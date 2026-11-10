import { yearOf } from "./dates"
import { intersection, type Rect } from "./geometry"
import type { GardenPlan, Plant, PlantFamily, Planting } from "./schema"

/** A planting that returns a botanical family to soil it used too recently. */
export interface RotationConflict {
  /** The later planting: the one to move or swap. */
  plantingId: string
  /** The earlier planting of the same family on overlapping ground. */
  previousPlantingId: string
  family: PlantFamily
  /** Calendar years between the two plantings going in. 0 means the same year. */
  yearsApart: number
  /** The ground both plantings share. */
  overlap: Rect
}

export interface RotationOptions {
  /**
   * Length of the rotation: a family may return to the same ground every
   * `years` years. With the default of 3, tomatoes grown in 2024 conflict
   * with tomatoes in 2025 and 2026, but not in 2027.
   */
  years?: number
}

/**
 * Finds plantings that break crop rotation. Two plantings conflict when they
 * belong to the same family, share ground, the earlier one is out before the
 * later one goes in, and fewer than `years` calendar years separate them.
 * Plants of the family `other`, and plants the lookup does not know, are skipped.
 */
export function findRotationConflicts(
  plan: GardenPlan,
  getPlant: (id: string) => Plant | undefined,
  options: RotationOptions = {}
): RotationConflict[] {
  const years = options.years ?? 3

  const byFamily = new Map<PlantFamily, Planting[]>()
  for (const planting of plan.plantings) {
    const family = getPlant(planting.plantId)?.family
    if (!family || family === "other") continue
    const group = byFamily.get(family)
    if (group) group.push(planting)
    else byFamily.set(family, [planting])
  }

  const conflicts: RotationConflict[] = []
  for (const [family, plantings] of byFamily) {
    for (const later of plantings) {
      for (const earlier of plantings) {
        // Only pairs where the earlier crop has left the ground: crops that
        // share ground at the same time are interplanting, not rotation.
        if (earlier.inGround.to >= later.inGround.from) continue
        const yearsApart = yearOf(later.inGround.from) - yearOf(earlier.inGround.from)
        if (yearsApart >= years) continue
        const overlap = intersection(earlier.rect, later.rect)
        if (!overlap) continue
        conflicts.push({
          plantingId: later.id,
          previousPlantingId: earlier.id,
          family,
          yearsApart,
          overlap,
        })
      }
    }
  }
  return conflicts
}
