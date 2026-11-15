import type { Forecast, WeatherNow } from "@leira/core"

/**
 * A source of weather data. The routes depend on this interface, not on a
 * vendor, so the provider can be swapped (or faked in tests) in one place.
 */
export interface WeatherProvider {
  /** Current conditions at a position. Throws `WeatherProviderError` on failure. */
  current(lat: number, lon: number): Promise<WeatherNow>
  /**
   * The coming days at a position, today first, split at local midnight.
   * Throws `WeatherProviderError` on failure.
   */
  forecast(lat: number, lon: number): Promise<Forecast>
}

/**
 * A provider failure. The message is safe to log: it never contains the
 * request URL, which may carry the API key.
 */
export class WeatherProviderError extends Error {
  override name = "WeatherProviderError"
}
