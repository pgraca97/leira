import { describe, expect, it } from "vitest"
import { containsPoint, type Rect } from "./geometry"
import { PLANTING_LAYOUTS } from "./schema"
import { fillArea, fillPoints } from "./spacing"

const lettuce = { inRowCm: 25, rowCm: 30 }
const tomato = { inRowCm: 50, rowCm: 90 }
const carrot = { inRowCm: 5, rowCm: 25 }
const onion = { inRowCm: 10, rowCm: 30 }

describe("fillArea", () => {
  it("puts a single plant in the centre", () => {
    const fill = fillArea({ x: 100, y: 200, w: 50, h: 50 }, tomato, "single")
    expect(fill.count).toBe(1)
    expect(fill.origin).toEqual({ x: 125, y: 225 })
  })

  it("runs rows along the longer side of a wide rectangle", () => {
    const fill = fillArea({ x: 0, y: 0, w: 200, h: 90 }, lettuce, "row")
    expect(fill).toMatchObject({ cols: 8, rows: 3, count: 24, pitch: { x: 25, y: 30 } })
    // 8 plants span 175 cm, leaving 12.5 cm either side; 3 rows span 60 cm, leaving 15 cm.
    expect(fill.origin).toEqual({ x: 12.5, y: 15 })
  })

  it("runs rows along the longer side of a tall rectangle", () => {
    const fill = fillArea({ x: 0, y: 0, w: 90, h: 200 }, lettuce, "row")
    expect(fill).toMatchObject({ cols: 3, rows: 8, count: 24, pitch: { x: 30, y: 25 } })
  })

  it("uses the in-row spacing both ways in a block", () => {
    const fill = fillArea({ x: 0, y: 0, w: 200, h: 100 }, tomato, "block")
    expect(fill).toMatchObject({ cols: 4, rows: 2, count: 8, pitch: { x: 50, y: 50 } })
  })

  it("still places one plant in a rectangle smaller than its spacing", () => {
    const fill = fillArea({ x: 10, y: 10, w: 20, h: 20 }, tomato, "row")
    expect(fill.count).toBe(1)
    expect(fill.origin).toEqual({ x: 20, y: 20 })
  })

  describe("square foot gardening", () => {
    const square: Rect = { x: 0, y: 0, w: 30, h: 30 }

    it.each([
      ["carrot", carrot, 16],
      ["onion", onion, 9],
      ["a 15 cm crop", { inRowCm: 15, rowCm: 30 }, 4],
      ["lettuce", lettuce, 1],
    ])("fits %s into one square", (_name, spacing, count) => {
      expect(fillArea(square, spacing, "sfg").count).toBe(count)
    })

    it("gives a large plant a block of whole squares", () => {
      expect(fillArea({ x: 0, y: 0, w: 60, h: 60 }, tomato, "sfg").count).toBe(1)
      expect(fillArea({ x: 0, y: 0, w: 120, h: 60 }, tomato, "sfg").count).toBe(2)
    })

    it("repeats the per-square count across a bed", () => {
      // A 120 by 60 cm bed is 4 by 2 squares, each holding 9 onions.
      expect(fillArea({ x: 0, y: 0, w: 120, h: 60 }, onion, "sfg").count).toBe(72)
    })
  })
})

describe("fillPoints", () => {
  const rect: Rect = { x: 40, y: 70, w: 230, h: 110 }

  it.each(PLANTING_LAYOUTS)(
    "returns one point per plant, all inside the rectangle (%s)",
    (layout) => {
      const fill = fillArea(rect, lettuce, layout)
      const points = fillPoints(fill)
      expect(points).toHaveLength(fill.count)
      for (const point of points) expect(containsPoint(rect, point)).toBe(true)
    }
  )

  it("spaces neighbours by the pitch", () => {
    const fill = fillArea({ x: 0, y: 0, w: 200, h: 90 }, lettuce, "row")
    const [first, second] = fillPoints(fill)
    expect(second!.x - first!.x).toBe(25)
    expect(second!.y).toBe(first!.y)
  })

  it("stops at the limit without changing the count", () => {
    const fill = fillArea({ x: 0, y: 0, w: 1000, h: 400 }, carrot, "row")
    expect(fill.count).toBe(3200)
    expect(fillPoints(fill, 100)).toHaveLength(100)
  })
})
