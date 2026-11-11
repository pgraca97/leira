import { describe, expect, it } from "vitest"
import { findCompanions } from "./companions"
import { rectGap } from "./geometry"
import { getPlant } from "./plants"
import { emptyPlan, type GardenPlan, type Planting } from "./schema"

function planting(id: string, plantId: string, x: number, overrides: Partial<Planting> = {}) {
  return {
    id,
    plantId,
    rect: { x, y: 0, w: 100, h: 100 },
    layout: "row",
    inGround: { from: "2026-04-15", to: "2026-09-30" },
    ...overrides,
  } satisfies Planting
}

function planWith(...plantings: Planting[]): GardenPlan {
  return { ...emptyPlan(), plantings }
}

describe("rectGap", () => {
  const a = { x: 0, y: 0, w: 100, h: 100 }

  it("is zero for rectangles that touch or overlap", () => {
    expect(rectGap(a, { x: 100, y: 0, w: 50, h: 50 })).toBe(0)
    expect(rectGap(a, { x: 50, y: 50, w: 100, h: 100 })).toBe(0)
  })

  it("is the clear distance between rectangles side by side", () => {
    expect(rectGap(a, { x: 130, y: 20, w: 50, h: 50 })).toBe(30)
    expect(rectGap({ x: 130, y: 20, w: 50, h: 50 }, a)).toBe(30)
    expect(rectGap(a, { x: 0, y: 140, w: 50, h: 50 })).toBe(40)
  })

  it("is measured corner to corner for rectangles set diagonally", () => {
    expect(rectGap(a, { x: 130, y: 140, w: 50, h: 50 })).toBe(50)
  })
})

describe("findCompanions", () => {
  // In the sample data, green beans and onions are bad neighbours, and
  // tomatoes and carrots good ones.
  it("flags crops that grow poorly side by side", () => {
    const plan = planWith(planting("beans", "green-bean", 0), planting("onions", "onion", 100))
    expect(findCompanions(plan, getPlant)).toEqual([
      { plantingId: "beans", otherPlantingId: "onions", relation: "bad" },
    ])
  })

  it("flags the pair even when only one of the two crops names the other", () => {
    // A lookup where the bean names the onion as bad, but the onion names nobody.
    const oneSided = (id: string) => {
      const plant = getPlant(id)
      return plant && id === "onion" ? { ...plant, companions: { good: [], bad: [] } } : plant
    }
    const plan = planWith(planting("onions", "onion", 0), planting("beans", "green-bean", 100))
    expect(findCompanions(plan, oneSided)).toEqual([
      { plantingId: "onions", otherPlantingId: "beans", relation: "bad" },
    ])
  })

  it("lets a bad relation outweigh a good one", () => {
    const mixed = (id: string) => {
      const plant = getPlant(id)
      return plant && id === "onion"
        ? { ...plant, companions: { good: ["green-bean"], bad: [] } }
        : plant
    }
    const plan = planWith(planting("onions", "onion", 0), planting("beans", "green-bean", 100))
    expect(findCompanions(plan, mixed).map((pair) => pair.relation)).toEqual(["bad"])
  })

  it("notes crops that help each other", () => {
    const plan = planWith(planting("tomatoes", "tomato", 0), planting("carrots", "carrot", 120))
    expect(findCompanions(plan, getPlant)).toEqual([
      { plantingId: "tomatoes", otherPlantingId: "carrots", relation: "good" },
    ])
  })

  it("ignores crops too far apart to affect each other", () => {
    const plan = planWith(planting("beans", "green-bean", 0), planting("onions", "onion", 160))
    expect(findCompanions(plan, getPlant)).toEqual([])
    expect(findCompanions(plan, getPlant, { withinCm: 60 })).toHaveLength(1)
  })

  it("ignores crops that are never in the ground together", () => {
    const plan = planWith(
      planting("beans", "green-bean", 0, { inGround: { from: "2026-04-15", to: "2026-06-30" } }),
      planting("onions", "onion", 100, { inGround: { from: "2026-07-01", to: "2026-10-30" } })
    )
    expect(findCompanions(plan, getPlant)).toEqual([])
  })

  it("counts a single shared day as being in the ground together", () => {
    const plan = planWith(
      planting("beans", "green-bean", 0, { inGround: { from: "2026-04-15", to: "2026-07-01" } }),
      planting("onions", "onion", 100, { inGround: { from: "2026-07-01", to: "2026-10-30" } })
    )
    expect(findCompanions(plan, getPlant)).toHaveLength(1)
  })

  it("says nothing about crops with no known relation, or of the same kind", () => {
    const plan = planWith(
      planting("beans", "green-bean", 0),
      planting("more-beans", "green-bean", 100),
      planting("lettuces", "lettuce", 200)
    )
    expect(findCompanions(plan, getPlant)).toEqual([])
  })

  it("skips crops it does not know", () => {
    const plan = planWith(
      planting("beans", "green-bean", 0),
      planting("mystery", "dragonfruit", 100)
    )
    expect(findCompanions(plan, getPlant)).toEqual([])
  })
})
