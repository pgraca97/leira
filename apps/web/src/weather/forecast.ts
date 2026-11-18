import type { GardenLocation } from "@leira/core"
import type { Backend } from "../lib/backend"

/**
 * The query for the forecast where a garden is. The editor's panel and the
 * week on the garden list share it, so gardens in one zone ask once, and a
 * garden opened from the list already has its forecast.
 */
export function forecastQuery(backend: Backend, location: GardenLocation) {
  return {
    queryKey: ["forecast", location.lat, location.lon],
    queryFn: () => backend.forecast(location.lat, location.lon),
    // The server refreshes a zone's forecast every three hours at most.
    staleTime: 30 * 60 * 1000,
  }
}
