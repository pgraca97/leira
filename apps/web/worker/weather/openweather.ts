import type { WeatherCondition, WeatherNow } from "@garden/core"
import { z } from "zod"
import { type WeatherProvider, WeatherProviderError } from "./provider"

const ENDPOINT = "https://api.openweathermap.org/data/2.5/weather"
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

/**
 * OpenWeather "current weather" endpoint, included in the free plan.
 * https://openweathermap.org/current
 */
export function openWeather(apiKey: string, fetchFn: typeof fetch = fetch): WeatherProvider {
  return {
    async current(lat, lon) {
      const url = new URL(ENDPOINT)
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
      const parsed = CurrentWeatherSchema.safeParse(body)
      if (!parsed.success) {
        throw new WeatherProviderError("OpenWeather response had an unexpected shape")
      }
      return toWeatherNow(parsed.data)
    },
  }
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
