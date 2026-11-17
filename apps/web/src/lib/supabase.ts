import { ForecastSchema, PlacesSchema, WeatherNowSchema } from "@leira/core"
import { createClient, type SupabaseClient } from "@supabase/supabase-js"
import type { z } from "zod"
import { accountApi, authErrorCode, IDENTITY_TAKEN } from "./account"
import type { Backend } from "./backend"
import { loadConfig } from "./config"
import { gardensApi } from "./gardens"
import { statsApi } from "./stats"
import { recordVisit } from "./visits"

/**
 * Returns the access token of the current session. A visitor without one is
 * signed in anonymously: they get a real user id, so their gardens are
 * protected by the same row level security as anyone else's.
 */
async function accessToken(client: SupabaseClient): Promise<string> {
  const { data, error } = await client.auth.getSession()
  if (error) throw new Error(error.message)
  if (data.session) return data.session.access_token

  const signedIn = await client.auth.signInAnonymously()
  if (signedIn.error || !signedIn.data.session) {
    throw new Error(signedIn.error?.message ?? "Anonymous sign-in returned no session")
  }
  return signedIn.data.session.access_token
}

/** Connects to Supabase and makes sure there is a session before any page loads data. */
export async function connectBackend(): Promise<Backend> {
  const config = await loadConfig()
  // Read before the client starts: it handles what the auth server left in
  // the address, and the refusal must not stay there to be met again on reload.
  const refusal = authErrorCode(new URL(window.location.href))
  const client = createClient(config.supabaseUrl, config.supabasePublishableKey)
  await accessToken(client)
  recordVisit(client)
  if (refusal) window.history.replaceState(null, "", window.location.pathname)

  const account = accountApi(client, window.location.origin)
  if (refusal === IDENTITY_TAKEN) {
    // The guest chose a Google account that is already registered here, so
    // it cannot be attached to them: sign in to that account instead. The
    // browser is leaving, so the app stays on "connecting" until it does.
    await account.signInWithGoogle()
    return new Promise<never>(() => {})
  }

  /** Calls one of the Worker's routes as the signed-in visitor. */
  async function workerRoute<T>(
    path: string,
    params: Record<string, string>,
    schema: z.ZodType<T>
  ) {
    const query = new URLSearchParams(params)
    const response = await fetch(`${path}?${query}`, {
      headers: { Authorization: `Bearer ${await accessToken(client)}` },
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
        await accessToken(client)
      },
    },
    weather: (lat, lon) => workerRoute("/api/weather", at(lat, lon), WeatherNowSchema),
    forecast: (lat, lon) => workerRoute("/api/forecast", at(lat, lon), ForecastSchema),
    places: (query) => workerRoute("/api/places", { q: query }, PlacesSchema),
    stats: statsApi(client),
  }
}
