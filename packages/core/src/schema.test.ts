import { describe, expect, it } from "vitest"
import {
  emptyPlan,
  GardenLocationSchema,
  type GardenPlan,
  GardenPlanSchema,
  PLAN_SCHEMA_VERSION,
  PlaceSchema,
  PlacesSchema,
  roundCoordinate,
} from "./schema"

const BED_ID = "3f2b8c1e-5d4a-4b6f-9a7e-1c2d3e4f5a6b"
const PLANTING_ID = "7c9e6679-7425-40de-944b-e07fc1f90ae7"

function samplePlan(): GardenPlan {
  return {
    ...emptyPlan(),
    beds: [{ id: BED_ID, name: "Bed 1", kind: "bed", rect: { x: 50, y: 50, w: 200, h: 100 } }],
    plantings: [
      {
        id: PLANTING_ID,
        plantId: "tomato",
        rect: { x: 50, y: 50, w: 100, h: 100 },
        layout: "row",
        inGround: { from: "2026-04-15", to: "2026-09-30" },
      },
    ],
  }
}

describe("GardenPlanSchema", () => {
  it("accepts a new empty plan", () => {
    expect(GardenPlanSchema.parse(emptyPlan())).toEqual(emptyPlan())
  })

  it("accepts a plan with beds and plantings and returns it unchanged", () => {
    expect(GardenPlanSchema.parse(samplePlan())).toEqual(samplePlan())
  })

  it("rejects a plan written by another schema version", () => {
    const plan = { ...samplePlan(), schemaVersion: PLAN_SCHEMA_VERSION + 1 }
    expect(GardenPlanSchema.safeParse(plan).success).toBe(false)
  })

  it("rejects fractional centimetres", () => {
    const plan = samplePlan()
    plan.beds[0]!.rect.w = 99.5
    expect(GardenPlanSchema.safeParse(plan).success).toBe(false)
  })

  it("rejects a rectangle with no area", () => {
    const plan = samplePlan()
    plan.plantings[0]!.rect.h = 0
    expect(GardenPlanSchema.safeParse(plan).success).toBe(false)
  })

  it("rejects dates that are not calendar days", () => {
    const plan = samplePlan()
    plan.plantings[0]!.inGround.from = "2026-02-30"
    expect(GardenPlanSchema.safeParse(plan).success).toBe(false)
  })

  it("rejects a crop that leaves the ground before it goes in", () => {
    const plan = samplePlan()
    plan.plantings[0]!.inGround = { from: "2026-09-30", to: "2026-04-15" }
    expect(GardenPlanSchema.safeParse(plan).success).toBe(false)
  })

  it("rejects an unknown layout", () => {
    const plan = samplePlan() as unknown as { plantings: { layout: string }[] }
    plan.plantings[0]!.layout = "spiral"
    expect(GardenPlanSchema.safeParse(plan).success).toBe(false)
  })
})

