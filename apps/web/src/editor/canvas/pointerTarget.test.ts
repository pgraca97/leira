import { emptyPlan, type GardenPlan } from "@leira/core"
import { describe, expect, it } from "vitest"
import { cursorFor, pointerTarget } from "./pointerTarget"

const plan: GardenPlan = {
  ...emptyPlan(),
  beds: [{ id: "bed", name: "", kind: "bed", rect: { x: 100, y: 100, w: 200, h: 100 } }],
  plantings: [
    {
      id: "crop",
      plantId: "lettuce",
      rect: { x: 120, y: 120, w: 60, h: 60 },
      layout: "row",
      inGround: { from: "2026-03-01", to: "2026-05-15" },
    },
  ],
}

const BED = { kind: "bed", id: "bed" } as const
const REACH = 5

describe("pointerTarget", () => {
  it("resizes when the press lands on a handle of the selected item", () => {
    expect(pointerTarget({ plan, selection: [BED] }, { x: 302, y: 201 }, REACH)).toEqual({
      kind: "resize",
      ref: BED,
      handle: "se",
    })
  })

  it("moves when the press lands inside the selected item", () => {
    expect(pointerTarget({ plan, selection: [BED] }, { x: 250, y: 150 }, REACH)).toEqual({
      kind: "move",
    })
  })

  it("moves the selected bed even where a crop lies on top of it", () => {
    expect(pointerTarget({ plan, selection: [BED] }, { x: 150, y: 150 }, REACH)).toEqual({
      kind: "move",
    })
  })

  it("pans when the press misses the selected item", () => {
    expect(pointerTarget({ plan, selection: [BED] }, { x: 450, y: 300 }, REACH)).toEqual({
      kind: "pan",
    })
  })

  it("pans over an item that is not selected, so a stray drag moves nothing", () => {
    expect(pointerTarget({ plan, selection: [] }, { x: 250, y: 150 }, REACH)).toEqual({
      kind: "pan",
    })
  })

  it("moves when the press lands inside any of several selected items", () => {
    const CROP = { kind: "planting", id: "crop" } as const
    const selection = [BED, CROP]
    expect(pointerTarget({ plan, selection }, { x: 250, y: 150 }, REACH)).toEqual({ kind: "move" })
  })

  it("offers no handles while several items are selected", () => {
    const CROP = { kind: "planting", id: "crop" } as const
    expect(pointerTarget({ plan, selection: [BED, CROP] }, { x: 302, y: 201 }, REACH)).toEqual({
      kind: "pan",
    })
  })

  it("draws an area to select instead of panning while adding to the selection", () => {
    const adding = { adding: true }
    expect(pointerTarget({ plan, selection: [] }, { x: 450, y: 300 }, REACH, adding)).toEqual({
      kind: "area",
    })
    // A press on a selected item still drags the group, or picks it out on release.
    expect(pointerTarget({ plan, selection: [BED] }, { x: 250, y: 150 }, REACH, adding)).toEqual({
      kind: "move",
    })
  })

  it("resizes the garden from anywhere along its border, with nothing selected", () => {
    expect(pointerTarget({ plan, selection: [] }, { x: 603, y: 200 }, REACH)).toEqual({
      kind: "resize-garden",
      handle: "e",
    })
    expect(pointerTarget({ plan, selection: [BED] }, { x: -3, y: 403 }, REACH)).toEqual({
      kind: "resize-garden",
      handle: "sw",
    })
  })

  it("lets a selected item's handle win over the garden's border beneath it", () => {
    const atEdge: GardenPlan = {
      ...plan,
      beds: [{ id: "bed", name: "", kind: "bed", rect: { x: 400, y: 100, w: 200, h: 100 } }],
    }
    expect(pointerTarget({ plan: atEdge, selection: [BED] }, { x: 600, y: 200 }, REACH)).toEqual({
      kind: "resize",
      ref: BED,
      handle: "se",
    })
    expect(pointerTarget({ plan: atEdge, selection: [BED] }, { x: 598, y: 150 }, REACH)).toEqual({
      kind: "resize",
      ref: BED,
      handle: "e",
    })
  })

  it("pans when the selected item no longer exists", () => {
    const gone = { kind: "bed", id: "deleted" } as const
    expect(pointerTarget({ plan, selection: [gone] }, { x: 250, y: 150 }, REACH)).toEqual({
      kind: "pan",
    })
  })
})

describe("cursorFor", () => {
  it("shows which way a handle resizes", () => {
    const cursor = (handle: "n" | "e" | "se" | "sw") =>
      cursorFor({ kind: "resize", ref: BED, handle })
    expect(cursor("n")).toBe("ns-resize")
    expect(cursor("e")).toBe("ew-resize")
    expect(cursor("se")).toBe("nwse-resize")
    expect(cursor("sw")).toBe("nesw-resize")
  })

  it("shows which way the garden resizes", () => {
    expect(cursorFor({ kind: "resize-garden", handle: "w" })).toBe("ew-resize")
    expect(cursorFor({ kind: "resize-garden", handle: "ne" })).toBe("nesw-resize")
  })

  it("shows that an item can be moved and the view can be panned", () => {
    expect(cursorFor({ kind: "move" })).toBe("move")
    expect(cursorFor({ kind: "pan" })).toBe("grab")
    expect(cursorFor({ kind: "area" })).toBe("crosshair")
  })
})
