import type { Forecast, WeatherCondition, WeatherNow } from "@leira/core"
import { z } from "zod"
import { type WeatherProvider, WeatherProviderError } from "./provider"

const CURRENT_ENDPOINT = "https://api.openweathermap.org/data/2.5/weather"
const FORECAST_ENDPOINT = "https://api.openweathermap.org/data/2.5/forecast"
const TIMEOUT_MS = 8_000

/** The parts of OpenWeather's "current weather" response this app reads. */
const CurrentWeatherSchema = z.object({
  weather: z.array(z.object({ id: z.number(), icon: z.string() })).min(1),
  main: z.object({ temp: z.number(), feels_like: z.number(), humidity: z.number() }),
  wind: z.object({ speed: z.number() }),
  /** Time of the observation, in Unix seconds. */
  dt: z.number(),
  name: z.string().optional(),
})

/** The parts of OpenWeather's "5 day / 3 hour forecast" response this app reads. */
const ForecastResponseSchema = z.object({
  list: z
    .array(
      z.object({
        /** Start of the three-hour step, in Unix seconds. */
        dt: z.number(),
        main: z.object({ temp_min: z.number(), temp_max: z.number() }),
        weather: z.array(z.object({ id: z.number() })).min(1),
      })
    )
    .min(1),
  /** The place's offset from UTC, in seconds. */
  city: z.object({ timezone: z.number() }),
})

/**
 * OpenWeather's "current weather" and "5 day / 3 hour forecast" endpoints,
 * both included in the free plan.
 * https://openweathermap.org/current and https://openweathermap.org/forecast5
 */
export function openWeather(apiKey: string, fetchFn: typeof fetch = fetch): WeatherProvider {
  /** Calls an endpoint for a position and checks the answer against `schema`. */
  async function request<T>(endpoint: string, lat: number, lon: number, schema: z.ZodType<T>) {
    const url = new URL(endpoint)
    url.search = new URLSearchParams({
      lat: String(lat),
      lon: String(lon),
      units: "metric",
      appid: apiKey,
    }).toString()

    let response: Response
    try {
      response = await fetchFn(url, { signal: AbortSignal.timeout(TIMEOUT_MS) })
    } catch {
      // The cause is dropped on purpose: it could quote the URL and leak the key.
      throw new WeatherProviderError("OpenWeather request failed")
    }
    if (!response.ok) {
      throw new WeatherProviderError(`OpenWeather responded with status ${response.status}`)
    }

    const body: unknown = await response.json().catch(() => null)
    const parsed = schema.safeParse(body)
    if (!parsed.success) {
      throw new WeatherProviderError("OpenWeather response had an unexpected shape")
    }
    return parsed.data
  }

  return {
    async current(lat, lon) {
      return toWeatherNow(await request(CURRENT_ENDPOINT, lat, lon, CurrentWeatherSchema))
    },
    async forecast(lat, lon) {
      return toForecast(await request(FORECAST_ENDPOINT, lat, lon, ForecastResponseSchema))
    },
  }
}

/**
 * Folds three-hour steps into days: each day's lowest low, highest high, and
 * the condition most of its steps share. Days are split at local midnight, so
 * "tonight's frost" lands on the day a gardener would expect. The first and
 * last day usually cover only part of their 24 hours.
 */
function toForecast(data: z.infer<typeof ForecastResponseSchema>): Forecast {
  const days = new Map<string, { minC: number; maxC: number; conditions: WeatherCondition[] }>()
  for (const step of data.list) {
    const date = new Date((step.dt + data.city.timezone) * 1000).toISOString().slice(0, 10)
    // `.min(1)` above guarantees the first entry: the primary condition.
    const condition = conditionFromCode((step.weather[0] as { id: number }).id)
    const day = days.get(date)
    if (day) {
      day.minC = Math.min(day.minC, step.main.temp_min)
      day.maxC = Math.max(day.maxC, step.main.temp_max)
      day.conditions.push(condition)
    } else {
      days.set(date, {
        minC: step.main.temp_min,
        maxC: step.main.temp_max,
        conditions: [condition],
      })
    }
  }
  return [...days.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, day]) => ({
      date,
      minC: day.minC,
      maxC: day.maxC,
      condition: mostCommon(day.conditions),
    }))
}

/** The value that appears most often. On a tie, the one that appears first wins. */
function mostCommon<T>(values: readonly [T, ...T[]] | T[]): T {
  const counts = new Map<T, number>()
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1)
  let best = values[0] as T
  for (const [value, count] of counts) {
    if (count > (counts.get(best) ?? 0)) best = value
  }
  return best
}

function toWeatherNow(data: z.infer<typeof CurrentWeatherSchema>): WeatherNow {
  // `.min(1)` above guarantees the first entry: the primary condition.
  const primary = data.weather[0] as (typeof data.weather)[number]
  return {
    tempC: data.main.temp,
    feelsLikeC: data.main.feels_like,
    humidityPct: data.main.humidity,
    windMs: data.wind.speed,
    condition: conditionFromCode(primary.id),
    // Icon names end in "d" by day and "n" by night, e.g. "01d".
    isDay: primary.icon.endsWith("d"),
    placeName: data.name || null,
    observedAt: new Date(data.dt * 1000).toISOString(),
  }
}

/**
 * Maps OpenWeather condition codes to the app's conditions.
 * https://openweathermap.org/weather-conditions
 */
export function conditionFromCode(code: number): WeatherCondition {
  if (code >= 200 && code < 300) return "thunderstorm"
  if (code >= 300 && code < 400) return "drizzle"
  if (code >= 500 && code < 600) return "rain"
  if (code >= 600 && code < 700) return "snow"
  // The 7xx group is mist, haze, dust and the like: anything that cuts visibility.
  if (code >= 700 && code < 800) return "fog"
  if (code === 800) return "clear"
  return "clouds"
}
