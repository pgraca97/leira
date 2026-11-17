import type { Forecast, Place, WeatherNow } from "@leira/core"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { type AppDeps, createApp, type VerifiedUser } from "./app"
import type { Mailer } from "./mail"
import type { SoilProvider, WeatherProvider } from "./weather/provider"
import { WeatherProviderError } from "./weather/provider"

const VALID_TOKEN = "valid-token"
const SIGNED_IN = { Authorization: `Bearer ${VALID_TOKEN}` }
const ALICE = { id: "user-1", email: "alice@example.com", isAnonymous: false }
const GUEST_TOKEN = "guest-token"
const NO_EMAIL_TOKEN = "no-email-token"

/** The tokens the fake token check knows, and who each one belongs to. */
const USERS: Record<string, VerifiedUser> = {
  [VALID_TOKEN]: ALICE,
  [GUEST_TOKEN]: { id: "guest-1", email: null, isAnonymous: true },
  [NO_EMAIL_TOKEN]: { id: "user-2", email: null, isAnonymous: false },
}

/** When the database says Alice's account will be deleted. */
const DELETE_ON = new Date("2026-12-17T10:00:00.000Z")

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

/** The soil for the first day only: the second is beyond what it covers. */
const SOIL = [
  { date: "2026-11-09", meanC: 13 },
  { date: "2026-11-10", meanC: 12.1 },
]

const FORECAST_WITH_SOIL: Forecast = [
  { date: "2026-11-10", minC: 9.5, maxC: 17.5, condition: "clear", soilC: 12.1 },
  { date: "2026-11-11", minC: 4, maxC: 15, condition: "rain" },
]

