import { describe, expect, it } from "vitest"
import { defaultInGround, hitTest, planBounds, plantingFill } from "./plan"
import { getPlant } from "./plants"
import { emptyPlan, type GardenPlan } from "./schema"

const plan: GardenPlan = {
  ...emptyPlan(),
  beds: [
    { id: "bed-under", name: "Under", kind: "bed", rect: { x: 0, y: 0, w: 300, h: 200 } },
    { id: "bed-over", name: "Over", kind: "bed", rect: { x: 200, y: 100, w: 200, h: 200 } },
  ],
  plantings: [
    {
      id: "lettuces",
      plantId: "lettuce",
      rect: { x: 0, y: 0, w: 100, h: 60 },
      layout: "row",
      inGround: { from: "2026-03-01", to: "2026-05-15" },
    },
  ],
}

describe("planBounds", () => {
  it("covers the whole garden from the origin", () => {
    expect(planBounds(plan)).toEqual({ x: 0, y: 0, w: 600, h: 400 })
  })
})

describe("hitTest", () => {
  it("prefers a planting over the bed beneath it", () => {
    expect(hitTest(plan, { x: 50, y: 30 })).toEqual({ kind: "planting", id: "lettuces" })
  })

  it("finds a bed where nothing is planted", () => {
    expect(hitTest(plan, { x: 150, y: 150 })).toEqual({ kind: "bed", id: "bed-under" })
  })

  it("picks the bed added last where two overlap", () => {
    expect(hitTest(plan, { x: 250, y: 150 })).toEqual({ kind: "bed", id: "bed-over" })
  })

  it("returns null on bare ground", () => {
    expect(hitTest(plan, { x: 550, y: 50 })).toBeNull()
  })
})

describe("plantingFill", () => {
  it("lays a planting out with its crop's spacing", () => {
    const lettuce = getPlant("lettuce")!
    // 100 by 60 cm at 25 cm in the row and 30 cm between rows: 4 by 2.
    expect(plantingFill(plan.plantings[0]!, lettuce).count).toBe(8)
  })
})

describe("defaultInGround", () => {
  it("keeps the crop in the ground until its latest harvest", () => {
    const tomato = getPlant("tomato")!
    expect(defaultInGround(tomato, "2026-05-01")).toEqual({ from: "2026-05-01", to: "2026-07-25" })
  })
})
