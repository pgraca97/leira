import type { VerifiedUser } from "./app"
import { supabaseClient } from "./supabase"

/**
 * Verifies a Supabase access token and returns who it belongs to, or null
 * when the token is missing, forged, expired, or cannot be checked.
 *
 * `getClaims` verifies the signature locally when the project signs tokens
 * with asymmetric keys, and asks the Auth server otherwise.
 */
export async function verifySupabaseToken(env: Env, token: string): Promise<VerifiedUser | null> {
  const client = supabaseClient(env)
  if (!client) return null
  const { data, error } = await client.auth.getClaims(token)
  if (error || !data?.claims.sub) return null
  const { sub, email, is_anonymous } = data.claims
  // A guest's token carries an empty email rather than none.
  return { id: sub, email: email || null, isAnonymous: is_anonymous === true }
}
