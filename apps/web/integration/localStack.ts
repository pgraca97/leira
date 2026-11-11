import { existsSync, readFileSync } from "node:fs"
import { createClient, type SupabaseClient } from "@supabase/supabase-js"

export interface StackSettings {
  url: string
  publishableKey: string
}

/**
 * Where the local stack is: from the environment, else from `.dev.vars`, the
 * same file the Worker reads in development.
 */
export function stackSettings(): StackSettings {
  const fromFile: Record<string, string> = {}
  const devVars = new URL("../.dev.vars", import.meta.url)
  if (existsSync(devVars)) {
    for (const line of readFileSync(devVars, "utf8").split("\n")) {
      const match = line.match(/^\s*([A-Z_]+)\s*=\s*"?([^"#]*?)"?\s*$/)
      if (match?.[1] && match[2]) fromFile[match[1]] = match[2]
    }
  }
  const url = process.env.SUPABASE_URL ?? fromFile.SUPABASE_URL
  const publishableKey = process.env.SUPABASE_PUBLISHABLE_KEY ?? fromFile.SUPABASE_PUBLISHABLE_KEY
  if (!url || !publishableKey) {
    throw new Error(
      "Set SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY, or fill in apps/web/.dev.vars. " +
        "`pnpm supabase status` prints both once `pnpm db:start` is running."
    )
  }
  return { url, publishableKey }
}

/** A fresh anonymous visitor: a client with its own session, and that session's token. */
export async function signInVisitor(
  settings: StackSettings
): Promise<{ client: SupabaseClient; userId: string; accessToken: string }> {
  const client = createClient(settings.url, settings.publishableKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const { data, error } = await client.auth.signInAnonymously()
  if (error || !data.session || !data.user) {
    throw new Error(`Anonymous sign-in failed: ${error?.message ?? "no session"}`)
  }
  return { client, userId: data.user.id, accessToken: data.session.access_token }
}