const PLACES: Place[] = [
  { name: "Braga", region: "Braga", country: "PT", lat: 41.5510583, lon: -8.4280045 },
  { name: "Braga", country: "BR", lat: -29.3, lon: -53.7 },
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

/** A rate limiter that lets everything through until a test tells it to refuse. */
function fakeLimiter() {
  const limit = vi.fn(async (_options: { key: string }) => ({ success: true }))
  return { limit, binding: { limit } as unknown as RateLimit }
}

let cache: ReturnType<typeof fakeKv>
let apiLimit: ReturnType<typeof fakeLimiter>
let lookupLimit: ReturnType<typeof fakeLimiter>
let current: ReturnType<typeof vi.fn<WeatherProvider["current"]>>
let forecast: ReturnType<typeof vi.fn<WeatherProvider["forecast"]>>
let places: ReturnType<typeof vi.fn<WeatherProvider["places"]>>
let soilTemperature: ReturnType<typeof vi.fn<SoilProvider["soilTemperature"]>>
let sharedGarden: ReturnType<typeof vi.fn<AppDeps["sharedGarden"]>>
let requestDeletion: ReturnType<typeof vi.fn<AppDeps["requestDeletion"]>>
let sendMail: ReturnType<typeof vi.fn<Mailer["send"]>>
let deps: AppDeps

function bindings() {
  return {
    CACHE: cache.binding,
    API_LIMIT: apiLimit.binding,
    LOOKUP_LIMIT: lookupLimit.binding,
  } as Env
}

function request(path: string, headers: Record<string, string> = SIGNED_IN) {
  return createApp(deps).request(path, { headers }, bindings())
}

beforeEach(() => {
  cache = fakeKv()
  apiLimit = fakeLimiter()
  lookupLimit = fakeLimiter()
  current = vi.fn<WeatherProvider["current"]>(async () => READING)
  forecast = vi.fn<WeatherProvider["forecast"]>(async () => FORECAST)
  places = vi.fn<WeatherProvider["places"]>(async () => PLACES)
  soilTemperature = vi.fn<SoilProvider["soilTemperature"]>(async () => SOIL)
  sharedGarden = vi.fn<AppDeps["sharedGarden"]>(async () => null)
  requestDeletion = vi.fn<AppDeps["requestDeletion"]>(async () => DELETE_ON)
  sendMail = vi.fn<Mailer["send"]>(async () => {})
  deps = {
    verifyToken: async (_env, token) => USERS[token] ?? null,
    weatherProvider: () => ({ current, forecast, places }),
    soilProvider: () => ({ soilTemperature }),
    sharedGarden,
    requestDeletion,
    mailer: () => ({ send: sendMail }),
  }
  vi.spyOn(console, "error").mockImplementation(() => {})
  vi.spyOn(console, "warn").mockImplementation(() => {})
})

describe("GET /api/config", () => {
  const env = {
    SUPABASE_URL: "https://project.supabase.co",
    SUPABASE_PUBLISHABLE_KEY: "sb_publishable_abc",
    TURNSTILE_SITE_KEY: "0x4AAAAAAA",
    OPENWEATHER_API_KEY: "secret",
  } as Env

  it("gives the browser the public settings without a session", async () => {
    const response = await createApp(deps).request("/api/config", {}, env)
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      supabaseUrl: "https://project.supabase.co",
      supabasePublishableKey: "sb_publishable_abc",
      turnstileSiteKey: "0x4AAAAAAA",
    })
  })

  // Set in production only, so local and test visits never reach the analytics.
  it("adds the Web Analytics token when one is set", async () => {
    const withToken = { ...env, WEB_ANALYTICS_TOKEN: "beacon-token" } as Env
    const response = await createApp(deps).request("/api/config", {}, withToken)
    expect(await response.json()).toEqual({
      supabaseUrl: "https://project.supabase.co",
      supabasePublishableKey: "sb_publishable_abc",
      turnstileSiteKey: "0x4AAAAAAA",
      webAnalyticsToken: "beacon-token",
    })
  })

  // Without it no browser could sign in once the captcha is on, so it is
  // treated like the Supabase settings.
  it("answers 503 when the Turnstile site key is missing", async () => {
    const withoutKey = { ...env, TURNSTILE_SITE_KEY: "" } as Env
    const response = await createApp(deps).request("/api/config", {}, withoutKey)
    expect(response.status).toBe(503)
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

describe("Google's site verification file", () => {
  // The static files would redirect `/name.html` to `/name`, which the check may not follow.
  it("answers at its exact address, with no redirect", async () => {
    const response = await request("/google2109b0318d502cf4.html", {})
    expect(response.status).toBe(200)
    expect(await response.text()).toBe("google-site-verification: google2109b0318d502cf4.html")
  })
})

describe("the app's pages", () => {
  /** The built files, with only the app shell in them. */
  function fakeAssets() {
    const fetch = vi.fn(async (input: RequestInfo | URL) =>
      new URL(input instanceof Request ? input.url : input).pathname === "/app"
        ? new Response("<!doctype html><div id=root></div>", {
            headers: { "Content-Type": "text/html", ETag: '"shell"' },
          })
        : new Response(null, { status: 404 })
    )
    return { fetch, binding: { fetch } as unknown as Fetcher }
  }

  function page(path: string, assets = fakeAssets()) {
    return createApp(deps).request(`https://leira.test${path}`, {}, {
      ASSETS: assets.binding,
    } as Env)
  }

  it.each(["/gardens", "/gardens/b1c2", "/shared/abc", "/stats"])(
    "serves the app shell at %s and keeps it out of search results",
    async (path) => {
      const response = await page(path)
      expect(response.status).toBe(200)
      expect(response.headers.get("Content-Type")).toBe("text/html")
      expect(response.headers.get("X-Robots-Tag")).toBe("noindex")
      expect(await response.text()).toContain("<div id=root>")
    }
  )

  // The asset server answers `/app.html` with a redirect to `/app`.
  it("asks the static files for /app, without the extension", async () => {
    const assets = fakeAssets()
    await page("/gardens", assets)
    const [input] = assets.fetch.mock.calls[0] ?? []
    expect(new URL(input instanceof Request ? input.url : String(input)).pathname).toBe("/app")
  })

  it("lets search engines index the privacy page", async () => {
    const response = await page("/privacy")
    expect(response.status).toBe(200)
    expect(response.headers.get("X-Robots-Tag")).toBeNull()
  })

  it("keeps the shell's own headers, so the browser can still revalidate it", async () => {
    const response = await page("/gardens")
    expect(response.headers.get("ETag")).toBe('"shell"')
  })

  it("still answers an unknown API path with JSON", async () => {
    const response = await page("/api/nope")
    expect(response.status).toBe(404)
    expect(await response.json()).toEqual({ error: "not_found" })
  })
})

describe("rate limits", () => {
  const FROM_ALICE = { ...SIGNED_IN, "CF-Connecting-IP": "203.0.113.7" }

  it.each([
    "/api/weather?lat=38.72&lon=-9.14",
    "/api/forecast?lat=38.72&lon=-9.14",
    "/api/places?q=Braga",
  ])("refuse %s to a visitor who asks too often, before checking the session", async (path) => {
    const verifyToken = vi.spyOn(deps, "verifyToken")
    apiLimit.limit.mockResolvedValue({ success: false })

    const response = await request(path, FROM_ALICE)
    expect(response.status).toBe(429)
    expect(await response.json()).toEqual({ error: "rate_limited" })
    expect(response.headers.get("Retry-After")).toBe("60")
    expect(verifyToken).not.toHaveBeenCalled()
    expect(cache.kv.get).not.toHaveBeenCalled()
  })

  it("count each visitor apart, by the address the request came from", async () => {
    await request("/api/weather?lat=38.72&lon=-9.14", FROM_ALICE)
    expect(apiLimit.limit).toHaveBeenCalledExactlyOnceWith({ key: "203.0.113.7" })
    expect(lookupLimit.limit).toHaveBeenCalledExactlyOnceWith({ key: "203.0.113.7" })
  })

  // A machine is usually given a whole /64 block of IPv6 addresses and can
  // take any address in it, so each one must not count as a new visitor.
  it("count every address in one IPv6 /64 block as one visitor, however it is written", async () => {
    for (const address of [
      "2001:db8:0:0:1::1",
      "2001:DB8::2",
      "2001:0db8:0000:0000:ffff:ffff:ffff:ffff",
    ]) {
      await request("/api/weather?lat=38.72&lon=-9.14", {
        ...SIGNED_IN,
        "CF-Connecting-IP": address,
      })
    }
    const keys = apiLimit.limit.mock.calls.map(([options]) => options.key)
    expect(keys).toHaveLength(3)
    expect(new Set(keys).size).toBe(1)
  })

  it("count neighbouring IPv6 blocks apart", async () => {
    for (const address of ["2001:db8:0:1::1", "2001:db8:0:2::1"]) {
      await request("/api/weather?lat=38.72&lon=-9.14", {
        ...SIGNED_IN,
        "CF-Connecting-IP": address,
      })
    }
    const [first, second] = apiLimit.limit.mock.calls.map(([options]) => options.key)
    expect(first).not.toBe(second)
  })

  it("still answer when the address cannot be read", async () => {
    const response = await request("/api/weather?lat=38.72&lon=-9.14", {
      ...SIGNED_IN,
      "CF-Connecting-IP": "1:2:3:4:5:6:7:8:9::1",
    })
    expect(response.status).toBe(200)
  })

  it("refuse a lookup to a visitor who has caused too many, sparing the provider", async () => {
    lookupLimit.limit.mockResolvedValue({ success: false })

    const response = await request("/api/places?q=Braga", FROM_ALICE)
    expect(response.status).toBe(429)
    expect(await response.json()).toEqual({ error: "rate_limited" })
    expect(response.headers.get("Retry-After")).toBe("60")
    expect(places).not.toHaveBeenCalled()
    expect(cache.kv.put).not.toHaveBeenCalled()
  })

  it("do not count an answer from the cache as a lookup", async () => {
    await request("/api/forecast?lat=38.72&lon=-9.14", FROM_ALICE)
    lookupLimit.limit.mockResolvedValue({ success: false })

    const response = await request("/api/forecast?lat=38.72&lon=-9.14", FROM_ALICE)
    expect(response.status).toBe(200)
    expect(response.headers.get("X-Cache")).toBe("HIT")
    expect(lookupLimit.limit).toHaveBeenCalledTimes(1)
  })

  it("do not count a request that is refused for another reason as a lookup", async () => {
    await request("/api/weather?lat=north&lon=west", FROM_ALICE)
    await request("/api/weather?lat=38.72&lon=-9.14", { "CF-Connecting-IP": "203.0.113.7" })
    expect(lookupLimit.limit).not.toHaveBeenCalled()
  })

  it("leave the health check and the public settings alone", async () => {
    apiLimit.limit.mockResolvedValue({ success: false })
    expect((await request("/api/health", {})).status).toBe(200)
    expect(apiLimit.limit).not.toHaveBeenCalled()
  })

  it("let requests through when the limiter itself is down", async () => {
    apiLimit.limit.mockRejectedValue(new Error("limiter unavailable"))
    lookupLimit.limit.mockRejectedValue(new Error("limiter unavailable"))

    const response = await request("/api/weather?lat=38.72&lon=-9.14", FROM_ALICE)
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual(READING)
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
    expect(await response.json()).toEqual(FORECAST_WITH_SOIL)
    expect(response.headers.get("X-Cache")).toBe("MISS")
    expect(response.headers.get("Cache-Control")).toBe("private, max-age=1800")
    expect(forecast).toHaveBeenCalledExactlyOnceWith(38.7, -9.1)
    expect(soilTemperature).toHaveBeenCalledExactlyOnceWith(38.7, -9.1)
  })

  it("still gives the forecast when the soil lookup fails", async () => {
    soilTemperature.mockRejectedValue(new WeatherProviderError("Open-Meteo request failed"))
    const response = await request("/api/forecast?lat=38.72&lon=-9.14")
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual(FORECAST)
  })

  it("gives the forecast alone when no soil provider is set up", async () => {
    deps.soilProvider = () => null
    const response = await request("/api/forecast?lat=38.72&lon=-9.14")
    expect(await response.json()).toEqual(FORECAST)
  })

  it("caches a forecast for three hours, apart from the current weather", async () => {
    await request("/api/forecast?lat=38.72&lon=-9.14")
    await request("/api/weather?lat=38.72&lon=-9.14")
    expect(cache.kv.put).toHaveBeenCalledWith(
      "weather:forecast:v2:38.7:-9.1",
      JSON.stringify(FORECAST_WITH_SOIL),
      { expirationTtl: 10_800 }
    )
    expect([...cache.store.keys()]).toEqual([
      "weather:forecast:v2:38.7:-9.1",
      "weather:now:v1:38.7:-9.1",
    ])
  })

  it("serves a second request in the same zone from the cache", async () => {
    await request("/api/forecast?lat=38.72&lon=-9.14")
    const response = await request("/api/forecast?lat=38.68&lon=-9.06")
    expect(await response.json()).toEqual(FORECAST_WITH_SOIL)
    expect(response.headers.get("X-Cache")).toBe("HIT")
    expect(forecast).toHaveBeenCalledTimes(1)
  })

  it("ignores a cache entry that no longer matches the schema", async () => {
    cache.store.set("weather:forecast:v2:38.7:-9.1", JSON.stringify([{ day: "monday" }]))
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

describe("GET /api/places", () => {
  it("rejects a request without a session before touching the provider", async () => {
    const response = await request("/api/places?q=Braga", {})
    expect(response.status).toBe(401)
    expect(await response.json()).toEqual({ error: "unauthorized" })
    expect(places).not.toHaveBeenCalled()
  })

  it.each([
    ["a missing name", "/api/places"],
    ["a single letter", "/api/places?q=B"],
    ["only spaces", "/api/places?q=%20%20%20"],
    ["a name longer than any place", `/api/places?q=${"a".repeat(81)}`],
  ])("rejects %s", async (_case, path) => {
    const response = await request(path)
    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({ error: "invalid_query" })
    expect(places).not.toHaveBeenCalled()
  })

  it("returns the matching places and marks them as fresh", async () => {
    const response = await request("/api/places?q=Braga")
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual(PLACES)
    expect(response.headers.get("X-Cache")).toBe("MISS")
    expect(response.headers.get("Cache-Control")).toBe("private, max-age=86400")
    expect(places).toHaveBeenCalledExactlyOnceWith("Braga")
  })

  it("caches a search for thirty days, whatever its case and spacing", async () => {
    await request("/api/places?q=%20Vila%20%20Nova%20DE%20Gaia%20")
    expect(places).toHaveBeenCalledExactlyOnceWith("Vila Nova DE Gaia")
    expect(cache.kv.put).toHaveBeenCalledWith(
      "places:v1:vila nova de gaia",
      JSON.stringify(PLACES),
      { expirationTtl: 2_592_000 }
    )
  })

  it("serves the same search again from the cache", async () => {
    await request("/api/places?q=Braga")
    const response = await request("/api/places?q=%20BRAGA")
    expect(await response.json()).toEqual(PLACES)
    expect(response.headers.get("X-Cache")).toBe("HIT")
    expect(places).toHaveBeenCalledTimes(1)
  })

  it("answers with an empty list when nothing matches", async () => {
    places.mockResolvedValue([])
    const response = await request("/api/places?q=Xyzzy")
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual([])
  })

  it("ignores a cache entry that no longer matches the schema", async () => {
    cache.store.set("places:v1:braga", JSON.stringify([{ town: "Braga" }]))
    const response = await request("/api/places?q=Braga")
    expect(response.headers.get("X-Cache")).toBe("MISS")
  })

  it("answers 503 when no provider is configured", async () => {
    deps.weatherProvider = () => null
    const response = await request("/api/places?q=Braga")
    expect(response.status).toBe(503)
    expect(await response.json()).toEqual({ error: "weather_not_configured" })
  })

  it("answers 502 when the provider fails, without caching the failure", async () => {
    places.mockRejectedValue(new WeatherProviderError("OpenWeather responded with status 500"))
    const response = await request("/api/places?q=Braga")
    expect(response.status).toBe(502)
    expect(await response.json()).toEqual({ error: "weather_unavailable" })
    expect(cache.kv.put).not.toHaveBeenCalled()
  })
})

describe("GET /api/shared/:token", () => {
  const TOKEN = "33333333-3333-4333-8333-333333333333"
  const PLAN = {
    schemaVersion: 1,
    widthCm: 600,
    heightCm: 400,
    cellCm: 10,
    beds: [],
    plantings: [],
  }
  const ROW = {
    name: "Allotment 12",
    plan: PLAN,
    location: null,
    updated_at: "2026-11-16T10:00:00+00:00",
  }

  it("opens a shared garden for a visitor with no session, and is never kept", async () => {
    sharedGarden.mockResolvedValue(ROW)
    const response = await request(`/api/shared/${TOKEN}`, {})
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      name: "Allotment 12",
      plan: PLAN,
      location: null,
      updatedAt: "2026-11-16T10:00:00+00:00",
    })
    // The owner may stop sharing at any moment: no copy should outlive that.
    expect(response.headers.get("Cache-Control")).toBe("no-store")
    expect(sharedGarden).toHaveBeenCalledExactlyOnceWith(expect.anything(), TOKEN)
  })

  it("passes on the location when the database gives one", async () => {
    const location = { lat: 41.55, lon: -8.43, name: "Braga" }
    sharedGarden.mockResolvedValue({ ...ROW, location })
    const response = await request(`/api/shared/${TOKEN}`, {})
    expect(await response.json()).toMatchObject({ location })
  })

  it("answers 404 for a link nobody made", async () => {
    const response = await request(`/api/shared/${TOKEN}`, {})
    expect(response.status).toBe(404)
    expect(await response.json()).toEqual({ error: "not_found" })
  })

  it.each([
    ["a word", "allotment"],
    ["a token cut short", TOKEN.slice(0, -1)],
  ])("answers 404 for %s without asking the database", async (_case, token) => {
    const response = await request(`/api/shared/${token}`, {})
    expect(response.status).toBe(404)
    expect(await response.json()).toEqual({ error: "not_found" })
    expect(sharedGarden).not.toHaveBeenCalled()
  })

  it("answers 502 when the database cannot be asked, without echoing the failure", async () => {
    sharedGarden.mockRejectedValue(new Error("connection refused"))
    const response = await request(`/api/shared/${TOKEN}`, {})
    expect(response.status).toBe(502)
    expect(await response.json()).toEqual({ error: "shared_unavailable" })
  })

  it("answers 502 when the database answers with something else", async () => {
    sharedGarden.mockResolvedValue({ title: "Allotment 12" })
    const response = await request(`/api/shared/${TOKEN}`, {})
    expect(response.status).toBe(502)
  })

  it("refuses a visitor who asks too often, before asking the database", async () => {
    apiLimit.limit.mockResolvedValue({ success: false })
    const response = await request(`/api/shared/${TOKEN}`, { "CF-Connecting-IP": "203.0.113.7" })
    expect(response.status).toBe(429)
    expect(apiLimit.limit).toHaveBeenCalledExactlyOnceWith({ key: "203.0.113.7" })
    expect(sharedGarden).not.toHaveBeenCalled()
  })
})

describe("POST /api/account/deletion", () => {
  function askToDelete(body?: unknown, headers: Record<string, string> = SIGNED_IN) {
    return createApp(deps).request(
      "https://leira.test/api/account/deletion",
      {
        method: "POST",
        headers: { "Content-Type": "application/json", ...headers },
        body: body === undefined ? undefined : JSON.stringify(body),
      },
      bindings()
    )
  }

  it("asks for the deletion as the caller and emails them the date, in their language", async () => {
    const response = await askToDelete({ locale: "pt" })
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ deleteOn: "2026-12-17T10:00:00.000Z", emailed: true })
    expect(requestDeletion).toHaveBeenCalledExactlyOnceWith(expect.anything(), VALID_TOKEN)
    expect(sendMail).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        to: "alice@example.com",
        subject: "A tua conta do Leira vai ser apagada a 17 de dezembro de 2026",
      })
    )
  })

  it("writes in English when asked", async () => {
    await askToDelete({ locale: "en" })
    expect(sendMail).toHaveBeenCalledWith(
      expect.objectContaining({ subject: "Your Leira account will be deleted on 17 December 2026" })
    )
  })

  it.each([
    ["no body", undefined],
    ["no language", {}],
  ])("writes in English with %s", async (_case, body) => {
    const response = await askToDelete(body)
    expect(response.status).toBe(200)
    expect(sendMail).toHaveBeenCalledWith(
      expect.objectContaining({ subject: expect.stringContaining("17 December 2026") })
    )
  })

  it("links to the gardens of the site it was asked on, where signing in keeps the account", async () => {
    await askToDelete({ locale: "en" })
    const [message] = sendMail.mock.calls[0]!
    expect(message.text).toContain("https://leira.test/gardens")
    expect(message.html).toContain('href="https://leira.test/gardens"')
  })

  it("rejects a language the app does not have, without asking the database", async () => {
    const response = await askToDelete({ locale: "fr" })
    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({ error: "invalid_body" })
    expect(requestDeletion).not.toHaveBeenCalled()
  })

  it.each([
    ["no Authorization header", {}],
    ["a token that does not verify", { Authorization: "Bearer forged" }],
  ])("rejects %s before touching anything", async (_case, headers) => {
    const response = await askToDelete({ locale: "en" }, headers)
    expect(response.status).toBe(401)
    expect(await response.json()).toEqual({ error: "unauthorized" })
    expect(requestDeletion).not.toHaveBeenCalled()
    expect(sendMail).not.toHaveBeenCalled()
  })

  // A guest has no email and no way to sign in again: it deletes at once instead.
  it("refuses a guest, without asking the database", async () => {
    const response = await askToDelete({ locale: "en" }, { Authorization: `Bearer ${GUEST_TOKEN}` })
    expect(response.status).toBe(403)
    expect(await response.json()).toEqual({ error: "guest" })
    expect(requestDeletion).not.toHaveBeenCalled()
    expect(sendMail).not.toHaveBeenCalled()
  })

  it("refuses an account with no email address to write to", async () => {
    const response = await askToDelete(
      { locale: "en" },
      { Authorization: `Bearer ${NO_EMAIL_TOKEN}` }
    )
    expect(response.status).toBe(403)
    expect(await response.json()).toEqual({ error: "no_email" })
    expect(requestDeletion).not.toHaveBeenCalled()
  })

  // Asking ends every session, so afterwards the token may no longer say who this is.
  it("reads who the caller is before the database ends their sessions", async () => {
    const steps: string[] = []
    deps.verifyToken = async (_env, token) => {
      steps.push("verify")
      return USERS[token] ?? null
    }
    requestDeletion.mockImplementation(async () => {
      steps.push("request")
      return DELETE_ON
    })
    sendMail.mockImplementation(async () => {
      steps.push("email")
    })

    await askToDelete({ locale: "en" })
    expect(steps).toEqual(["verify", "request", "email"])
  })

  it("answers 502 and sends nothing when the database refuses", async () => {
    requestDeletion.mockRejectedValue(new Error("connection refused"))
    const response = await askToDelete({ locale: "en" })
    expect(response.status).toBe(502)
    expect(await response.json()).toEqual({ error: "deletion_failed" })
    expect(sendMail).not.toHaveBeenCalled()
  })

  it("keeps the request and says so when the email cannot be sent", async () => {
    sendMail.mockRejectedValue(new Error("550 Invalid RCPT TO: <alice@example.com>"))
    const response = await askToDelete({ locale: "en" })
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ deleteOn: "2026-12-17T10:00:00.000Z", emailed: false })
    expect(console.error).toHaveBeenCalled()
    // The logs keep no email addresses, even when the server quotes one back.
    expect(vi.mocked(console.error).mock.calls.flat().join(" ")).not.toContain("alice@example.com")
  })

  it("asks for the deletion but sends nothing when no mail server is set up", async () => {
    deps.mailer = () => null
    const response = await askToDelete({ locale: "en" })
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ deleteOn: "2026-12-17T10:00:00.000Z", emailed: false })
    expect(requestDeletion).toHaveBeenCalledTimes(1)
  })

  // The token keeps working for up to an hour after its session ends, and
  // every email spends the quota of the account that sends the sign-in links.
  it("emails one request once, however often it is asked", async () => {
    await askToDelete({ locale: "en" })
    const again = await askToDelete({ locale: "en" })
    expect(await again.json()).toEqual({ deleteOn: "2026-12-17T10:00:00.000Z", emailed: true })
    expect(requestDeletion).toHaveBeenCalledTimes(2)
    expect(sendMail).toHaveBeenCalledTimes(1)
  })

  // Only the old session's access token can ask again for the same request,
  // and it expires within the hour: the mark need not keep the user id longer.
  it("remembers the email for two hours, while the old token can still ask", async () => {
    await askToDelete({ locale: "en" })
    expect(cache.kv.put).toHaveBeenCalledExactlyOnceWith(
      "deletion-email:v1:user-1:2026-12-17T10:00:00.000Z",
      "true",
      { expirationTtl: 2 * 3600 }
    )
  })

  it("tries the email again on the next request when it failed", async () => {
    sendMail.mockRejectedValueOnce(new Error("timeout"))
    await askToDelete({ locale: "en" })
    const again = await askToDelete({ locale: "en" })
    expect(await again.json()).toMatchObject({ emailed: true })
    expect(sendMail).toHaveBeenCalledTimes(2)
  })

  it("refuses a visitor who asks too often, before checking the session", async () => {
    const verifyToken = vi.spyOn(deps, "verifyToken")
    apiLimit.limit.mockResolvedValue({ success: false })
    const response = await askToDelete(
      { locale: "en" },
      { ...SIGNED_IN, "CF-Connecting-IP": "203.0.113.7" }
    )
    expect(response.status).toBe(429)
    expect(apiLimit.limit).toHaveBeenCalledExactlyOnceWith({ key: "203.0.113.7" })
    expect(verifyToken).not.toHaveBeenCalled()
    expect(requestDeletion).not.toHaveBeenCalled()
    expect(sendMail).not.toHaveBeenCalled()
  })
})
