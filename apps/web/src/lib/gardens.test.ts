import { emptyPlan } from "@garden/core"
import { describe, expect, it } from "vitest"
import { GardenFormatError, parseGarden, parseGardenSummary } from "./gardens"

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

  it("rejects a row that is not a garden", () => {
    expect(() => parseGarden(null)).toThrow(GardenFormatError)
  })
})

describe("parseGardenSummary", () => {
  it("reads the list columns without needing the plan", () => {
    const { id, name, updated_at } = ROW
    expect(parseGardenSummary({ id, name, updated_at })).toEqual({
      id,
      name,
      updatedAt: updated_at,
    })
  })
})
