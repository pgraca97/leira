import { describe, expect, it } from "vitest"
import {
  duplicateItem,
  duplicateItems,
  handleAt,
  itemRect,
  itemsWithin,
  moveItem,
  moveItems,
  removeItems,
  resizeItem,
  resizePlan,
  visibleHandles,
} from "./edit"
import { emptyPlan, type GardenPlan, type Planting } from "./schema"

function planting(id: string, x: number, y: number, w: number, h: number): Planting {
  return {
    id,
    plantId: "lettuce",
    rect: { x, y, w, h },
    layout: "row",
    inGround: { from: "2026-03-01", to: "2026-05-15" },
  }
}

/** A 6 m by 4 m garden on a 10 cm grid with one bed, a crop on it and a crop beside it. */
const plan: GardenPlan = {
  ...emptyPlan(),
  beds: [{ id: "bed", name: "Long bed", kind: "bed", rect: { x: 100, y: 100, w: 200, h: 100 } }],
  plantings: [planting("on-bed", 110, 110, 80, 60), planting("beside", 400, 100, 100, 100)],
}

const BED = { kind: "bed", id: "bed" } as const
const BESIDE = { kind: "planting", id: "beside" } as const
const ON_BED = { kind: "planting", id: "on-bed" } as const

describe("itemRect", () => {
  it("finds the ground an item takes", () => {
    expect(itemRect(plan, BED)).toEqual({ x: 100, y: 100, w: 200, h: 100 })
    expect(itemRect(plan, BESIDE)).toEqual({ x: 400, y: 100, w: 100, h: 100 })
  })

  it("returns undefined for an item that is gone", () => {
    expect(itemRect(plan, { kind: "bed", id: "nope" })).toBeUndefined()
  })
})

describe("moveItem", () => {
  it("moves an item by whole grid cells", () => {
    const moved = moveItem(plan, BESIDE, 33, -48)
    expect(itemRect(moved, BESIDE)).toEqual({ x: 430, y: 50, w: 100, h: 100 })
  })

  it("stops at the garden's edge without changing the item's size", () => {
    const moved = moveItem(plan, BESIDE, 900, 900)
    expect(itemRect(moved, BESIDE)).toEqual({ x: 500, y: 300, w: 100, h: 100 })
    expect(itemRect(moveItem(plan, BESIDE, -900, -900), BESIDE)).toMatchObject({ x: 0, y: 0 })
  })

  it("takes the crops growing on a bed along with it", () => {
    const moved = moveItem(plan, BED, 50, 100)
    expect(itemRect(moved, BED)).toEqual({ x: 150, y: 200, w: 200, h: 100 })
    expect(itemRect(moved, { kind: "planting", id: "on-bed" })).toEqual({
      x: 160,
      y: 210,
      w: 80,
      h: 60,
    })
  })

  it("leaves crops that only overlap the bed, or sit elsewhere, where they are", () => {
    const overlapping = planting("half-on", 250, 150, 100, 100)
    const before = { ...plan, plantings: [...plan.plantings, overlapping] }
    const moved = moveItem(before, BED, 50, 100)
    expect(itemRect(moved, { kind: "planting", id: "half-on" })).toEqual(overlapping.rect)
    expect(itemRect(moved, BESIDE)).toEqual({ x: 400, y: 100, w: 100, h: 100 })
  })

  it("moves the crops on a bed only as far as the bed itself could go", () => {
    const moved = moveItem(plan, BED, -500, 0)
    expect(itemRect(moved, BED)).toMatchObject({ x: 0 })
    expect(itemRect(moved, { kind: "planting", id: "on-bed" })).toMatchObject({ x: 10 })
  })

  it("does not take a bed along when a crop on it moves", () => {
    const moved = moveItem(plan, { kind: "planting", id: "on-bed" }, 100, 0)
    expect(itemRect(moved, BED)).toEqual({ x: 100, y: 100, w: 200, h: 100 })
  })

  it("returns the same plan when nothing moves", () => {
    expect(moveItem(plan, BESIDE, 4, -3)).toBe(plan)
    expect(moveItem(plan, { kind: "bed", id: "nope" }, 100, 100)).toBe(plan)
  })

  it("does not touch the plan it was given", () => {
    const before = JSON.parse(JSON.stringify(plan))
    moveItem(plan, BED, 50, 100)
    expect(plan).toEqual(before)
  })
})

