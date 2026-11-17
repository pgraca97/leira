import { describe, expect, it } from "vitest"
import { GardenFileSchema, gardenFile } from "./exportFile"
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
