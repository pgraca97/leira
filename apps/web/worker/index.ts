import { createApp } from "./app"
import { verifySupabaseToken } from "./auth"
import { fetchSharedGarden } from "./shared"
import { openWeather } from "./weather/openweather"

export default createApp({
  verifyToken: verifySupabaseToken,
  sharedGarden: fetchSharedGarden,
  weatherProvider: (env) => (env.OPENWEATHER_API_KEY ? openWeather(env.OPENWEATHER_API_KEY) : null),
})
