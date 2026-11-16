import { supabaseClient } from "./supabase"

/**
 * Verifies a Supabase access token and returns the user id, or null when the
 * token is missing, forged, expired, or cannot be checked.
 *
 * `getClaims` verifies the signature locally when the project signs tokens
 * with asymmetric keys, and asks the Auth server otherwise.
 */
export async function verifySupabaseToken(env: Env, token: string): Promise<string | null> {
  const client = supabaseClient(env)
  if (!client) return null
  const { data, error } = await client.auth.getClaims(token)
  if (error || !data) return null
  return data.claims.sub || null
}
