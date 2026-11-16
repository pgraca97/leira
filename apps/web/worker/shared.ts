import { supabaseClient } from "./supabase"

/**
 * The garden a share link opens, as the database hands it over, or null when
 * no link has that token. The database function is the only way in for a
 * caller with no session, and it decides what a link may show.
 */
export async function fetchSharedGarden(env: Env, token: string): Promise<unknown> {
  const client = supabaseClient(env)
  if (!client) throw new Error("Supabase is not configured")
  const { data, error } = await client.rpc("shared_garden", { share_token: token })
  if (error) throw new Error(error.message)
  return Array.isArray(data) ? (data[0] ?? null) : null
}
