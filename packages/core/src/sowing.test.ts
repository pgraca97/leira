import { describe, expect, it } from "vitest"
import { getPlant, PLANTS } from "./plants"
import { emptyPlan, type GardenPlan, type Planting } from "./schema"
import { findOutOfSeason, monthRanges, startsOn } from "./sowing"

// Goes out from April to June after 6 weeks under cover.
const raised = { groundMonths: [4, 5, 6], indoorsWeeks: 6 }
// Sown where it grows, in spring and again in autumn.
const direct = { groundMonths: [3, 4, 9, 10] }
// Sown from October to February: its season runs over the year's end.
const winter = { groundMonths: [1, 2, 10, 11, 12] }

describe("startsOn", () => {
  it("sows a direct crop in the months it goes in the ground", () => {
    expect(startsOn(direct, "2026-03-01")).toEqual(["sow"])
    expect(startsOn(direct, "2026-10-31")).toEqual(["sow"])
    expect(startsOn(direct, "2026-05-15")).toEqual([])
  })

  it("starts seedlings early enough to go out in season", () => {
    // Six weeks from 20 February is 3 April.
    expect(startsOn(raised, "2026-02-20")).toEqual(["sow-indoors"])
    expect(startsOn(raised, "2026-02-10")).toEqual([])
  })

  it("plants seedlings out in season, when it is too late to start more", () => {
    // Six weeks from 10 June is past the end of June.
    expect(startsOn(raised, "2026-06-10")).toEqual(["transplant"])
  })

  it("offers both while seedlings started now would still go out in season", () => {
    expect(startsOn(raised, "2026-04-15")).toEqual(["sow-indoors", "transplant"])
  })

  it("follows a season that runs over the year's end", () => {
    expect(startsOn(winter, "2026-12-20")).toEqual(["sow"])
    expect(startsOn(winter, "2027-01-05")).toEqual(["sow"])
    expect(startsOn(winter, "2026-06-01")).toEqual([])
  })
})

describe("monthRanges", () => {
  it("joins consecutive months into stretches", () => {
    expect(monthRanges([4, 5, 6])).toEqual([[4, 6]])
    expect(monthRanges([3, 4, 9, 10])).toEqual([
      [3, 4],
      [9, 10],
    ])
    expect(monthRanges([7])).toEqual([[7, 7]])
  })

  it("joins December to January, starting the stretch in the autumn", () => {
    expect(monthRanges([1, 2, 10, 11, 12])).toEqual([[10, 2]])
    expect(monthRanges([1, 5, 6, 12])).toEqual([
      [5, 6],
      [12, 1],
    ])
  })

  it("is one stretch for a crop that goes in all year", () => {
    expect(monthRanges([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12])).toEqual([[1, 12]])
  })

  it("is nothing for no months", () => {
    expect(monthRanges([])).toEqual([])
  })
})

describe("findOutOfSeason", () => {
  function planting(id: string, plantId: string, from: string, to: string): Planting {
    return {
      id,
      plantId,
      rect: { x: 0, y: 0, w: 100, h: 100 },
      layout: "row",
      inGround: { from, to },
    }
  }
  const tomato = getPlant("tomato")
  if (!tomato) throw new Error("No tomato in the catalogue")
  const good = tomato.groundMonths[0] as number
  const bad = ([1, 12] as const).find((month) => !tomato.groundMonths.includes(month)) as number
  const day = (month: number) => `2026-${String(month).padStart(2, "0")}-10`

  const plan: GardenPlan = {
    ...emptyPlan(),
    plantings: [
      planting("in season", "tomato", day(good), "2026-12-31"),
      planting("out of season", "tomato", day(bad), "2026-12-31"),
      { ...planting("already in", "tomato", day(bad), "2026-12-31"), planted: true },
      planting("unknown", "dragonfruit", day(bad), "2026-12-31"),
    ],
  }

  it("finds the plantings that go in the ground outside their crop's season", () => {
    expect(findOutOfSeason(plan, getPlant)).toEqual([
      { plantingId: "out of season", plantId: "tomato", month: bad },
    ])
  })
})

describe("the catalogue's seasons", () => {
  it("gives every crop months to go in the ground, in order and without repeats", () => {
    for (const plant of PLANTS) {
      expect(plant.groundMonths.length, plant.id).toBeGreaterThan(0)
      expect(plant.groundMonths, plant.id).toEqual(
        [...new Set(plant.groundMonths)].sort((a, b) => a - b)
      )
    }
  })

  it("has something to start in every month of the year", () => {
    for (let month = 1; month <= 12; month++) {
      const date = `2026-${String(month).padStart(2, "0")}-15`
      expect(
        PLANTS.some((plant) => startsOn(plant, date).length > 0),
        `month ${month}`
      ).toBe(true)
    }
  })
})
