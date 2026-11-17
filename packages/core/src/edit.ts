import { clampRect, type Point, type Rect, snap } from "./geometry"
import { type PlanItemRef, planBounds } from "./plan"
import { withoutPlantingRecords } from "./records"
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

/** The smallest rectangle around all the given ones, which must not be empty. Shared with the clipboard, not part of the package's API. */
export function boundsOf(rects: readonly Rect[]): Rect {
  const left = Math.min(...rects.map((rect) => rect.x))
  const top = Math.min(...rects.map((rect) => rect.y))
  const right = Math.max(...rects.map((rect) => rect.x + rect.w))
  const bottom = Math.max(...rects.map((rect) => rect.y + rect.h))
  return { x: left, y: top, w: right - left, h: bottom - top }
}

export function shifted<T extends Bed | Planting>(item: T, dx: number, dy: number): T {
  return { ...item, rect: { ...item.rect, x: item.rect.x + dx, y: item.rect.y + dy } }
}

/** The beds and plantings the refs point at, in plan order. Refs to items that are gone are skipped. */
export function chosenItems(plan: GardenPlan, refs: readonly PlanItemRef[]) {
  const bedIds = new Set(refs.filter((ref) => ref.kind === "bed").map((ref) => ref.id))
  const plantingIds = new Set(refs.filter((ref) => ref.kind === "planting").map((ref) => ref.id))
  return {
    beds: plan.beds.filter((bed) => bedIds.has(bed.id)),
    plantings: plan.plantings.filter((planting) => plantingIds.has(planting.id)),
  }
}

/**
 * Moves several items together by a distance in centimetres, as one block:
 * the block lands on the grid and stays inside the garden as a whole, so the
 * items keep their places relative to each other and may travel less far than
 * asked. Crops that lie wholly on a moving bed travel with it, the way they
 * would if the bed were a real box, and only once when they are chosen too.
 */
export function moveItems(
  plan: GardenPlan,
  refs: readonly PlanItemRef[],
  dx: number,
  dy: number
): GardenPlan {
  const chosen = chosenItems(plan, refs)
  const plantings = plan.plantings.filter(
    (planting) =>
      chosen.plantings.includes(planting) ||
      chosen.beds.some((bed) => contains(bed.rect, planting.rect))
  )
  const rects = [...chosen.beds, ...plantings].map((item) => item.rect)
  if (rects.length === 0) return plan

  const block = boundsOf(rects)
  const target = clampRect(
    { ...block, x: snap(block.x + dx, plan.cellCm), y: snap(block.y + dy, plan.cellCm) },
    planBounds(plan)
  )
  const shiftX = target.x - block.x
  const shiftY = target.y - block.y
  if (shiftX === 0 && shiftY === 0) return plan

  return {
    ...plan,
    beds: plan.beds.map((bed) => (chosen.beds.includes(bed) ? shifted(bed, shiftX, shiftY) : bed)),
    plantings: plan.plantings.map((planting) =>
      plantings.includes(planting) ? shifted(planting, shiftX, shiftY) : planting
    ),
  }
}

/** Moves one item, as `moveItems` does: a bed takes the crops on it along. */
export function moveItem(plan: GardenPlan, ref: PlanItemRef, dx: number, dy: number): GardenPlan {
  return moveItems(plan, [ref], dx, dy)
}

/**
 * Removes the chosen items. Crops on a removed bed stay: they are separate
 * items, and the gardener may still want them there.
 */
export function removeItems(plan: GardenPlan, refs: readonly PlanItemRef[]): GardenPlan {
  const chosen = chosenItems(plan, refs)
  if (chosen.beds.length === 0 && chosen.plantings.length === 0) return plan
  return {
    ...plan,
    beds: plan.beds.filter((bed) => !chosen.beds.includes(bed)),
    plantings: plan.plantings.filter((planting) => !chosen.plantings.includes(planting)),
  }
}

/**
 * The items lying wholly inside an area, beds first, each in plan order. An
 * item the area only partly covers is left out, so an area drawn inside a bed
 * picks the crops on it and not the bed.
 */
export function itemsWithin(plan: GardenPlan, area: Rect): PlanItemRef[] {
  return [
    ...plan.beds
      .filter((bed) => contains(area, bed.rect))
      .map((bed): PlanItemRef => ({ kind: "bed", id: bed.id })),
    ...plan.plantings
      .filter((planting) => contains(area, planting.rect))
      .map((planting): PlanItemRef => ({ kind: "planting", id: planting.id })),
  ]
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
 * Adds a copy of each chosen item, one cell down and to the right so the copies
 * do not hide the originals, and on top of the others. The copies move as one
 * block, so they keep their layout. A copied bed comes without the crops on it
 * unless they are chosen too, and a copied crop with nothing recorded. Returns
 * null when none of the items is there, or when the plan cannot hold every
 * copy: half a group would be a surprise.
 */
export function duplicateItems(
  plan: GardenPlan,
  refs: readonly PlanItemRef[],
  newId: () => string
): { plan: GardenPlan; refs: PlanItemRef[] } | null {
  const { beds, plantings } = chosenItems(plan, refs)
  if (beds.length === 0 && plantings.length === 0) return null
  if (
    plan.beds.length + beds.length > PLAN_LIMITS.maxBeds ||
    plan.plantings.length + plantings.length > PLAN_LIMITS.maxPlantings
  ) {
    return null
  }

  const block = boundsOf([...beds, ...plantings].map((item) => item.rect))
  const target = clampRect(
    { ...block, x: block.x + plan.cellCm, y: block.y + plan.cellCm },
    planBounds(plan)
  )
  const shiftX = target.x - block.x
  const shiftY = target.y - block.y
  const bedCopies = beds.map((bed) => ({ ...shifted(bed, shiftX, shiftY), id: newId() }))
  // A copy is a new crop on the same dates: nothing has happened to it yet.
  const plantingCopies = plantings.map((planting) => ({
    ...shifted(withoutPlantingRecords(planting), shiftX, shiftY),
    id: newId(),
  }))

  return {
    plan: {
      ...plan,
      beds: [...plan.beds, ...bedCopies],
      plantings: [...plan.plantings, ...plantingCopies],
    },
    refs: [
      ...bedCopies.map((bed): PlanItemRef => ({ kind: "bed", id: bed.id })),
      ...plantingCopies.map((planting): PlanItemRef => ({ kind: "planting", id: planting.id })),
    ],
  }
}

/** Adds a copy of one item, as `duplicateItems` does. */
export function duplicateItem(
  plan: GardenPlan,
  ref: PlanItemRef,
  newId: string
): { plan: GardenPlan; ref: PlanItemRef } | null {
  const copy = duplicateItems(plan, [ref], () => newId)
  return copy?.refs[0] ? { plan: copy.plan, ref: copy.refs[0] } : null
}
