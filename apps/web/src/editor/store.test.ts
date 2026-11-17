import { type Bed, emptyPlan, type Planting } from "@leira/core"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { editorStore, redo, selectedBed, selectedPlanting, shownPlan, undo } from "./store"

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

describe("setPlantingSowDate", () => {
  it("records the day the seeds were sown", () => {
    expect(state().setPlantingSowDate("p1", "2026-03-10")).toBe(true)
    expect(planting()?.sowDate).toBe("2026-03-10")
  })

  it("refuses a day that is not before the crop goes in the ground", () => {
    expect(state().setPlantingSowDate("p1", "2026-05-01")).toBe(false)
    expect(state().setPlantingSowDate("p1", "2026-06-01")).toBe(false)
    expect(planting()).toEqual(TOMATO)
  })

  it("refuses something that is not a date", () => {
    expect(state().setPlantingSowDate("p1", "soon")).toBe(false)
  })

  it("forgets the day when given none, leaving no trace in the plan", () => {
    state().setPlantingSowDate("p1", "2026-03-10")
    expect(state().setPlantingSowDate("p1", null)).toBe(true)
    expect(planting()).toEqual(TOMATO)
    expect(planting()).not.toHaveProperty("sowDate")
  })

  it("reports when nothing changed, and adds no undo step", () => {
    expect(state().setPlantingSowDate("p1", null)).toBe(false)
    expect(editorStore.temporal.getState().pastStates).toHaveLength(0)
  })

  it("is one undo step", () => {
    state().setPlantingSowDate("p1", "2026-03-10")
    undo()
    expect(planting()).toEqual(TOMATO)
  })

  it("is forgotten when the crop moves into the ground on or before that day", () => {
    state().setPlantingSowDate("p1", "2026-03-10")
    state().setPlantingDates("p1", { from: "2026-03-10", to: "2026-09-30" })
    expect(planting()).not.toHaveProperty("sowDate")
  })

  it("is kept when the crop still goes in the ground after that day", () => {
    state().setPlantingSowDate("p1", "2026-03-10")
    state().setPlantingDates("p1", { from: "2026-04-20", to: "2026-09-30" })
    expect(planting()?.sowDate).toBe("2026-03-10")
  })
})

describe("recordTask", () => {
  it("marks a job done on a day, writing the real day into the plan", () => {
    expect(state().recordTask("p1", "transplant", "2026-05-06")).toBe(true)
    expect(planting()).toMatchObject({
      planted: true,
      inGround: { from: "2026-05-06", to: "2026-09-30" },
    })
  })

  it("puts a job back to do, keeping the day", () => {
    state().recordTask("p1", "clear", "2026-09-12")
    expect(state().recordTask("p1", "clear", null)).toBe(true)
    expect(planting()).not.toHaveProperty("cleared")
    expect(planting()?.inGround.to).toBe("2026-09-12")
  })

  it("refuses a day the planting's other dates rule out, adding no undo step", () => {
    expect(state().recordTask("p1", "clear", "2026-04-30")).toBe(false)
    expect(state().recordTask("p1", "sow-indoors", "2026-05-01")).toBe(false)
    expect(state().recordTask("p1", "transplant", "not a date")).toBe(false)
    expect(planting()).toEqual(TOMATO)
    expect(editorStore.temporal.getState().pastStates).toHaveLength(0)
  })

  it("does nothing for a planting that is gone", () => {
    expect(state().recordTask("nope", "transplant", "2026-05-06")).toBe(false)
  })

  it("is one undo step", () => {
    state().recordTask("p1", "transplant", "2026-05-06")
    undo()
    expect(planting()).toEqual(TOMATO)
  })
})

