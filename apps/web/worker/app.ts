import {
  type Forecast,
  ForecastSchema,
  PlacesSchema,
  roundCoordinate,
  WeatherNowSchema,
} from "@leira/core"
import type { Context } from "hono"
import { Hono } from "hono"
import { createMiddleware } from "hono/factory"
import { z } from "zod"
import type { SoilDay, SoilProvider, WeatherProvider } from "./weather/provider"

/** What the routes need from the outside world. Tests pass fakes. */
export interface AppDeps {
  /** Resolves an access token to a user id, or null when it is not valid. */
  verifyToken(env: Env, token: string): Promise<string | null>
  /** The weather provider to use, or null when none is configured. */
  weatherProvider(env: Env): WeatherProvider | null
  /** Where soil temperatures come from, or null when nowhere. */
  soilProvider(env: Env): SoilProvider | null
  /**
   * The garden a share link opens, as the database hands it over, or null
   * when no link has that token. Throws when the database cannot be asked.
   */
  sharedGarden(env: Env, token: string): Promise<unknown>
}

type AppEnv = { Bindings: Env }

/** A reading of the current weather goes stale within the hour. */
const WEATHER_TTL_SECONDS = 3600
const WEATHER_BROWSER_MAX_AGE_SECONDS = 600
/** The provider publishes its forecast in three-hour steps, so that is how long one lasts. */
const FORECAST_TTL_SECONDS = 3 * 3600
const FORECAST_BROWSER_MAX_AGE_SECONDS = 1800
/** Zones are 0.1 degrees wide, about 11 km: weather does not vary much within one. */
const ZONE_DECIMALS = 1
/** A town does not move, so a search for its name is good for a month. */
const PLACES_TTL_SECONDS = 30 * 24 * 3600
const PLACES_BROWSER_MAX_AGE_SECONDS = 24 * 3600
/** The window both rate limiters count over, as set in wrangler.jsonc. */
const RATE_LIMIT_PERIOD_SECONDS = 60

const decimal = z
  .string()
  .regex(/^-?\d+(\.\d+)?$/)
  .transform(Number)

const WeatherQuerySchema = z.object({
  lat: decimal.pipe(z.number().min(-90).max(90)),
  lon: decimal.pipe(z.number().min(-180).max(180)),
})

/** A place name as typed: trimmed, with runs of spaces collapsed, 2 to 80 characters. */
const PlaceQuerySchema = z.object({
  q: z
    .string()
    .transform((text) => text.trim().replace(/\s+/g, " "))
    .pipe(z.string().min(2).max(80)),
})

/** A shared garden as the database hands it over. The browser checks the plan itself. */
const SharedGardenRowSchema = z.object({
  name: z.string(),
  plan: z.unknown(),
  location: z.unknown(),
  updated_at: z.string(),
})

