import { emptyPlan } from "@garden/core"
import { beforeAll, describe, expect, it } from "vitest"
import {
  GardenConflictError,
  GardenNotFoundError,
  type GardensApi,
  gardensApi,
} from "../src/lib/gardens"
import { verifySupabaseToken } from "../worker/auth"
import { signInVisitor, stackSettings } from "./localStack"

/**
 * The gardens API and the Worker's token check against the real local stack:
 * sign-in, the Data API, row level security and the version trigger together.
 */
const settings = stackSettings()

let alice: Awaited<ReturnType<typeof signInVisitor>>
let bob: Awaited<ReturnType<typeof signInVisitor>>
let aliceGardens: GardensApi
let bobGardens: GardensApi

beforeAll(async () => {
  alice = await signInVisitor(settings)
  bob = await signInVisitor(settings)
  aliceGardens = gardensApi(alice.client)
  bobGardens = gardensApi(bob.client)
})

describe("gardens", () => {
  it("creates a garden and reads it back", async () => {
    const created = await aliceGardens.create("Back garden", emptyPlan())
    expect(created).toMatchObject({ name: "Back garden", version: 1, location: null })

    expect(await aliceGardens.get(created.id)).toEqual(created)
    expect(await aliceGardens.list()).toContainEqual({
      id: created.id,
      name: "Back garden",
      updatedAt: created.updatedAt,
    })
  })

  it("saves changes and moves the version on", async () => {
    const garden = await aliceGardens.create("Plot", emptyPlan())
    const plan = { ...emptyPlan(), widthCm: 800 }
    const location = { lat: 41.15, lon: -8.61 }

    const saved = await aliceGardens.save(garden.id, garden.version, {
      name: "Plot 12",
      plan,
      location,
    })
    expect(saved.version).toBe(2)
    expect(await aliceGardens.get(garden.id)).toMatchObject({
      name: "Plot 12",
      plan,
      location,
      version: 2,
    })
  })

  it("refuses a save built on a version that has moved on", async () => {
    const garden = await aliceGardens.create("Plot", emptyPlan())
    await aliceGardens.save(garden.id, 1, { name: "First tab" })

    await expect(aliceGardens.save(garden.id, 1, { name: "Stale tab" })).rejects.toThrow(
      GardenConflictError
    )
    expect((await aliceGardens.get(garden.id)).name).toBe("First tab")
  })

  it("hides a garden from everyone but its owner", async () => {
    const garden = await aliceGardens.create("Private", emptyPlan())

    await expect(bobGardens.get(garden.id)).rejects.toThrow(GardenNotFoundError)
    expect((await bobGardens.list()).map((item) => item.id)).not.toContain(garden.id)
    await expect(bobGardens.save(garden.id, 1, { name: "Taken" })).rejects.toThrow(
      GardenConflictError
    )
    await bobGardens.remove(garden.id)
    expect((await aliceGardens.get(garden.id)).name).toBe("Private")
  })

  it("deletes a garden", async () => {
    const garden = await aliceGardens.create("Gone soon", emptyPlan())
    await aliceGardens.remove(garden.id)
    await expect(aliceGardens.get(garden.id)).rejects.toThrow(GardenNotFoundError)
  })
})

describe("the Worker's token check", () => {
  const env = {
    SUPABASE_URL: settings.url,
    SUPABASE_PUBLISHABLE_KEY: settings.publishableKey,
  } as Env

  it("resolves a visitor's access token to their user id", async () => {
    expect(await verifySupabaseToken(env, alice.accessToken)).toBe(alice.userId)
  })

  it("rejects a token that was tampered with", async () => {
    const forged = `${alice.accessToken.slice(0, -4)}AAAA`
    expect(await verifySupabaseToken(env, forged)).toBeNull()
  })
})
