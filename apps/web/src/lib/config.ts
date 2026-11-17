import { z } from "zod"

const ConfigSchema = z.object({
  supabaseUrl: z.url(),
  supabasePublishableKey: z.string().min(1),
  /** Set in production only. */
  webAnalyticsToken: z.string().min(1).optional(),
})

export type Config = z.infer<typeof ConfigSchema>

/**
 * Reads the public settings the Worker hands out, so one build fits every
 * environment. The session and the visit counter both need them, so they are
 * asked for once per page; a failure is not kept, so trying again asks again.
 */
export function configLoader(fetchConfig: () => Promise<Response>): () => Promise<Config> {
  let pending: Promise<Config> | null = null

  async function read(): Promise<Config> {
    const response = await fetchConfig()
    if (!response.ok) throw new Error(`Config request failed: ${response.status}`)
    return ConfigSchema.parse(await response.json())
  }

  return () => {
    pending ??= read().catch((error: unknown) => {
      pending = null
      throw error
    })
    return pending
  }
}

export const loadConfig = configLoader(() => fetch("/api/config"))
