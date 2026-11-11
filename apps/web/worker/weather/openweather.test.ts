import { ForecastSchema, WeatherNowSchema } from "@garden/core"
import { describe, expect, it, vi } from "vitest"
import { conditionFromCode, openWeather } from "./openweather"
import { WeatherProviderError } from "./provider"

const API_KEY = "test-key-do-not-leak"

/** A trimmed copy of a real "current weather" response. */
const LISBON = {
  coord: { lon: -9.1, lat: 38.7 },
  weather: [{ id: 800, main: "Clear", description: "clear sky", icon: "01d" }],
  main: {
    temp: 18.3,
    feels_like: 17.9,
    temp_min: 16.5,
    temp_max: 19.6,
    pressure: 1018,
    humidity: 65,
  },
  visibility: 10000,
  wind: { speed: 4.6, deg: 340 },
  clouds: { all: 0 },
  dt: 1794312000,
  sys: { country: "PT", sunrise: 1794294000, sunset: 1794331000 },
  timezone: 0,
  id: 2267057,
  name: "Lisbon",
  cod: 200,
}

function respondWith(body: unknown, status = 200) {
  return vi.fn<typeof fetch>(async () => Response.json(body, { status }))
}

describe("openWeather", () => {
  it("maps a reading to the app's weather shape", async () => {
    const weather = await openWeather(API_KEY, respondWith(LISBON)).current(38.7, -9.1)
    expect(weather).toEqual({
      tempC: 18.3,
      feelsLikeC: 17.9,
      humidityPct: 65,
      windMs: 4.6,
      condition: "clear",
      isDay: true,
      placeName: "Lisbon",
      observedAt: "2026-11-10T12:00:00.000Z",
    })
    expect(WeatherNowSchema.safeParse(weather).success).toBe(true)
  })

  it("asks for metric units at the given position", async () => {
    const fetchFn = respondWith(LISBON)
    await openWeather(API_KEY, fetchFn).current(38.7, -9.1)
    const url = new URL(String(fetchFn.mock.calls[0]![0]))
    expect(url.origin + url.pathname).toBe("https://api.openweathermap.org/data/2.5/weather")
    expect(Object.fromEntries(url.searchParams)).toEqual({
      lat: "38.7",
      lon: "-9.1",
      units: "metric",
      appid: API_KEY,
    })
  })

  it("reads night from the icon and treats a blank place name as unknown", async () => {
    const night = { ...LISBON, weather: [{ id: 802, icon: "03n" }], name: "" }
    const weather = await openWeather(API_KEY, respondWith(night)).current(0, 0)
    expect(weather).toMatchObject({ condition: "clouds", isDay: false, placeName: null })
  })

  it("fails on an error status without leaking the key", async () => {
    const fetchFn = respondWith({ cod: 401, message: `Invalid API key ${API_KEY}` }, 401)
    const failure = await openWeather(API_KEY, fetchFn)
      .current(38.7, -9.1)
      .catch((error: unknown) => error)
    expect(failure).toBeInstanceOf(WeatherProviderError)
    expect(String(failure)).toContain("401")
    expect(String(failure)).not.toContain(API_KEY)
  })

  it("fails on a network error without leaking the key", async () => {
    const fetchFn = vi.fn<typeof fetch>(async (input) => {
      throw new TypeError(`fetch failed: ${String(input)}`)
    })
    const failure = await openWeather(API_KEY, fetchFn)
      .current(38.7, -9.1)
      .catch((error: unknown) => error)
    expect(failure).toBeInstanceOf(WeatherProviderError)
    expect(String(failure)).not.toContain(API_KEY)
    expect((failure as Error).cause).toBeUndefined()
  })

  it.each([
    ["a body that is not JSON", new Response("<html>bad gateway</html>")],
    ["a body with fields missing", Response.json({ weather: [], main: {} })],
  ])("fails on %s", async (_case, response) => {
    const fetchFn = vi.fn<typeof fetch>(async () => response)
    await expect(openWeather(API_KEY, fetchFn).current(38.7, -9.1)).rejects.toThrow(
      WeatherProviderError
    )
  })
})

describe("conditionFromCode", () => {
  it.each([
    [200, "thunderstorm"],
    [232, "thunderstorm"],
    [301, "drizzle"],
    [500, "rain"],
    [531, "rain"],
    [600, "snow"],
    [701, "fog"],
    [741, "fog"],
    [800, "clear"],
    [801, "clouds"],
    [804, "clouds"],
  ] as const)("maps %i to %s", (code, condition) => {
    expect(conditionFromCode(code)).toBe(condition)
  })
})

