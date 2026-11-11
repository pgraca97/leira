import {
  type GardenLocation,
  GardenLocationSchema,
  type GardenPlan,
  GardenPlanSchema,
} from "@garden/core"
import type { SupabaseClient } from "@supabase/supabase-js"
import { z } from "zod"

/** A garden as the list shows it: no plan, so the list stays light. */
export interface GardenSummary {
  id: string
  name: string
  updatedAt: string
}

export interface Garden extends GardenSummary {
  location: GardenLocation | null
  plan: GardenPlan
  /** Sent back on save, so a stale tab cannot overwrite a newer save. */
  version: number
}

/** The row holds something this version of the app cannot read. */
export class GardenFormatError extends Error {
  override name = "GardenFormatError"
}

/** The garden does not exist, or belongs to someone else. */
export class GardenNotFoundError extends Error {
  override name = "GardenNotFoundError"
}

/** The garden was saved elsewhere since it was loaded here. */
export class GardenConflictError extends Error {
  override name = "GardenConflictError"
}

export const GARDEN_NAME_MAX = 80

const SummaryRowSchema = z.object({
  id: z.string(),
  name: z.string(),
  updated_at: z.string(),
})

const GardenRowSchema = SummaryRowSchema.extend({
  location: GardenLocationSchema.nullable(),
  plan: GardenPlanSchema,
  version: z.int(),
})

const SavedRowSchema = z.object({ version: z.int(), updated_at: z.string() })

export function parseGardenSummary(row: unknown): GardenSummary {
  const parsed = SummaryRowSchema.safeParse(row)
  if (!parsed.success) throw new GardenFormatError("Unreadable garden row")
  const { id, name, updated_at } = parsed.data
  return { id, name, updatedAt: updated_at }
}

export function parseGarden(row: unknown): Garden {
  const parsed = GardenRowSchema.safeParse(row)
  if (!parsed.success) throw new GardenFormatError("Unreadable garden row")
  const { id, name, updated_at, location, plan, version } = parsed.data
  return { id, name, updatedAt: updated_at, location, plan, version }
}

const SUMMARY_COLUMNS = "id, name, updated_at"
const GARDEN_COLUMNS = "id, name, location, plan, version, updated_at"

/** The fields a save may change. Absent fields are left as they are. */
export interface GardenChanges {
  name?: string
  location?: GardenLocation | null
  plan?: GardenPlan
}

export interface SavedGarden {
  version: number
  updatedAt: string
}

/**
 * Reads and writes the signed-in user's gardens. Row level security already
 * limits every query to the owner, so nothing here filters by user.
 */
export function gardensApi(client: SupabaseClient) {
  return {
    async list(): Promise<GardenSummary[]> {
      const { data, error } = await client
        .from("gardens")
        .select(SUMMARY_COLUMNS)
        .order("updated_at", { ascending: false })
      if (error) throw new Error(error.message)
      return data.map(parseGardenSummary)
    },

    async get(id: string): Promise<Garden> {
      const { data, error } = await client
        .from("gardens")
        .select(GARDEN_COLUMNS)
        .eq("id", id)
        .maybeSingle()
      if (error) throw new Error(error.message)
      if (!data) throw new GardenNotFoundError(id)
      return parseGarden(data)
    },

    async create(name: string, plan: GardenPlan): Promise<Garden> {
      const { data, error } = await client
        .from("gardens")
        .insert({ name, plan })
        .select(GARDEN_COLUMNS)
        .single()
      if (error) throw new Error(error.message)
      return parseGarden(data)
    },

    /**
     * Saves changes on top of `version`, the one this client loaded. When the
     * row has moved on (or is gone) nothing is written and the save fails with
     * a `GardenConflictError`.
     */
    async save(id: string, version: number, changes: GardenChanges): Promise<SavedGarden> {
      const { data, error } = await client
        .from("gardens")
        .update(changes)
        .eq("id", id)
        .eq("version", version)
        .select("version, updated_at")
        .maybeSingle()
      if (error) throw new Error(error.message)
      if (!data) throw new GardenConflictError(id)
      const saved = SavedRowSchema.parse(data)
      return { version: saved.version, updatedAt: saved.updated_at }
    },

    async remove(id: string): Promise<void> {
      const { error } = await client.from("gardens").delete().eq("id", id)
      if (error) throw new Error(error.message)
    },
  }
}

export type GardensApi = ReturnType<typeof gardensApi>
