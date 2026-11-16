import { describe, expect, it } from "vitest"
import {
  addHarvest,
  doneDateBounds,
  harvestTotals,
  publicPlan,
  recordTask,
  removeHarvest,
  setCleared,
  setPlanted,
  withoutRecords,
} from "./records"
import { emptyPlan, type GardenPlan, type Planting } from "./schema"

const base: Planting = {
  id: "7c9e6679-7425-40de-944b-e07fc1f90ae7",
  plantId: "tomato",
  rect: { x: 50, y: 50, w: 100, h: 100 },
  layout: "row",
  inGround: { from: "2026-05-10", to: "2026-09-30" },
}

const picked: Planting = {
  ...base,
  harvests: [
    { date: "2026-07-12", quantity: 1.2, unit: "kg" },
    { date: "2026-07-20" },
    { date: "2026-08-02", quantity: 12, unit: "units" },
    { date: "2026-08-15", quantity: 3.5, unit: "kg" },
  ],
}

describe("setPlanted", () => {
  it("moves the planting day to the real one and marks it", () => {
    expect(setPlanted(base, "2026-05-20")).toEqual({
      ...base,
      planted: true,
      inGround: { from: "2026-05-20", to: "2026-09-30" },
    })
  })

  it("refuses a day after the crop leaves the ground", () => {
    expect(setPlanted(base, "2026-10-01")).toBeNull()
  })

  it("refuses a day after the first harvest", () => {
    expect(setPlanted(picked, "2026-07-13")).toBeNull()
    expect(setPlanted(picked, "2026-07-12")?.inGround.from).toBe("2026-07-12")
  })

  it("forgets a sowing day that is no longer before the planting day", () => {
    const sown = { ...base, sowDate: "2026-05-01" }
    expect(setPlanted(sown, "2026-04-30")).not.toHaveProperty("sowDate")
    expect(setPlanted(sown, "2026-05-02")?.sowDate).toBe("2026-05-01")
  })

  it("takes the mark off and keeps the day", () => {
    expect(setPlanted({ ...base, planted: true }, null)).toEqual(base)
  })

  it("hands back the same planting when nothing changes", () => {
    const planted: Planting = { ...base, planted: true }
    expect(setPlanted(planted, "2026-05-10")).toBe(planted)
    expect(setPlanted(base, null)).toBe(base)
  })
})

describe("setCleared", () => {
  it("moves the last day to the real one and marks it", () => {
    expect(setCleared(base, "2026-09-12")).toEqual({
      ...base,
      cleared: true,
      inGround: { from: "2026-05-10", to: "2026-09-12" },
    })
  })

  it("refuses a day before the crop went in", () => {
    expect(setCleared(base, "2026-05-09")).toBeNull()
  })

  it("refuses a day before the last harvest", () => {
    expect(setCleared(picked, "2026-08-14")).toBeNull()
    expect(setCleared(picked, "2026-08-15")?.inGround.to).toBe("2026-08-15")
  })

  it("takes the mark off and keeps the day", () => {
    expect(setCleared({ ...base, cleared: true }, null)).toEqual(base)
  })

  it("hands back the same planting when nothing changes", () => {
    const cleared: Planting = { ...base, cleared: true }
    expect(setCleared(cleared, "2026-09-30")).toBe(cleared)
    expect(setCleared(base, null)).toBe(base)
  })
})

describe("addHarvest", () => {
  it("adds a harvest, with or without an amount", () => {
    const once = addHarvest(base, { date: "2026-07-12", quantity: 1.2, unit: "kg" })
    expect(once?.harvests).toEqual([{ date: "2026-07-12", quantity: 1.2, unit: "kg" }])
    expect(addHarvest(base, { date: "2026-07-12" })?.harvests).toEqual([{ date: "2026-07-12" }])
  })

  it("keeps harvests oldest first, a new one after the others of its day", () => {
    const added = addHarvest(picked, { date: "2026-07-20", quantity: 2, unit: "kg" })
    expect(added?.harvests?.map((harvest) => harvest.date)).toEqual([
      "2026-07-12",
      "2026-07-20",
      "2026-07-20",
      "2026-08-02",
      "2026-08-15",
    ])
    expect(added?.harvests?.[2]).toEqual({ date: "2026-07-20", quantity: 2, unit: "kg" })
  })

  it("keeps the crop in the ground until a harvest later than planned", () => {
    expect(addHarvest(base, { date: "2026-10-05" })?.inGround).toEqual({
      from: "2026-05-10",
      to: "2026-10-05",
    })
  })

  it("refuses a harvest after the crop was cleared", () => {
    expect(addHarvest({ ...base, cleared: true }, { date: "2026-10-05" })).toBeNull()
    expect(addHarvest({ ...base, cleared: true }, { date: "2026-09-30" })).not.toBeNull()
  })

  it("refuses a harvest from before the crop went in", () => {
    expect(addHarvest(base, { date: "2026-05-09" })).toBeNull()
    expect(addHarvest(base, { date: "2026-05-10" })).not.toBeNull()
  })

  it("refuses one more harvest than a planting holds", () => {
    const full = { ...base, harvests: Array(200).fill({ date: "2026-07-12" }) }
    expect(addHarvest(full, { date: "2026-07-13" })).toBeNull()
  })
})