describe("addHarvest and removeHarvest", () => {
  it("records what was picked", () => {
    expect(state().addHarvest("p1", { date: "2026-07-12", quantity: 1.5, unit: "kg" })).toBe(true)
    expect(state().addHarvest("p1", { date: "2026-07-20" })).toBe(true)
    expect(planting()?.harvests).toEqual([
      { date: "2026-07-12", quantity: 1.5, unit: "kg" },
      { date: "2026-07-20" },
    ])
  })

  it.each([
    ["an amount with no unit", { date: "2026-07-12", quantity: 2 }],
    ["an amount of nothing", { date: "2026-07-12", quantity: 0, unit: "kg" as const }],
    ["a day that is not one", { date: "soon" }],
    ["a day before the crop went in", { date: "2026-04-30" }],
  ])("refuses %s", (_case, harvest) => {
    expect(state().addHarvest("p1", harvest)).toBe(false)
    expect(planting()).toEqual(TOMATO)
  })

  it("undoes a late harvest together with the last day it moved", () => {
    state().addHarvest("p1", { date: "2026-10-08" })
    expect(planting()?.inGround.to).toBe("2026-10-08")
    undo()
    expect(planting()).toEqual(TOMATO)
  })

  it("removes one harvest", () => {
    state().addHarvest("p1", { date: "2026-07-12" })
    state().addHarvest("p1", { date: "2026-07-20" })
    expect(state().removeHarvest("p1", 0)).toBe(true)
    expect(planting()?.harvests).toEqual([{ date: "2026-07-20" }])
    expect(state().removeHarvest("p1", 5)).toBe(false)
  })
})

describe("setPlantingDates with harvests recorded", () => {
  beforeEach(() => {
    state().addHarvest("p1", { date: "2026-07-12" })
    state().addHarvest("p1", { date: "2026-08-20" })
  })

  it("refuses to plant the crop after it was first picked", () => {
    expect(state().setPlantingDates("p1", { from: "2026-07-13", to: "2026-09-30" })).toBe(false)
    expect(planting()?.inGround).toEqual(TOMATO.inGround)
  })

  it("refuses to end the crop before it was last picked", () => {
    expect(state().setPlantingDates("p1", { from: "2026-05-01", to: "2026-08-19" })).toBe(false)
    expect(planting()?.inGround).toEqual(TOMATO.inGround)
  })

  it("still moves the dates around the harvests", () => {
    expect(state().setPlantingDates("p1", { from: "2026-07-12", to: "2026-08-20" })).toBe(true)
  })
})

describe("notes", () => {
  it("keeps a note on a planting, line breaks and all", () => {
    expect(state().setPlantingNotes("p1", "Blight in August.\nTry another variety.")).toBe(true)
    expect(planting()?.notes).toBe("Blight in August.\nTry another variety.")
  })

  it("keeps a note on the garden", () => {
    expect(state().setPlanNotes("The well ran dry in July.")).toBe(true)
    expect(state().plan.notes).toBe("The well ran dry in July.")
  })

  it("drops the space left at the end of a note", () => {
    state().setPlantingNotes("p1", "Slugs.  \n\n")
    expect(planting()?.notes).toBe("Slugs.")
  })

  it("leaves no trace of a note that was emptied", () => {
    state().setPlantingNotes("p1", "Slugs.")
    state().setPlanNotes("Dry year.")
    expect(state().setPlantingNotes("p1", "  ")).toBe(true)
    expect(state().setPlanNotes("")).toBe(true)
    expect(planting()).toEqual(TOMATO)
    expect(state().plan).not.toHaveProperty("notes")
  })

  it("refuses a note longer than the plan holds", () => {
    expect(state().setPlantingNotes("p1", "x".repeat(2001))).toBe(false)
    expect(state().setPlanNotes("x".repeat(5001))).toBe(false)
    expect(state().setPlantingNotes("p1", "x".repeat(2000))).toBe(true)
  })

  it("adds no undo step when the note is the same", () => {
    state().setPlantingNotes("p1", "Slugs.")
    expect(state().setPlantingNotes("p1", "Slugs. ")).toBe(false)
    expect(state().setPlanNotes(" ")).toBe(false)
    expect(editorStore.temporal.getState().pastStates).toHaveLength(1)
  })

  it("is one undo step", () => {
    state().setPlantingNotes("p1", "Slugs.")
    undo()
    expect(planting()).toEqual(TOMATO)
  })
})

describe("setPlantingVariety", () => {
  it("names the variety, without the space around what was typed", () => {
    expect(state().setPlantingVariety("p1", "  Coração de Boi ")).toBe(true)
    expect(planting()?.variety).toBe("Coração de Boi")
  })

  it("leaves no trace of a variety that was emptied", () => {
    state().setPlantingVariety("p1", "Roma")
    expect(state().setPlantingVariety("p1", " ")).toBe(true)
    expect(planting()).toEqual(TOMATO)
  })

  it("refuses a name longer than the plan holds, and one that changes nothing", () => {
    expect(state().setPlantingVariety("p1", "x".repeat(61))).toBe(false)
    state().setPlantingVariety("p1", "Roma")
    expect(state().setPlantingVariety("p1", "Roma ")).toBe(false)
    expect(editorStore.temporal.getState().pastStates).toHaveLength(1)
  })
})