export function createApp(deps: AppDeps) {
  const app = new Hono<AppEnv>()

  /**
   * Stops one address from calling the routes that cost something more than
   * `API_LIMIT` allows. It runs before the session check, so a flood of bad
   * tokens is counted too.
   */
  const limitVisitor = createMiddleware<AppEnv>(async (c, next) => {
    if (!(await allowed(c.env.API_LIMIT, visitorKey(c)))) return tooManyRequests(c)
    await next()
  })

  const requireUser = createMiddleware<AppEnv>(async (c, next) => {
    const token = c.req.header("Authorization")?.match(/^Bearer (\S+)$/)?.[1]
    const userId = token ? await deps.verifyToken(c.env, token) : null
    if (!userId) return c.json({ error: "unauthorized" }, 401)
    await next()
  })

  app.get("/api/health", (c) => c.json({ ok: true }))

  /**
   * The public Supabase settings, so the browser reads them from the same
   * place as the Worker and a build works in every environment. Both values
   * are meant to be public: row level security is what protects the data.
   * The Web Analytics token comes along only where one is set.
   */
  app.get("/api/config", (c) => {
    const { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, WEB_ANALYTICS_TOKEN } = c.env
    if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY) {
      return c.json({ error: "not_configured" }, 503)
    }
    return c.json(
      {
        supabaseUrl: SUPABASE_URL,
        supabasePublishableKey: SUPABASE_PUBLISHABLE_KEY,
        ...(WEB_ANALYTICS_TOKEN ? { webAnalyticsToken: WEB_ANALYTICS_TOKEN } : {}),
      },
      200,
      { "Cache-Control": "public, max-age=300" }
    )
  })

  /**
   * Answers from the cache when it can, and from the provider otherwise,
   * keeping what the provider said for `ttlSeconds`. The provider's quota is
   * then spent once per key however many people ask.
   */
  async function cached<T>(
    c: Context<AppEnv>,
    options: {
      /** Bump the version in the key when the stored shape changes. */
      cacheKey: string
      schema: z.ZodType<T>
      /** How long an answer is reused for everyone asking the same thing. */
      ttlSeconds: number
      /** How long the browser may reuse a response without asking again. */
      browserMaxAgeSeconds: number
      load(provider: WeatherProvider): Promise<T>
    }
  ) {
    const respond = (data: T, cache: "HIT" | "MISS") =>
      c.json(data, 200, {
        "Cache-Control": `private, max-age=${options.browserMaxAgeSeconds}`,
        "X-Cache": cache,
      })

    const stored = options.schema.safeParse(await readCache(c.env.CACHE, options.cacheKey))
    if (stored.success) return respond(stored.data, "HIT")

    const provider = deps.weatherProvider(c.env)
    if (!provider) return c.json({ error: "weather_not_configured" }, 503)

    // Only now, with the cache unable to answer, does the request cost a call
    // to the provider and a write to the cache: those are counted on their own.
    if (!(await allowed(c.env.LOOKUP_LIMIT, visitorKey(c)))) return tooManyRequests(c)

    let data: T
    try {
      data = await options.load(provider)
    } catch (error) {
      // Log the error's own message only: never the request, which carries the API key.
      console.error("Weather lookup failed:", error instanceof Error ? error.message : "unknown")
      return c.json({ error: "weather_unavailable" }, 502)
    }

    await writeCache(c.env.CACHE, options.cacheKey, data, options.ttlSeconds)
    return respond(data, "MISS")
  }

  /**
   * A route that answers with weather data for a position. Only signed-in
   * users may call it, a limited number of times a minute, and answers are
   * cached per zone, so nearby gardens share one call to the provider.
   */
  function zoneRoute<T>(options: {
    path: string
    /** Start of the cache key. Bump its version when the stored shape changes. */
    cachePrefix: string
    schema: z.ZodType<T>
    ttlSeconds: number
    browserMaxAgeSeconds: number
    load(provider: WeatherProvider, lat: number, lon: number, env: Env): Promise<T>
  }) {
    app.get(options.path, limitVisitor, requireUser, async (c) => {
      const query = WeatherQuerySchema.safeParse(c.req.query())
      if (!query.success) return c.json({ error: "invalid_coordinates" }, 400)

      const lat = roundCoordinate(query.data.lat, ZONE_DECIMALS)
      const lon = roundCoordinate(query.data.lon, ZONE_DECIMALS)
      return cached(c, {
        cacheKey: `${options.cachePrefix}:${lat.toFixed(ZONE_DECIMALS)}:${lon.toFixed(ZONE_DECIMALS)}`,
        schema: options.schema,
        ttlSeconds: options.ttlSeconds,
        browserMaxAgeSeconds: options.browserMaxAgeSeconds,
        load: (provider) => options.load(provider, lat, lon, c.env),
      })
    })
  }

  zoneRoute({
    path: "/api/weather",
    cachePrefix: "weather:now:v1",
    schema: WeatherNowSchema,
    ttlSeconds: WEATHER_TTL_SECONDS,
    browserMaxAgeSeconds: WEATHER_BROWSER_MAX_AGE_SECONDS,
    load: (provider, lat, lon) => provider.current(lat, lon),
  })

  zoneRoute({
    path: "/api/forecast",
    cachePrefix: "weather:forecast:v2",
    schema: ForecastSchema,
    ttlSeconds: FORECAST_TTL_SECONDS,
    browserMaxAgeSeconds: FORECAST_BROWSER_MAX_AGE_SECONDS,
    load: async (provider, lat, lon, env) => {
      const [forecast, soil] = await Promise.all([
        provider.forecast(lat, lon),
        soilDays(deps.soilProvider(env), lat, lon),
      ])
      return withSoil(forecast, soil)
    },
  })

  /**
   * The places a typed name may refer to, so a garden can be located without
   * coordinates. It goes through the weather provider, so it fails the way
   * the weather routes do. The cache key ignores case: "BRAGA" and "braga"
   * are one search.
   */
  app.get("/api/places", limitVisitor, requireUser, async (c) => {
    const query = PlaceQuerySchema.safeParse(c.req.query())
    if (!query.success) return c.json({ error: "invalid_query" }, 400)

    const name = query.data.q
    return cached(c, {
      cacheKey: `places:v1:${name.toLowerCase()}`,
      schema: PlacesSchema,
      ttlSeconds: PLACES_TTL_SECONDS,
      browserMaxAgeSeconds: PLACES_BROWSER_MAX_AGE_SECONDS,
      load: (provider) => provider.places(name),
    })
  })

  /**
   * The garden behind a share link, for anyone who has the link: this is the
   * one route with data that asks for no session, so opening a link does not
   * create a guest account. The token is the permission, and a wrong one
   * looks the same as none.
   */
  app.get("/api/shared/:token", limitVisitor, async (c) => {
    const token = z.uuid().safeParse(c.req.param("token"))
    if (!token.success) return c.json({ error: "not_found" }, 404)

    let row: unknown
    try {
      row = await deps.sharedGarden(c.env, token.data)
    } catch (error) {
      console.error(
        "Shared garden lookup failed:",
        error instanceof Error ? error.message : "unknown"
      )
      return c.json({ error: "shared_unavailable" }, 502)
    }
    if (row === null) return c.json({ error: "not_found" }, 404)

    const shared = SharedGardenRowSchema.safeParse(row)
    if (!shared.success) {
      console.error("Shared garden lookup returned an unexpected row")
      return c.json({ error: "shared_unavailable" }, 502)
    }
    const { name, plan, location, updated_at } = shared.data
    // Not kept anywhere: the owner may stop sharing at any moment.
    return c.json({ name, plan, location: location ?? null, updatedAt: updated_at }, 200, {
      "Cache-Control": "no-store",
    })
  })

  app.notFound((c) => c.json({ error: "not_found" }, 404))

  return app
}

