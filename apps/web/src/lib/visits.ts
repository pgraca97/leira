import type { SupabaseClient } from "@supabase/supabase-js"

const ignore = () => undefined

/**
 * Tells the database that this visitor opened the app today, for the usage
 * stats. Nobody waits for the answer and a failure is dropped: the stats must
 * never slow the app down or break it.
 */
export function recordVisit(client: Pick<SupabaseClient, "rpc">): void {
  try {
    // The query builder sends nothing until someone calls `then` on it.
    Promise.resolve(client.rpc("record_visit")).then(ignore, ignore)
  } catch {
    // A client that cannot even build the call costs a day of stats, nothing more.
  }
}
