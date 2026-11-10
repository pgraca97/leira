import { describe, expect, it } from "vitest"
import { getPlant, PLANTS } from "./plants"
import { PlantSchema } from "./schema"

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

describe("getPlant", () => {
  it("finds a plant by id", () => {
    expect(getPlant("tomato")?.latin).toBe("Solanum lycopersicum")
  })

  it("returns undefined for an unknown id", () => {
    expect(getPlant("triffid")).toBeUndefined()
  })
})
