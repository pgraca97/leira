import { addDays, type IsoDate } from "./dates"
import {
  clampRect,
  containsPoint,
  intersection,
  type Point,
  type Rect,
  snap,
  snapRect,
} from "./geometry"
import type { GardenPlan, Plant, Planting } from "./schema"
import { type AreaFill, fillArea } from "./spacing"

/** The whole garden as a rectangle anchored at the origin. */
export function planBounds(plan: GardenPlan): Rect {
  return { x: 0, y: 0, w: plan.widthCm, h: plan.heightCm }
}

/**
 * Turns a freely drawn rectangle into one the plan can hold: clipped to the
 * garden and snapped to the grid. Returns null when it lies outside the garden.
 */
export function fitRectToPlan(plan: GardenPlan, rect: Rect): Rect | null {
  const bounds = planBounds(plan)
  const inside = intersection(rect, bounds)
  if (!inside) return null
  // Snapping can push an edge past the garden when its size is not a whole
  // number of cells, so clamp once more.
  return clampRect(snapRect(inside, plan.cellCm), bounds)
}

/**
 * The ground one plant takes when placed on its own: a grid-aligned square
 * around `center`, as wide as the crop's in-row spacing rounded up to whole cells.
 */
export function footprintAt(plan: GardenPlan, plant: Plant, center: Point): Rect {
  const cell = plan.cellCm
  const side = Math.max(cell, Math.ceil(plant.spacing.inRowCm / cell) * cell)
  return {
    x: snap(center.x - side / 2, cell),
    y: snap(center.y - side / 2, cell),
    w: side,
    h: side,
  }
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
