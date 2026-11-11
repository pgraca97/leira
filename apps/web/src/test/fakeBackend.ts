import type { WeatherNow } from "@garden/core"
import type { Backend } from "../lib/backend"
import {
  type Garden,
  GardenConflictError,
  GardenNotFoundError,
  type GardensApi,
} from "../lib/gardens"

export interface FakeBackend extends Backend {
  /** The stored gardens, to seed and to inspect. */
  rows: Map<string, Garden>
  /** Makes the next save of this kind fail. */
  failNextSave(error: Error): void
  /** What `weather` answers: a reading, or an error to throw. */
  weatherResult: WeatherNow | Error
  weatherCalls: { lat: number; lon: number }[]
}

/** A backend that keeps gardens in memory and follows the real one's rules. */
export function fakeBackend(seed: Garden[] = []): FakeBackend {
  const rows = new Map(seed.map((garden) => [garden.id, garden]))
  let clock = Date.parse("2026-11-11T12:00:00Z")
  const now = () => {
    clock += 1000
    return new Date(clock).toISOString()
  }
  let saveFailure: Error | null = null
  let nextId = 1

  const gardens: GardensApi = {
    async list() {
      return [...rows.values()]
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
        .map(({ id, name, updatedAt }) => ({ id, name, updatedAt }))
    },
    async get(id) {
      const garden = rows.get(id)
      if (!garden) throw new GardenNotFoundError(id)
      return structuredClone(garden)
    },
    async create(name, plan) {
      const id = `00000000-0000-4000-8000-${String(nextId++).padStart(12, "0")}`
      const garden: Garden = { id, name, plan, location: null, version: 1, updatedAt: now() }
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
    },
  }

  const backend: FakeBackend = {
    rows,
    gardens,
    failNextSave(error) {
      saveFailure = error
    },
    weatherResult: new Error("no weather set"),
    weatherCalls: [],
    async weather(lat, lon) {
      backend.weatherCalls.push({ lat, lon })
      if (backend.weatherResult instanceof Error) throw backend.weatherResult
      return backend.weatherResult
    },
  }
  return backend
}
