import { describe, expect, it } from "vitest"
import { getPlant } from "./plants"
import { emptyPlan, type GardenPlan, type Planting } from "./schema"
import { seedList } from "./seeds"

function planting(id: string, plantId: string, from: string, w = 100): Planting {
  return {
    id,
    plantId,
    rect: { x: 0, y: 0, w, h: 100 },
    layout: "block",
    inGround: { from, to: "2027-12-31" },
  }
}

describe("seedList", () => {
  const plan: GardenPlan = {
    ...emptyPlan(),
    plantings: [
      // Tomato, 50 cm apart in a block: 4 on a square metre, 8 on two.
      planting("t1", "tomato", "2026-05-01"),
      planting("c1", "carrot", "2026-03-15"),
      planting("t2", "tomato", "2026-05-20", 200),
      planting("next year", "tomato", "2027-05-01"),
      { ...planting("in already", "tomato", "2026-04-20"), planted: true },
      planting("unknown", "dragonfruit", "2026-05-01"),
    ],
  }

  it("adds up the plants of each crop that goes in the ground that year", () => {
    expect(seedList(plan, getPlant, 2026)).toEqual([
      { plantId: "tomato", plants: 12, plantings: 2 },
      { plantId: "carrot", plants: 400, plantings: 1 },
    ])
  })

  it("leaves out what is already in the ground, and crops it does not know", () => {
    const ids = seedList(plan, getPlant, 2026).map((need) => need.plantId)
    expect(ids).toEqual(["tomato", "carrot"])
    expect(seedList(plan, getPlant, 2027)).toEqual([{ plantId: "tomato", plants: 4, plantings: 1 }])
  })

  it("keeps the varieties of a crop apart: their seeds are bought apart", () => {
    const varieties: GardenPlan = {
      ...emptyPlan(),
      plantings: [
        { ...planting("a", "tomato", "2026-05-01"), variety: "Roma" },
        planting("b", "tomato", "2026-05-01"),
        { ...planting("c", "tomato", "2026-05-10", 200), variety: "Roma" },
      ],
    }
    expect(seedList(varieties, getPlant, 2026)).toEqual([
      { plantId: "tomato", variety: "Roma", plants: 12, plantings: 2 },
      { plantId: "tomato", plants: 4, plantings: 1 },
    ])
  })

  it("is empty for a year with nothing to plant", () => {
    expect(seedList(plan, getPlant, 2030)).toEqual([])
  })
})
