import type { Forecast, WeatherNow } from "@garden/core"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { type AppDeps, createApp } from "./app"
import type { WeatherProvider } from "./weather/provider"
import { WeatherProviderError } from "./weather/provider"

const VALID_TOKEN = "valid-token"
const SIGNED_IN = { Authorization: `Bearer ${VALID_TOKEN}` }

const READING: WeatherNow = {
  tempC: 18.3,
  feelsLikeC: 17.9,
  humidityPct: 65,
  windMs: 4.6,
  condition: "clear",
  isDay: true,
  placeName: "Lisbon",
  observedAt: "2026-11-10T12:00:00.000Z",
}

const FORECAST: Forecast = [
  { date: "2026-11-10", minC: 9.5, maxC: 17.5, condition: "clear" },
  { date: "2026-11-11", minC: 4, maxC: 15, condition: "rain" },
]

/** The two KV methods the app uses, backed by a Map. */
function fakeKv() {
  const store = new Map<string, string>()
  const kv = {
    get: vi.fn(async (key: string) => JSON.parse(store.get(key) ?? "null")),
    put: vi.fn(async (key: string, value: string, _options?: { expirationTtl?: number }) => {
      store.set(key, value)
    }),
  }
  return { store, kv, binding: kv as unknown as KVNamespace }
}

let cache: ReturnType<typeof fakeKv>
let current: ReturnType<typeof vi.fn<WeatherProvider["current"]>>
let forecast: ReturnType<typeof vi.fn<WeatherProvider["forecast"]>>
let deps: AppDeps

function request(path: string, headers: Record<string, string> = SIGNED_IN) {
  const env = { CACHE: cache.binding } as Env
  return createApp(deps).request(path, { headers }, env)
}

beforeEach(() => {
  cache = fakeKv()
  current = vi.fn<WeatherProvider["current"]>(async () => READING)
  forecast = vi.fn<WeatherProvider["forecast"]>(async () => FORECAST)
  deps = {
    verifyToken: async (_env, token) => (token === VALID_TOKEN ? "user-1" : null),
    weatherProvider: () => ({ current, forecast }),
  }
  vi.spyOn(console, "error").mockImplementation(() => {})
  vi.spyOn(console, "warn").mockImplementation(() => {})
})

describe("GET /api/config", () => {
  const env = {
    SUPABASE_URL: "https://project.supabase.co",
    SUPABASE_PUBLISHABLE_KEY: "sb_publishable_abc",
    OPENWEATHER_API_KEY: "secret",
  } as Env

  it("gives the browser the public Supabase settings without a session", async () => {
    const response = await createApp(deps).request("/api/config", {}, env)
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      supabaseUrl: "https://project.supabase.co",
      supabasePublishableKey: "sb_publishable_abc",
    })
  })

  it("answers 503 when Supabase is not configured", async () => {
    const response = await createApp(deps).request("/api/config", {}, {} as Env)
    expect(response.status).toBe(503)
    expect(await response.json()).toEqual({ error: "not_configured" })
  })
})

describe("GET /api/health", () => {
  it("answers without a session", async () => {
    const response = await request("/api/health", {})
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ ok: true })
  })
})

describe("unknown routes", () => {
  it("answer 404 as JSON", async () => {
    const response = await request("/api/nope")
    expect(response.status).toBe(404)
    expect(await response.json()).toEqual({ error: "not_found" })
  })
})

