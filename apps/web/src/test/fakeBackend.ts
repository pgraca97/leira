import { type Forecast, type Place, publicPlan, type WeatherNow } from "@leira/core"
import type { Backend, PublicBackend } from "../lib/backend"
import {
  type Garden,
  GardenConflictError,
  GardenNotFoundError,
  type GardenShare,
  type GardensApi,
} from "../lib/gardens"
import { StatsForbiddenError, type UsageStats } from "../lib/stats"

export interface FakeBackend extends Backend {
  /** The stored gardens, to seed and to inspect. */
  rows: Map<string, Garden>
  /** The share links, by garden id, to seed and to inspect. */
  shares: Map<string, GardenShare>
  /** Makes the next change to a share link fail. */
  failNextShare(): void
  /** What a visitor with no session can reach: the gardens above, through their links. */
  publicBackend: PublicBackend
  /** Makes the next save of this kind fail. */
  failNextSave(error: Error): void
  /** What `weather` answers: a reading, or an error to throw. */
  weatherResult: WeatherNow | Error
  weatherCalls: { lat: number; lon: number }[]
  /** What `forecast` answers: the coming days, or an error to throw. */
  forecastResult: Forecast | Error
  /** What `places` answers: the matches, or an error to throw. */
  placesResult: Place[] | Error
  /** The names searched for, in order. */
  placeQueries: string[]
  /** The signed-in address, or null for a guest. */
  email: string | null
  /** The addresses a link was asked for, in order. */
  linkRequests: string[]
  /** Makes the next request for a link fail. */
  failNextLink(): void
  /** How many times the visitor was sent to Google. */
  googleStarts: number
  /** Makes the next trip to Google fail before it starts. */
  failNextGoogle(): void
  /** How many times the user deleted their account. */
  deletedAccounts: number
  /** Makes the next export of the user's data fail. */
  failNextExport(): void
  /** Makes the next deletion of the account fail, keeping everything. */
  failNextDelete(): void
  /** Whether the visitor may read the usage stats. Nobody may, at first. */
  admin: boolean
  /** What the stats answer an admin: the numbers, or an error to throw. */
  statsResult: UsageStats | Error
}

