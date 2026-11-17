import { describe, expect, it } from "vitest"
import { GardenFileSchema, gardenFile, readExportFile } from "./exportFile"
import { emptyPlan, type GardenPlan } from "./schema"

const NOW = new Date("2026-11-17T10:00:00Z")

const PLAN: GardenPlan = {
  ...emptyPlan(),
  notes: "The well ran dry in July.",
  plantings: [
    {
      id: "7c9e6679-7425-40de-944b-e07fc1f90ae7",
      plantId: "tomato",
      variety: "Coração de Boi",
      rect: { x: 50, y: 50, w: 100, h: 100 },
      layout: "row",
      inGround: { from: "2026-05-10", to: "2026-09-30" },
      sowDate: "2026-03-20",
      planted: true,
      harvests: [{ date: "2026-07-12", quantity: 1.2, unit: "kg" }],
      notes: "Blight in August.",
    },
  ],
}

const GARDEN = {
  name: "Tomato patch",
  plan: PLAN,
  location: { lat: 41.15, lon: -8.61, name: "Porto" },
}

describe("gardenFile", () => {
  it("holds one garden in the shape of the account's export, with all it recorded", () => {
    expect(gardenFile(GARDEN, NOW)).toEqual({
      format: 1,
      exportedAt: "2026-11-17T10:00:00.000Z",
      gardens: [{ ...GARDEN, updatedAt: "2026-11-17T10:00:00.000Z" }],
    })
  })

  it("keeps a garden that has no location", () => {
    expect(gardenFile({ ...GARDEN, location: null }, NOW).gardens[0]?.location).toBeNull()
  })

  it("comes back the same through JSON and the file's schema", () => {
    const file = gardenFile(GARDEN, NOW)
    expect(GardenFileSchema.parse(JSON.parse(JSON.stringify(file)))).toEqual(file)
  })
})

describe("readExportFile", () => {
  const NAMES = { garden: "My garden", template: "Imported template" }
  const ITEMS = {
    format: 1,
    beds: [
      {
        id: "44444444-4444-4444-8444-444444444444",
        name: "Herb bed",
        kind: "bed",
        rect: { x: 0, y: 0, w: 200, h: 100 },
      },
    ],
    plantings: [],
  }
  const read = (file: unknown) => readExportFile(JSON.stringify(file), NAMES)
  const withGarden = (garden: Record<string, unknown>) =>
    read({ format: 1, gardens: [{ ...GARDEN, ...garden }] })

  it("reads the file of one garden", () => {
    expect(readExportFile(JSON.stringify(gardenFile(GARDEN, NOW)), NAMES)).toEqual({
      ok: true,
      gardens: [GARDEN],
      templates: [],
      skipped: 0,
    })
  })

  it("reads the account's export, its gardens and its templates", () => {
    const account = {
      format: 1,
      exportedAt: "2026-11-17T10:00:00.123456+00:00",
      account: { email: "ana@example.com", signInMethods: [], sessions: [] },
      profile: { displayName: null, locale: "pt" },
      gardens: [
        {
          ...GARDEN,
          version: 7,
          createdAt: "2026-05-01T10:00:00+00:00",
          updatedAt: "2026-11-01T10:00:00+00:00",
          share: { token: "aaaaaaaa-aaaa-4aaa-8aaa-000000000001", showLocation: true },
        },
        { name: "Herb spiral", plan: emptyPlan(), location: null, version: 1, share: null },
      ],
      templates: [{ name: "Herbs", items: ITEMS, createdAt: "2026-06-01T10:00:00+00:00" }],
      activityDays: ["2026-11-17"],
    }
    expect(read(account)).toEqual({
      ok: true,
      gardens: [GARDEN, { name: "Herb spiral", plan: emptyPlan(), location: null }],
      templates: [{ name: "Herbs", items: ITEMS }],
      skipped: 0,
    })
  })

  it("brings a plan written by an older version up to date", () => {
    const result = withGarden({ plan: { ...emptyPlan(), schemaVersion: 1 } })
    expect(result.ok && result.gardens[0]?.plan).toEqual(emptyPlan())
  })

  it("leaves out what it cannot read, and counts it", () => {
    const result = read({
      format: 1,
      gardens: [
        GARDEN,
        null,
        "Tomato patch",
        { name: "No plan" },
        { ...GARDEN, plan: { ...PLAN, widthCm: -1 } },
        { ...GARDEN, plan: { ...PLAN, schemaVersion: 99 } },
      ],
      templates: [{ name: "Herbs", items: ITEMS }, { name: "Broken", items: { format: 2 } }, 7],
    })
    expect(result).toEqual({
      ok: true,
      gardens: [GARDEN],
      templates: [{ name: "Herbs", items: ITEMS }],
      skipped: 7,
    })
  })

  it.each([
    ["text that is not JSON", "{ format: 1"],
    ["JSON that is not an object", "[]"],
    ["a file with no format", JSON.stringify({ gardens: [GARDEN] })],
    ["a format that is not a number", JSON.stringify({ format: "1", gardens: [GARDEN] })],
    ["gardens that are not a list", JSON.stringify({ format: 1, gardens: GARDEN })],
  ])("refuses %s as unreadable", (_, text) => {
    expect(readExportFile(text, NAMES)).toEqual({ ok: false, problem: "unreadable" })
  })

  it("refuses a file from a newer version, saying so", () => {
    expect(read({ format: 99, gardens: [GARDEN] })).toEqual({ ok: false, problem: "newer" })
  })

  it.each([
    ["no gardens or templates", { format: 1 }],
    ["empty lists", { format: 1, gardens: [], templates: [] }],
    ["nothing readable", { format: 1, gardens: [{ name: "No plan" }] }],
  ])("refuses a file with %s as empty", (_, file) => {
    expect(read(file)).toEqual({ ok: false, problem: "empty" })
  })

  it("trims a name and cuts it to what the database keeps", () => {
    const long = `  ${"a".repeat(79)}🌱🌱  `
    const result = read({
      format: 1,
      gardens: [{ ...GARDEN, name: long }],
      templates: [{ name: `${"b".repeat(59)} c`, items: ITEMS }],
    })
    // Cut by characters, so the seedling is not split in half.
    expect(result.ok && result.gardens[0]?.name).toBe(`${"a".repeat(79)}🌱`)
    // And no space left at the end of the cut.
    expect(result.ok && result.templates[0]?.name).toBe("b".repeat(59))
  })

  it.each([["   "], [""], [42], [undefined]])(
    "gives the fallback name for a name of %j",
    (name) => {
      const result = read({
        format: 1,
        gardens: [{ ...GARDEN, name }],
        templates: [{ name, items: ITEMS }],
      })
      expect(result.ok && result.gardens[0]?.name).toBe("My garden")
      expect(result.ok && result.templates[0]?.name).toBe("Imported template")
    }
  )

  it.each([
    ["off the globe", { lat: 91, lon: 0 }],
    ["not a place", "Porto"],
    ["missing", undefined],
  ])("keeps a garden whose location is %s, with no location", (_, location) => {
    const result = withGarden({ location })
    expect(result.ok && result.gardens[0]).toEqual({ ...GARDEN, location: null })
  })

  it("rounds the location to about a kilometre, as the app stores it", () => {
    const result = withGarden({ location: { lat: 41.14961, lon: -8.61099 } })
    expect(result.ok && result.gardens[0]?.location).toEqual({ lat: 41.15, lon: -8.61 })
  })
})
