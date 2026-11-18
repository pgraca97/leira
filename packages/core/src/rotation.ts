import { type IsoDate, yearOf } from "./dates"
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

/** How many years a family keeps away from the same ground. */
export const ROTATION_YEARS = 3

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
/**
 * The day the ground starts resting from a crop. For an annual, the day it
 * went in, which keeps a crop over winter (garlic in November) to the one
 * season. A perennial holds the ground for years, so the rest starts when it
 * leaves: strawberries in from 2023 to 2026 should not come back in 2027.
 */
function restFrom(planting: Planting, getPlant: (id: string) => Plant | undefined): IsoDate {
  return getPlant(planting.plantId)?.perennial ? planting.inGround.to : planting.inGround.from
}

export function findRotationConflicts(
  plan: GardenPlan,
  getPlant: (id: string) => Plant | undefined,
  options: RotationOptions = {}
): RotationConflict[] {
  const years = options.years ?? ROTATION_YEARS

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
        const yearsApart = yearOf(later.inGround.from) - yearOf(restFrom(earlier, getPlant))
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

/**
 * The families a stretch of ground should rest from for a crop going in on a
 * day: those of the plantings on it that left the ground before then, fewer
 * than `years` calendar years earlier. The same rule as the rotation warning,
 * so what is suggested for the ground is never what the warning then condemns.
 */
export function familiesToRest(
  plan: GardenPlan,
  ground: Rect,
  from: IsoDate,
  getPlant: (id: string) => Plant | undefined,
  years = ROTATION_YEARS
): Set<PlantFamily> {
  const families = new Set<PlantFamily>()
  for (const planting of plan.plantings) {
    if (planting.inGround.to >= from) continue
    if (yearOf(from) - yearOf(restFrom(planting, getPlant)) >= years) continue
    if (!intersection(planting.rect, ground)) continue
    const family = getPlant(planting.plantId)?.family
    if (family && family !== "other") families.add(family)
  }
  return families
}
