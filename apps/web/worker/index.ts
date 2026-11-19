import { requestAccountDeletion } from "./account"
import { createApp } from "./app"
import { verifySupabaseToken } from "./auth"
import { fetchGardenCalendar } from "./calendarFeed"
import { keepAwake } from "./keepAwake"
import { smtpMailer } from "./mail"
import { fetchSharedGarden } from "./shared"
import { supabaseClient } from "./supabase"
import { openMeteo, openMeteoPlaces } from "./weather/openmeteo"
import { openWeather } from "./weather/openweather"

const app = createApp({
  verifyToken: verifySupabaseToken,
  sharedGarden: fetchSharedGarden,
  gardenCalendar: fetchGardenCalendar,
  requestDeletion: requestAccountDeletion,
  mailer: smtpMailer,
  weatherProvider: (env) => (env.OPENWEATHER_API_KEY ? openWeather(env.OPENWEATHER_API_KEY) : null),
  // Open-Meteo needs no key, so it is always there.
  soilProvider: () => openMeteo(),
  placeProvider: () => openMeteoPlaces(),
})

export default {
  fetch: app.fetch,
  // The crons in wrangler.jsonc. A run that throws shows as failed in the Worker's logs.
  scheduled(_controller, env, ctx) {
    ctx.waitUntil(keepAwake(supabaseClient(env)))
  },
} satisfies ExportedHandler<Env>
