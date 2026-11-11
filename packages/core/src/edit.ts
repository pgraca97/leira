import { clampRect, type Point, type Rect, snap } from "./geometry"
import { type PlanItemRef, planBounds } from "./plan"
import { type Bed, type GardenPlan, PLAN_LIMITS, type Planting } from "./schema"

/**
 * Changes to a plan made by hand in the editor. Every function returns a new
 * plan and leaves the one it was given untouched; when nothing would change it
 * returns that same plan, so callers can tell with `===`.
 */

/** The ground an item takes, or undefined when the plan has no such item. */
export function itemRect(plan: GardenPlan, ref: PlanItemRef): Rect | undefined {
  const items: readonly (Bed | Planting)[] = ref.kind === "bed" ? plan.beds : plan.plantings
  return items.find((item) => item.id === ref.id)?.rect
}

function sameRect(a: Rect, b: Rect): boolean {
  return a.x === b.x && a.y === b.y && a.w === b.w && a.h === b.h
}

function withRect(plan: GardenPlan, ref: PlanItemRef, rect: Rect): GardenPlan {
  const place = <T extends Bed | Planting>(item: T): T =>
    item.id === ref.id ? { ...item, rect } : item
  return ref.kind === "bed"
    ? { ...plan, beds: plan.beds.map(place) }
    : { ...plan, plantings: plan.plantings.map(place) }
}

function contains(outer: Rect, inner: Rect): boolean {
  return (
    inner.x >= outer.x &&
    inner.y >= outer.y &&
    inner.x + inner.w <= outer.x + outer.w &&
    inner.y + inner.h <= outer.y + outer.h
  )
}

/**
 * Moves an item by a distance in centimetres. The item lands on the grid,
 * keeps its size and stays inside the garden, so it may travel less far than
 * asked. Crops that lie wholly on a bed travel with it, the way they would if
 * the bed were a real box; a crop moved on its own leaves the bed behind.
 */
export function moveItem(plan: GardenPlan, ref: PlanItemRef, dx: number, dy: number): GardenPlan {
  const rect = itemRect(plan, ref)
  if (!rect) return plan
  const target = clampRect(
    { ...rect, x: snap(rect.x + dx, plan.cellCm), y: snap(rect.y + dy, plan.cellCm) },
    planBounds(plan)
  )
  if (sameRect(rect, target)) return plan

  const moved = withRect(plan, ref, target)
  if (ref.kind !== "bed") return moved
  const shiftX = target.x - rect.x
  const shiftY = target.y - rect.y
  return {
    ...moved,
    plantings: moved.plantings.map((planting) =>
      contains(rect, planting.rect)
        ? {
            ...planting,
            rect: { ...planting.rect, x: planting.rect.x + shiftX, y: planting.rect.y + shiftY },
          }
        : planting
    ),
  }
}

/** The eight places an item can be grabbed to resize it, named like compass points. */
export const RESIZE_HANDLES = ["nw", "ne", "se", "sw", "n", "e", "s", "w"] as const
export type ResizeHandle = (typeof RESIZE_HANDLES)[number]

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}

/**
 * Resizes an item by dragging one of its handles to `point`. The dragged edges
 * follow the pointer on the grid, the opposite ones stay where they are, and
 * the item keeps at least one cell and stays inside the garden. Unlike a move,
 * resizing a bed leaves the crops on it in place.
 */
export function resizeItem(
  plan: GardenPlan,
  ref: PlanItemRef,
  handle: ResizeHandle,
  point: Point
): GardenPlan {
  const rect = itemRect(plan, ref)
  if (!rect) return plan
  const cell = plan.cellCm
  let left = rect.x
  let right = rect.x + rect.w
  let top = rect.y
  let bottom = rect.y + rect.h

  if (handle.includes("w")) left = clamp(snap(point.x, cell), 0, right - cell)
  if (handle.includes("e")) right = clamp(snap(point.x, cell), left + cell, plan.widthCm)
  if (handle.includes("n")) top = clamp(snap(point.y, cell), 0, bottom - cell)
  if (handle.includes("s")) bottom = clamp(snap(point.y, cell), top + cell, plan.heightCm)

  const target = { x: left, y: top, w: right - left, h: bottom - top }
  return sameRect(rect, target) ? plan : withRect(plan, ref, target)
}

