import { createClient, type SupabaseClient } from "@supabase/supabase-js"

let cached: { url: string; key: string; client: SupabaseClient } | undefined

/**
 * The Worker's own Supabase client, with no session: it verifies tokens and
 * reads what is open to anyone. One per isolate, so the signing keys it
 * downloads to verify tokens are fetched once and reused across requests.
 * Null when Supabase is not configured.
 */
export function supabaseClient(env: Env): SupabaseClient | null {
  const { SUPABASE_URL: url, SUPABASE_PUBLISHABLE_KEY: key } = env
  if (!url || !key) return null
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
 * A client that acts as the user whose access token it carries, so the
 * database applies that user's rules and its functions act on them alone.
 * Made per request and never kept: it belongs to one caller.
 */
export function userClient(env: Env, accessToken: string): SupabaseClient | null {
  const { SUPABASE_URL: url, SUPABASE_PUBLISHABLE_KEY: key } = env
  if (!url || !key) return null
  return createClient(url, key, {
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  })
}