/** A backend that keeps gardens in memory and follows the real one's rules. */
export function fakeBackend(seed: Garden[] = []): FakeBackend {
  const rows = new Map(seed.map((garden) => [garden.id, garden]))
  let clock = Date.parse("2026-11-11T12:00:00Z")
  const now = () => {
    clock += 1000
    return new Date(clock).toISOString()
  }
  const shares = new Map<string, GardenShare>()
  let saveFailure: Error | null = null
  let shareFailure = false
  let nextId = 1
  let nextToken = 1
  const failingShare = () => {
    if (!shareFailure) return
    shareFailure = false
    throw new Error("database down")
  }

  const gardens: GardensApi = {
    async list() {
      return [...rows.values()]
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
        .map(({ id, name, updatedAt, plan }) => ({
          id,
          name,
          updatedAt,
          plan: structuredClone(plan),
        }))
    },
    async get(id) {
      const garden = rows.get(id)
      if (!garden) throw new GardenNotFoundError(id)
      return structuredClone(garden)
    },
    async create(name, plan, location = null) {
      const id = `00000000-0000-4000-8000-${String(nextId++).padStart(12, "0")}`
      const garden: Garden = { id, name, plan, location, version: 1, updatedAt: now() }
      rows.set(id, garden)
      return structuredClone(garden)
    },
    async save(id, version, changes) {
      if (saveFailure) {
        const error = saveFailure
        saveFailure = null
        throw error
      }
      const garden = rows.get(id)
      if (!garden || garden.version !== version) throw new GardenConflictError(id)
      const saved = { ...garden, ...changes, version: version + 1, updatedAt: now() }
      rows.set(id, saved)
      return { version: saved.version, updatedAt: saved.updatedAt }
    },
    async remove(id) {
      rows.delete(id)
      // The real share is deleted with its garden.
      shares.delete(id)
    },
    async getShare(id) {
      return shares.get(id) ?? null
    },
    async share(id, showLocation) {
      failingShare()
      // The real backend refuses a share for a garden that is not the user's.
      if (!rows.has(id)) throw new Error("new row violates row-level security policy")
      const token =
        shares.get(id)?.token ?? `aaaaaaaa-aaaa-4aaa-8aaa-${String(nextToken++).padStart(12, "0")}`
      const share = { token, showLocation }
      shares.set(id, share)
      return { ...share }
    },
    async unshare(id) {
      failingShare()
      shares.delete(id)
    },
  }

  const publicBackend: PublicBackend = {
    async sharedGarden(token) {
      const [gardenId, share] = [...shares].find(([, share]) => share.token === token) ?? []
      const garden = gardenId ? rows.get(gardenId) : undefined
      if (!garden || !share) throw new GardenNotFoundError(token)
      const { name, plan, location, updatedAt } = structuredClone(garden)
      return {
        name,
        plan: publicPlan(plan),
        location: share.showLocation ? location : null,
        updatedAt,
      }
    },
  }

  let linkFailure = false
  let googleFailure = false
  let exportFailure = false
  let deleteFailure = false

  const backend: FakeBackend = {
    email: null,
    linkRequests: [],
    failNextLink() {
      linkFailure = true
    },
    googleStarts: 0,
    failNextGoogle() {
      googleFailure = true
    },
    deletedAccounts: 0,
    failNextExport() {
      exportFailure = true
    },
    failNextDelete() {
      deleteFailure = true
    },
    account: {
      async get() {
        return { email: backend.email }
      },
      async requestEmailLink(email) {
        if (linkFailure) {
          linkFailure = false
          throw new Error("mail server down")
        }
        backend.linkRequests.push(email)
      },
      async continueWithGoogle() {
        if (googleFailure) {
          googleFailure = false
          throw new Error("provider is not enabled")
        }
        backend.googleStarts += 1
      },
      async signOut() {
        backend.email = null
        // The real backend starts over as a new guest, who owns no gardens.
        rows.clear()
        shares.clear()
      },
      async exportData() {
        if (exportFailure) {
          exportFailure = false
          throw new Error("database down")
        }
        // The real document has more in it; the gardens are what tests look at.
        return {
          format: 1,
          account: { email: backend.email },
          gardens: [...rows.values()].map(({ name, plan, location, version, updatedAt }) => ({
            name,
            plan: structuredClone(plan),
            location,
            version,
            updatedAt,
          })),
        }
      },
      async deleteAccount() {
        if (deleteFailure) {
          deleteFailure = false
          throw new Error("database down")
        }
        backend.deletedAccounts += 1
        // Like signing out, the visitor starts over as a new guest with nothing.
        backend.email = null
        rows.clear()
        shares.clear()
      },
    },
    rows,
    gardens,
    shares,
    failNextShare() {
      shareFailure = true
    },
    publicBackend,
    failNextSave(error) {
      saveFailure = error
    },
    weatherResult: new Error("no weather set"),
    weatherCalls: [],
    forecastResult: new Error("no forecast set"),
    async forecast() {
      if (backend.forecastResult instanceof Error) throw backend.forecastResult
      return backend.forecastResult
    },
    placesResult: new Error("no places set"),
    placeQueries: [],
    async places(query) {
      backend.placeQueries.push(query)
      if (backend.placesResult instanceof Error) throw backend.placesResult
      return backend.placesResult
    },
    admin: false,
    statsResult: new Error("no stats set"),
    stats: {
      async usage() {
        // Like the database, which refuses anyone who is not an admin.
        if (!backend.admin) throw new StatsForbiddenError()
        if (backend.statsResult instanceof Error) throw backend.statsResult
        return structuredClone(backend.statsResult)
      },
    },
    async weather(lat, lon) {
      backend.weatherCalls.push({ lat, lon })
      if (backend.weatherResult instanceof Error) throw backend.weatherResult
      return backend.weatherResult
    },
  }
  return backend
}
