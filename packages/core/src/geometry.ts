/** A point in garden space. Units are centimetres; y grows downwards. */
export interface Point {
  x: number
  y: number
}

/** An axis-aligned rectangle in garden space: top-left corner plus size, in centimetres. */
export interface Rect {
  x: number
  y: number
  w: number
  h: number
}

/** Rounds a value to the nearest multiple of `step`. */
export function snap(value: number, step: number): number {
  // `+ 0` turns the -0 that Math.round can produce into 0.
  return Math.round(value / step) * step + 0
}

/** The rectangle spanned by two opposite corners, whatever order they come in. */
export function rectFromPoints(a: Point, b: Point): Rect {
  return {
    x: Math.min(a.x, b.x),
    y: Math.min(a.y, b.y),
    w: Math.abs(a.x - b.x),
    h: Math.abs(a.y - b.y),
  }
}

/**
 * Snaps a rectangle's edges to the grid. An edge pair that collapses onto the
 * same grid line is widened to one cell, so the result never has a zero side.
 */
export function snapRect(rect: Rect, step: number): Rect {
  const x = snap(rect.x, step)
  const y = snap(rect.y, step)
  return {
    x,
    y,
    w: Math.max(step, snap(rect.x + rect.w, step) - x),
    h: Math.max(step, snap(rect.y + rect.h, step) - y),
  }
}

/** Shrinks and moves a rectangle as little as needed to fit inside `bounds`. */
export function clampRect(rect: Rect, bounds: Rect): Rect {
  const w = Math.min(rect.w, bounds.w)
  const h = Math.min(rect.h, bounds.h)
  return {
    x: Math.min(Math.max(rect.x, bounds.x), bounds.x + bounds.w - w),
    y: Math.min(Math.max(rect.y, bounds.y), bounds.y + bounds.h - h),
    w,
    h,
  }
}

/** The overlapping area of two rectangles, or null when they only touch or are apart. */
export function intersection(a: Rect, b: Rect): Rect | null {
  const x = Math.max(a.x, b.x)
  const y = Math.max(a.y, b.y)
  const w = Math.min(a.x + a.w, b.x + b.w) - x
  const h = Math.min(a.y + a.h, b.y + b.h) - y
  return w > 0 && h > 0 ? { x, y, w, h } : null
}

/** Whether a point lies inside a rectangle. The right and bottom edges are excluded. */
export function containsPoint(rect: Rect, point: Point): boolean {
  return (
    point.x >= rect.x && point.x < rect.x + rect.w && point.y >= rect.y && point.y < rect.y + rect.h
  )
}

/**
 * The clear distance between two rectangles: zero when they touch or overlap,
 * and measured corner to corner when they sit diagonally.
 */
export function rectGap(a: Rect, b: Rect): number {
  const dx = Math.max(0, a.x - (b.x + b.w), b.x - (a.x + a.w))
  const dy = Math.max(0, a.y - (b.y + b.h), b.y - (a.y + a.h))
  return Math.hypot(dx, dy)
}