describe("resizeItem", () => {
  it("drags a corner to the pointer and keeps the opposite corner in place", () => {
    const resized = resizeItem(plan, BESIDE, "se", { x: 548, y: 233 })
    expect(itemRect(resized, BESIDE)).toEqual({ x: 400, y: 100, w: 150, h: 130 })

    const fromTopLeft = resizeItem(plan, BESIDE, "nw", { x: 352, y: 61 })
    expect(itemRect(fromTopLeft, BESIDE)).toEqual({ x: 350, y: 60, w: 150, h: 140 })
  })

  it("changes one side only when an edge is dragged", () => {
    expect(itemRect(resizeItem(plan, BESIDE, "e", { x: 560, y: 999 }), BESIDE)).toEqual({
      x: 400,
      y: 100,
      w: 160,
      h: 100,
    })
    expect(itemRect(resizeItem(plan, BESIDE, "n", { x: -999, y: 40 }), BESIDE)).toEqual({
      x: 400,
      y: 40,
      w: 100,
      h: 160,
    })
  })

  it("never shrinks below one cell, even when dragged past the opposite edge", () => {
    expect(itemRect(resizeItem(plan, BESIDE, "e", { x: 100, y: 0 }), BESIDE)).toEqual({
      x: 400,
      y: 100,
      w: 10,
      h: 100,
    })
    expect(itemRect(resizeItem(plan, BESIDE, "nw", { x: 900, y: 900 }), BESIDE)).toEqual({
      x: 490,
      y: 190,
      w: 10,
      h: 10,
    })
  })

  it("stops at the garden's edge", () => {
    expect(itemRect(resizeItem(plan, BESIDE, "se", { x: 5000, y: 5000 }), BESIDE)).toEqual({
      x: 400,
      y: 100,
      w: 200,
      h: 300,
    })
    expect(itemRect(resizeItem(plan, BESIDE, "nw", { x: -50, y: -50 }), BESIDE)).toEqual({
      x: 0,
      y: 0,
      w: 500,
      h: 200,
    })
  })

  it("leaves the crops on a bed where they are", () => {
    const resized = resizeItem(plan, BED, "se", { x: 400, y: 300 })
    expect(itemRect(resized, { kind: "planting", id: "on-bed" })).toEqual({
      x: 110,
      y: 110,
      w: 80,
      h: 60,
    })
  })

  it("returns the same plan when the size does not change", () => {
    expect(resizeItem(plan, BESIDE, "se", { x: 502, y: 197 })).toBe(plan)
  })
})

describe("handleAt", () => {
  const rect = { x: 100, y: 100, w: 200, h: 100 }

  it("finds the handle near the pointer", () => {
    expect(handleAt(rect, { x: 101, y: 99 }, 5)).toBe("nw")
    expect(handleAt(rect, { x: 303, y: 203 }, 5)).toBe("se")
    expect(handleAt(rect, { x: 200, y: 98 }, 5)).toBe("n")
    expect(handleAt(rect, { x: 296, y: 150 }, 5)).toBe("e")
  })

  it("returns null away from every handle", () => {
    expect(handleAt(rect, { x: 200, y: 150 }, 5)).toBeNull()
    expect(handleAt(rect, { x: 150, y: 100 }, 5)).toBeNull()
    expect(handleAt(rect, { x: 320, y: 220 }, 5)).toBeNull()
  })

  it("offers only the corners on a side too short to fit a middle handle", () => {
    const narrow = { x: 100, y: 100, w: 20, h: 100 }
    expect(visibleHandles(narrow, 5)).toEqual(["nw", "ne", "se", "sw", "e", "w"])
    expect(handleAt(narrow, { x: 110, y: 100 }, 5)).toBeNull()
  })

  it("prefers the bottom-right corner when an item is so small its handles overlap", () => {
    const tiny = { x: 100, y: 100, w: 4, h: 4 }
    expect(handleAt(tiny, { x: 102, y: 102 }, 5)).toBe("se")
  })
})

