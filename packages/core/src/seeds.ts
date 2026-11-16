import { yearOf } from "./dates"
import { plantingFill } from "./plan"
import type { GardenPlan, Plant } from "./schema"

/** How much of a crop a year's plan asks for. */
export interface SeedNeed {
  plantId: string
  /** Present when the plantings name one: varieties are bought apart. */
  variety?: string
  /** Plants over all its plantings. For a crop sown direct, that is seeds that come up. */
  plants: number
  plantings: number
}

/**
 * What to get hold of for a year: the plants of each crop, and of each named
 * variety of it, due in the ground that year, in the order the plan first
 * names them. Plantings already
 * recorded as in the ground are left out: those seeds are spent.
 */
export function seedList(
  plan: GardenPlan,
  getPlant: (id: string) => Plant | undefined,
  year: number
): SeedNeed[] {
  const needs = new Map<string, SeedNeed>()
  for (const planting of plan.plantings) {
    const plant = getPlant(planting.plantId)
    if (!plant || planting.planted || yearOf(planting.inGround.from) !== year) continue
    const { variety } = planting
    // A line break cannot be in an id or typed into the field, so it keeps the two apart.
    const key = `${plant.id}\n${variety ?? ""}`
    const need = needs.get(key) ?? {
      plantId: plant.id,
      ...(variety ? { variety } : {}),
      plants: 0,
      plantings: 0,
    }
    need.plants += plantingFill(planting, plant).count
    need.plantings += 1
    needs.set(key, need)
  }
  return [...needs.values()]
}
