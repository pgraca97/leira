// @vitest-environment jsdom
import "../test/setup"
import { type Bed, emptyPlan } from "@leira/core"
import { render } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it } from "vitest"
import { editorStore } from "./store"
import { useEditorShortcuts } from "./useEditorShortcuts"

const BED: Bed = { id: "b1", name: "", kind: "bed", rect: { x: 200, y: 100, w: 200, h: 100 } }

function Shortcuts() {
  useEditorShortcuts()
  return <input aria-label="field" />
}

const bedRect = () => editorStore.getState().plan.beds[0]?.rect

beforeEach(() => {
  editorStore.getState().loadPlan({ ...emptyPlan(), beds: [BED] })
  editorStore.getState().select({ kind: "bed", id: "b1" })
  render(<Shortcuts />)
})

describe("editor shortcuts", () => {
  it("nudges the selection one cell with the arrow keys", async () => {
    await userEvent.keyboard("{ArrowRight}{ArrowDown}")
    expect(bedRect()).toEqual({ x: 210, y: 110, w: 200, h: 100 })
    await userEvent.keyboard("{ArrowLeft}{ArrowUp}")
    expect(bedRect()).toEqual(BED.rect)
  })

  it("nudges ten cells with Shift held", async () => {
    await userEvent.keyboard("{Shift>}{ArrowLeft}{/Shift}")
    expect(bedRect()).toEqual({ x: 100, y: 100, w: 200, h: 100 })
  })

  it("duplicates the selection with Ctrl+D", async () => {
    await userEvent.keyboard("{Control>}d{/Control}")
    expect(editorStore.getState().plan.beds).toHaveLength(2)
  })

  it("leaves the keys alone while the user types in a field", async () => {
    await userEvent.click(document.querySelector("input") as HTMLInputElement)
    await userEvent.keyboard("{ArrowRight}{Control>}d{/Control}")
    expect(bedRect()).toEqual(BED.rect)
    expect(editorStore.getState().plan.beds).toHaveLength(1)
  })
})

describe("selecting everything", () => {
  it("selects every item shown with Ctrl+A", async () => {
    const crop = {
      id: "p1",
      plantId: "lettuce",
      rect: { x: 0, y: 0, w: 50, h: 50 },
      layout: "row" as const,
      inGround: { from: "2026-03-01", to: "2026-05-15" },
    }
    editorStore.getState().loadPlan({ ...emptyPlan(), beds: [BED], plantings: [crop] })
    await userEvent.keyboard("{Control>}a{/Control}")
    expect(editorStore.getState().selection).toEqual([
      { kind: "bed", id: "b1" },
      { kind: "planting", id: "p1" },
    ])
  })

  it("leaves out crops not in the ground on the day shown", async () => {
    const crop = {
      id: "p1",
      plantId: "lettuce",
      rect: { x: 0, y: 0, w: 50, h: 50 },
      layout: "row" as const,
      inGround: { from: "2026-03-01", to: "2026-05-15" },
    }
    editorStore.getState().loadPlan({ ...emptyPlan(), beds: [BED], plantings: [crop] })
    editorStore.getState().setViewDate("2026-08-01")
    await userEvent.keyboard("{Control>}a{/Control}")
    expect(editorStore.getState().selection).toEqual([{ kind: "bed", id: "b1" }])
  })
})

describe("Escape", () => {
  it("first stops selecting several by touch, then clears the selection", async () => {
    editorStore.getState().setSelectingMany(true)
    await userEvent.keyboard("{Escape}")
    expect(editorStore.getState().selectingMany).toBe(false)
    expect(editorStore.getState().selection).toHaveLength(1)
    await userEvent.keyboard("{Escape}")
    expect(editorStore.getState().selection).toEqual([])
  })
})
