import { describe, expect, it } from "vitest"
import { getPlant } from "./plants"
import { gardenTasks, isInGround, plantingSchedule, plantingsInGround } from "./schedule"
import { emptyPlan, type GardenPlan, type Plant, type Planting } from "./schema"

function planting(id: string, plantId: string, from: string, to: string): Planting {
  return {
    id,
    plantId,
    rect: { x: 0, y: 0, w: 100, h: 100 },
    layout: "row",
    inGround: { from, to },
  }
}

function plant(id: string): Plant {
  const found = getPlant(id)
  if (!found) throw new Error(`No sample plant called ${id}`)
  return found
}

// Tomato: 6 weeks indoors, harvest 60 to 85 days after planting out.
const tomatoes = planting("tomatoes", "tomato", "2026-05-01", "2026-09-30")
// Carrot: sown direct, harvest 70 to 110 days after sowing.
const carrots = planting("carrots", "carrot", "2026-03-15", "2026-07-03")

describe("plantingSchedule", () => {
  it("starts a transplanted crop indoors, the crop's lead time before it goes out", () => {
    expect(plantingSchedule(tomatoes, plant("tomato")).indoors).toEqual({
      from: "2026-03-20",
      to: "2026-04-30",
    })
  })

  it("has no time indoors for a crop sown direct", () => {
    expect(plantingSchedule(carrots, plant("carrot")).indoors).toBeNull()
  })

  it("uses the recorded sowing date in place of the crop's usual lead time", () => {
    const sownEarly = { ...tomatoes, sowDate: "2026-03-01" }
    expect(plantingSchedule(sownEarly, plant("tomato")).indoors).toEqual({
      from: "2026-03-01",
      to: "2026-04-30",
    })
  })

  it("ignores a sowing date that is not before the crop goes in the ground", () => {
    const sownOutside = { ...carrots, sowDate: "2026-03-15" }
    expect(plantingSchedule(sownOutside, plant("carrot")).indoors).toBeNull()
  })

  it("opens the harvest at the earliest picking day and closes it when the crop comes out", () => {
    expect(plantingSchedule(tomatoes, plant("tomato")).harvest).toEqual({
      from: "2026-06-30",
      to: "2026-09-30",
    })
  })

  it("has no harvest when the crop is pulled before it is ready", () => {
    const pulledEarly = planting("early", "carrot", "2026-03-15", "2026-04-15")
    expect(plantingSchedule(pulledEarly, plant("carrot")).harvest).toBeNull()
  })

  it("passes the time in the ground through", () => {
    expect(plantingSchedule(carrots, plant("carrot")).inGround).toEqual(carrots.inGround)
  })
})

describe("isInGround", () => {
  it("includes the first and the last day", () => {
    expect(isInGround(carrots, "2026-03-15")).toBe(true)
    expect(isInGround(carrots, "2026-07-03")).toBe(true)
    expect(isInGround(carrots, "2026-05-01")).toBe(true)
  })

  it("excludes the days before and after", () => {
    expect(isInGround(carrots, "2026-03-14")).toBe(false)
    expect(isInGround(carrots, "2026-07-04")).toBe(false)
  })
})

describe("plantingsInGround", () => {
  const plan: GardenPlan = { ...emptyPlan(), plantings: [tomatoes, carrots] }

  it("keeps only the crops in the ground on the day", () => {
    expect(plantingsInGround(plan, "2026-04-01").plantings).toEqual([carrots])
    expect(plantingsInGround(plan, "2026-06-01").plantings).toEqual([tomatoes, carrots])
    expect(plantingsInGround(plan, "2026-12-01").plantings).toEqual([])
  })

  it("leaves the beds and the rest of the plan alone", () => {
    const withBed: GardenPlan = {
      ...plan,
      beds: [{ id: "bed", name: "", kind: "bed", rect: { x: 0, y: 0, w: 100, h: 100 } }],
    }
    expect(plantingsInGround(withBed, "2026-12-01")).toEqual({ ...withBed, plantings: [] })
  })
})

describe("gardenTasks", () => {
  const plan: GardenPlan = { ...emptyPlan(), plantings: [tomatoes, carrots] }
  const all = { from: "2026-01-01", to: "2026-12-31" }

  it("lists what to do for each crop, in date order", () => {
    expect(gardenTasks(plan, getPlant, all)).toEqual([
      { date: "2026-03-15", kind: "sow", plantingId: "carrots", plantId: "carrot" },
      { date: "2026-03-20", kind: "sow-indoors", plantingId: "tomatoes", plantId: "tomato" },
      { date: "2026-05-01", kind: "transplant", plantingId: "tomatoes", plantId: "tomato" },
      { date: "2026-05-24", kind: "harvest", plantingId: "carrots", plantId: "carrot" },
      { date: "2026-06-30", kind: "harvest", plantingId: "tomatoes", plantId: "tomato" },
      { date: "2026-07-03", kind: "clear", plantingId: "carrots", plantId: "carrot" },
      { date: "2026-09-30", kind: "clear", plantingId: "tomatoes", plantId: "tomato" },
    ])
  })

  it("keeps only the tasks inside the range, both ends included", () => {
    const tasks = gardenTasks(plan, getPlant, { from: "2026-03-20", to: "2026-05-01" })
    expect(tasks.map((task) => task.kind)).toEqual(["sow-indoors", "transplant"])
  })

  it("skips the harvest of a crop pulled before it is ready", () => {
    const early: GardenPlan = {
      ...emptyPlan(),
      plantings: [planting("early", "carrot", "2026-03-15", "2026-04-15")],
    }
    expect(gardenTasks(early, getPlant, all).map((task) => task.kind)).toEqual(["sow", "clear"])
  })

  it("skips plantings of a crop it does not know", () => {
    const unknown: GardenPlan = {
      ...emptyPlan(),
      plantings: [planting("mystery", "dragonfruit", "2026-03-15", "2026-04-15")],
    }
    expect(gardenTasks(unknown, getPlant, all)).toEqual([])
  })
})
