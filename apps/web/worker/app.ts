import {
  type Forecast,
  ForecastSchema,
  PlacesSchema,
  roundCoordinate,
  StoredPlanSchema,
  WeatherNowSchema,
} from "@leira/core"
import type { Context } from "hono"
import { Hono } from "hono"
import { createMiddleware } from "hono/factory"
import { z } from "zod"
import { fileNameFor } from "../src/export/fileName"
import { LANGUAGES, type Language } from "../src/i18n/languages"
import { calendarFeed } from "./calendarFeed"
import { deletionEmail } from "./deletionEmail"
import type { Mailer } from "./mail"
import { sharePreviewHead } from "./sharePreview"
import type { PlaceProvider, SoilDay, SoilProvider, WeatherProvider } from "./weather/provider"

/** Who an access token belongs to, as its claims say. */
export interface VerifiedUser {
  id: string
  /** Null for a guest, who has none. */
  email: string | null
  isAnonymous: boolean
}

/** What the routes need from the outside world. Tests pass fakes. */
export interface AppDeps {
  /** Resolves an access token to its user, or null when it is not valid. */
  verifyToken(env: Env, token: string): Promise<VerifiedUser | null>
  /** The weather provider to use, or null when none is configured. */
  weatherProvider(env: Env): WeatherProvider | null
  /** Where soil temperatures come from, or null when nowhere. */
  soilProvider(env: Env): SoilProvider | null
  /** Where a garden's location is looked up by name. */
  placeProvider(env: Env): PlaceProvider
  /**
   * The garden a share link opens, as the database hands it over, or null
   * when no link has that token. Throws when the database cannot be asked.
   */
  sharedGarden(env: Env, token: string): Promise<unknown>
  /**
   * The garden a calendar link reads, as the database hands it over, or null
   * when no link has that token. Throws when the database cannot be asked.
   */
  gardenCalendar(env: Env, token: string): Promise<unknown>
  /**
   * Asks the database, as the owner of the access token, to delete their
   * account after the grace period, and resolves to when it will be. Throws
   * when it cannot.
   */
  requestDeletion(env: Env, accessToken: string): Promise<Date>
  /** Where the Worker's emails go out, or null when no mail server is configured. */
  mailer(env: Env): Mailer | null
}

type AppEnv = {
  Bindings: Env
  /** Set by `requireUser` for the routes behind it. */
  Variables: { user: VerifiedUser; accessToken: string }
}

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
/**
 * How long the mark of a confirmation email is kept. Asking again for the
 * same request takes the old session's access token, which expires within
 * the hour (a new sign-in cancels the request instead), so twice that is
 * enough, and the user id is not kept for the month the account waits.
 */
const DELETION_EMAIL_MARK_SECONDS = 2 * 3600

const decimal = z
  .string()
  .regex(/^-?\d+(\.\d+)?$/)
  .transform(Number)

const WeatherQuerySchema = z.object({
  lat: decimal.pipe(z.number().min(-90).max(90)),
  lon: decimal.pipe(z.number().min(-180).max(180)),
})

/**
 * A place name as typed: trimmed, with runs of spaces collapsed, 2 to 80
 * characters. With it, the language to name the places in: English, the
 * app's own fallback, when it says none.
 */
const PlaceQuerySchema = z.object({
  q: z
    .string()
    .transform((text) => text.trim().replace(/\s+/g, " "))
    .pipe(z.string().min(2).max(80)),
  lang: z.enum(LANGUAGES).default("en"),
})

/**
 * What the browser sends with a request to delete the account: the language
 * to write the email in. English, the app's own fallback, when it says none.
 */
const DeletionRequestSchema = z.object({ locale: z.enum(LANGUAGES).default("en") })

/** A shared garden as the database hands it over. The browser checks the plan itself. */
const SharedGardenRowSchema = z.object({
  name: z.string(),
  plan: z.unknown(),
  location: z.unknown(),
  updated_at: z.string(),
})

