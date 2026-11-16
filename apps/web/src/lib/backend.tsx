import type { Forecast, Place, WeatherNow } from "@leira/core"
import { createContext, useContext } from "react"
import type { AccountApi } from "./account"
import type { GardensApi, SharedGarden } from "./gardens"

/** Everything the pages need from the server. Tests pass an in-memory one. */
export interface Backend {
  gardens: GardensApi
  account: AccountApi
  /** Current weather at a position. Rejects when it is unavailable. */
  weather(lat: number, lon: number): Promise<WeatherNow>
  /** The coming days at a position, today first. Rejects when it is unavailable. */
  forecast(lat: number, lon: number): Promise<Forecast>
  /** The places a name may refer to, best match first. Empty when nothing matches. */
  places(query: string): Promise<Place[]>
}

export const BackendContext = createContext<Backend | null>(null)

export function useBackend(): Backend {
  const backend = useContext(BackendContext)
  if (!backend) throw new Error("useBackend needs a BackendContext provider")
  return backend
}

/**
 * What a page may ask the server with no session at all. It is apart from
 * `Backend` because connecting that one signs the visitor in as a guest, and
 * opening a link someone sent should not create an account.
 */
export interface PublicBackend {
  /**
   * The garden a share link opens. Rejects with `GardenNotFoundError` when
   * the link opens nothing: never made, or turned off by the owner.
   */
  sharedGarden(token: string): Promise<SharedGarden>
}

export const PublicBackendContext = createContext<PublicBackend | null>(null)

export function usePublicBackend(): PublicBackend {
  const backend = useContext(PublicBackendContext)
  if (!backend) throw new Error("usePublicBackend needs a PublicBackendContext provider")
  return backend
}
