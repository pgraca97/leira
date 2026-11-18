import { describe, expect, it } from "vitest"
import { getPlant } from "./plants"
import {
  type Bed,
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

function day(date: string, minC: number, maxC: number, soilC?: number): ForecastDay {
  return { date, minC, maxC, condition: "clear", ...(soilC === undefined ? {} : { soilC }) }
}

// Tomato is tender and suffers above 35 °C. Lettuce is half-hardy, onion hardy.
const tomatoes = planting("tomatoes", "tomato", "2026-04-01", "2026-09-30")
const lettuces = planting("lettuces", "lettuce", "2026-04-01", "2026-06-30")
const onions = planting("onions", "onion", "2026-04-01", "2026-08-30")

describe("ForecastDaySchema", () => {
  it("accepts a day of forecast", () => {
    expect(ForecastDaySchema.safeParse(day("2026-04-10", 3.5, 14)).success).toBe(true)
  })

  it("accepts a day that also gives the soil temperature", () => {
    expect(ForecastDaySchema.parse(day("2026-04-10", 3.5, 14, 9.2)).soilC).toBe(9.2)
  })

  it("rejects a day whose low is above its high", () => {
    expect(ForecastDaySchema.safeParse(day("2026-04-10", 15, 14)).success).toBe(false)
  })
})

describe("findWeatherRisks", () => {
  it("warns of frost on a tender crop when the night gets close to freezing", () => {
    const forecast = [day("2026-04-10", 6, 15), day("2026-04-11", 1.5, 12)]
    expect(findWeatherRisks(planWith(tomatoes), getPlant, forecast)).toEqual([
      {
        plantingId: "tomatoes",
        plantId: "tomato",
        kind: "frost",
        date: "2026-04-11",
        tempC: 1.5,
        site: "open",
      },
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
      {
        plantingId: "tomatoes",
        plantId: "tomato",
        kind: "frost",
        date: "2026-04-11",
        tempC: 1,
        site: "open",
      },
    ])
  })

  it("warns of heat when the day reaches what the crop tolerates", () => {
    const forecast = [day("2026-07-10", 20, 33), day("2026-07-11", 22, 35)]
    expect(findWeatherRisks(planWith(tomatoes), getPlant, forecast)).toEqual([
      {
        plantingId: "tomatoes",
        plantId: "tomato",
        kind: "heat",
        date: "2026-07-11",
        tempC: 35,
        site: "open",
      },
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
      {
        plantingId: "going-out",
        plantId: "tomato",
        kind: "cold",
        date: "2026-05-04",
        tempC: 7,
        site: "open",
      },
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
      {
        plantingId: "going-out",
        plantId: "tomato",
        kind: "frost",
        date: "2026-05-04",
        tempC: 1,
        site: "open",
      },
    ])
  })
})

describe("cold soil for sowing", () => {
  // Green beans are sown in place and need the soil at 15 °C to come up.
  const beans = planting("beans", "green-bean", "2026-05-04", "2026-08-15")

  it("warns when the soil is too cold on the day a crop is sown in place", () => {
    const forecast = [day("2026-05-03", 9, 20, 16), day("2026-05-04", 10, 21, 13.4)]
    expect(findWeatherRisks(planWith(beans), getPlant, forecast)).toEqual([
      {
        plantingId: "beans",
        plantId: "green-bean",
        kind: "coldSoil",
        date: "2026-05-04",
        tempC: 13.4,
        site: "open",
      },
    ])
  })

  it("stays quiet when the soil is as warm as the seed needs", () => {
    const forecast = [day("2026-05-04", 10, 21, 15)]
    expect(findWeatherRisks(planWith(beans), getPlant, forecast)).toEqual([])
  })

  it("only looks at the day of sowing: the seed is not in the ground before", () => {
    const forecast = [day("2026-05-03", 9, 20, 11), day("2026-05-04", 10, 21, 16)]
    expect(findWeatherRisks(planWith(beans), getPlant, forecast)).toEqual([])
  })

  it("says nothing once the crop is marked as sown", () => {
    const sown = { ...beans, planted: true as const }
    expect(findWeatherRisks(planWith(sown), getPlant, [day("2026-05-04", 10, 21, 11)])).toEqual([])
  })

  it("leaves out crops raised under cover: they go out as seedlings", () => {
    const tomato = planting("tomato", "tomato", "2026-05-04", "2026-09-30")
    expect(findWeatherRisks(planWith(tomato), getPlant, [day("2026-05-04", 12, 21, 8)])).toEqual([])
  })

  it("says nothing when the forecast has no soil temperature", () => {
    expect(findWeatherRisks(planWith(beans), getPlant, [day("2026-05-04", 10, 21)])).toEqual([])
  })

  it("says nothing for a crop with no known soil minimum", () => {
    const garlic = planting("garlic", "garlic", "2026-05-04", "2026-07-30")
    expect(findWeatherRisks(planWith(garlic), getPlant, [day("2026-05-04", 10, 21, 3)])).toEqual([])
  })
})

describe("in a greenhouse", () => {
  const GLASS: Bed = {
    id: "glass",
    name: "",
    kind: "greenhouse",
    rect: { x: 0, y: 0, w: 200, h: 200 },
  }
  const under = (...plantings: Planting[]): GardenPlan => ({
    ...emptyPlan(),
    beds: [GLASS],
    plantings,
  })
  // Carrot seed needs 5 °C of soil and is sown in place; tomato suffers from 35 °C.
  const carrots = planting("carrots", "carrot", "2026-03-04", "2026-07-30")

  it("warns of heat from a forecast eight degrees cooler than outside", () => {
    const forecast = [day("2026-07-10", 15, 26), day("2026-07-11", 16, 27)]
    expect(findWeatherRisks(planWith(tomatoes), getPlant, forecast)).toEqual([])
    expect(findWeatherRisks(under(tomatoes), getPlant, forecast)).toEqual([
      {
        plantingId: "tomatoes",
        plantId: "tomato",
        kind: "heat",
        date: "2026-07-11",
        tempC: 27,
        site: "greenhouse",
      },
    ])
  })

  it("warns of frost as outside, since a clear night can be as cold inside", () => {
    const forecast = [day("2026-04-11", FROST_LIMIT_C.tender, 14)]
    expect(findWeatherRisks(under(tomatoes), getPlant, forecast)).toEqual([
      {
        plantingId: "tomatoes",
        plantId: "tomato",
        kind: "frost",
        date: "2026-04-11",
        tempC: 2,
        site: "greenhouse",
      },
    ])
  })

  it("counts the soil two degrees warmer", () => {
    const cold = [day("2026-03-04", 6, 14, 2.9)]
    const justEnough = [day("2026-03-04", 6, 14, 3)]
    expect(findWeatherRisks(planWith(carrots), getPlant, justEnough)).toHaveLength(1)
    expect(findWeatherRisks(under(carrots), getPlant, justEnough)).toEqual([])
    expect(findWeatherRisks(under(carrots), getPlant, cold)).toEqual([
      {
        plantingId: "carrots",
        plantId: "carrot",
        kind: "coldSoil",
        date: "2026-03-04",
        tempC: 2.9,
        site: "greenhouse",
      },
    ])
  })

  it("says nothing about a crop drawn on a path", () => {
    const path: Bed = { ...GLASS, kind: "path" }
    const plan = { ...planWith(tomatoes), beds: [path] }
    expect(findWeatherRisks(plan, getPlant, [day("2026-04-11", -5, 40)])).toEqual([])
  })
})
