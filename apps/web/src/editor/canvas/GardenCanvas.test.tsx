// @vitest-environment jsdom
import "../../test/setup"
import "../../i18n"
import { type Bed, emptyPlan } from "@leira/core"
import { act, fireEvent, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"
import { Inspector } from "../Inspector"
import { editorStore } from "../store"
import { GardenCanvas } from "./GardenCanvas"

// Phaser needs a real canvas: the press is what is tested here, not the drawing.
vi.mock("./createGardenCanvas", () => ({ createGardenCanvas: () => ({ destroy() {} }) }))

const bed = (id: string, x: number): Bed => ({
  id,
  name: "",
  kind: "bed",
  rect: { x, y: 0, w: 100, h: 100 },
})

describe("a press on the garden", () => {
  it("first stores what a field holds, so it names the item it was typed for", async () => {
    editorStore.getState().loadPlan({ ...emptyPlan(), beds: [bed("a", 0), bed("b", 200)] })
    editorStore.getState().select({ kind: "bed", id: "a" })
    render(
      <>
        <GardenCanvas />
        <Inspector />
      </>
    )
    await userEvent.type(screen.getByRole("textbox", { name: "Name" }), "Salad bar")

    // A touch on the canvas moves no focus by itself: the canvas takes the
    // touch for its own. The press starts with a pointer event all the same,
    // and the scene picks the bed under it when the finger lifts.
    fireEvent.pointerDown(screen.getByTestId("garden-canvas"))
    act(() => editorStore.getState().select({ kind: "bed", id: "b" }))

    expect(editorStore.getState().plan.beds.map((item) => item.name)).toEqual(["Salad bar", ""])
  })
})
