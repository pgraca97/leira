import type { SupabaseClient } from "@supabase/supabase-js"
import { z } from "zod"

const count = z.number().int().nonnegative()

/** What `public.usage_stats()` answers. Weeks are oldest first and start on Monday, in UTC. */
export const UsageStatsSchema = z.object({
  generatedAt: z.string(),
  people: z.object({ guests: count, accounts: count, withGarden: count }),
  gardens: z.object({
    total: count,
    editedLast7Days: count,
    editedLast30Days: count,
    shared: count,
    withLocation: count,
  }),
  weeks: z.array(
    z.object({ weekStart: z.iso.date(), newPeople: count, active: count, returning: count })
  ),
  limits: z.object({ databaseBytes: count, monthlyUsers: count }),
})

export type UsageStats = z.infer<typeof UsageStatsSchema>

/** The visitor is not one of the admins, who alone may read the stats. */
export class StatsForbiddenError extends Error {
  constructor() {
    super("Usage stats are for admins only")
    this.name = "StatsForbiddenError"
  }
}

/** The database refuses with Postgres' "insufficient privilege" code. */
const INSUFFICIENT_PRIVILEGE = "42501"

export function statsApi(client: Pick<SupabaseClient, "rpc">) {
  return {
    /** Rejects with `StatsForbiddenError` for anyone but an admin. */
    async usage(): Promise<UsageStats> {
      const { data, error } = await client.rpc("usage_stats")
      if (error) {
        if (error.code === INSUFFICIENT_PRIVILEGE) throw new StatsForbiddenError()
        throw new Error(error.message)
      }
      return UsageStatsSchema.parse(data)
    },
  }
}

export type StatsApi = ReturnType<typeof statsApi>
