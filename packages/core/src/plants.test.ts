import { describe, expect, it } from "vitest"
import { getPlant, PLANTS } from "./plants"
import { PLANT_FAMILIES, PlantSchema } from "./schema"

describe("plant dataset", () => {
  it.each(PLANTS.map((plant) => [plant.id, plant] as const))(
    "%s matches the schema",
    (_id, plant) => {
      expect(PlantSchema.safeParse(plant).error).toBeUndefined()
    }
  )

  it("has unique ids", () => {
    const ids = PLANTS.map((plant) => plant.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it("only names companions that exist", () => {
    for (const plant of PLANTS) {
      for (const id of [...plant.companions.good, ...plant.companions.bad]) {
        expect(getPlant(id), `${plant.id} lists unknown companion ${id}`).toBeDefined()
      }
    }
  })

  it("never lists a plant as its own companion, or as both good and bad", () => {
    for (const plant of PLANTS) {
      const { good, bad } = plant.companions
      expect([...good, ...bad]).not.toContain(plant.id)
      expect(good.filter((id) => bad.includes(id))).toEqual([])
    }
  })

  it("keeps companion pairs mutual", () => {
    for (const plant of PLANTS) {
      for (const id of plant.companions.good) {
        expect(getPlant(id)?.companions.good, `${id} should list ${plant.id} as good`).toContain(
          plant.id
        )
      }
      for (const id of plant.companions.bad) {
        expect(getPlant(id)?.companions.bad, `${id} should list ${plant.id} as bad`).toContain(
          plant.id
        )
      }
    }
  })
})

describe("the catalogue", () => {
  it("covers the crops a kitchen garden usually grows", () => {
    expect(PLANTS.length).toBeGreaterThanOrEqual(40)
    for (const id of ["potato", "cabbage", "garlic", "pea", "courgette", "basil", "strawberry"]) {
      expect(getPlant(id), `${id} is missing`).toBeDefined()
    }
  })

  it.each(["pt", "en"] as const)("gives every plant a different name in %s", (language) => {
    const names = PLANTS.map((plant) => plant.name[language].toLowerCase())
    expect(names.filter((name, index) => names.indexOf(name) !== index)).toEqual([])
  })

  it("has a crop in every family that rotation tracks", () => {
    const families = new Set(PLANTS.map((plant) => plant.family))
    for (const family of PLANT_FAMILIES) {
      expect(families, `no crop in ${family}`).toContain(family)
    }
  })

  it("lists each companion of a plant once", () => {
    for (const plant of PLANTS) {
      const all = [...plant.companions.good, ...plant.companions.bad]
      expect(
        all.filter((id, index) => all.indexOf(id) !== index),
        plant.id
      ).toEqual([])
    }
  })

  it("never keeps a crop indoors for longer than it then takes to harvest", () => {
    // A guard against swapped figures.
    for (const plant of PLANTS) {
      if (plant.indoorsWeeks === undefined) continue
      expect(plant.indoorsWeeks * 7, plant.id).toBeLessThanOrEqual(plant.daysToHarvest[1])
    }
  })

  it("keeps the facts the rest of the tests rely on", () => {
    expect(getPlant("tomato")).toMatchObject({
      family: "solanaceae",
      frost: "tender",
      spacing: { inRowCm: 50, rowCm: 90 },
      daysToHarvest: [60, 85],
      indoorsWeeks: 6,
    })
    expect(getPlant("green-bean")?.companions.bad).toContain("onion")
    expect(getPlant("carrot")?.companions.good).toContain("tomato")
  })
})

describe("getPlant", () => {
  it("finds a plant by id", () => {
    expect(getPlant("tomato")?.latin).toBe("Solanum lycopersicum")
  })

  it("returns undefined for an unknown id", () => {
    expect(getPlant("triffid")).toBeUndefined()
  })
})
