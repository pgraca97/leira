import { describe, expect, it } from "vitest"
import { getPlant } from "./plants"
import {
  defaultDoneDate,
  gardenTasks,
  glancePlan,
  harvestingOn,
  isInGround,
  nearestPlantedDay,
  plantingSchedule,
  plantingsInGround,
  TASK_AHEAD_DAYS,
  TASK_LOOKBACK_DAYS,
  tasksThisWeek,
} from "./schedule"
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

  it("starts the harvest on the day of the first one recorded", () => {
    const early = { ...tomatoes, harvests: [{ date: "2026-06-20" }, { date: "2026-07-04" }] }
    expect(plantingSchedule(early, plant("tomato")).harvest).toEqual({
      from: "2026-06-20",
      to: "2026-09-30",
    })
  })

  it("has a harvest for a crop picked before it was due to be ready", () => {
    const pulledEarly = {
      ...planting("early", "carrot", "2026-03-15", "2026-04-15"),
      harvests: [{ date: "2026-04-10" }],
    }
    expect(plantingSchedule(pulledEarly, plant("carrot")).harvest).toEqual({
      from: "2026-04-10",
      to: "2026-04-15",
    })
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

describe("nearestPlantedDay", () => {
  const plan: GardenPlan = { ...emptyPlan(), plantings: [tomatoes, carrots] }

  it("is the next day a crop goes in, when the day shown is empty", () => {
    expect(nearestPlantedDay(plan, "2026-01-10")).toBe("2026-03-15")
  })

  it("is the last day a crop was in, when nothing comes after", () => {
    expect(nearestPlantedDay(plan, "2026-12-01")).toBe("2026-09-30")
  })

  it("is the day itself when something is in the ground then", () => {
    expect(nearestPlantedDay(plan, "2026-06-01")).toBe("2026-06-01")
  })

  it("is null for a plan with no crops", () => {
    expect(nearestPlantedDay(emptyPlan(), "2026-06-01")).toBeNull()
  })
})

describe("glancePlan", () => {
  const plan: GardenPlan = { ...emptyPlan(), plantings: [tomatoes, carrots] }

  it("is the plan on the day when something is in the ground", () => {
    expect(glancePlan(plan, "2026-04-01").plantings).toEqual([carrots])
  })

  it("is the whole plan when the day is empty, so the garden does not look bare", () => {
    expect(glancePlan(plan, "2026-12-01")).toBe(plan)
  })
})

describe("gardenTasks", () => {
  const plan: GardenPlan = { ...emptyPlan(), plantings: [tomatoes, carrots] }
  const all = { from: "2026-01-01", to: "2026-12-31" }

  it("lists what to do for each crop, in date order", () => {
    expect(gardenTasks(plan, getPlant, all)).toEqual([
      { date: "2026-03-15", kind: "sow", plantingId: "carrots", plantId: "carrot", done: false },
      {
        date: "2026-03-20",
        kind: "sow-indoors",
        plantingId: "tomatoes",
        plantId: "tomato",
        done: false,
      },
      {
        date: "2026-05-01",
        kind: "transplant",
        plantingId: "tomatoes",
        plantId: "tomato",
        done: false,
      },
      {
        date: "2026-05-24",
        kind: "harvest",
        plantingId: "carrots",
        plantId: "carrot",
        done: false,
      },
      {
        date: "2026-06-30",
        kind: "harvest",
        plantingId: "tomatoes",
        plantId: "tomato",
        done: false,
      },
      { date: "2026-07-03", kind: "clear", plantingId: "carrots", plantId: "carrot", done: false },
      { date: "2026-09-30", kind: "clear", plantingId: "tomatoes", plantId: "tomato", done: false },
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

  const tasksOf = (recorded: Planting) =>
    gardenTasks({ ...emptyPlan(), plantings: [recorded] }, getPlant, all).map((task) => [
      task.kind,
      task.date,
      task.done,
    ])

  it("marks a job done from what the planting records, on the day recorded", () => {
    const done: Planting = {
      ...tomatoes,
      sowDate: "2026-03-10",
      planted: true,
      harvests: [{ date: "2026-07-04" }],
      cleared: true,
    }
    expect(tasksOf(done)).toEqual([
      ["sow-indoors", "2026-03-10", true],
      ["transplant", "2026-05-01", true],
      ["harvest", "2026-07-04", true],
      ["clear", "2026-09-30", true],
    ])
  })

  it("keeps a job not done when only earlier stages are done", () => {
    expect(tasksOf({ ...tomatoes, sowDate: "2026-03-10", planted: true })).toEqual([
      ["sow-indoors", "2026-03-10", true],
      ["transplant", "2026-05-01", true],
      ["harvest", "2026-06-30", false],
      ["clear", "2026-09-30", false],
    ])
  })

  it("drops a job not done once a later stage is done", () => {
    // Planted with no sowing day recorded, cleared with nothing picked:
    // nobody is going to sow those seedlings or start that harvest now.
    expect(tasksOf({ ...tomatoes, planted: true, cleared: true })).toEqual([
      ["transplant", "2026-05-01", true],
      ["clear", "2026-09-30", true],
    ])
    expect(tasksOf({ ...carrots, harvests: [{ date: "2026-06-01" }] })).toEqual([
      ["harvest", "2026-06-01", true],
      ["clear", "2026-07-03", false],
    ])
  })

  it("keeps a planting's jobs of the same day in the order they happen", () => {
    const oneDay = planting("one-day", "carrot", "2026-03-15", "2026-03-15")
    expect(tasksOf(oneDay)).toEqual([
      ["sow", "2026-03-15", false],
      ["clear", "2026-03-15", false],
    ])
  })

  it("skips plantings of a crop it does not know", () => {
    const unknown: GardenPlan = {
      ...emptyPlan(),
      plantings: [planting("mystery", "dragonfruit", "2026-03-15", "2026-04-15")],
    }
    expect(gardenTasks(unknown, getPlant, all)).toEqual([])
  })
})

describe("harvestingOn", () => {
  const plan: GardenPlan = { ...emptyPlan(), plantings: [tomatoes, carrots] }

  it("lists the crops being picked on the day, in the plan's order", () => {
    // Carrots from May 24, tomatoes from June 30.
    expect(harvestingOn(plan, getPlant, "2026-06-01").map((item) => item.id)).toEqual(["carrots"])
    expect(harvestingOn(plan, getPlant, "2026-07-01").map((item) => item.id)).toEqual([
      "tomatoes",
      "carrots",
    ])
  })

  it("starts on the first harvest recorded, even before the usual day", () => {
    const early = { ...tomatoes, harvests: [{ date: "2026-06-10" }] }
    expect(harvestingOn({ ...plan, plantings: [early] }, getPlant, "2026-06-12")).toEqual([early])
  })

  it("leaves out a crop not yet ready, one gone from the ground, and one cleared", () => {
    expect(harvestingOn(plan, getPlant, "2026-05-01")).toEqual([])
    expect(harvestingOn(plan, getPlant, "2026-10-01")).toEqual([])
    const cleared = { ...carrots, cleared: true as const }
    expect(harvestingOn({ ...plan, plantings: [cleared] }, getPlant, "2026-06-01")).toEqual([])
  })
})

describe("tasksThisWeek", () => {
  const plan: GardenPlan = { ...emptyPlan(), plantings: [tomatoes, carrots] }

  it("looks a week ahead and a month back", () => {
    expect(TASK_AHEAD_DAYS).toBe(7)
    expect(TASK_LOOKBACK_DAYS).toBe(30)
  })

  it("lists the jobs of the coming week", () => {
    expect(tasksThisWeek(plan, getPlant, "2026-04-25").map((task) => task.kind)).toEqual([
      "transplant",
    ])
  })

  it("keeps a job that slipped, until it is a month late", () => {
    expect(tasksThisWeek(plan, getPlant, "2026-04-15").map((task) => task.date)).toEqual([
      "2026-03-20",
    ])
    expect(tasksThisWeek(plan, getPlant, "2026-04-20")).toEqual([])
  })

  it("leaves out what is done", () => {
    const sown: GardenPlan = { ...plan, plantings: [tomatoes, { ...carrots, planted: true }] }
    expect(tasksThisWeek(sown, getPlant, "2026-03-20").map((task) => task.plantingId)).toEqual([
      "tomatoes",
    ])
  })
})

describe("defaultDoneDate", () => {
  it("is today when the planting allows the job on that day", () => {
    const task = { kind: "transplant", date: "2026-05-01" } as const
    expect(defaultDoneDate(tomatoes, task, "2026-05-05")).toBe("2026-05-05")
    expect(defaultDoneDate(tomatoes, task, "2026-04-28")).toBe("2026-04-28")
  })

  it("is the planned day when today is too late for the job", () => {
    // Seedlings cannot be sown on the day they go out, or after it.
    const sowing = { kind: "sow-indoors", date: "2026-03-20" } as const
    expect(defaultDoneDate(tomatoes, sowing, "2026-05-01")).toBe("2026-03-20")
    expect(defaultDoneDate(tomatoes, sowing, "2026-04-30")).toBe("2026-04-30")
  })

  it("is no day at all for a job that cannot have been done yet", () => {
    // Not in the ground until May: nothing was picked or cleared in April.
    const harvest = { kind: "harvest", date: "2026-06-30" } as const
    const clear = { kind: "clear", date: "2026-09-30" } as const
    expect(defaultDoneDate(tomatoes, harvest, "2026-04-20")).toBeNull()
    expect(defaultDoneDate(tomatoes, clear, "2026-04-20")).toBeNull()
    expect(defaultDoneDate(tomatoes, clear, "2026-05-01")).toBe("2026-05-01")
  })

  it("never is a day still to come", () => {
    const kinds = ["sow-indoors", "transplant", "harvest", "clear"] as const
    const days = ["2026-01-01", "2026-04-30", "2026-05-01", "2026-07-15", "2026-12-31"]
    for (const today of days) {
      for (const task of gardenTasks({ ...emptyPlan(), plantings: [tomatoes] }, getPlant, {
        from: "2026-01-01",
        to: "2026-12-31",
      })) {
        expect(kinds).toContain(task.kind)
        const day = defaultDoneDate(tomatoes, task, today)
        if (day !== null) expect(day <= today).toBe(true)
      }
    }
  })
})