describe("resizePlan", () => {
  it("changes the size of the garden", () => {
    expect(resizePlan(plan, 800, 500)).toMatchObject({ widthCm: 800, heightCm: 500 })
  })

  it("can shrink the garden down to the items on it", () => {
    expect(resizePlan(plan, 500, 200)).toMatchObject({ widthCm: 500, heightCm: 200 })
  })

  it("refuses a size that would leave an item outside", () => {
    expect(resizePlan(plan, 490, 400)).toBeNull()
    expect(resizePlan(plan, 600, 190)).toBeNull()
  })

  it("refuses a size outside what a plan may hold", () => {
    expect(resizePlan(plan, 50, 400)).toBeNull()
    expect(resizePlan(plan, 600, 10_001)).toBeNull()
    expect(resizePlan(plan, 600.5, 400)).toBeNull()
  })

  it("returns the same plan when the size is unchanged", () => {
    expect(resizePlan(plan, 600, 400)).toBe(plan)
  })
})

describe("duplicateItem", () => {
  it("copies a planting one cell down and to the right, under a new id", () => {
    const result = duplicateItem(plan, BESIDE, "copy")
    expect(result?.ref).toEqual({ kind: "planting", id: "copy" })
    expect(result?.plan.plantings).toHaveLength(3)
    expect(result?.plan.plantings.at(-1)).toEqual({
      ...plan.plantings[1],
      id: "copy",
      rect: { x: 410, y: 110, w: 100, h: 100 },
    })
  })

  it("starts the copy of a planting with nothing recorded, on the same dates", () => {
    const recorded: Planting = {
      ...planting("recorded", 400, 100, 100, 100),
      sowDate: "2026-02-01",
      planted: true,
      cleared: true,
      harvests: [{ date: "2026-04-20", quantity: 2, unit: "kg" }],
      notes: "Slugs.",
    }
    const result = duplicateItem(
      { ...plan, plantings: [recorded] },
      { kind: "planting", id: "recorded" },
      "copy"
    )
    expect(result?.plan.plantings.at(-1)).toEqual({
      ...planting("copy", 410, 110, 100, 100),
      inGround: recorded.inGround,
    })
  })

  it("copies a bed, without the crops on it", () => {
    const result = duplicateItem(plan, BED, "copy")
    expect(result?.plan.beds.at(-1)).toEqual({
      id: "copy",
      name: "Long bed",
      kind: "bed",
      rect: { x: 110, y: 110, w: 200, h: 100 },
    })
    expect(result?.plan.plantings).toHaveLength(2)
  })

  it("keeps the copy inside the garden", () => {
    const corner = planting("corner", 500, 300, 100, 100)
    const result = duplicateItem(
      { ...plan, plantings: [corner] },
      { kind: "planting", id: "corner" },
      "copy"
    )
    expect(result?.plan.plantings.at(-1)?.rect).toEqual(corner.rect)
  })

  it("returns null for an item that is gone", () => {
    expect(duplicateItem(plan, { kind: "bed", id: "nope" }, "copy")).toBeNull()
  })

  it("returns null when the plan is full", () => {
    const full = { ...plan, beds: Array.from({ length: 500 }, () => plan.beds[0]!) }
    expect(duplicateItem(full, BED, "copy")).toBeNull()
  })
})

describe("moveItems", () => {
  it("moves several items by the same distance, keeping their places", () => {
    const moved = moveItems(plan, [BED, BESIDE], 50, 100)
    expect(itemRect(moved, BED)).toEqual({ x: 150, y: 200, w: 200, h: 100 })
    expect(itemRect(moved, BESIDE)).toEqual({ x: 450, y: 200, w: 100, h: 100 })
  })

  it("stops the whole group at the garden's edge, without squeezing it together", () => {
    const moved = moveItems(plan, [BED, BESIDE], 200, 0)
    // The group spans 100 to 500, so it can only go 100 further in a 600 cm garden.
    expect(itemRect(moved, BED)).toMatchObject({ x: 200 })
    expect(itemRect(moved, BESIDE)).toMatchObject({ x: 500 })
    expect(itemRect(moved, ON_BED)).toMatchObject({ x: 210 })
  })

  it("moves a crop on a moving bed once, even when it is chosen too", () => {
    const moved = moveItems(plan, [BED, ON_BED], 50, 0)
    expect(itemRect(moved, BED)).toMatchObject({ x: 150 })
    expect(itemRect(moved, ON_BED)).toMatchObject({ x: 160 })
  })

  it("skips items that are gone", () => {
    const moved = moveItems(plan, [{ kind: "bed", id: "nope" }, BESIDE], 100, 0)
    expect(itemRect(moved, BESIDE)).toMatchObject({ x: 500 })
  })

  it("returns the same plan when nothing moves", () => {
    expect(moveItems(plan, [BED, BESIDE], 4, -3)).toBe(plan)
    expect(moveItems(plan, [], 100, 100)).toBe(plan)
    expect(moveItems(plan, [{ kind: "bed", id: "nope" }], 100, 100)).toBe(plan)
  })
})

