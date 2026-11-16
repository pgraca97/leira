import type { PublicBackend } from "./backend"
import { GardenNotFoundError, parseSharedGarden } from "./gardens"

/** Asks the Worker, which needs no session for what a share link opens. */
export const workerPublicBackend: PublicBackend = {
  async sharedGarden(token) {
    const response = await fetch(`/api/shared/${encodeURIComponent(token)}`)
    if (response.status === 404) throw new GardenNotFoundError(token)
    if (!response.ok) throw new Error(`Shared garden request failed: ${response.status}`)
    return parseSharedGarden(await response.json())
  },
}