function handlePoint(rect: Rect, handle: ResizeHandle): Point {
  const x = handle.includes("w")
    ? rect.x
    : handle.includes("e")
      ? rect.x + rect.w
      : rect.x + rect.w / 2
  const y = handle.includes("n")
    ? rect.y
    : handle.includes("s")
      ? rect.y + rect.h
      : rect.y + rect.h / 2
  return { x, y }
}

/** A side shorter than this many reaches has no room for a handle in its middle. */
const MIDDLE_HANDLE_MIN_REACHES = 6

/**
 * The handles to offer on a rectangle, given how far a handle reaches from its
 * centre. Corners always; the middle of a side only when the side is long
 * enough that its handle does not crowd the corners.
 */
export function visibleHandles(rect: Rect, reach: number): ResizeHandle[] {
  const room = reach * MIDDLE_HANDLE_MIN_REACHES
  return RESIZE_HANDLES.filter((handle) => {
    if (handle === "n" || handle === "s") return rect.w >= room
    if (handle === "e" || handle === "w") return rect.h >= room
    return true
  })
}

/** Where each visible handle sits. */
export function handlePoints(rect: Rect, reach: number): { handle: ResizeHandle; point: Point }[] {
  return visibleHandles(rect, reach).map((handle) => ({ handle, point: handlePoint(rect, handle) }))
}

/** Checked first to last. Bottom-right leads: it is the one that grows a tiny item. */
const HIT_ORDER: readonly ResizeHandle[] = ["se", "ne", "sw", "nw", "s", "e", "n", "w"]

/** The handle within `reach` of a point (a square around its centre), or null. */
export function handleAt(rect: Rect, point: Point, reach: number): ResizeHandle | null {
  const visible = visibleHandles(rect, reach)
  for (const handle of HIT_ORDER) {
    if (!visible.includes(handle)) continue
    const at = handlePoint(rect, handle)
    if (Math.abs(point.x - at.x) <= reach && Math.abs(point.y - at.y) <= reach) return handle
  }
  return null
}

/**
 * Changes the size of the garden, keeping its top-left corner. Returns null
 * for a size a plan may not have, or one that would leave an item outside.
 */
export function resizePlan(plan: GardenPlan, widthCm: number, heightCm: number): GardenPlan | null {
  const allowed = (side: number) =>
    Number.isInteger(side) && side >= PLAN_LIMITS.minSideCm && side <= PLAN_LIMITS.maxSideCm
  if (!allowed(widthCm) || !allowed(heightCm)) return null
  if (widthCm === plan.widthCm && heightCm === plan.heightCm) return plan

  const bounds = { x: 0, y: 0, w: widthCm, h: heightCm }
  const fits = (item: Bed | Planting) => contains(bounds, item.rect)
  if (!plan.beds.every(fits) || !plan.plantings.every(fits)) return null
  return { ...plan, widthCm, heightCm }
}

/**
 * Adds a copy of an item, one cell down and to the right so it does not hide
 * the original, and on top of the others. A copied bed comes without crops.
 * Returns null when the item is gone or the plan is full.
 */
export function duplicateItem(
  plan: GardenPlan,
  ref: PlanItemRef,
  newId: string
): { plan: GardenPlan; ref: PlanItemRef } | null {
  const offset = (rect: Rect) =>
    clampRect({ ...rect, x: rect.x + plan.cellCm, y: rect.y + plan.cellCm }, planBounds(plan))
  const copyRef: PlanItemRef = { kind: ref.kind, id: newId }

  if (ref.kind === "bed") {
    const bed = plan.beds.find((item) => item.id === ref.id)
    if (!bed || plan.beds.length >= PLAN_LIMITS.maxBeds) return null
    const copy = { ...bed, id: newId, rect: offset(bed.rect) }
    return { plan: { ...plan, beds: [...plan.beds, copy] }, ref: copyRef }
  }
  const planting = plan.plantings.find((item) => item.id === ref.id)
  if (!planting || plan.plantings.length >= PLAN_LIMITS.maxPlantings) return null
  const copy = { ...planting, id: newId, rect: offset(planting.rect) }
  return { plan: { ...plan, plantings: [...plan.plantings, copy] }, ref: copyRef }
}