describe("removeHarvest", () => {
  it("removes the harvest at a position", () => {
    expect(removeHarvest(picked, 1).harvests).toEqual([
      picked.harvests?.[0],
      picked.harvests?.[2],
      picked.harvests?.[3],
    ])
  })

  it("leaves no list behind when the last harvest goes", () => {
    expect(removeHarvest({ ...base, harvests: [{ date: "2026-07-12" }] }, 0)).toEqual(base)
  })

  it("hands back the same planting for a position with no harvest", () => {
    expect(removeHarvest(picked, 9)).toBe(picked)
    expect(removeHarvest(base, 0)).toBe(base)
  })
})

describe("harvestTotals", () => {
  it("adds up what was picked, by unit, leaving out harvests with no amount", () => {
    expect(harvestTotals(picked)).toEqual({ kg: 4.7, units: 12 })
  })

  it("is nothing for a planting with no harvests", () => {
    expect(harvestTotals(base)).toEqual({ kg: 0, units: 0 })
  })

  it("does not pick up rounding dust from adding decimals", () => {
    const dusty = {
      ...base,
      harvests: [0.1, 0.2].map((quantity) => ({
        date: "2026-07-12",
        quantity,
        unit: "kg" as const,
      })),
    }
    expect(harvestTotals(dusty).kg).toBe(0.3)
  })
})

describe("doneDateBounds", () => {
  it("has seedlings sown before the crop goes in", () => {
    expect(doneDateBounds(base, "sow-indoors")).toEqual({ max: "2026-05-09" })
  })

  it("has the crop go in no later than it leaves or is first picked", () => {
    expect(doneDateBounds(base, "transplant")).toEqual({ max: "2026-09-30" })
    expect(doneDateBounds(picked, "sow")).toEqual({ max: "2026-07-12" })
  })

  it("has harvests from the planting day on, up to the day a cleared crop left", () => {
    expect(doneDateBounds(base, "harvest")).toEqual({ min: "2026-05-10" })
    expect(doneDateBounds({ ...base, cleared: true }, "harvest")).toEqual({
      min: "2026-05-10",
      max: "2026-09-30",
    })
  })

  it("has the crop leave no earlier than it went in or was last picked", () => {
    expect(doneDateBounds(base, "clear")).toEqual({ min: "2026-05-10" })
    expect(doneDateBounds(picked, "clear")).toEqual({ min: "2026-08-15" })
  })
})

describe("recordTask", () => {
  it("records the day seedlings were sown, and forgets it", () => {
    expect(recordTask(base, "sow-indoors", "2026-04-01")).toEqual({
      ...base,
      sowDate: "2026-04-01",
    })
    expect(recordTask({ ...base, sowDate: "2026-04-01" }, "sow-indoors", null)).toEqual(base)
  })

  it("refuses seedlings sown on the day the crop goes in, or later", () => {
    expect(recordTask(base, "sow-indoors", "2026-05-10")).toBeNull()
  })

  it.each(["transplant", "sow"] as const)("marks the crop planted for a %s job", (kind) => {
    expect(recordTask(base, kind, "2026-05-12")).toEqual(setPlanted(base, "2026-05-12"))
    expect(recordTask({ ...base, planted: true }, kind, null)).toEqual(base)
  })

  it("marks the crop cleared", () => {
    expect(recordTask(base, "clear", "2026-09-12")).toEqual(setCleared(base, "2026-09-12"))
    expect(recordTask({ ...base, cleared: true }, "clear", null)).toEqual(base)
  })

  it("starts the harvest with one that has no amount", () => {
    expect(recordTask(base, "harvest", "2026-07-12")?.harvests).toEqual([{ date: "2026-07-12" }])
  })

  it("does not undo a harvest: its entries are removed one by one", () => {
    expect(recordTask(picked, "harvest", null)).toBeNull()
  })
})

const recorded: GardenPlan = {
  ...emptyPlan(),
  notes: "The well ran dry in July.",
  plantings: [
    { ...picked, planted: true, cleared: true, sowDate: "2026-04-01", notes: "Blight in August." },
    { ...base, id: "0b0e0c7e-3a53-4f5c-9a43-3a4f6a1c2b10" },
  ],
}

describe("withoutRecords", () => {
  it("keeps the plan and its dates, and nothing of what happened", () => {
    expect(withoutRecords(recorded)).toEqual({
      ...emptyPlan(),
      plantings: [base, { ...base, id: "0b0e0c7e-3a53-4f5c-9a43-3a4f6a1c2b10" }],
    })
  })
})

describe("publicPlan", () => {
  it("keeps marks and harvest days, and leaves out notes and amounts", () => {
    expect(publicPlan(recorded)).toEqual({
      ...emptyPlan(),
      plantings: [
        {
          ...base,
          planted: true,
          cleared: true,
          sowDate: "2026-04-01",
          harvests: [
            { date: "2026-07-12" },
            { date: "2026-07-20" },
            { date: "2026-08-02" },
            { date: "2026-08-15" },
          ],
        },
        { ...base, id: "0b0e0c7e-3a53-4f5c-9a43-3a4f6a1c2b10" },
      ],
    })
  })
})
