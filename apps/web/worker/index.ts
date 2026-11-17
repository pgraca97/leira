import { requestAccountDeletion } from "./account"
import { createApp } from "./app"
import { verifySupabaseToken } from "./auth"
import { smtpMailer } from "./mail"
import { fetchSharedGarden } from "./shared"
import { openMeteo } from "./weather/openmeteo"
import { openWeather } from "./weather/openweather"

export default createApp({
  verifyToken: verifySupabaseToken,
  sharedGarden: fetchSharedGarden,
  requestDeletion: requestAccountDeletion,
  mailer: smtpMailer,
  weatherProvider: (env) => (env.OPENWEATHER_API_KEY ? openWeather(env.OPENWEATHER_API_KEY) : null),
  // Open-Meteo needs no key, so it is always there.
  soilProvider: () => openMeteo(),
})
