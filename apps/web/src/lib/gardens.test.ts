import { emptyPlan } from "@leira/core"
import { describe, expect, it } from "vitest"
import {
  GARDEN_NAME_MAX,
  GardenFormatError,
  gardenCopyName,
  parseGarden,
  parseGardenSummary,
  parseSharedGarden,
} from "./gardens"

const ROW = {
  id: "0b0e0c7e-3a53-4f5c-9a43-3a4f6a1c2b10",
  name: "Back garden",
  location: { lat: 41.15, lon: -8.61, name: "Porto" },
  plan: emptyPlan(),
  version: 3,
  updated_at: "2026-11-10T21:07:02.123456+00:00",
}

describe("parseGarden", () => {
  it("turns a database row into a garden", () => {
    expect(parseGarden(ROW)).toEqual({
      id: ROW.id,
      name: "Back garden",
      location: { lat: 41.15, lon: -8.61, name: "Porto" },
      plan: emptyPlan(),
      version: 3,
      updatedAt: "2026-11-10T21:07:02.123456+00:00",
    })
  })

  it("accepts a garden without a location", () => {
    expect(parseGarden({ ...ROW, location: null }).location).toBeNull()
  })

  it("rejects a plan written by a newer version of the app", () => {
    const row = { ...ROW, plan: { ...emptyPlan(), schemaVersion: 999 } }
    expect(() => parseGarden(row)).toThrow(GardenFormatError)
  })

  it("brings a plan stored by an older version of the app up to date", () => {
    const row = { ...ROW, plan: { ...emptyPlan(), schemaVersion: 1 } }
    expect(parseGarden(row).plan).toEqual(emptyPlan())
  })

  it("rejects a row that is not a garden", () => {
    expect(() => parseGarden(null)).toThrow(GardenFormatError)
  })
})

describe("parseGardenSummary", () => {
  const { id, name, updated_at, plan } = ROW

  it("reads the list columns, with the plan to draw a picture from", () => {
    expect(parseGardenSummary({ id, name, updated_at, plan })).toEqual({
      id,
      name,
      updatedAt: updated_at,
      location: null,
      plan,
    })
  })

  it("reads where the garden is, for its weather this week", () => {
    const location = { lat: 41.15, lon: -8.61, name: "Porto" }
    expect(parseGardenSummary({ id, name, updated_at, location, plan }).location).toEqual(location)
  })

  it("still lists a garden whose place it cannot read, without the place", () => {
    const location = { lat: "north" }
    expect(parseGardenSummary({ id, name, updated_at, location, plan }).location).toBeNull()
  })

  it("still lists a garden whose plan it cannot read, without the plan", () => {
    const newer = { ...emptyPlan(), schemaVersion: 999 }
    expect(parseGardenSummary({ id, name, updated_at, plan: newer }).plan).toBeNull()
    expect(parseGardenSummary({ id, name, updated_at }).plan).toBeNull()
  })

  it("brings a plan stored by an older version of the app up to date", () => {
    const older = { ...emptyPlan(), schemaVersion: 1 }
    expect(parseGardenSummary({ id, name, updated_at, plan: older }).plan).toEqual(emptyPlan())
  })

  it("rejects a row that is not a garden", () => {
    expect(() => parseGardenSummary({ name })).toThrow(GardenFormatError)
  })
})

describe("gardenCopyName", () => {
  it("adds the suffix to the name", () => {
    expect(gardenCopyName("Back garden", " (copy)")).toBe("Back garden (copy)")
  })

  it("cuts a long name so the copy's name still fits", () => {
    const copy = gardenCopyName("a".repeat(GARDEN_NAME_MAX), " (copy)")
    expect(copy).toHaveLength(GARDEN_NAME_MAX)
    expect(copy.endsWith(" (copy)")).toBe(true)
  })
})

describe("parseSharedGarden", () => {
  const SHARED = {
    name: "Back garden",
    location: null,
    plan: emptyPlan(),
    updatedAt: "2026-11-10T21:07:02.123456+00:00",
  }

  it("accepts what the Worker answers for a share link", () => {
    expect(parseSharedGarden(SHARED)).toEqual(SHARED)
    const location = { lat: 41.15, lon: -8.61, name: "Porto" }
    expect(parseSharedGarden({ ...SHARED, location }).location).toEqual(location)
  })

  it.each([
    ["a plan this version cannot read", { ...SHARED, plan: { schemaVersion: 99 } }],
    ["a location off the globe", { ...SHARED, location: { lat: 123, lon: 0 } }],
    ["no name", { ...SHARED, name: undefined }],
    ["nothing", null],
  ])("refuses %s", (_case, body) => {
    expect(() => parseSharedGarden(body)).toThrow(GardenFormatError)
  })
})