describe("what happened to a planting", () => {
  const withRecord = (record: Record<string, unknown>) => {
    const plan = samplePlan()
    return { ...plan, plantings: [{ ...plan.plantings[0], ...record }] }
  }

  it("is kept with the planting: marks, harvests and notes", () => {
    const plan = withRecord({
      planted: true,
      cleared: true,
      harvests: [{ date: "2026-07-12", quantity: 1.2, unit: "kg" }, { date: "2026-07-20" }],
      notes: "Blight in August.",
    })
    expect(GardenPlanSchema.parse(plan)).toEqual(plan)
  })

  it("names the variety of a planting in the gardener's own words", () => {
    const plan = withRecord({ variety: "Coração de Boi" })
    expect(GardenPlanSchema.parse(plan)).toEqual(plan)
    expect(GardenPlanSchema.safeParse(withRecord({ variety: "x".repeat(61) })).success).toBe(false)
    expect(GardenPlanSchema.safeParse(withRecord({ variety: "" })).success).toBe(false)
  })

  it("lets the garden carry notes of its own", () => {
    const plan = { ...samplePlan(), notes: "Water from the well ran out in July." }
    expect(GardenPlanSchema.parse(plan)).toEqual(plan)
  })

  it.each([
    ["a quantity with no unit", { harvests: [{ date: "2026-07-12", quantity: 1.2 }] }],
    ["a unit with no quantity", { harvests: [{ date: "2026-07-12", unit: "kg" }] }],
    ["a quantity of nothing", { harvests: [{ date: "2026-07-12", quantity: 0, unit: "kg" }] }],
    ["a quantity too large", { harvests: [{ date: "2026-07-12", quantity: 10_001, unit: "kg" }] }],
    ["an unknown unit", { harvests: [{ date: "2026-07-12", quantity: 2, unit: "lb" }] }],
    ["a mark that says no", { planted: false }],
    ["more harvests than fit", { harvests: Array(201).fill({ date: "2026-07-12" }) }],
    ["notes that are too long", { notes: "x".repeat(2001) }],
  ])("rejects %s", (_name, record) => {
    expect(GardenPlanSchema.safeParse(withRecord(record)).success).toBe(false)
  })

  it("rejects garden notes that are too long", () => {
    const plan = { ...samplePlan(), notes: "x".repeat(5001) }
    expect(GardenPlanSchema.safeParse(plan).success).toBe(false)
  })
})

describe("GardenLocationSchema", () => {
  it("accepts coordinates with an optional name", () => {
    expect(GardenLocationSchema.safeParse({ lat: 38.72, lon: -9.14 }).success).toBe(true)
    expect(GardenLocationSchema.safeParse({ lat: 38.72, lon: -9.14, name: "Lisboa" }).success).toBe(
      true
    )
  })

  it("rejects coordinates off the globe", () => {
    expect(GardenLocationSchema.safeParse({ lat: 91, lon: 0 }).success).toBe(false)
    expect(GardenLocationSchema.safeParse({ lat: 0, lon: -181 }).success).toBe(false)
  })
})

describe("PlaceSchema", () => {
  const braga = { name: "Braga", region: "Braga", country: "PT", lat: 41.5503, lon: -8.42 }

  it("accepts a place, with or without its region and country", () => {
    expect(PlaceSchema.safeParse(braga).success).toBe(true)
    expect(PlaceSchema.safeParse({ name: "Braga", lat: 41.5503, lon: -8.42 }).success).toBe(true)
  })

  it("keeps the area a place lies in, which tells apart places of one name", () => {
    const arcozelo = { name: "Arcozelo", area: "Vila Nova de Gaia", lat: 41.06, lon: -8.63 }
    expect(PlaceSchema.parse(arcozelo)).toEqual(arcozelo)
    expect(PlaceSchema.safeParse({ ...arcozelo, area: "" }).success).toBe(false)
  })

  it("rejects a place with no name or off the globe", () => {
    expect(PlaceSchema.safeParse({ ...braga, name: "" }).success).toBe(false)
    expect(PlaceSchema.safeParse({ ...braga, lat: 91 }).success).toBe(false)
  })

  it("holds at most ten places, the most a search returns", () => {
    expect(PlacesSchema.safeParse(Array(10).fill(braga)).success).toBe(true)
    expect(PlacesSchema.safeParse(Array(11).fill(braga)).success).toBe(false)
  })
})

describe("roundCoordinate", () => {
  it("keeps two decimals by default", () => {
    expect(roundCoordinate(38.722252)).toBe(38.72)
    expect(roundCoordinate(-9.139337)).toBe(-9.14)
  })

  it("rounds to the requested precision", () => {
    expect(roundCoordinate(38.76, 1)).toBe(38.8)
  })

  it("never returns negative zero", () => {
    expect(Object.is(roundCoordinate(-0.001), 0)).toBe(true)
  })
})
