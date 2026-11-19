import { emptyPlan, type GardenPlan } from "@leira/core"
import { createClient } from "@supabase/supabase-js"
import { beforeAll, describe, expect, it } from "vitest"
import {
  GardenConflictError,
  GardenNotFoundError,
  type GardensApi,
  gardensApi,
} from "../src/lib/gardens"
import { verifySupabaseToken } from "../worker/auth"
import { fetchGardenCalendar } from "../worker/calendarFeed"
import { fetchSharedGarden } from "../worker/shared"
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
      location: null,
      plan: emptyPlan(),
    })
  })

  it("creates a garden where another one is, as a copy needs", async () => {
    const location = { lat: 41.15, lon: -8.61, name: "Porto" }
    const created = await aliceGardens.create("Back garden (copy)", emptyPlan(), location)
    expect(created.location).toEqual(location)
    // The list has it too, for the week's weather.
    const listed = (await aliceGardens.list()).find((garden) => garden.id === created.id)
    expect(listed?.location).toEqual(location)
    expect((await aliceGardens.get(created.id)).location).toEqual(location)
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

const env = {
  SUPABASE_URL: settings.url,
  SUPABASE_PUBLISHABLE_KEY: settings.publishableKey,
} as Env

describe("sharing a garden", () => {
  const location = { lat: 41.15, lon: -8.61, name: "Porto" }

  it("gives a garden a link the Worker can open with no session, without its location", async () => {
    const garden = await aliceGardens.create("Shared plot", emptyPlan(), location)
    expect(await aliceGardens.getShare(garden.id)).toBeNull()

    const share = await aliceGardens.share(garden.id, false)
    expect(share.showLocation).toBe(false)
    expect(await aliceGardens.getShare(garden.id)).toEqual(share)

    expect(await fetchSharedGarden(env, share.token)).toEqual({
      name: "Shared plot",
      plan: emptyPlan(),
      location: null,
      updated_at: expect.any(String),
    })
    // Sharing is not a save: the editor's copy of the garden is still current.
    expect((await aliceGardens.get(garden.id)).version).toBe(1)
  })

  it("keeps the owner's notes and harvest amounts out of the link", async () => {
    const planting = {
      id: "55555555-5555-4555-8555-555555555555",
      plantId: "tomato",
      rect: { x: 0, y: 0, w: 100, h: 100 },
      layout: "block" as const,
      inGround: { from: "2026-05-01", to: "2026-09-30" },
    }
    const plan: GardenPlan = {
      ...emptyPlan(),
      notes: "The well ran dry in July.",
      plantings: [
        {
          ...planting,
          planted: true,
          harvests: [{ date: "2026-07-12", quantity: 1.2, unit: "kg" }],
          notes: "Blight in August.",
        },
      ],
    }
    const garden = await aliceGardens.create("Recorded plot", plan)
    // The owner still reads all of it.
    expect((await aliceGardens.get(garden.id)).plan).toEqual(plan)

    const share = await aliceGardens.share(garden.id, false)
    expect(await fetchSharedGarden(env, share.token)).toMatchObject({
      plan: {
        ...emptyPlan(),
        plantings: [{ ...planting, planted: true, harvests: [{ date: "2026-07-12" }] }],
      },
    })
    const body = JSON.stringify(await fetchSharedGarden(env, share.token))
    expect(body).not.toMatch(/notes|quantity|unit|well|Blight/)
  })

  it("opens a plan stored by an older version of the app, brought up to date", async () => {
    const older = { ...emptyPlan(), schemaVersion: 1 } as unknown as GardenPlan
    const garden = await aliceGardens.create("Older plot", older)
    expect((await aliceGardens.get(garden.id)).plan).toEqual(emptyPlan())
  })

  it("shows the location once the owner says so, on the same link", async () => {
    const garden = await aliceGardens.create("Located plot", emptyPlan(), location)
    const share = await aliceGardens.share(garden.id, false)

    const changed = await aliceGardens.share(garden.id, true)
    expect(changed).toEqual({ token: share.token, showLocation: true })
    expect(await fetchSharedGarden(env, share.token)).toMatchObject({ location })
  })

  it("stops opening when the owner stops sharing, and a new link is a different one", async () => {
    const garden = await aliceGardens.create("Briefly shared", emptyPlan())
    const first = await aliceGardens.share(garden.id, false)
    await aliceGardens.unshare(garden.id)

    expect(await fetchSharedGarden(env, first.token)).toBeNull()
    expect(await aliceGardens.getShare(garden.id)).toBeNull()

    const second = await aliceGardens.share(garden.id, false)
    expect(second.token).not.toBe(first.token)
    expect(await fetchSharedGarden(env, first.token)).toBeNull()
  })

  it("opens nothing for a token nobody was given", async () => {
    expect(await fetchSharedGarden(env, "11111111-1111-4111-8111-111111111111")).toBeNull()
  })

  it("keeps a garden's link out of other users' hands", async () => {
    const garden = await aliceGardens.create("Alice's shared plot", emptyPlan())
    const share = await aliceGardens.share(garden.id, false)

    expect(await bobGardens.getShare(garden.id)).toBeNull()
    await expect(bobGardens.share(garden.id, true)).rejects.toThrow(/row-level security/)
    await bobGardens.unshare(garden.id)
    expect(await aliceGardens.getShare(garden.id)).toEqual(share)
  })

  it("lets a visitor with no session reach the shared garden and nothing else", async () => {
    const garden = await aliceGardens.create("Open to read", emptyPlan())
    const share = await aliceGardens.share(garden.id, false)
    const visitor = createClient(settings.url, settings.publishableKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    })

    const opened = await visitor.rpc("shared_garden", { share_token: share.token })
    expect(opened.data).toHaveLength(1)
    expect((await visitor.from("gardens").select("id")).data ?? []).toEqual([])
    expect((await visitor.from("garden_shares").select("token")).data ?? []).toEqual([])
  })

  it("is opened by the Worker only, not by a signed-in user directly", async () => {
    const garden = await aliceGardens.create("Not for Bob", emptyPlan())
    const share = await aliceGardens.share(garden.id, false)
    const direct = await bob.client.rpc("shared_garden", { share_token: share.token })
    expect(direct.data).toBeNull()
    expect(direct.error).not.toBeNull()
  })
})

describe("a garden's calendar link", () => {
  it("gives a garden a link the Worker can read with no session, without moving its version", async () => {
    const garden = await aliceGardens.create("Calendar plot", emptyPlan())
    expect(await aliceGardens.getCalendar(garden.id)).toBeNull()

    const token = await aliceGardens.startCalendar(garden.id)
    expect(token).toMatch(/^[0-9a-f]{8}-/)
    expect(await aliceGardens.getCalendar(garden.id)).toBe(token)
    expect(await fetchGardenCalendar(env, token)).toEqual({
      name: "Calendar plot",
      plan: emptyPlan(),
    })
    expect((await aliceGardens.get(garden.id)).version).toBe(1)
  })

  it("keeps the link it has when turned on again", async () => {
    const garden = await aliceGardens.create("Twice on", emptyPlan())
    const first = await aliceGardens.startCalendar(garden.id)
    expect(await aliceGardens.startCalendar(garden.id)).toBe(first)
  })

  it("reads nothing once turned off, and a new link is a different one", async () => {
    const garden = await aliceGardens.create("Briefly subscribed", emptyPlan())
    const first = await aliceGardens.startCalendar(garden.id)
    await aliceGardens.stopCalendar(garden.id)

    expect(await fetchGardenCalendar(env, first)).toBeNull()
    expect(await aliceGardens.getCalendar(garden.id)).toBeNull()
    expect(await aliceGardens.startCalendar(garden.id)).not.toBe(first)
  })

  it("keeps a garden's link out of other users' hands", async () => {
    const garden = await aliceGardens.create("Alice's calendar", emptyPlan())
    const token = await aliceGardens.startCalendar(garden.id)

    expect(await bobGardens.getCalendar(garden.id)).toBeNull()
    await expect(bobGardens.startCalendar(garden.id)).rejects.toThrow(/row-level security/)
    await bobGardens.stopCalendar(garden.id)
    expect(await aliceGardens.getCalendar(garden.id)).toBe(token)
  })
})

describe("the Worker's token check", () => {
  it("resolves a visitor's access token to their user, a guest with no email", async () => {
    expect(await verifySupabaseToken(env, alice.accessToken)).toEqual({
      id: alice.userId,
      email: null,
      isAnonymous: true,
    })
  })

  it("rejects a token that was tampered with", async () => {
    const forged = `${alice.accessToken.slice(0, -4)}AAAA`
    expect(await verifySupabaseToken(env, forged)).toBeNull()
  })
})
