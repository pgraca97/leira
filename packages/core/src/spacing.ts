import type { Point, Rect } from "./geometry"
import type { Plant, PlantingLayout } from "./schema"

/** Side of one square in square foot gardening. */
export const SFG_CELL_CM = 30

/** Most plants a single square holds in square foot gardening: a 4 by 4 grid. */
const SFG_MAX_PER_SIDE = 4

type Spacing = Plant["spacing"]

/** A regular grid of plants laid over a rectangle. */
export interface AreaFill {
  /** Plants per horizontal line. */
  cols: number
  /** Number of horizontal lines. */
  rows: number
  /** Total plants: `cols * rows`. */
  count: number
  /** Distance between neighbouring plants on each axis. */
  pitch: { x: number; y: number }
  /** Centre of the top-left plant. */
  origin: Point
}

/**
 * Works out how many plants fit in a rectangle, and where they go.
 *
 * Each plant owns a `pitch.x` by `pitch.y` cell. As many whole cells as fit are
 * centred in the rectangle; a rectangle smaller than one cell still gets one
 * plant, so placing a plant never yields an empty planting.
 */
export function fillArea(rect: Rect, spacing: Spacing, layout: PlantingLayout): AreaFill {
  if (layout === "single") {
    return {
      cols: 1,
      rows: 1,
      count: 1,
      pitch: { x: spacing.inRowCm, y: spacing.inRowCm },
      origin: { x: rect.x + rect.w / 2, y: rect.y + rect.h / 2 },
    }
  }

  const pitch = pitchFor(rect, spacing, layout)
  const cols = Math.max(1, Math.floor(rect.w / pitch.x))
  const rows = Math.max(1, Math.floor(rect.h / pitch.y))
  return {
    cols,
    rows,
    count: cols * rows,
    pitch,
    origin: {
      x: rect.x + (rect.w - (cols - 1) * pitch.x) / 2,
      y: rect.y + (rect.h - (rows - 1) * pitch.y) / 2,
    },
  }
}

function pitchFor(
  rect: Rect,
  spacing: Spacing,
  layout: Exclude<PlantingLayout, "single">
): { x: number; y: number } {
  switch (layout) {
    case "row":
      // Rows run along the longer side of the rectangle.
      return rect.w >= rect.h
        ? { x: spacing.inRowCm, y: spacing.rowCm }
        : { x: spacing.rowCm, y: spacing.inRowCm }
    case "block":
      return { x: spacing.inRowCm, y: spacing.inRowCm }
    case "sfg": {
      const side = sfgPitch(spacing.inRowCm)
      return { x: side, y: side }
    }
  }
}

/**
 * Square foot gardening spacing. Small plants share a square in a 1, 2, 3 or
 * 4-a-side grid (1, 4, 9 or 16 plants); a plant wider than one square takes a
 * block of whole squares.
 */
function sfgPitch(inRowCm: number): number {
  if (inRowCm > SFG_CELL_CM) return SFG_CELL_CM * Math.ceil(inRowCm / SFG_CELL_CM)
  const perSide = Math.min(SFG_MAX_PER_SIDE, Math.floor(SFG_CELL_CM / inRowCm))
  return SFG_CELL_CM / perSide
}

/**
 * The centre of every plant in a fill, row by row. Pass `limit` to cap the
 * work for very dense plantings: a renderer cannot usefully draw thousands of
 * dots, but `fill.count` stays exact either way.
 */
export function fillPoints(fill: AreaFill, limit: number = Number.POSITIVE_INFINITY): Point[] {
  const points: Point[] = []
  for (let row = 0; row < fill.rows; row++) {
    for (let col = 0; col < fill.cols; col++) {
      if (points.length >= limit) return points
      points.push({
        x: fill.origin.x + col * fill.pitch.x,
        y: fill.origin.y + row * fill.pitch.y,
      })
    }
  }
  return points
}
