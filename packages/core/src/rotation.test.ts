import { describe, expect, it } from "vitest"
import { getPlant } from "./plants"
import { findRotationConflicts } from "./rotation"
import { emptyPlan, type GardenPlan, type Planting } from "./schema"

const bedA = { x: 0, y: 0, w: 200, h: 100 }
const bedB = { x: 300, y: 0, w: 200, h: 100 }

function planting(id: string, plantId: string, year: number, overrides: Partial<Planting> = {}) {
  return {
    id,
    plantId,
    rect: bedA,
    layout: "row",
    inGround: { from: `${year}-04-15`, to: `${year}-09-30` },
    ...overrides,
  } satisfies Planting
}

function planWith(...plantings: Planting[]): GardenPlan {
  return { ...emptyPlan(), plantings }
}

describe("findRotationConflicts", () => {
  it("flags the same family on the same ground a year later", () => {
    const plan = planWith(planting("first", "tomato", 2025), planting("second", "tomato", 2026))
    expect(findRotationConflicts(plan, getPlant)).toEqual([
      {
        plantingId: "second",
        previousPlantingId: "first",
        family: "solanaceae",
        yearsApart: 1,
        overlap: bedA,
      },
    ])
  })

  it("allows the family back once the rotation has run", () => {
    const plan = planWith(planting("first", "tomato", 2024), planting("second", "tomato", 2027))
    expect(findRotationConflicts(plan, getPlant)).toEqual([])
  })

  it("honours a longer rotation", () => {
    const plan = planWith(planting("first", "tomato", 2024), planting("second", "tomato", 2027))
    expect(findRotationConflicts(plan, getPlant, { years: 4 })).toHaveLength(1)
  })

  it("ignores a different family on the same ground", () => {
    const plan = planWith(planting("first", "tomato", 2025), planting("second", "carrot", 2026))
    expect(findRotationConflicts(plan, getPlant)).toEqual([])
  })

  it("ignores the same family on other ground", () => {
    const plan = planWith(
      planting("first", "tomato", 2025),
      planting("second", "tomato", 2026, { rect: bedB })
    )
    expect(findRotationConflicts(plan, getPlant)).toEqual([])
  })

  it("ignores beds that only share an edge", () => {
    const next = { ...bedA, x: bedA.x + bedA.w }
    const plan = planWith(
      planting("first", "tomato", 2025),
      planting("second", "tomato", 2026, { rect: next })
    )
    expect(findRotationConflicts(plan, getPlant)).toEqual([])
  })

  it("reports only the ground the two plantings share", () => {
    const shifted = { x: 150, y: 50, w: 200, h: 100 }
    const plan = planWith(
      planting("first", "tomato", 2025),
      planting("second", "tomato", 2026, { rect: shifted })
    )
    expect(findRotationConflicts(plan, getPlant)[0]?.overlap).toEqual({
      x: 150,
      y: 50,
      w: 50,
      h: 50,
    })
  })

  it("does not treat crops growing side by side as a rotation", () => {
    const plan = planWith(planting("first", "tomato", 2026), planting("second", "tomato", 2026))
    expect(findRotationConflicts(plan, getPlant)).toEqual([])
  })

  it("flags a follow-on crop of the same family within one year", () => {
    const plan = planWith(
      planting("spring", "lettuce", 2026, { inGround: { from: "2026-03-01", to: "2026-05-15" } }),
      planting("autumn", "lettuce", 2026, { inGround: { from: "2026-09-01", to: "2026-11-15" } })
    )
    expect(findRotationConflicts(plan, getPlant)).toMatchObject([
      { plantingId: "autumn", previousPlantingId: "spring", yearsApart: 0 },
    ])
  })

  it("counts years from when each crop went in, across a winter", () => {
    const plan = planWith(
      planting("first", "onion", 2024, { inGround: { from: "2024-10-15", to: "2025-06-20" } }),
      planting("second", "onion", 2025, { inGround: { from: "2025-10-15", to: "2026-06-20" } })
    )
    expect(findRotationConflicts(plan, getPlant)).toMatchObject([{ yearsApart: 1 }])
  })

  it("reports every earlier planting a new one clashes with", () => {
    const plan = planWith(
      planting("y1", "tomato", 2024),
      planting("y2", "tomato", 2025),
      planting("y3", "tomato", 2026)
    )
    const pairs = findRotationConflicts(plan, getPlant).map(
      (conflict) => `${conflict.previousPlantingId}>${conflict.plantingId}`
    )
    expect(pairs.sort()).toEqual(["y1>y2", "y1>y3", "y2>y3"])
  })

  it("skips plants it does not know", () => {
    const plan = planWith(planting("first", "triffid", 2025), planting("second", "triffid", 2026))
    expect(findRotationConflicts(plan, getPlant)).toEqual([])
  })
})
