import { createClient, type SupabaseClient } from "@supabase/supabase-js"

let cached: { url: string; key: string; client: SupabaseClient } | undefined

/**
 * One client per isolate, so the signing keys it downloads to verify tokens
 * are fetched once and reused across requests.
 */
function authClient(url: string, key: string): SupabaseClient {
  if (cached?.url !== url || cached.key !== key) {
    cached = {
      url,
      key,
      client: createClient(url, key, {
        auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      }),
    }
  }
  return cached.client
}

/**
 * Verifies a Supabase access token and returns the user id, or null when the
 * token is missing, forged, expired, or cannot be checked.
 *
 * `getClaims` verifies the signature locally when the project signs tokens
 * with asymmetric keys, and asks the Auth server otherwise.
 */
export async function verifySupabaseToken(env: Env, token: string): Promise<string | null> {
  if (!env.SUPABASE_URL || !env.SUPABASE_PUBLISHABLE_KEY) return null
  const client = authClient(env.SUPABASE_URL, env.SUPABASE_PUBLISHABLE_KEY)
  const { data, error } = await client.auth.getClaims(token)
  if (error || !data) return null
  return data.claims.sub || null
}