/** One three-hour step of a "5 day forecast" response, trimmed to what matters here. */
function step(isoTime: string, tempMin: number, tempMax: number, conditionCode = 800) {
  return {
    dt: Date.parse(isoTime) / 1000,
    main: { temp: (tempMin + tempMax) / 2, temp_min: tempMin, temp_max: tempMax, humidity: 60 },
    weather: [{ id: conditionCode, main: "x", description: "x", icon: "01d" }],
    wind: { speed: 3 },
  }
}

function forecastBody(steps: ReturnType<typeof step>[], timezoneSeconds = 0) {
  return {
    cod: "200",
    cnt: steps.length,
    list: steps,
    city: { name: "Lisbon", timezone: timezoneSeconds },
  }
}

describe("openWeather forecast", () => {
  it("folds the three-hour steps of each day into its low and its high", async () => {
    const body = forecastBody([
      step("2026-11-10T09:00:00Z", 11, 13),
      step("2026-11-10T15:00:00Z", 14, 17.5),
      step("2026-11-10T21:00:00Z", 9.5, 12),
      step("2026-11-11T03:00:00Z", 4, 6),
      step("2026-11-11T12:00:00Z", 10, 15),
    ])
    const forecast = await openWeather(API_KEY, respondWith(body)).forecast(38.7, -9.1)
    expect(forecast).toEqual([
      { date: "2026-11-10", minC: 9.5, maxC: 17.5, condition: "clear" },
      { date: "2026-11-11", minC: 4, maxC: 15, condition: "clear" },
    ])
    expect(ForecastSchema.safeParse(forecast).success).toBe(true)
  })

  it("splits the days at midnight where the garden is, not in UTC", async () => {
    // 23:00 UTC is already the next morning ten hours to the east.
    const body = forecastBody(
      [step("2026-11-10T12:00:00Z", 20, 25), step("2026-11-10T23:00:00Z", 12, 14)],
      10 * 3600
    )
    const forecast = await openWeather(API_KEY, respondWith(body)).forecast(-33.9, 151.2)
    expect(forecast.map((day) => day.date)).toEqual(["2026-11-10", "2026-11-11"])
  })

  it("gives each day the weather that most of it has", async () => {
    const body = forecastBody([
      step("2026-11-10T06:00:00Z", 10, 12, 800),
      step("2026-11-10T09:00:00Z", 10, 12, 500),
      step("2026-11-10T12:00:00Z", 10, 12, 501),
      step("2026-11-10T15:00:00Z", 10, 12, 803),
    ])
    const [day] = await openWeather(API_KEY, respondWith(body)).forecast(38.7, -9.1)
    expect(day?.condition).toBe("rain")
  })

  it("asks the forecast endpoint for metric units at the given position", async () => {
    const fetchFn = respondWith(forecastBody([step("2026-11-10T09:00:00Z", 11, 13)]))
    await openWeather(API_KEY, fetchFn).forecast(38.7, -9.1)
    const url = new URL(String(fetchFn.mock.calls[0]![0]))
    expect(url.origin + url.pathname).toBe("https://api.openweathermap.org/data/2.5/forecast")
    expect(Object.fromEntries(url.searchParams)).toEqual({
      lat: "38.7",
      lon: "-9.1",
      units: "metric",
      appid: API_KEY,
    })
  })

  it("fails on an error status without leaking the key", async () => {
    const fetchFn = respondWith({ cod: 401, message: `Invalid API key ${API_KEY}` }, 401)
    const failure = await openWeather(API_KEY, fetchFn)
      .forecast(38.7, -9.1)
      .catch((error: unknown) => error)
    expect(failure).toBeInstanceOf(WeatherProviderError)
    expect(String(failure)).not.toContain(API_KEY)
  })

  it.each([
    ["a body with no steps", Response.json(forecastBody([]))],
    ["a body with fields missing", Response.json({ list: [{ dt: 1 }], city: {} })],
  ])("fails on %s", async (_case, response) => {
    const fetchFn = vi.fn<typeof fetch>(async () => response)
    await expect(openWeather(API_KEY, fetchFn).forecast(38.7, -9.1)).rejects.toThrow(
      WeatherProviderError
    )
  })
})