/**
 * The soil temperatures for a zone, or none when they cannot be had: they add
 * to the forecast, so their absence must not take it down.
 */
async function soilDays(
  provider: SoilProvider | null,
  lat: number,
  lon: number
): Promise<SoilDay[]> {
  if (!provider) return []
  try {
    return await provider.soilTemperature(lat, lon)
  } catch (error) {
    console.error("Soil lookup failed:", error instanceof Error ? error.message : "unknown")
    return []
  }
}

/** Puts each day's soil temperature on the forecast day it belongs to. */
function withSoil(forecast: Forecast, soil: readonly SoilDay[]): Forecast {
  const byDate = new Map(soil.map((day) => [day.date, day.meanC]))
  return forecast.map((day) => {
    const soilC = byDate.get(day.date)
    return soilC === undefined ? day : { ...day, soilC }
  })
}

/**
 * What the rate limiters count by: the address Cloudflare saw the request
 * come from. An account would not do, since a guest can make a new one at will.
 * An IPv6 address counts by its /64 block: a machine is usually given a whole
 * block and can take any address in it.
 */
function visitorKey(c: Context<AppEnv>): string {
  const address = c.req.header("CF-Connecting-IP") ?? "unknown"
  return address.includes(":") ? ipv6Block(address) : address
}

/**
 * The /64 block an IPv6 address belongs to, in one spelling whichever way the
 * address was written (case, leading zeros, `::`). An address it cannot read
 * is its own key, so a strange header never fails the request.
 */
function ipv6Block(address: string): string {
  const halves = address.toLowerCase().split("::")
  if (halves.length > 2) return address
  const [head = [], tail] = halves.map((half) => (half ? half.split(":") : []))
  const missing = tail === undefined ? 0 : 8 - head.length - tail.length
  if (missing < 0) return address
  const groups = [...head, ...Array<string>(missing).fill("0"), ...(tail ?? [])]
  const block = groups.slice(0, 4).map((group) => group.replace(/^0+(?=.)/, ""))
  return `${block.join(":")}::/64`
}

/** A limiter that is down lets requests through: it must not take the endpoint down with it. */
async function allowed(limiter: RateLimit, key: string): Promise<boolean> {
  try {
    return (await limiter.limit({ key })).success
  } catch {
    return true
  }
}

function tooManyRequests(c: Context<AppEnv>) {
  return c.json({ error: "rate_limited" }, 429, {
    "Retry-After": String(RATE_LIMIT_PERIOD_SECONDS),
  })
}

/** A cache that is down must not take the endpoint down with it. */
async function readCache(cache: KVNamespace, key: string): Promise<unknown> {
  try {
    return await cache.get(key, "json")
  } catch {
    return null
  }
}

async function writeCache(
  cache: KVNamespace,
  key: string,
  data: unknown,
  ttlSeconds: number
): Promise<void> {
  try {
    await cache.put(key, JSON.stringify(data), { expirationTtl: ttlSeconds })
  } catch {
    console.warn("Could not cache the weather data")
  }
}
