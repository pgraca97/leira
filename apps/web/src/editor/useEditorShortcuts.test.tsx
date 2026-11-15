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
