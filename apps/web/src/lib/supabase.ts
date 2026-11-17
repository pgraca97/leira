import { ForecastSchema, PlacesSchema, WeatherNowSchema } from "@leira/core"
import { createClient, type SupabaseClient } from "@supabase/supabase-js"
import { z } from "zod"
import { currentLanguage } from "../i18n"
import { accountApi, authErrorCode, IDENTITY_TAKEN } from "./account"
import type { Backend } from "./backend"
import { type CaptchaSolver, captchaSolver } from "./captcha"
import { loadConfig } from "./config"
import { gardensApi } from "./gardens"
import { statsApi } from "./stats"
import { templatesApi } from "./templates"
import { recordVisit } from "./visits"

/**
 * Returns the access token of the current session. A visitor without one is
 * signed in anonymously: they get a real user id, so their gardens are
 * protected by the same row level security as anyone else's. The auth server
 * asks for a captcha first, which `captcha` answers.
 */
async function accessToken(client: SupabaseClient, captcha: CaptchaSolver): Promise<string> {
  const { data, error } = await client.auth.getSession()
  if (error) throw new Error(error.message)
  if (data.session) return data.session.access_token

  const signedIn = await client.auth.signInAnonymously({
    options: { captchaToken: await captcha() },
  })
  if (signedIn.error || !signedIn.data.session) {
    throw new Error(signedIn.error?.message ?? "Anonymous sign-in returned no session")
  }
  return signedIn.data.session.access_token
}

/** What the Worker answers to a request to delete the account. */
const DeletionAnswerSchema = z.object({
  deleteOn: z.iso.datetime({ offset: true }),
  emailed: z.boolean(),
})

/**
 * Asks the Worker to delete the account after the grace period. It asks the
 * database as the user, then emails them the date and how to keep the
 * account, in the language the app is in.
 */
async function askWorkerToDelete(accessToken: string): Promise<Date> {
  const response = await fetch("/api/account/deletion", {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ locale: currentLanguage() }),
  })
  if (!response.ok) throw new Error(`/api/account/deletion failed: ${response.status}`)
  return new Date(DeletionAnswerSchema.parse(await response.json()).deleteOn)
}

/** Connects to Supabase and makes sure there is a session before any page loads data. */
export async function connectBackend(): Promise<Backend> {
  const config = await loadConfig()
  // Read before the client starts: it handles what the auth server left in
  // the address, and the refusal must not stay there to be met again on reload.
  const refusal = authErrorCode(new URL(window.location.href))
  const client = createClient(config.supabaseUrl, config.supabasePublishableKey)
  const captcha = captchaSolver(config.turnstileSiteKey)
  /** The session's token, signing in a new guest if there is none. */
  const token = () => accessToken(client, captcha)
  await token()
  recordVisit(client)
  if (refusal) window.history.replaceState(null, "", window.location.pathname)

  // Signing in comes back to the gardens: `/` is the landing page, which knows nothing of sessions.
  const account = accountApi(client, `${window.location.origin}/gardens`, {
    captcha,
    askDeletion: askWorkerToDelete,
  })
  if (refusal === IDENTITY_TAKEN) {
    // The guest chose a Google account that is already registered here, so
    // it cannot be attached to them: sign in to that account instead. The
    // browser is leaving, so the app stays on "connecting" until it does.
    await account.signInWithGoogle()
    return new Promise<never>(() => {})
  }

  // Every sign-in, by emailed link or by Google, comes back to the app as a
  // page load, so this is where signing in again keeps an account that asked
  // to be deleted. A failure is dropped: the next page load tries again.
  const cancelledDeletion = await account.resume().catch(() => null)

  /** Calls one of the Worker's routes as the signed-in visitor. */
  async function workerRoute<T>(
    path: string,
    params: Record<string, string>,
    schema: z.ZodType<T>
  ) {
    const query = new URLSearchParams(params)
    const response = await fetch(`${path}?${query}`, {
      headers: { Authorization: `Bearer ${await token()}` },
    })
    if (!response.ok) throw new Error(`${path} failed: ${response.status}`)
    return schema.parse(await response.json())
  }

  const at = (lat: number, lon: number) => ({ lat: String(lat), lon: String(lon) })

  return {
    gardens: gardensApi(client),
    account: {
      ...account,
      async signOut() {
        await account.signOut()
        // Nobody uses the app without a session: start over as a new guest.
        await token()
      },
      async deleteAccount() {
        await account.deleteAccount()
        await token()
      },
      async requestDeletion() {
        const deleteOn = await account.requestDeletion()
        await token()
        return deleteOn
      },
    },
    cancelledDeletion,
    weather: (lat, lon) => workerRoute("/api/weather", at(lat, lon), WeatherNowSchema),
    forecast: (lat, lon) => workerRoute("/api/forecast", at(lat, lon), ForecastSchema),
    places: (query) => workerRoute("/api/places", { q: query }, PlacesSchema),
    stats: statsApi(client),
    templates: templatesApi(client),
  }
}
