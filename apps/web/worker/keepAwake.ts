import type { SupabaseClient } from "@supabase/supabase-js"

/**
 * Makes one small database call, so the free Supabase project is never idle
 * for the week after which it is paused. The cron in wrangler.jsonc runs it.
 * Null when Supabase is not configured, as in tests, and there is nothing to keep awake.
 */
export async function keepAwake(client: Pick<SupabaseClient, "rpc"> | null): Promise<void> {
  if (!client) return
  const { error } = await client.rpc("keep_awake")
  if (error) throw new Error(`The database did not answer: ${error.message}`)
}