describe("GET /api/weather", () => {
  it.each([
    ["no Authorization header", {}],
    ["a token that does not verify", { Authorization: "Bearer forged" }],
    ["a scheme other than Bearer", { Authorization: `Basic ${VALID_TOKEN}` }],
    ["an empty bearer token", { Authorization: "Bearer " }],
  ])("rejects %s before touching the provider", async (_case, headers) => {
    const response = await request("/api/weather?lat=38.72&lon=-9.14", headers)
    expect(response.status).toBe(401)
    expect(await response.json()).toEqual({ error: "unauthorized" })
    expect(current).not.toHaveBeenCalled()
  })

  it.each([
    ["missing coordinates", "/api/weather"],
    ["a missing longitude", "/api/weather?lat=38.72"],
    ["empty values", "/api/weather?lat=&lon="],
    ["text", "/api/weather?lat=north&lon=west"],
    ["a latitude off the globe", "/api/weather?lat=90.5&lon=0"],
    ["a longitude off the globe", "/api/weather?lat=0&lon=-180.5"],
    ["scientific notation", "/api/weather?lat=1e1&lon=0"],
  ])("rejects %s", async (_case, path) => {
    const response = await request(path)
    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({ error: "invalid_coordinates" })
    expect(current).not.toHaveBeenCalled()
  })

  it("returns the reading and marks it as fresh", async () => {
    const response = await request("/api/weather?lat=38.72&lon=-9.14")
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual(READING)
    expect(response.headers.get("X-Cache")).toBe("MISS")
    expect(response.headers.get("Cache-Control")).toBe("private, max-age=600")
  })

  it("asks the provider for the centre of the zone, not the exact position", async () => {
    await request("/api/weather?lat=38.7223&lon=-9.1393")
    expect(current).toHaveBeenCalledExactlyOnceWith(38.7, -9.1)
  })

  it("caches a reading for an hour", async () => {
    await request("/api/weather?lat=38.72&lon=-9.14")
    expect(cache.kv.put).toHaveBeenCalledExactlyOnceWith(
      "weather:now:v1:38.7:-9.1",
      JSON.stringify(READING),
      { expirationTtl: 3600 }
    )
  })

  it("serves a second request in the same zone from the cache", async () => {
    await request("/api/weather?lat=38.72&lon=-9.14")
    const response = await request("/api/weather?lat=38.68&lon=-9.06")
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual(READING)
    expect(response.headers.get("X-Cache")).toBe("HIT")
    expect(current).toHaveBeenCalledTimes(1)
  })

  it("keeps zones apart", async () => {
    await request("/api/weather?lat=38.72&lon=-9.14")
    await request("/api/weather?lat=41.16&lon=-8.61")
    expect(current).toHaveBeenCalledTimes(2)
    expect([...cache.store.keys()]).toEqual([
      "weather:now:v1:38.7:-9.1",
      "weather:now:v1:41.2:-8.6",
    ])
  })

  it("uses one zone for both sides of the equator and the prime meridian", async () => {
    await request("/api/weather?lat=-0.04&lon=0.04")
    expect([...cache.store.keys()]).toEqual(["weather:now:v1:0.0:0.0"])
  })

  it("ignores a cache entry that no longer matches the schema", async () => {
    cache.store.set("weather:now:v1:38.7:-9.1", JSON.stringify({ temp: 18 }))
    const response = await request("/api/weather?lat=38.72&lon=-9.14")
    expect(response.headers.get("X-Cache")).toBe("MISS")
    expect(current).toHaveBeenCalledTimes(1)
  })

  it("still answers when the cache is down", async () => {
    cache.kv.get.mockRejectedValue(new Error("KV unavailable"))
    cache.kv.put.mockRejectedValue(new Error("KV unavailable"))
    const response = await request("/api/weather?lat=38.72&lon=-9.14")
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual(READING)
  })

  it("answers 503 when no provider is configured", async () => {
    deps.weatherProvider = () => null
    const response = await request("/api/weather?lat=38.72&lon=-9.14")
    expect(response.status).toBe(503)
    expect(await response.json()).toEqual({ error: "weather_not_configured" })
  })

  it("answers 502 when the provider fails, without caching or echoing the failure", async () => {
    current.mockRejectedValue(new WeatherProviderError("OpenWeather responded with status 500"))
    const response = await request("/api/weather?lat=38.72&lon=-9.14")
    expect(response.status).toBe(502)
    expect(await response.json()).toEqual({ error: "weather_unavailable" })
    expect(cache.kv.put).not.toHaveBeenCalled()
  })
})

describe("GET /api/forecast", () => {
  it("rejects a request without a session before touching the provider", async () => {
    const response = await request("/api/forecast?lat=38.72&lon=-9.14", {})
    expect(response.status).toBe(401)
    expect(await response.json()).toEqual({ error: "unauthorized" })
    expect(forecast).not.toHaveBeenCalled()
  })

  it.each([
    ["missing coordinates", "/api/forecast"],
    ["a latitude off the globe", "/api/forecast?lat=90.5&lon=0"],
  ])("rejects %s", async (_case, path) => {
    const response = await request(path)
    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({ error: "invalid_coordinates" })
    expect(forecast).not.toHaveBeenCalled()
  })

  it("returns the forecast for the centre of the zone and marks it as fresh", async () => {
    const response = await request("/api/forecast?lat=38.7223&lon=-9.1393")
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual(FORECAST)
    expect(response.headers.get("X-Cache")).toBe("MISS")
    expect(response.headers.get("Cache-Control")).toBe("private, max-age=1800")
    expect(forecast).toHaveBeenCalledExactlyOnceWith(38.7, -9.1)
  })

  it("caches a forecast for three hours, apart from the current weather", async () => {
    await request("/api/forecast?lat=38.72&lon=-9.14")
    await request("/api/weather?lat=38.72&lon=-9.14")
    expect(cache.kv.put).toHaveBeenCalledWith(
      "weather:forecast:v1:38.7:-9.1",
      JSON.stringify(FORECAST),
      { expirationTtl: 10_800 }
    )
    expect([...cache.store.keys()]).toEqual([
      "weather:forecast:v1:38.7:-9.1",
      "weather:now:v1:38.7:-9.1",
    ])
  })

  it("serves a second request in the same zone from the cache", async () => {
    await request("/api/forecast?lat=38.72&lon=-9.14")
    const response = await request("/api/forecast?lat=38.68&lon=-9.06")
    expect(await response.json()).toEqual(FORECAST)
    expect(response.headers.get("X-Cache")).toBe("HIT")
    expect(forecast).toHaveBeenCalledTimes(1)
  })

  it("ignores a cache entry that no longer matches the schema", async () => {
    cache.store.set("weather:forecast:v1:38.7:-9.1", JSON.stringify([{ day: "monday" }]))
    const response = await request("/api/forecast?lat=38.72&lon=-9.14")
    expect(response.headers.get("X-Cache")).toBe("MISS")
  })

  it("answers 503 when no provider is configured", async () => {
    deps.weatherProvider = () => null
    const response = await request("/api/forecast?lat=38.72&lon=-9.14")
    expect(response.status).toBe(503)
    expect(await response.json()).toEqual({ error: "weather_not_configured" })
  })

  it("answers 502 when the provider fails, without caching the failure", async () => {
    forecast.mockRejectedValue(new WeatherProviderError("OpenWeather responded with status 500"))
    const response = await request("/api/forecast?lat=38.72&lon=-9.14")
    expect(response.status).toBe(502)
    expect(await response.json()).toEqual({ error: "weather_unavailable" })
    expect(cache.kv.put).not.toHaveBeenCalled()
  })
})
