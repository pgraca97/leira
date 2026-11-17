import { describe, expect, it } from "vitest"
import { loadAnalyticsToken } from "./analyticsToken"

const answering =
  (body: unknown, status = 200) =>
  async () =>
    new Response(JSON.stringify(body), { status })

describe("the analytics token for the static pages", () => {
  it("is read from the public settings", async () => {
    const settings = answering({ supabaseUrl: "https://x.supabase.co", webAnalyticsToken: "abc" })
    expect(await loadAnalyticsToken(settings)).toEqual({ webAnalyticsToken: "abc" })
  })

  it("is missing where none is set", async () => {
    expect(await loadAnalyticsToken(answering({ supabaseUrl: "https://x" }))).toEqual({})
  })

  it("is missing when the settings hold something else under its name", async () => {
    expect(await loadAnalyticsToken(answering({ webAnalyticsToken: 42 }))).toEqual({})
  })

  it("fails when the settings cannot be had", async () => {
    await expect(loadAnalyticsToken(answering({ error: "not_configured" }, 503))).rejects.toThrow()
  })
})
