// @vitest-environment jsdom
import "./test/setup"
import { beforeEach, describe, expect, it } from "vitest"
import { startAnalytics, stopCountingThisBrowser } from "./analytics"

const beacons = () => document.head.querySelectorAll("script[data-cf-beacon]")

beforeEach(() => {
  for (const script of beacons()) script.remove()
  localStorage.clear()
})

describe("the visit counter", () => {
  it("loads Cloudflare's beacon with the site token", async () => {
    await startAnalytics(async () => ({ webAnalyticsToken: "beacon-token" }))
    const [script] = beacons()
    expect(script).toHaveAttribute("src", "https://static.cloudflareinsights.com/beacon.min.js")
    expect(JSON.parse(script?.getAttribute("data-cf-beacon") ?? "")).toEqual({
      token: "beacon-token",
    })
  })

  it("stays off where no token is set, as in development and tests", async () => {
    await startAnalytics(async () => ({}))
    expect(beacons()).toHaveLength(0)
  })

  it("stays off when the settings cannot be read, without failing", async () => {
    await expect(
      startAnalytics(async () => {
        throw new Error("offline")
      })
    ).resolves.toBeUndefined()
    expect(beacons()).toHaveLength(0)
  })

  it("loads the beacon only once", async () => {
    const load = async () => ({ webAnalyticsToken: "beacon-token" })
    await startAnalytics(load)
    await startAnalytics(load)
    expect(beacons()).toHaveLength(1)
  })

  it("leaves out a browser where the owner stopped counting", async () => {
    stopCountingThisBrowser()
    await startAnalytics(async () => ({ webAnalyticsToken: "beacon-token" }))
    expect(beacons()).toHaveLength(0)
  })
})
