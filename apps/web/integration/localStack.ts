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

/**
 * The token Cloudflare's test site key hands out. The local auth server checks
 * captchas with Cloudflare's test secret (supabase/config.toml), which lets
 * any token through: locally, what counts is that one is sent at all.
 */
export const TEST_CAPTCHA_TOKEN = "XXXX.DUMMY.TOKEN.XXXX"

/** Answers the captcha the way a browser with the test site key would. */
export const testCaptcha = async () => TEST_CAPTCHA_TOKEN

/** A client of its own, with no session yet. */
export function newClient(settings: StackSettings): SupabaseClient {
  return createClient(settings.url, settings.publishableKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

/** A fresh anonymous visitor: a client with its own session, and that session's token. */
export async function signInVisitor(
  settings: StackSettings
): Promise<{ client: SupabaseClient; userId: string; accessToken: string }> {
  const client = newClient(settings)
  const { data, error } = await client.auth.signInAnonymously({
    options: { captchaToken: TEST_CAPTCHA_TOKEN },
  })
  if (error || !data.session || !data.user) {
    throw new Error(`Anonymous sign-in failed: ${error?.message ?? "no session"}`)
  }
  return { client, userId: data.user.id, accessToken: data.session.access_token }
}

/** The local stack catches every email it sends in Mailpit instead of delivering it. */
const MAILPIT_URL = "http://127.0.0.1:54324"

/**
 * Waits for the newest email sent to an address and returns the first link in
 * it: the confirmation or sign-in link the user would click.
 */
export async function emailedLink(address: string): Promise<string> {
  for (let attempt = 0; attempt < 40; attempt++) {
    const search = await fetch(
      `${MAILPIT_URL}/api/v1/search?query=${encodeURIComponent(`to:${address}`)}`
    )
    const { messages } = (await search.json()) as { messages: { ID: string }[] }
    const newest = messages[0]
    if (newest) {
      const message = await fetch(`${MAILPIT_URL}/api/v1/message/${newest.ID}`)
      const { Text } = (await message.json()) as { Text: string }
      const link = Text.match(/https?:\/\/\S+\/auth\/v1\/verify\S+/)?.[0]
      if (link) {
        // Taken out of the inbox, so the next call waits for the next email
        // instead of finding this one again.
        await fetch(`${MAILPIT_URL}/api/v1/messages`, {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ IDs: [newest.ID] }),
        })
        return link.replace(/[)\]>.]+$/, "")
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 250))
  }
  throw new Error(`No email with a link arrived for ${address}`)
}

/**
 * Follows an emailed link the way a browser would, up to the redirect back
 * to the app, and returns the session it carries in the address.
 */
export async function followEmailedLink(
  link: string
): Promise<{ redirectedTo: string; accessToken: string | null }> {
  const response = await fetch(link, { redirect: "manual" })
  const location = response.headers.get("location")
  if (!location) throw new Error(`The link did not redirect (status ${response.status})`)
  const target = new URL(location)
  const fragment = new URLSearchParams(target.hash.slice(1))
  return { redirectedTo: target.origin, accessToken: fragment.get("access_token") }
}
