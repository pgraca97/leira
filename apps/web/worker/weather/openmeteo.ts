import { z } from "zod"
import { type SoilDay, type SoilProvider, WeatherProviderError } from "./provider"

const FORECAST_ENDPOINT = "https://api.open-meteo.com/v1/forecast"
const TIMEOUT_MS = 8_000
/** One day more than the main forecast covers, so every day of it finds its soil. */
const FORECAST_DAYS = 6

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
 * Open-Meteo's forecast endpoint, which gives soil temperatures and needs no
 * key for non-commercial use. Its data are under CC BY 4.0, so the browser
 * credits it next to wherever they are shown.
 * https://open-meteo.com/en/docs and https://open-meteo.com/en/terms
 */
export function openMeteo(fetchFn: typeof fetch = fetch): SoilProvider {
  return {
    async soilTemperature(lat, lon) {
      const url = new URL(FORECAST_ENDPOINT)
      url.search = new URLSearchParams({
        latitude: String(lat),
        longitude: String(lon),
        hourly: "soil_temperature_6cm",
        forecast_days: String(FORECAST_DAYS),
        timezone: "auto",
      }).toString()

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
      const parsed = SoilResponseSchema.safeParse(body)
      if (!parsed.success) {
        throw new WeatherProviderError("Open-Meteo response had an unexpected shape")
      }
      return dailyMeans(parsed.data.hourly.time, parsed.data.hourly.soil_temperature_6cm)
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
