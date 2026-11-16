import { yearOf } from "./dates"
import { plantingFill } from "./plan"
import type { GardenPlan, Plant } from "./schema"

/** How much of a crop a year's plan asks for. */
export interface SeedNeed {
  plantId: string
  /** Plants over all its plantings. For a crop sown direct, that is seeds that come up. */
  plants: number
  plantings: number
}

/**
 * What to get hold of for a year: the plants of each crop due in the ground
 * that year, in the order the plan first names them. Plantings already
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
    const need = needs.get(plant.id) ?? { plantId: plant.id, plants: 0, plantings: 0 }
    need.plants += plantingFill(planting, plant).count
    need.plantings += 1
    needs.set(plant.id, need)
  }
  return [...needs.values()]
}
