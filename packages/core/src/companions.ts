import { rectGap } from "./geometry"
import type { GardenPlan, Plant } from "./schema"

/** Two plantings close enough, and in the ground together long enough, to affect each other. */
export interface CompanionPair {
  /** The planting that comes first in the plan. */
  plantingId: string
  otherPlantingId: string
  /** `bad`: they grow poorly side by side. `good`: they help each other. */
  relation: "good" | "bad"
}

export interface CompanionOptions {
  /**
   * How far apart two plantings may be and still count as neighbours.
   * The default of 50 cm covers adjacent rows and the next bed over a narrow path.
   */
  withinCm?: number
}

/**
 * Finds neighbouring plantings whose crops are known companions, good or bad.
 * Two plantings are neighbours when they lie within `withinCm` of each other
 * and share at least one day in the ground. A pair counts when either crop
 * names the other; a bad relation outweighs a good one. Each pair is reported
 * once. Plantings of the same crop, and crops the lookup does not know, are
 * skipped.
 */
export function findCompanions(
  plan: GardenPlan,
  getPlant: (id: string) => Plant | undefined,
  options: CompanionOptions = {}
): CompanionPair[] {
  const withinCm = options.withinCm ?? 50
  const pairs: CompanionPair[] = []

  plan.plantings.forEach((first, index) => {
    const firstPlant = getPlant(first.plantId)
    if (!firstPlant) return
    for (const second of plan.plantings.slice(index + 1)) {
      if (second.plantId === first.plantId) continue
      const secondPlant = getPlant(second.plantId)
      if (!secondPlant) continue

      const relation = relationBetween(firstPlant, secondPlant)
      if (!relation) continue
      const together =
        first.inGround.from <= second.inGround.to && second.inGround.from <= first.inGround.to
      if (!together || rectGap(first.rect, second.rect) > withinCm) continue

      pairs.push({ plantingId: first.id, otherPlantingId: second.id, relation })
    }
  })
  return pairs
}

/** How two crops get on, going by what either says about the other. */
export function relationBetween(a: Plant, b: Plant): "good" | "bad" | null {
  if (a.companions.bad.includes(b.id) || b.companions.bad.includes(a.id)) return "bad"
  if (a.companions.good.includes(b.id) || b.companions.good.includes(a.id)) return "good"
  return null
}
