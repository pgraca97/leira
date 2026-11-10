import { createApp } from "./app"
import { verifySupabaseToken } from "./auth"
import { openWeather } from "./weather/openweather"

export default createApp({
  verifyToken: verifySupabaseToken,
  weatherProvider: (env) => (env.OPENWEATHER_API_KEY ? openWeather(env.OPENWEATHER_API_KEY) : null),
})
