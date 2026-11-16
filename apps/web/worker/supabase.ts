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
