import type { Place } from "@leira/core"
import { z } from "zod"
import type { Language } from "../../src/i18n/languages"
import {
  type PlaceProvider,
  type SoilDay,
  type SoilProvider,
  WeatherProviderError,
} from "./provider"

const FORECAST_ENDPOINT = "https://api.open-meteo.com/v1/forecast"
const GEOCODING_ENDPOINT = "https://geocoding-api.open-meteo.com/v1/search"
const TIMEOUT_MS = 8_000
/** One day more than the main forecast covers, so every day of it finds its soil. */
const FORECAST_DAYS = 6
/**
 * How many matches to ask the geocoder for: more than are shown, since
 * mountains, airports and the like are dropped from them.
 */
const SEARCH_COUNT = 20
/** The most places a search returns. */
const MAX_PLACES = 10
/** The longest name a garden's location can keep. */
const PLACE_NAME_MAX = 120
/**
 * GeoNames codes that start with "PPL" but name no place anyone lives in
 * now: a historical, abandoned or destroyed one, or a former capital.
 * https://www.geonames.org/export/codes.html
 */
const PAST_PLACES = new Set(["PPLH", "PPLQ", "PPLW", "PPLCH"])

/** The parts of Open-Meteo's forecast response this app reads. */
const SoilResponseSchema = z
  .object({
    hourly: z.object({
      /** Local times such as "2026-05-04T13:00", since the request asks for the place's own zone. */
      time: z.array(z.string().regex(/^\d{4}-\d{2}-\d{2}T/)),
      /** A null is an hour the model has no value for. */
      soil_temperature_6cm: z.array(z.number().nullable()),
    }),
  })
  .refine((data) => data.hourly.time.length === data.hourly.soil_temperature_6cm.length, {
    error: "times and values must pair up",
  })

/**
 * The parts of Open-Meteo's geocoding response this app reads. It has no
 * `results` at all when nothing matches, and which areas a match names
 * varies by country.
 */
const GeocodingResponseSchema = z.object({
  results: z
    .array(
      z.object({
        name: z.string().min(1),
        latitude: z.number(),
        longitude: z.number(),
        /** The GeoNames feature code: "PPL" and its kin for a town or a village. */
        feature_code: z.string().optional(),
        country_code: z.string().min(1).optional(),
        /** The district, state or province. */
        admin1: z.string().min(1).optional(),
        /** The municipality or county: in Portugal, the concelho. */
        admin2: z.string().min(1).optional(),
      })
    )
    .default([]),
})

/** Calls Open-Meteo and checks the answer against `schema`. */
async function request<T>(
  fetchFn: typeof fetch,
  endpoint: string,
  params: Record<string, string>,
  schema: z.ZodType<T>
): Promise<T> {
  const url = new URL(endpoint)
  url.search = new URLSearchParams(params).toString()

  let response: Response
  try {
    response = await fetchFn(url, { signal: AbortSignal.timeout(TIMEOUT_MS) })
  } catch {
    throw new WeatherProviderError("Open-Meteo request failed")
  }
  if (!response.ok) {
    throw new WeatherProviderError(`Open-Meteo responded with status ${response.status}`)
  }
  const body: unknown = await response.json().catch(() => null)
  const parsed = schema.safeParse(body)
  if (!parsed.success) {
    throw new WeatherProviderError("Open-Meteo response had an unexpected shape")
  }
  return parsed.data
}

/**
 * Open-Meteo's forecast endpoint, which gives soil temperatures and needs no
 * key for non-commercial use. Its data are under CC BY 4.0, so the browser
 * credits it next to wherever they are shown.
 * https://open-meteo.com/en/docs and https://open-meteo.com/en/terms
 */
export function openMeteo(fetchFn: typeof fetch = fetch): SoilProvider {
  return {
    async soilTemperature(lat, lon) {
      const params = {
        latitude: String(lat),
        longitude: String(lon),
        hourly: "soil_temperature_6cm",
        forecast_days: String(FORECAST_DAYS),
        timezone: "auto",
      }
      const { hourly } = await request(fetchFn, FORECAST_ENDPOINT, params, SoilResponseSchema)
      return dailyMeans(hourly.time, hourly.soil_temperature_6cm)
    },
  }
}

/**
 * Open-Meteo's geocoding endpoint, which finds places by name in GeoNames.
 * Unlike OpenWeather's, it names each place's municipality and district,
 * which in Portugal is what tells apart the villages that share a name, and
 * it gives them in the language asked for. Its data are under CC BY 4.0, so
 * the browser credits GeoNames next to the results.
 * https://open-meteo.com/en/docs/geocoding-api
 */
export function openMeteoPlaces(fetchFn: typeof fetch = fetch): PlaceProvider {
  return {
    async places(query: string, language: Language): Promise<Place[]> {
      const params = { name: query, count: String(SEARCH_COUNT), language, format: "json" }
      const { results } = await request(
        fetchFn,
        GEOCODING_ENDPOINT,
        params,
        GeocodingResponseSchema
      )
      return results
        .filter(({ feature_code: code }) => code?.startsWith("PPL") && !PAST_PLACES.has(code))
        .slice(0, MAX_PLACES)
        .map((match) => ({
          name: match.name.slice(0, PLACE_NAME_MAX),
          // Left out, not set to undefined, so an absent field stays absent in JSON and in the cache.
          ...(match.admin2 ? { area: match.admin2.slice(0, PLACE_NAME_MAX) } : {}),
          ...(match.admin1 ? { region: match.admin1.slice(0, PLACE_NAME_MAX) } : {}),
          ...(match.country_code ? { country: match.country_code } : {}),
          lat: match.latitude,
          lon: match.longitude,
        }))
    },
  }
}

/**
 * Folds hourly readings into each day's mean, to one decimal. The soil 6 cm
 * down swings between night and afternoon, and germination follows the
 * average more than either end. Hours with no value are left out, and so is
 * a day with none.
 */
function dailyMeans(times: readonly string[], values: readonly (number | null)[]): SoilDay[] {
  const days = new Map<string, { sum: number; count: number }>()
  times.forEach((time, index) => {
    const value = values[index]
    if (value === null || value === undefined) return
    const date = time.slice(0, 10)
    const day = days.get(date) ?? { sum: 0, count: 0 }
    day.sum += value
    day.count += 1
    days.set(date, day)
  })
  return [...days.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, day]) => ({ date, meanC: Math.round((day.sum / day.count) * 10) / 10 }))
}