describe("the view of the canvas", () => {
  // The store outlives each test: leave the view as a new canvas would find it.
  afterEach(() => {
    state().reportView({ canZoomIn: true, canZoomOut: true, fitted: true })
  })

  it("starts fitted to the garden, free to zoom either way", () => {
    expect(state().view).toEqual({ canZoomIn: true, canZoomOut: true, fitted: true })
  })

  it("passes a request on to the canvas, a new one each time it is asked", () => {
    state().requestView("zoom-in")
    const first = state().viewRequest
    expect(first).toEqual({ action: "zoom-in" })
    state().requestView("zoom-in")
    expect(state().viewRequest).toEqual({ action: "zoom-in" })
    expect(state().viewRequest).not.toBe(first)
  })

  it("keeps what the canvas reports", () => {
    state().reportView({ canZoomIn: false, canZoomOut: true, fitted: false })
    expect(state().view).toEqual({ canZoomIn: false, canZoomOut: true, fitted: false })
  })

  it("tells nobody when the canvas reports what is already known", () => {
    const listener = vi.fn()
    const unsubscribe = editorStore.subscribe(listener)
    state().reportView({ ...state().view })
    unsubscribe()
    expect(listener).not.toHaveBeenCalled()
  })

  it("is not something to undo or to save", () => {
    const plan = state().plan
    state().requestView("fit")
    state().reportView({ canZoomIn: true, canZoomOut: false, fitted: false })
    expect(state().plan).toBe(plan)
    expect(editorStore.temporal.getState().pastStates).toHaveLength(0)
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
    expect(state().selection).toEqual([{ kind: "planting", id: copy?.id }])
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

describe("the view date", () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it("starts unset, showing the whole plan", () => {
    expect(state().viewDate).toBeNull()
    expect(shownPlan(state())).toBe(state().plan)
  })

  it("narrows the shown plan to the crops in the ground that day", () => {
    state().setViewDate("2026-12-25")
    expect(shownPlan(state()).plantings).toEqual([])
    expect(shownPlan(state()).beds).toEqual([BED])

    state().setViewDate("2026-06-01")
    expect(shownPlan(state()).plantings).toEqual([TOMATO])
  })

  it("is cleared by null or by something that is not a date", () => {
    state().setViewDate("2026-06-01")
    state().setViewDate(null)
    expect(state().viewDate).toBeNull()

    state().setViewDate("2026-06-01")
    state().setViewDate("")
    expect(state().viewDate).toBeNull()
  })

  it("is not an undo step and does not change the plan", () => {
    const { plan } = state()
    state().setViewDate("2026-06-01")
    expect(state().plan).toBe(plan)
    expect(editorStore.temporal.getState().pastStates).toHaveLength(0)
  })

  it("is forgotten when another plan is loaded", () => {
    state().setViewDate("2026-06-01")
    state().loadPlan(emptyPlan())
    expect(state().viewDate).toBeNull()
  })

  it("is the day a new planting goes in the ground", () => {
    state().setViewDate("2027-04-10")
    state().addPlanting("lettuce", { x: 300, y: 0, w: 100, h: 100 }, "row")
    // Lettuce is ready in 75 days at the latest.
    expect(state().plan.plantings.at(-1)?.inGround).toEqual({
      from: "2027-04-10",
      to: "2027-06-24",
    })
  })

  it("leaves a new planting starting today when no date is set", () => {
    vi.useFakeTimers({ now: new Date(2026, 10, 11, 9, 0) })
    state().addPlanting("lettuce", { x: 300, y: 0, w: 100, h: 100 }, "row")
    expect(state().plan.plantings.at(-1)?.inGround.from).toBe("2026-11-11")
  })
})

describe("a selection of several items", () => {
  const TOMATO_REF = { kind: "planting", id: "p1" } as const
  const BED_REF = { kind: "bed", id: "b1" } as const

  it("starts empty, and holds one item once one is selected", () => {
    expect(state().selection).toEqual([])
    state().select(BED_REF)
    expect(state().selection).toEqual([BED_REF])
    state().select(null)
    expect(state().selection).toEqual([])
  })

  it("adds an item, or takes it out when it is already in", () => {
    state().select(BED_REF)
    state().toggleSelected(TOMATO_REF)
    expect(state().selection).toEqual([BED_REF, TOMATO_REF])
    state().toggleSelected(BED_REF)
    expect(state().selection).toEqual([TOMATO_REF])
  })

  it("can be replaced as a whole, without the same item twice", () => {
    state().selectItems([TOMATO_REF, BED_REF, TOMATO_REF])
    expect(state().selection).toEqual([TOMATO_REF, BED_REF])
  })

  it("describes an item on its own only when it is the only one", () => {
    state().selectItems([TOMATO_REF, BED_REF])
    expect(selectedBed(state())).toBeUndefined()
    expect(selectedPlanting(state())).toBeUndefined()
    state().select(TOMATO_REF)
    expect(selectedPlanting(state())).toEqual(TOMATO)
  })

  it("moves together, in one undo step", () => {
    state().selectItems([TOMATO_REF, BED_REF])
    expect(state().moveSelection(100, 50)).toBe(true)
    expect(planting()?.rect).toMatchObject({ x: 100, y: 50 })
    expect(bed()?.rect).toMatchObject({ x: 300, y: 250 })
    undo()
    expect(planting()?.rect).toEqual(TOMATO.rect)
    expect(bed()?.rect).toEqual(BED.rect)
  })

  it("is nudged together", () => {
    state().selectItems([TOMATO_REF, BED_REF])
    expect(state().nudgeSelection(1, 1)).toBe(true)
    expect(planting()?.rect).toMatchObject({ x: 10, y: 10 })
    expect(bed()?.rect).toMatchObject({ x: 210, y: 210 })
  })

  it("is duplicated together, and the copies become the selection", () => {
    state().selectItems([TOMATO_REF, BED_REF])
    expect(state().duplicateSelection()).toBe(true)
    const copies = [state().plan.beds[1], state().plan.plantings[1]]
    expect(state().selection).toEqual([
      { kind: "bed", id: copies[0]?.id },
      { kind: "planting", id: copies[1]?.id },
    ])
  })

  it("is removed together, in one undo step", () => {
    state().selectItems([TOMATO_REF, BED_REF])
    state().removeSelection()
    expect(state().plan.beds).toEqual([])
    expect(state().plan.plantings).toEqual([])
    expect(state().selection).toEqual([])
    undo()
    expect(state().plan.beds).toHaveLength(1)
    expect(state().plan.plantings).toHaveLength(1)
  })
})

describe("picking an item on the canvas", () => {
  const TOMATO_REF = { kind: "planting", id: "p1" } as const
  const BED_REF = { kind: "bed", id: "b1" } as const

  it("selects it on its own, or nothing when the press missed", () => {
    state().selectItems([TOMATO_REF, BED_REF])
    state().pickItem(BED_REF, { adding: false })
    expect(state().selection).toEqual([BED_REF])
    state().pickItem(null, { adding: false })
    expect(state().selection).toEqual([])
  })

  it("adds it or takes it out while adding, and keeps the rest on a miss", () => {
    state().pickItem(BED_REF, { adding: true })
    state().pickItem(TOMATO_REF, { adding: true })
    expect(state().selection).toEqual([BED_REF, TOMATO_REF])
    state().pickItem(BED_REF, { adding: true })
    state().pickItem(null, { adding: true })
    expect(state().selection).toEqual([TOMATO_REF])
  })
})

describe("selecting several items by touch", () => {
  it("is a mode that a drawing tool or a new plan turns off", () => {
    state().setSelectingMany(true)
    expect(state().selectingMany).toBe(true)
    state().setTool({ kind: "bed" })
    expect(state().selectingMany).toBe(false)

    state().setTool({ kind: "select" })
    state().setSelectingMany(true)
    state().loadPlan(emptyPlan())
    expect(state().selectingMany).toBe(false)
  })

  it("puts the select tool back when it is turned on", () => {
    state().setTool({ kind: "bed" })
    state().setSelectingMany(true)
    expect(state().tool).toEqual({ kind: "select" })
  })
})
