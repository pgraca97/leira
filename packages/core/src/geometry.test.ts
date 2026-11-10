import { describe, expect, it } from "vitest"
import { clampRect, containsPoint, intersection, rectFromPoints, snap, snapRect } from "./geometry"

describe("snap", () => {
  it("rounds to the nearest multiple of the step", () => {
    expect(snap(14, 10)).toBe(10)
    expect(snap(15, 10)).toBe(20)
    expect(snap(-14, 10)).toBe(-10)
  })

  it("never returns negative zero", () => {
    expect(Object.is(snap(-2, 10), 0)).toBe(true)
  })
})

describe("rectFromPoints", () => {
  it("accepts the corners in any order", () => {
    const expected = { x: 10, y: 20, w: 30, h: 40 }
    expect(rectFromPoints({ x: 10, y: 20 }, { x: 40, y: 60 })).toEqual(expected)
    expect(rectFromPoints({ x: 40, y: 60 }, { x: 10, y: 20 })).toEqual(expected)
    expect(rectFromPoints({ x: 40, y: 20 }, { x: 10, y: 60 })).toEqual(expected)
  })
})

describe("snapRect", () => {
  it("snaps every edge to the grid", () => {
    expect(snapRect({ x: 12, y: 18, w: 95, h: 41 }, 10)).toEqual({ x: 10, y: 20, w: 100, h: 40 })
  })

  it("keeps at least one cell on each side", () => {
    expect(snapRect({ x: 12, y: 12, w: 1, h: 1 }, 10)).toEqual({ x: 10, y: 10, w: 10, h: 10 })
  })
})

describe("clampRect", () => {
  const bounds = { x: 0, y: 0, w: 600, h: 400 }

  it("leaves a rectangle that already fits untouched", () => {
    const rect = { x: 50, y: 50, w: 100, h: 100 }
    expect(clampRect(rect, bounds)).toEqual(rect)
  })

  it("moves a rectangle that hangs over an edge back inside", () => {
    expect(clampRect({ x: -30, y: 350, w: 100, h: 100 }, bounds)).toEqual({
      x: 0,
      y: 300,
      w: 100,
      h: 100,
    })
  })

  it("shrinks a rectangle larger than the bounds", () => {
    expect(clampRect({ x: -10, y: -10, w: 900, h: 900 }, bounds)).toEqual(bounds)
  })
})

describe("intersection", () => {
  it("returns the shared area", () => {
    const a = { x: 0, y: 0, w: 100, h: 100 }
    const b = { x: 60, y: 70, w: 100, h: 100 }
    expect(intersection(a, b)).toEqual({ x: 60, y: 70, w: 40, h: 30 })
  })

  it("is null when the rectangles only share an edge", () => {
    const a = { x: 0, y: 0, w: 100, h: 100 }
    const b = { x: 100, y: 0, w: 100, h: 100 }
    expect(intersection(a, b)).toBeNull()
  })

  it("is null when the rectangles are apart", () => {
    const a = { x: 0, y: 0, w: 10, h: 10 }
    const b = { x: 50, y: 50, w: 10, h: 10 }
    expect(intersection(a, b)).toBeNull()
  })
})

describe("containsPoint", () => {
  const rect = { x: 10, y: 10, w: 20, h: 20 }

  it("includes the top-left corner and excludes the bottom-right one", () => {
    expect(containsPoint(rect, { x: 10, y: 10 })).toBe(true)
    expect(containsPoint(rect, { x: 30, y: 30 })).toBe(false)
  })

  it("rejects points outside", () => {
    expect(containsPoint(rect, { x: 9, y: 15 })).toBe(false)
    expect(containsPoint(rect, { x: 15, y: 31 })).toBe(false)
  })
})
