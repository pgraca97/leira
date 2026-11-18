import type { Forecast, IsoDate, Place, WeatherNow } from "@leira/core"
import type { Language } from "../../src/i18n/languages"

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
 * A source of places to locate a garden by. It stands apart from
 * `WeatherProvider`, whose geocoder names no municipality in Portugal.
 */
export interface PlaceProvider {
  /**
   * The places a name may refer to, best match first, at most ten, named in
   * `language`. Empty when nothing matches. Throws `WeatherProviderError` on
   * failure.
   */
  places(query: string, language: Language): Promise<Place[]>
}

/** The soil's mean temperature on one local day, 6 cm down. */
export interface SoilDay {
  date: IsoDate
  meanC: number
}

/**
 * A source of soil temperatures. It stands apart from `WeatherProvider`
 * because the main provider has none: the two can come from different vendors.
 */
export interface SoilProvider {
  /**
   * The coming days at a position, today first, split at local midnight.
   * Throws `WeatherProviderError` on failure.
   */
  soilTemperature(lat: number, lon: number): Promise<SoilDay[]>
}

/**
 * A provider failure. The message is safe to log: it never contains the
 * request URL, which may carry the API key.
 */
export class WeatherProviderError extends Error {
  override name = "WeatherProviderError"
}
