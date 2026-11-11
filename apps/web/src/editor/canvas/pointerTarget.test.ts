import { emptyPlan, type GardenPlan } from "@garden/core"
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
    expect(pointerTarget({ plan, selection: BED }, { x: 302, y: 201 }, REACH)).toEqual({
      kind: "resize",
      ref: BED,
      handle: "se",
    })
  })

  it("moves when the press lands inside the selected item", () => {
    expect(pointerTarget({ plan, selection: BED }, { x: 250, y: 150 }, REACH)).toEqual({
      kind: "move",
      ref: BED,
    })
  })

  it("moves the selected bed even where a crop lies on top of it", () => {
    expect(pointerTarget({ plan, selection: BED }, { x: 150, y: 150 }, REACH)).toEqual({
      kind: "move",
      ref: BED,
    })
  })

  it("pans when the press misses the selected item", () => {
    expect(pointerTarget({ plan, selection: BED }, { x: 450, y: 300 }, REACH)).toEqual({
      kind: "pan",
    })
  })

  it("pans over an item that is not selected, so a stray drag moves nothing", () => {
    expect(pointerTarget({ plan, selection: null }, { x: 250, y: 150 }, REACH)).toEqual({
      kind: "pan",
    })
  })

  it("pans when the selected item no longer exists", () => {
    const gone = { kind: "bed", id: "deleted" } as const
    expect(pointerTarget({ plan, selection: gone }, { x: 250, y: 150 }, REACH)).toEqual({
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

  it("shows that an item can be moved and the view can be panned", () => {
    expect(cursorFor({ kind: "move", ref: BED })).toBe("move")
    expect(cursorFor({ kind: "pan" })).toBe("grab")
  })
})
