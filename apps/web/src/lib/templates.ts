import { type Clipboard, ClipboardSchema } from "@leira/core"
import type { SupabaseClient } from "@supabase/supabase-js"
import { z } from "zod"

/** A group of beds and crops saved to use again, in any of the user's gardens. */
export interface Template {
  id: string
  name: string
  items: Clipboard
  createdAt: string
}

/** The user already has as many templates as one may keep. */
export class TemplateLimitError extends Error {
  constructor() {
    super("At most 50 templates per user")
    this.name = "TemplateLimitError"
  }
}

const COLUMNS = "id, name, items, created_at"

const RowSchema = z.object({
  id: z.string(),
  name: z.string(),
  items: z.unknown(),
  created_at: z.string(),
})

/** A stored row, or null when its items are in a shape this version cannot read. */
function parseTemplate(row: unknown): Template | null {
  const { id, name, items, created_at } = RowSchema.parse(row)
  const parsed = ClipboardSchema.safeParse(items)
  return parsed.success ? { id, name, items: parsed.data, createdAt: created_at } : null
}

/** Postgres' code for a broken check, which the limit on templates raises. */
const CHECK_VIOLATION = "23514"

/**
 * Reads and writes the signed-in user's templates. Row level security limits
 * every query to the owner, so nothing here filters by user.
 */
export function templatesApi(client: SupabaseClient) {
  return {
    /** Newest first. One that cannot be read any more is left out, not an error. */
    async list(): Promise<Template[]> {
      const { data, error } = await client
        .from("templates")
        .select(COLUMNS)
        .order("created_at", { ascending: false })
      if (error) throw new Error(error.message)
      return data.flatMap((row) => parseTemplate(row) ?? [])
    },

    /** Rejects with `TemplateLimitError` once the user has fifty. */
    async save(name: string, items: Clipboard): Promise<Template> {
      const { data, error } = await client
        .from("templates")
        .insert({ name, items })
        .select(COLUMNS)
        .single()
      if (error) {
        if (error.code === CHECK_VIOLATION && error.message.includes("at most 50")) {
          throw new TemplateLimitError()
        }
        throw new Error(error.message)
      }
      const saved = parseTemplate(data)
      if (!saved) throw new Error("The saved template could not be read back")
      return saved
    },

    async remove(id: string): Promise<void> {
      const { error } = await client.from("templates").delete().eq("id", id)
      if (error) throw new Error(error.message)
    },
  }
}

export type TemplatesApi = ReturnType<typeof templatesApi>
