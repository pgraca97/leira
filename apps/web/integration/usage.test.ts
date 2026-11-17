import { createClient } from "@supabase/supabase-js"
import { describe, expect, it } from "vitest"
import { signInVisitor, stackSettings } from "./localStack"

/**
 * Who may call the usage functions on the real stack. The platform's default
 * privileges on new functions are not in the PGlite stand-in, so this is where
 * they are checked.
 */
const settings = stackSettings()

describe("usage functions", () => {
  it("let a signed-in visitor record a visit, more than once a day", async () => {
    const visitor = await signInVisitor(settings)
    expect((await visitor.client.rpc("record_visit")).error).toBeNull()
    expect((await visitor.client.rpc("record_visit")).error).toBeNull()
  })

  it("keep the usage stats from a visitor who is not an admin", async () => {
    const visitor = await signInVisitor(settings)
    const stats = await visitor.client.rpc("usage_stats")
    expect(stats.data).toBeNull()
    expect(stats.error?.code).toBe("42501")
  })

  it("are closed to callers with no session", async () => {
    const stranger = createClient(settings.url, settings.publishableKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
    expect((await stranger.rpc("record_visit")).error).not.toBeNull()
    expect((await stranger.rpc("usage_stats")).error).not.toBeNull()
  })
})