describe("duplicateItems", () => {
  const ids = () => {
    let next = 0
    return () => `copy-${++next}`
  }

  it("copies several items one cell down and to the right, keeping their layout", () => {
    const result = duplicateItems(plan, [BESIDE, BED], ids())
    expect(result?.refs).toEqual([
      { kind: "bed", id: "copy-1" },
      { kind: "planting", id: "copy-2" },
    ])
    expect(result?.plan.beds.at(-1)?.rect).toEqual({ x: 110, y: 110, w: 200, h: 100 })
    expect(result?.plan.plantings.at(-1)).toMatchObject({
      id: "copy-2",
      rect: { x: 410, y: 110, w: 100, h: 100 },
    })
  })

  it("copies the crops on a bed only when they are chosen too", () => {
    const alone = duplicateItems(plan, [BED], ids())
    expect(alone?.plan.plantings).toHaveLength(2)
    const together = duplicateItems(plan, [BED, ON_BED], ids())
    expect(together?.plan.plantings).toHaveLength(3)
    expect(together?.plan.plantings.at(-1)?.rect).toEqual({ x: 120, y: 120, w: 80, h: 60 })
  })

  it("keeps the copies inside the garden as one block", () => {
    const corner = planting("corner", 500, 300, 100, 100)
    const next = planting("next", 400, 300, 100, 100)
    const result = duplicateItems(
      { ...plan, plantings: [next, corner] },
      [
        { kind: "planting", id: "next" },
        { kind: "planting", id: "corner" },
      ],
      ids()
    )
    expect(result?.plan.plantings.slice(2).map((item) => item.rect)).toEqual([
      next.rect,
      corner.rect,
    ])
  })

  it("makes no copy at all when the plan cannot hold every one", () => {
    const nearlyFull = {
      ...plan,
      beds: Array.from({ length: 499 }, (_, index) => ({ ...plan.beds[0]!, id: `bed-${index}` })),
    }
    const twoBeds = [
      { kind: "bed", id: "bed-0" },
      { kind: "bed", id: "bed-1" },
    ] as const
    expect(duplicateItems(nearlyFull, twoBeds, ids())).toBeNull()
  })

  it("returns null when none of the items is there", () => {
    expect(duplicateItems(plan, [], ids())).toBeNull()
    expect(duplicateItems(plan, [{ kind: "bed", id: "nope" }], ids())).toBeNull()
  })
})

describe("removeItems", () => {
  it("removes the chosen items and leaves the crops on a removed bed", () => {
    const left = removeItems(plan, [BED, BESIDE])
    expect(left.beds).toEqual([])
    expect(left.plantings.map((item) => item.id)).toEqual(["on-bed"])
  })

  it("returns the same plan when there is nothing to remove", () => {
    expect(removeItems(plan, [])).toBe(plan)
    expect(removeItems(plan, [{ kind: "planting", id: "nope" }])).toBe(plan)
  })
})

describe("itemsWithin", () => {
  it("finds the items wholly inside an area, beds first", () => {
    expect(itemsWithin(plan, { x: 0, y: 0, w: 600, h: 400 })).toEqual([BED, ON_BED, BESIDE])
  })

  it("leaves out an item the area only partly covers", () => {
    // Drawn inside the bed, around the crop on it: the bed itself is not wholly inside.
    expect(itemsWithin(plan, { x: 105, y: 105, w: 100, h: 80 })).toEqual([ON_BED])
  })

  it("finds nothing in an empty area", () => {
    expect(itemsWithin(plan, { x: 0, y: 300, w: 100, h: 100 })).toEqual([])
  })
})
