import {
  type GardenLocation,
  GardenLocationSchema,
  type GardenPlan,
  StoredPlanSchema,
} from "@leira/core"
import type { SupabaseClient } from "@supabase/supabase-js"
import { z } from "zod"

/** A garden as the list shows it. */
export interface GardenSummary {
  id: string
  name: string
  updatedAt: string
  /**
   * The plan, to draw a small picture of the garden from. Null when this
   * version of the app cannot read it: the garden is still listed, and opening
   * it says what is wrong.
   */
  plan: GardenPlan | null
  /** Where the garden is, for the week's weather. Null when unset or unreadable. */
  location: GardenLocation | null
}

export interface Garden extends GardenSummary {
  location: GardenLocation | null
  plan: GardenPlan
  /** Sent back on save, so a stale tab cannot overwrite a newer save. */
  version: number
}

/** A garden's read-only link. */
export interface GardenShare {
  /** What the link ends in. Anyone who has it can see the garden. */
  token: string
  /** Whether the link also says where the garden is. */
  showLocation: boolean
}

/** A garden as someone with its link sees it: no id, no owner, nothing to save. */
export interface SharedGarden {
  name: string
  /** Null unless the owner chose to show it. */
  location: GardenLocation | null
  plan: GardenPlan
  updatedAt: string
}

/** The row holds something this version of the app cannot read. */
export class GardenFormatError extends Error {
  override name = "GardenFormatError"
}

/** The garden does not exist, belongs to someone else, or its link opens nothing. */
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
  // Checked on its own, so one unreadable plan does not hide the whole list.
  plan: z.unknown().optional(),
  location: z.unknown().optional(),
})

const GardenRowSchema = SummaryRowSchema.extend({
  location: GardenLocationSchema.nullable(),
  plan: StoredPlanSchema,
  version: z.int(),
})

const ShareRowSchema = z.object({ token: z.string(), show_location: z.boolean() })

const SharedGardenSchema = z.object({
  name: z.string(),
  location: GardenLocationSchema.nullable(),
  plan: StoredPlanSchema,
  updatedAt: z.string(),
})

const SavedRowSchema = z.object({ version: z.int(), updated_at: z.string() })

export function parseGardenSummary(row: unknown): GardenSummary {
  const parsed = SummaryRowSchema.safeParse(row)
  if (!parsed.success) throw new GardenFormatError("Unreadable garden row")
  const { id, name, updated_at } = parsed.data
  const plan = StoredPlanSchema.safeParse(parsed.data.plan)
  // A place is only for the weather: one that cannot be read is left out, not the garden.
  const location = GardenLocationSchema.safeParse(parsed.data.location)
  return {
    id,
    name,
    updatedAt: updated_at,
    location: location.success ? location.data : null,
    plan: plan.success ? plan.data : null,
  }
}

/**
 * The name for a copy of a garden: the original's with `suffix` after it, cut
 * short where needed so the whole still fits in a garden's name.
 */
export function gardenCopyName(name: string, suffix: string): string {
  return name.slice(0, Math.max(0, GARDEN_NAME_MAX - suffix.length)).trimEnd() + suffix
}

export function parseGarden(row: unknown): Garden {
  const parsed = GardenRowSchema.safeParse(row)
  if (!parsed.success) throw new GardenFormatError("Unreadable garden row")
  const { id, name, updated_at, location, plan, version } = parsed.data
  return { id, name, updatedAt: updated_at, location, plan, version }
}

/** Checks what the Worker answered for a share link. */
export function parseSharedGarden(body: unknown): SharedGarden {
  const parsed = SharedGardenSchema.safeParse(body)
  if (!parsed.success) throw new GardenFormatError("Unreadable shared garden")
  return parsed.data
}

function parseShare(row: unknown): GardenShare {
  const { token, show_location } = ShareRowSchema.parse(row)
  return { token, showLocation: show_location }
}

const SUMMARY_COLUMNS = "id, name, location, plan, updated_at"
const GARDEN_COLUMNS = "id, name, location, plan, version, updated_at"
const SHARE_COLUMNS = "token, show_location"

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
 * Reads and writes the signed-in user's gardens and their share links. Row
 * level security already limits every query to the owner, so nothing here
 * filters by user.
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

    /** A new garden. A copy of another one also takes its `location`. */
    async create(
      name: string,
      plan: GardenPlan,
      location: GardenLocation | null = null
    ): Promise<Garden> {
      const { data, error } = await client
        .from("gardens")
        .insert({ name, plan, location })
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

    /** The garden's read-only link, or null when it has none. */
    async getShare(id: string): Promise<GardenShare | null> {
      const { data, error } = await client
        .from("garden_shares")
        .select(SHARE_COLUMNS)
        .eq("garden_id", id)
        .maybeSingle()
      if (error) throw new Error(error.message)
      return data ? parseShare(data) : null
    },

    /**
     * Gives the garden a read-only link, or changes whether the link it has
     * shows the location. The link itself stays the same until `unshare`.
     *
     * A share is a row of its own, so this does not go through the editor's
     * autosave and does not move the garden's version on.
     */
    async share(id: string, showLocation: boolean): Promise<GardenShare> {
      // Two steps, not an upsert: an upsert would also write the token's
      // garden, which a client may set once and never change.
      const changed = await client
        .from("garden_shares")
        .update({ show_location: showLocation })
        .eq("garden_id", id)
        .select(SHARE_COLUMNS)
        .maybeSingle()
      if (changed.error) throw new Error(changed.error.message)
      if (changed.data) return parseShare(changed.data)

      const created = await client
        .from("garden_shares")
        .insert({ garden_id: id, show_location: showLocation })
        .select(SHARE_COLUMNS)
        .single()
      if (created.error) throw new Error(created.error.message)
      return parseShare(created.data)
    },

    /** Turns the garden's link off for good. Sharing again makes a different link. */
    async unshare(id: string): Promise<void> {
      const { error } = await client.from("garden_shares").delete().eq("garden_id", id)
      if (error) throw new Error(error.message)
    },
  }
}

export type GardensApi = ReturnType<typeof gardensApi>
