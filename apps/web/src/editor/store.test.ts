import { emptyPlan, type Planting } from "@garden/core"
import { beforeEach, describe, expect, it } from "vitest"
import { editorStore, undo } from "./store"

const TOMATO: Planting = {
  id: "p1",
  plantId: "tomato",
  rect: { x: 0, y: 0, w: 100, h: 100 },
  layout: "block",
  inGround: { from: "2026-05-01", to: "2026-09-30" },
}

beforeEach(() => {
  editorStore.getState().loadPlan({ ...emptyPlan(), plantings: [TOMATO] })
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
