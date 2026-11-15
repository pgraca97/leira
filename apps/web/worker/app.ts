import { ForecastSchema, roundCoordinate, WeatherNowSchema } from "@leira/core"
import { Hono } from "hono"
import { createMiddleware } from "hono/factory"
import { z } from "zod"
import type { WeatherProvider } from "./weather/provider"

/** What the routes need from the outside world. Tests pass fakes. */
export interface AppDeps {
  /** Resolves an access token to a user id, or null when it is not valid. */
  verifyToken(env: Env, token: string): Promise<string | null>
  /** The weather provider to use, or null when none is configured. */
  weatherProvider(env: Env): WeatherProvider | null
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

const decimal = z
  .string()
  .regex(/^-?\d+(\.\d+)?$/)
  .transform(Number)

const WeatherQuerySchema = z.object({
  lat: decimal.pipe(z.number().min(-90).max(90)),
  lon: decimal.pipe(z.number().min(-180).max(180)),
})

export function createApp(deps: AppDeps) {
  const app = new Hono<AppEnv>()

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
   */
  app.get("/api/config", (c) => {
    const { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } = c.env
    if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY) {
      return c.json({ error: "not_configured" }, 503)
    }
    return c.json(
      { supabaseUrl: SUPABASE_URL, supabasePublishableKey: SUPABASE_PUBLISHABLE_KEY },
      200,
      { "Cache-Control": "public, max-age=300" }
    )
  })

  /**
   * A route that answers with weather data for a position. Only signed-in
   * users may call it, and answers are cached per zone, so the provider's
   * quota is spent once per zone per `ttlSeconds` however many people ask.
   */
  function zoneRoute<T>(options: {
    path: string
    /** Start of the cache key. Bump its version when the stored shape changes. */
    cachePrefix: string
    schema: z.ZodType<T>
    /** How long an answer is reused for everyone in the same zone. */
    ttlSeconds: number
    /** How long the browser may reuse a response without asking again. */
    browserMaxAgeSeconds: number
    load(provider: WeatherProvider, lat: number, lon: number): Promise<T>
  }) {
    app.get(options.path, requireUser, async (c) => {
      const query = WeatherQuerySchema.safeParse(c.req.query())
      if (!query.success) return c.json({ error: "invalid_coordinates" }, 400)

      const lat = roundCoordinate(query.data.lat, ZONE_DECIMALS)
      const lon = roundCoordinate(query.data.lon, ZONE_DECIMALS)
      const cacheKey = `${options.cachePrefix}:${lat.toFixed(ZONE_DECIMALS)}:${lon.toFixed(ZONE_DECIMALS)}`

      const respond = (data: T, cache: "HIT" | "MISS") =>
        c.json(data, 200, {
          "Cache-Control": `private, max-age=${options.browserMaxAgeSeconds}`,
          "X-Cache": cache,
        })

      const cached = options.schema.safeParse(await readCache(c.env.CACHE, cacheKey))
      if (cached.success) return respond(cached.data, "HIT")

      const provider = deps.weatherProvider(c.env)
      if (!provider) return c.json({ error: "weather_not_configured" }, 503)

      let data: T
      try {
        data = await options.load(provider, lat, lon)
      } catch (error) {
        // Log the error's own message only: never the request, which carries the API key.
        console.error("Weather lookup failed:", error instanceof Error ? error.message : "unknown")
        return c.json({ error: "weather_unavailable" }, 502)
      }

      await writeCache(c.env.CACHE, cacheKey, data, options.ttlSeconds)
      return respond(data, "MISS")
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
    cachePrefix: "weather:forecast:v1",
    schema: ForecastSchema,
    ttlSeconds: FORECAST_TTL_SECONDS,
    browserMaxAgeSeconds: FORECAST_BROWSER_MAX_AGE_SECONDS,
    load: (provider, lat, lon) => provider.forecast(lat, lon),
  })

  app.notFound((c) => c.json({ error: "not_found" }, 404))

  return app
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
