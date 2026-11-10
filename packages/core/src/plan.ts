import { addDays, type IsoDate } from "./dates"
import { containsPoint, type Point, type Rect } from "./geometry"
import type { GardenPlan, Plant, Planting } from "./schema"
import { type AreaFill, fillArea } from "./spacing"

/** The whole garden as a rectangle anchored at the origin. */
export function planBounds(plan: GardenPlan): Rect {
  return { x: 0, y: 0, w: plan.widthCm, h: plan.heightCm }
}

/** Something on the plan that can be pointed at. */
export interface PlanItemRef {
  kind: "bed" | "planting"
  id: string
}

/**
 * The topmost item under a point. Plantings sit above beds, and within each
 * kind the most recently added item is on top.
 */
export function hitTest(plan: GardenPlan, point: Point): PlanItemRef | null {
  const planting = plan.plantings.findLast((item) => containsPoint(item.rect, point))
  if (planting) return { kind: "planting", id: planting.id }
  const bed = plan.beds.findLast((item) => containsPoint(item.rect, point))
  if (bed) return { kind: "bed", id: bed.id }
  return null
}

/** How the plants of a planting are laid out, given the crop's spacing. */
export function plantingFill(planting: Planting, plant: Plant): AreaFill {
  return fillArea(planting.rect, plant.spacing, planting.layout)
}

/**
 * A first guess at how long a crop stays in the ground: from `from` until the
 * end of its latest harvest window.
 */
export function defaultInGround(plant: Plant, from: IsoDate): Planting["inGround"] {
  return { from, to: addDays(from, plant.daysToHarvest[1]) }
}
