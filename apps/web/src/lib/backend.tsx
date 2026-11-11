import type { WeatherNow } from "@garden/core"
import { createContext, useContext } from "react"
import type { GardensApi } from "./gardens"

/** Everything the pages need from the server. Tests pass an in-memory one. */
export interface Backend {
  gardens: GardensApi
  /** Current weather at a position. Rejects when it is unavailable. */
  weather(lat: number, lon: number): Promise<WeatherNow>
}

export const BackendContext = createContext<Backend | null>(null)

export function useBackend(): Backend {
  const backend = useContext(BackendContext)
  if (!backend) throw new Error("useBackend needs a BackendContext provider")
  return backend
}
