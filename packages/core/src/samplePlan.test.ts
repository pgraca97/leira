import { describe, expect, it } from "vitest"
import { findCompanions } from "./companions"
import { addDays, type IsoDate } from "./dates"
import { intersection } from "./geometry"
import { plantingFill } from "./plan"
import { getPlant } from "./plants"
import { findRotationConflicts } from "./rotation"
import { samplePlan } from "./samplePlan"
import { gardenTasks, plantingsInGround } from "./schedule"
import { GardenPlanSchema } from "./schema"

/** Hands out distinct, valid ids the way `crypto.randomUUID` would. */
function ids(): () => string {
  let next = 0
  return () => `00000000-0000-4000-8000-${String(++next).padStart(12, "0")}`
}

const sample = (today: IsoDate) => samplePlan(today, ids())

/** Every day from `from` for `days` days. */
function eachDay(from: IsoDate, days: number): IsoDate[] {
  return Array.from({ length: days }, (_, index) => addDays(from, index))
}

describe("samplePlan", () => {
  const plan = sample("2026-06-01")

  it("is a plan the app can store", () => {
    expect(GardenPlanSchema.safeParse(plan).success).toBe(true)
  })

  it("gives every bed and planting its own id", () => {
    const all = [...plan.beds, ...plan.plantings].map((item) => item.id)
    expect(new Set(all).size).toBe(all.length)
  })

  it("only grows crops the catalogue knows", () => {
    expect(plan.plantings.filter((planting) => !getPlant(planting.plantId))).toEqual([])
  })

  it("puts every crop on a bed, on the grid", () => {
    for (const { rect } of plan.plantings) {
      const onBed = plan.beds.some(
        (bed) =>
          rect.x >= bed.rect.x &&
          rect.y >= bed.rect.y &&
          rect.x + rect.w <= bed.rect.x + bed.rect.w &&
          rect.y + rect.h <= bed.rect.y + bed.rect.h
      )
      expect(onBed).toBe(true)
      for (const value of [rect.x, rect.y, rect.w, rect.h]) expect(value % plan.cellCm).toBe(0)
    }
  })

  it("breaks crop rotation once: nightshades back on the same ground a year later", () => {
    const conflicts = findRotationConflicts(plan, getPlant)
    expect(conflicts).toHaveLength(1)
    expect(conflicts[0]).toMatchObject({ family: "solanaceae", yearsApart: 1 })
  })

  it("has neighbours that help each other and one pair that does not", () => {
    const crop = (id: string) => plan.plantings.find((planting) => planting.id === id)?.plantId
    const pairs = findCompanions(plan, getPlant).map(
      (pair) =>
        `${pair.relation}: ${[crop(pair.plantingId), crop(pair.otherPlantingId)].sort().join(" and ")}`
    )
    expect(pairs.sort()).toEqual([
      "bad: broad-bean and onion",
      "good: basil and tomato",
      "good: carrot and onion",
    ])
  })

  it("has room for several plants of every crop", () => {
    const counts = plan.plantings.map((planting) => {
      const plant = getPlant(planting.plantId)
      return plant ? plantingFill(planting, plant).count : 0
    })
    expect(Math.min(...counts)).toBeGreaterThanOrEqual(3)
  })

  it("lays the crops side by side, apart from the pair that breaks rotation", () => {
    const [conflict] = findRotationConflicts(plan, getPlant)
    const overlapping = plan.plantings.flatMap((first, index) =>
      plan.plantings
        .slice(index + 1)
        .filter((second) => intersection(first.rect, second.rect))
        .map((second) => [first.id, second.id].sort())
    )
    expect(overlapping).toEqual([[conflict?.plantingId, conflict?.previousPlantingId].sort()])
  })

  it("follows the season: from October it plans the year to come", () => {
    const yearsOfTomatoes = (today: IsoDate) =>
      sample(today)
        .plantings.filter((planting) => planting.plantId === "tomato")
        .map((planting) => planting.inGround.from.slice(0, 4))
        .sort()
    expect(yearsOfTomatoes("2026-09-30")).toEqual(["2025", "2026"])
    expect(yearsOfTomatoes("2026-10-01")).toEqual(["2026", "2027"])
  })

  // Two years, one of them a leap year: 2027-01-01 to 2028-12-31.
  it.each(eachDay("2027-01-01", 731).filter((day) => day.endsWith("-01") || day.endsWith("-15")))(
    "has something in the ground on %s",
    (today) => {
      expect(plantingsInGround(sample(today), today).plantings.length).toBeGreaterThan(0)
    }
  )

  it("always has a job coming up in the next 30 days", () => {
    const quietDays = eachDay("2027-01-01", 731).filter((today) => {
      const range = { from: today, to: addDays(today, 30) }
      return gardenTasks(sample(today), getPlant, range).length === 0
    })
    expect(quietDays).toEqual([])
  })

  it("always has something in the ground", () => {
    const bareDays = eachDay("2027-01-01", 731).filter(
      (today) => plantingsInGround(sample(today), today).plantings.length === 0
    )
    expect(bareDays).toEqual([])
  })
})