/** A calendar link's file: its token and `.ics`, which some calendar apps look for. */
const CalendarFileSchema = z
  .string()
  .regex(/\.ics$/)
  .transform((file) => file.slice(0, -".ics".length))
  .pipe(z.uuid())

/** The language a calendar link writes its jobs in. English, the app's own fallback, when it says none. */
const CalendarQuerySchema = z.object({ lang: z.enum(LANGUAGES).default("en") })

/** A garden behind a calendar link as the database hands it over. */
const GardenCalendarRowSchema = z.object({ name: z.string(), plan: StoredPlanSchema })

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
    const user = token ? await deps.verifyToken(c.env, token) : null
    if (!token || !user) return c.json({ error: "unauthorized" }, 401)
    c.set("user", user)
    c.set("accessToken", token)
    await next()
  })

  app.get("/api/health", (c) => c.json({ ok: true }))

  /**
   * Proves to Google Search Console that the site is Paulo's. Served here,
   * not as a static file: the static files redirect `/name.html` to `/name`.
   */
  app.get(`/${GOOGLE_VERIFICATION}`, (c) =>
    c.text(`google-site-verification: ${GOOGLE_VERIFICATION}`)
  )

  /**
   * The public Supabase settings, so the browser reads them from the same
   * place as the Worker and a build works in every environment. Both values
   * are meant to be public: row level security is what protects the data.
   * So does the Turnstile site key, which the browser needs to solve the
   * captcha the auth server asks for. The Web Analytics token comes along only
   * where one is set.
   */
  app.get("/api/config", (c) => {
    const { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, TURNSTILE_SITE_KEY, WEB_ANALYTICS_TOKEN } =
      c.env
    if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY || !TURNSTILE_SITE_KEY) {
      return c.json({ error: "not_configured" }, 503)
    }
    return c.json(
      {
        supabaseUrl: SUPABASE_URL,
        supabasePublishableKey: SUPABASE_PUBLISHABLE_KEY,
        turnstileSiteKey: TURNSTILE_SITE_KEY,
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
  async function cached<T, P>(
    c: Context<AppEnv>,
    options: {
      /** Bump the version in the key when the stored shape changes. */
      cacheKey: string
      schema: z.ZodType<T>
      /** How long an answer is reused for everyone asking the same thing. */
      ttlSeconds: number
      /** How long the browser may reuse a response without asking again. */
      browserMaxAgeSeconds: number
      /** Who answers when the cache cannot, or null when no one is configured. */
      provider: P | null
      load(provider: P): Promise<T>
    }
  ) {
    const respond = (data: T, cache: "HIT" | "MISS") =>
      c.json(data, 200, {
        "Cache-Control": `private, max-age=${options.browserMaxAgeSeconds}`,
        "X-Cache": cache,
      })

    const stored = options.schema.safeParse(await readCache(c.env.CACHE, options.cacheKey))
    if (stored.success) return respond(stored.data, "HIT")

    const { provider } = options
    if (!provider) return c.json({ error: "weather_not_configured" }, 503)

    // Only now, with the cache unable to answer, does the request cost a call
    // to the provider and a write to the cache: those are counted on their own.
    if (!(await allowed(c.env.LOOKUP_LIMIT, visitorKey(c)))) return tooManyRequests(c)

    let data: T
    try {
      data = await options.load(provider)
    } catch (error) {
      // Log the error's own message only: never the request, which carries the API key.
      console.error("Lookup failed:", error instanceof Error ? error.message : "unknown")
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
        provider: deps.weatherProvider(c.env),
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
   * coordinates. It fails the way the weather routes do. The cache key
   * ignores case, "BRAGA" and "braga" being one search, but not the
   * language, which the places are named in.
   */
  app.get("/api/places", limitVisitor, requireUser, async (c) => {
    const query = PlaceQuerySchema.safeParse(c.req.query())
    if (!query.success) return c.json({ error: "invalid_query" }, 400)

    const { q: name, lang } = query.data
    return cached(c, {
      cacheKey: `places:v2:${lang}:${name.toLowerCase()}`,
      schema: PlacesSchema,
      ttlSeconds: PLACES_TTL_SECONDS,
      browserMaxAgeSeconds: PLACES_BROWSER_MAX_AGE_SECONDS,
      provider: deps.placeProvider(c.env),
      load: (provider) => provider.places(name, lang),
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

  /**
   * A garden's jobs as a calendar file, for the calendar apps that subscribe
   * to its link and read it again every few hours. They have no session: the
   * token is the permission, and a wrong one looks the same as none. Answers
   * are plain text, since a calendar app shows no JSON to anybody.
   */
  app.get("/api/calendar/:file", limitVisitor, async (c) => {
    const token = CalendarFileSchema.safeParse(c.req.param("file"))
    const query = CalendarQuerySchema.safeParse(c.req.query())
    if (!token.success || !query.success) return c.text("Not found", 404)

    let row: unknown
    try {
      row = await deps.gardenCalendar(c.env, token.data)
    } catch (error) {
      console.error(
        "Garden calendar lookup failed:",
        error instanceof Error ? error.message : "unknown"
      )
      return c.text("Calendar unavailable", 502)
    }
    if (row === null) return c.text("Not found", 404)

    const garden = GardenCalendarRowSchema.safeParse(row)
    if (!garden.success) {
      console.error("Garden calendar lookup returned an unexpected row")
      return c.text("Calendar unavailable", 502)
    }
    const feed = calendarFeed(garden.data, { language: query.data.lang, now: new Date() })
    return c.body(feed, 200, {
      "Content-Type": "text/calendar; charset=utf-8",
      // Not kept anywhere: turning the link off must end it.
      "Cache-Control": "no-store",
      "Content-Disposition": `inline; filename="${fileNameFor(garden.data.name, "ics")}"`,
    })
  })

  /**
   * Asks for the caller's account to be deleted after the grace period, and
   * emails them the date and how to keep it. Who the caller is comes from the
   * token before the database is asked, since asking ends all their sessions.
   * A guest is refused: with no email and no way to sign in again, it deletes
   * its user at once from the browser. An email that fails does not undo the
   * request; the answer says whether it went.
   */
  app.post("/api/account/deletion", limitVisitor, requireUser, async (c) => {
    const user = c.get("user")
    if (user.isAnonymous) return c.json({ error: "guest" }, 403)
    if (!user.email) return c.json({ error: "no_email" }, 403)

    // No body, or one that is not JSON, names no language.
    const body = DeletionRequestSchema.safeParse(await c.req.json().catch(() => ({})))
    if (!body.success) return c.json({ error: "invalid_body" }, 400)

    let deleteOn: Date
    try {
      deleteOn = await deps.requestDeletion(c.env, c.get("accessToken"))
    } catch (error) {
      console.error("Deletion request failed:", error instanceof Error ? error.message : "unknown")
      return c.json({ error: "deletion_failed" }, 502)
    }

    const emailed = await emailDeletion(c, {
      userId: user.id,
      to: user.email,
      language: body.data.locale,
      deleteOn,
    })
    return c.json({ deleteOn: deleteOn.toISOString(), emailed })
  })

  /**
   * Emails the confirmation of a deletion request, once per request. The
   * token can still be used for up to an hour after its session ends, and
   * every email spends the daily quota of the Gmail account that also sends
   * the sign-in links: without the mark, one person could use it all up.
   * True when the email has gone, now or on an earlier call.
   */
  async function emailDeletion(
    c: Context<AppEnv>,
    request: { userId: string; to: string; language: Language; deleteOn: Date }
  ): Promise<boolean> {
    const mailer = deps.mailer(c.env)
    if (!mailer) return false

    const mark = `deletion-email:v1:${request.userId}:${request.deleteOn.toISOString()}`
    if ((await readCache(c.env.CACHE, mark)) !== null) return true

    try {
      await mailer.send({
        to: request.to,
        ...deletionEmail({
          language: request.language,
          deleteOn: request.deleteOn,
          // The site the request came to, so a local stack's email points at itself.
          gardensUrl: new URL("/gardens", c.req.url).href,
        }),
      })
    } catch (error) {
      console.error("Deletion email failed:", withoutAddresses(error))
      return false
    }

    try {
      await c.env.CACHE.put(mark, "true", { expirationTtl: DELETION_EMAIL_MARK_SECONDS })
    } catch {
      console.warn("Could not mark the deletion email as sent")
    }
    return true
  }

  /**
   * The app's own pages. The landing page and the 404 pages are static files,
   * so the app shell cannot be the `index.html` that a single-page app falls
   * back to: it is `app.html`, and `run_worker_first` in wrangler.jsonc sends
   * the app's paths here instead. The router then shows the page, or says
   * there is none.
   */
  async function appShell(c: Context<AppEnv>): Promise<Response> {
    // `/app`, not `/app.html`: the static files answer that with a redirect.
    const shell = await c.env.ASSETS.fetch(new URL("/app", c.req.url))
    const response = new Response(shell.body, shell)
    // A garden, a share link or the stats are nobody's search result.
    if (!PUBLIC_APP_PAGES.has(c.req.path)) response.headers.set("X-Robots-Tag", "noindex")
    return response
  }

  /**
   * A share link's page: the app shell, with a head that names the garden
   * for the link previews of chat apps, which run none of its script.
   * Whatever goes wrong on the way gives the plain shell, since the page
   * itself must still open and say what it can.
   */
  app.get("/shared/:token", async (c) => {
    const [shell, name] = await Promise.all([appShell(c), sharedGardenName(c)])
    if (name === null) return shell
    const html = sharePreviewHead(await shell.text(), { name, url: c.req.url })
    const response = new Response(html, shell)
    // The body is no longer the shell the tag and length describe.
    response.headers.delete("ETag")
    response.headers.delete("Content-Length")
    // The owner may stop sharing at any moment: no copy should outlive that.
    response.headers.set("Cache-Control", "no-store")
    return response
  })

  /**
   * The name of the garden behind a share link, or null when there is none
   * to show. It counts against the same limit as `/api/shared/:token`, so
   * the page is not a way round it; a visitor over the limit still gets the
   * page, only without the name.
   */
  async function sharedGardenName(c: Context<AppEnv>): Promise<string | null> {
    const token = z.uuid().safeParse(c.req.param("token"))
    if (!token.success) return null
    if (!(await allowed(c.env.API_LIMIT, visitorKey(c)))) return null
    try {
      const row = SharedGardenRowSchema.safeParse(await deps.sharedGarden(c.env, token.data))
      return row.success ? row.data.name : null
    } catch (error) {
      console.error(
        "Shared garden lookup for a preview failed:",
        error instanceof Error ? error.message : "unknown"
      )
      return null
    }
  }

  app.get("*", async (c, next) => {
    if (c.req.path.startsWith("/api/")) return next()
    return appShell(c)
  })

  app.notFound((c) => c.json({ error: "not_found" }, 404))

  return app
}

/** The file Google Search Console asked for, by its name. */
const GOOGLE_VERIFICATION = "google2109b0318d502cf4.html"

/** The app pages meant for anyone to find. The rest belong to someone. */
const PUBLIC_APP_PAGES = new Set(["/privacy"])

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

/**
 * An error's message with any email address taken out. An SMTP server may
 * quote the recipient back, and the logs keep no email addresses.
 */
function withoutAddresses(error: unknown): string {
  const message = error instanceof Error ? error.message : "unknown"
  return message.replace(/[^\s<>@]+@[^\s<>@]+/g, "<address>")
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
