import { roundCoordinate, type WeatherNow, WeatherNowSchema } from "@garden/core"
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

/** How long a weather reading is reused for everyone in the same zone. */
const WEATHER_TTL_SECONDS = 3600
/** How long the browser may reuse a response without asking again. */
const WEATHER_BROWSER_MAX_AGE_SECONDS = 600
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
   * Current weather for a position. Only signed-in users may call it, and
   * readings are cached per zone, so the provider's quota is spent once per
   * zone per hour however many people ask.
   */
  app.get("/api/weather", requireUser, async (c) => {
    const query = WeatherQuerySchema.safeParse(c.req.query())
    if (!query.success) return c.json({ error: "invalid_coordinates" }, 400)

    const lat = roundCoordinate(query.data.lat, ZONE_DECIMALS)
    const lon = roundCoordinate(query.data.lon, ZONE_DECIMALS)
    const cacheKey = `weather:now:v1:${lat.toFixed(ZONE_DECIMALS)}:${lon.toFixed(ZONE_DECIMALS)}`

    const respond = (weather: WeatherNow, cache: "HIT" | "MISS") =>
      c.json(weather, 200, {
        "Cache-Control": `private, max-age=${WEATHER_BROWSER_MAX_AGE_SECONDS}`,
        "X-Cache": cache,
      })

    const cached = WeatherNowSchema.safeParse(await readCache(c.env.CACHE, cacheKey))
    if (cached.success) return respond(cached.data, "HIT")

    const provider = deps.weatherProvider(c.env)
    if (!provider) return c.json({ error: "weather_not_configured" }, 503)

    let weather: WeatherNow
    try {
      weather = await provider.current(lat, lon)
    } catch (error) {
      // Log the error's own message only: never the request, which carries the API key.
      console.error("Weather lookup failed:", error instanceof Error ? error.message : "unknown")
      return c.json({ error: "weather_unavailable" }, 502)
    }

    await writeCache(c.env.CACHE, cacheKey, weather)
    return respond(weather, "MISS")
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

async function writeCache(cache: KVNamespace, key: string, weather: WeatherNow): Promise<void> {
  try {
    await cache.put(key, JSON.stringify(weather), { expirationTtl: WEATHER_TTL_SECONDS })
  } catch {
    console.warn("Could not cache the weather reading")
  }
}
