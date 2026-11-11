import { type Bed, emptyPlan, type Planting } from "@garden/core"
import { beforeEach, describe, expect, it } from "vitest"
import { editorStore, redo, undo } from "./store"

const TOMATO: Planting = {
  id: "p1",
  plantId: "tomato",
  rect: { x: 0, y: 0, w: 100, h: 100 },
  layout: "block",
  inGround: { from: "2026-05-01", to: "2026-09-30" },
}

const BED: Bed = {
  id: "b1",
  name: "",
  kind: "bed",
  rect: { x: 200, y: 200, w: 200, h: 100 },
}

const state = () => editorStore.getState()
const planting = () => state().plan.plantings[0]
const bed = () => state().plan.beds[0]

beforeEach(() => {
  state().loadPlan({ ...emptyPlan(), beds: [BED], plantings: [TOMATO] })
})

describe("setPlantingDates", () => {
  it("changes when a planting is in the ground", () => {
    const changed = editorStore
      .getState()
      .setPlantingDates("p1", { from: "2027-04-15", to: "2027-08-31" })
    expect(changed).toBe(true)
    expect(editorStore.getState().plan.plantings[0]?.inGround).toEqual({
      from: "2027-04-15",
      to: "2027-08-31",
    })
  })

  it("refuses dates that end before they start", () => {
    const changed = editorStore
      .getState()
      .setPlantingDates("p1", { from: "2027-09-01", to: "2027-08-31" })
    expect(changed).toBe(false)
    expect(editorStore.getState().plan.plantings[0]?.inGround).toEqual(TOMATO.inGround)
  })

  it("refuses something that is not a date", () => {
    const changed = editorStore.getState().setPlantingDates("p1", { from: "", to: "2027-08-31" })
    expect(changed).toBe(false)
  })

  it("can be undone", () => {
    editorStore.getState().setPlantingDates("p1", { from: "2027-04-15", to: "2027-08-31" })
    undo()
    expect(editorStore.getState().plan.plantings[0]?.inGround).toEqual(TOMATO.inGround)
  })
})

describe("moveItem", () => {
  it("moves an item on the grid", () => {
    expect(state().moveItem({ kind: "planting", id: "p1" }, 52, 18)).toBe(true)
    expect(planting()?.rect).toEqual({ x: 50, y: 20, w: 100, h: 100 })
  })

  it("reports when nothing moved, and adds no undo step", () => {
    expect(state().moveItem({ kind: "planting", id: "p1" }, -500, -500)).toBe(false)
    expect(editorStore.temporal.getState().pastStates).toHaveLength(0)
  })

  it("is one undo step", () => {
    state().moveItem({ kind: "bed", id: "b1" }, 100, 0)
    undo()
    expect(bed()?.rect).toEqual(BED.rect)
    redo()
    expect(bed()?.rect).toEqual({ x: 300, y: 200, w: 200, h: 100 })
  })
})

describe("resizeItem", () => {
  it("drags a handle of an item to a point", () => {
    expect(state().resizeItem({ kind: "bed", id: "b1" }, "se", { x: 500, y: 350 })).toBe(true)
    expect(bed()?.rect).toEqual({ x: 200, y: 200, w: 300, h: 150 })
  })

  it("reports when the size did not change", () => {
    expect(state().resizeItem({ kind: "bed", id: "b1" }, "se", { x: 401, y: 299 })).toBe(false)
  })
})

describe("nudgeSelection", () => {
  it("moves the selected item by whole cells", () => {
    state().select({ kind: "bed", id: "b1" })
    expect(state().nudgeSelection(1, -2)).toBe(true)
    expect(bed()?.rect).toEqual({ x: 210, y: 180, w: 200, h: 100 })
  })

  it("does nothing without a selection", () => {
    expect(state().nudgeSelection(1, 0)).toBe(false)
  })
})

describe("duplicateSelection", () => {
  it("adds a copy next to the selected item and selects the copy", () => {
    state().select({ kind: "planting", id: "p1" })
    expect(state().duplicateSelection()).toBe(true)

    const [original, copy] = state().plan.plantings
    expect(copy).toMatchObject({ plantId: "tomato", rect: { x: 10, y: 10, w: 100, h: 100 } })
    expect(copy?.id).not.toBe(original?.id)
    expect(state().selection).toEqual({ kind: "planting", id: copy?.id })
  })

  it("does nothing without a selection", () => {
    expect(state().duplicateSelection()).toBe(false)
    expect(state().plan.plantings).toHaveLength(1)
  })
})

describe("updateBed", () => {
  it("renames a bed", () => {
    expect(state().updateBed("b1", { name: "  Herbs  " })).toBe(true)
    expect(bed()).toMatchObject({ name: "Herbs", kind: "bed" })
  })

  it("changes what kind of area a bed is", () => {
    expect(state().updateBed("b1", { kind: "greenhouse" })).toBe(true)
    expect(bed()).toMatchObject({ name: "", kind: "greenhouse" })
  })

  it("refuses a name the plan cannot hold", () => {
    expect(state().updateBed("b1", { name: "x".repeat(61) })).toBe(false)
    expect(bed()?.name).toBe("")
  })

  it("adds no undo step when nothing changes", () => {
    expect(state().updateBed("b1", { name: "", kind: "bed" })).toBe(false)
    expect(editorStore.temporal.getState().pastStates).toHaveLength(0)
  })
})

describe("setPlantingLayout", () => {
  it("changes how the plants are arranged", () => {
    expect(state().setPlantingLayout("p1", "sfg")).toBe(true)
    expect(planting()?.layout).toBe("sfg")
  })

  it("adds no undo step for the layout it already has", () => {
    expect(state().setPlantingLayout("p1", "block")).toBe(false)
    expect(editorStore.temporal.getState().pastStates).toHaveLength(0)
  })
})

describe("setPlanSize", () => {
  it("resizes the garden", () => {
    expect(state().setPlanSize(1000, 500)).toBe(true)
    expect(state().plan).toMatchObject({ widthCm: 1000, heightCm: 500 })
  })

  it("refuses a size that leaves an item outside", () => {
    expect(state().setPlanSize(300, 400)).toBe(false)
    expect(state().plan.widthCm).toBe(600)
  })
})
