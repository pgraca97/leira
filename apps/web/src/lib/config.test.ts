import { describe, expect, it, vi } from "vitest"
import { configLoader } from "./config"

const SETTINGS = {
  supabaseUrl: "https://project.supabase.co",
  supabasePublishableKey: "sb_publishable_abc",
  turnstileSiteKey: "0x4AAAAAAA",
}

const answer = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } })

describe("the public settings", () => {
  it("are asked for once, however many parts of the page need them", async () => {
    const fetchConfig = vi.fn(async () => answer(SETTINGS))
    const load = configLoader(fetchConfig)
    const [first, second] = await Promise.all([load(), load()])
    expect(first).toEqual(SETTINGS)
    expect(second).toEqual(SETTINGS)
    expect(fetchConfig).toHaveBeenCalledTimes(1)
  })

  it("carry the Web Analytics token when the Worker has one", async () => {
    const load = configLoader(async () => answer({ ...SETTINGS, webAnalyticsToken: "beacon" }))
    expect((await load()).webAnalyticsToken).toBe("beacon")
  })

  it("are refused without the Turnstile site key", async () => {
    const { turnstileSiteKey: _, ...withoutKey } = SETTINGS
    await expect(configLoader(async () => answer(withoutKey))()).rejects.toThrow()
  })

  it("are asked for again after a failure, so trying again can work", async () => {
    const fetchConfig = vi
      .fn<() => Promise<Response>>()
      .mockResolvedValueOnce(answer({ error: "not_configured" }, 503))
      .mockResolvedValueOnce(answer(SETTINGS))
    const load = configLoader(fetchConfig)
    await expect(load()).rejects.toThrow("503")
    expect(await load()).toEqual(SETTINGS)
  })
})
