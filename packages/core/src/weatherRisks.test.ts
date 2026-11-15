import { describe, expect, it } from "vitest"
import { getPlant } from "./plants"
import {
  emptyPlan,
  type ForecastDay,
  ForecastDaySchema,
  type GardenPlan,
  type Planting,
} from "./schema"
import { FROST_LIMIT_C, findWeatherRisks } from "./weatherRisks"

function planting(id: string, plantId: string, from: string, to: string): Planting {
  return {
    id,
    plantId,
    rect: { x: 0, y: 0, w: 100, h: 100 },
    layout: "row",
    inGround: { from, to },
  }
}

function planWith(...plantings: Planting[]): GardenPlan {
  return { ...emptyPlan(), plantings }
}

function day(date: string, minC: number, maxC: number): ForecastDay {
  return { date, minC, maxC, condition: "clear" }
}

// Tomato is tender and suffers above 35 °C. Lettuce is half-hardy, onion hardy.
const tomatoes = planting("tomatoes", "tomato", "2026-04-01", "2026-09-30")
const lettuces = planting("lettuces", "lettuce", "2026-04-01", "2026-06-30")
const onions = planting("onions", "onion", "2026-04-01", "2026-08-30")

describe("ForecastDaySchema", () => {
  it("accepts a day of forecast", () => {
    expect(ForecastDaySchema.safeParse(day("2026-04-10", 3.5, 14)).success).toBe(true)
  })

  it("rejects a day whose low is above its high", () => {
    expect(ForecastDaySchema.safeParse(day("2026-04-10", 15, 14)).success).toBe(false)
  })
})

describe("findWeatherRisks", () => {
  it("warns of frost on a tender crop when the night gets close to freezing", () => {
    const forecast = [day("2026-04-10", 6, 15), day("2026-04-11", 1.5, 12)]
    expect(findWeatherRisks(planWith(tomatoes), getPlant, forecast)).toEqual([
      { plantingId: "tomatoes", plantId: "tomato", kind: "frost", date: "2026-04-11", tempC: 1.5 },
    ])
  })

  it("warns at the limit itself", () => {
    const forecast = [day("2026-04-10", FROST_LIMIT_C.tender, 12)]
    expect(findWeatherRisks(planWith(tomatoes), getPlant, forecast)).toHaveLength(1)
  })

  it("lets hardier crops through nights that would hurt a tender one", () => {
    const forecast = [day("2026-04-10", -1, 9)]
    const risks = findWeatherRisks(planWith(tomatoes, lettuces, onions), getPlant, forecast)
    expect(risks.map((risk) => risk.plantingId)).toEqual(["tomatoes"])
  })

  it("warns for half-hardy crops in a real frost, and for hardy ones only in a hard one", () => {
    const frost = findWeatherRisks(planWith(lettuces, onions), getPlant, [day("2026-04-10", -3, 5)])
    expect(frost.map((risk) => risk.plantingId)).toEqual(["lettuces"])

    const hard = findWeatherRisks(planWith(lettuces, onions), getPlant, [day("2026-04-10", -9, 0)])
    expect(hard.map((risk) => risk.plantingId)).toEqual(["lettuces", "onions"])
  })

  it("reports each crop once, on the first day at risk", () => {
    const forecast = [day("2026-04-10", 5, 12), day("2026-04-11", 1, 12), day("2026-04-12", -2, 8)]
    expect(findWeatherRisks(planWith(tomatoes), getPlant, forecast)).toEqual([
      { plantingId: "tomatoes", plantId: "tomato", kind: "frost", date: "2026-04-11", tempC: 1 },
    ])
  })

  it("warns of heat when the day reaches what the crop tolerates", () => {
    const forecast = [day("2026-07-10", 20, 33), day("2026-07-11", 22, 35)]
    expect(findWeatherRisks(planWith(tomatoes), getPlant, forecast)).toEqual([
      { plantingId: "tomatoes", plantId: "tomato", kind: "heat", date: "2026-07-11", tempC: 35 },
    ])
  })

  it("ignores days when the crop is not in the ground", () => {
    const beforePlanting = [day("2026-03-31", -5, 4)]
    expect(findWeatherRisks(planWith(tomatoes), getPlant, beforePlanting)).toEqual([])
    const afterClearing = [day("2026-10-01", -5, 4)]
    expect(findWeatherRisks(planWith(tomatoes), getPlant, afterClearing)).toEqual([])
  })

  it("orders the warnings by day, then by the plan", () => {
    const forecast = [day("2026-04-10", 1, 9), day("2026-04-11", -3, 5)]
    const risks = findWeatherRisks(planWith(lettuces, tomatoes), getPlant, forecast)
    expect(risks.map((risk) => [risk.date, risk.plantingId])).toEqual([
      ["2026-04-10", "tomatoes"],
      ["2026-04-11", "lettuces"],
    ])
  })

  it("skips crops it does not know", () => {
    const mystery = planting("mystery", "dragonfruit", "2026-04-01", "2026-09-30")
    expect(findWeatherRisks(planWith(mystery), getPlant, [day("2026-04-10", -9, 40)])).toEqual([])
  })
})

describe("cold nights for transplants", () => {
  // A tomato seedling should not face a night under 10 °C.
  const goingOut = planting("going-out", "tomato", "2026-05-03", "2026-09-30")

  it("warns on the first cold night after a seedling is planted out", () => {
    const forecast = [
      day("2026-05-02", 6, 18),
      day("2026-05-03", 11, 20),
      day("2026-05-04", 7, 19),
      day("2026-05-05", 5, 18),
    ]
    expect(findWeatherRisks(planWith(goingOut), getPlant, forecast)).toEqual([
      { plantingId: "going-out", plantId: "tomato", kind: "cold", date: "2026-05-04", tempC: 7 },
    ])
  })

  it("stays quiet on a night as cold as the seedling can take", () => {
    const forecast = [day("2026-05-03", 10, 20)]
    expect(findWeatherRisks(planWith(goingOut), getPlant, forecast)).toEqual([])
  })

  it("stops warning once the crop has had a week to settle", () => {
    const lastDay = findWeatherRisks(planWith(goingOut), getPlant, [day("2026-05-10", 7, 19)])
    expect(lastDay.map((risk) => risk.kind)).toEqual(["cold"])
    const dayAfter = findWeatherRisks(planWith(goingOut), getPlant, [day("2026-05-11", 7, 19)])
    expect(dayAfter).toEqual([])
  })

  it("says nothing for a crop sown straight into the ground", () => {
    const sownDirect = (id: string) => {
      const plant = getPlant(id)
      return plant && { ...plant, indoorsWeeks: undefined }
    }
    const forecast = [day("2026-05-04", 7, 19)]
    expect(findWeatherRisks(planWith(goingOut), sownDirect, forecast)).toEqual([])
  })

  it("leaves the warning to frost when the same crop faces both", () => {
    const forecast = [day("2026-05-03", 6, 15), day("2026-05-04", 1, 12)]
    expect(findWeatherRisks(planWith(goingOut), getPlant, forecast)).toEqual([
      { plantingId: "going-out", plantId: "tomato", kind: "frost", date: "2026-05-04", tempC: 1 },
    ])
  })
})
