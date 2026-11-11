// @vitest-environment jsdom
import "../test/setup"
import "../i18n"
import { emptyPlan, type Planting } from "@garden/core"
import { fireEvent, render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it } from "vitest"
import { Inspector } from "./Inspector"
import { editorStore } from "./store"

function planting(id: string, plantId: string, from: string, to: string, x = 0): Planting {
  return {
    id,
    plantId,
    rect: { x, y: 0, w: 100, h: 100 },
    layout: "block",
    inGround: { from, to },
  }
}

function show(plantings: Planting[], selectedId?: string) {
  editorStore.getState().loadPlan({ ...emptyPlan(), plantings })
  if (selectedId) editorStore.getState().select({ kind: "planting", id: selectedId })
  render(<Inspector />)
}

describe("rotation warnings", () => {
  it("warns when a family returns to the same ground too soon", () => {
    show([
      planting("old", "tomato", "2026-05-01", "2026-09-30"),
      planting("new", "tomato", "2027-05-01", "2027-09-30"),
    ])
    const warnings = screen.getByRole("region", { name: "Crop rotation" })
    expect(within(warnings).getByRole("button")).toHaveTextContent(
      "Tomato goes where Tomato grew 1 year before. Leave 3 years between nightshades."
    )
  })

  it("selects the planting to move when its warning is clicked", async () => {
    show([
      planting("old", "tomato", "2026-05-01", "2026-09-30"),
      planting("new", "tomato", "2027-05-01", "2027-09-30"),
    ])
    const warnings = screen.getByRole("region", { name: "Crop rotation" })
    await userEvent.click(within(warnings).getByRole("button"))
    expect(editorStore.getState().selection).toEqual({ kind: "planting", id: "new" })
  })

  it("stays quiet when the plantings are on different ground", () => {
    show([
      planting("old", "tomato", "2026-05-01", "2026-09-30"),
      planting("new", "tomato", "2027-05-01", "2027-09-30", 300),
    ])
    expect(screen.queryByRole("region", { name: "Crop rotation" })).toBeNull()
  })

  it("stays quiet once the rotation is long enough", () => {
    show([
      planting("old", "tomato", "2026-05-01", "2026-09-30"),
      planting("new", "tomato", "2029-05-01", "2029-09-30"),
    ])
    expect(screen.queryByRole("region", { name: "Crop rotation" })).toBeNull()
  })
})

describe("the selected planting's dates", () => {
  it("shows when the planting is in the ground", () => {
    show([planting("p1", "tomato", "2026-05-01", "2026-09-30")], "p1")
    expect(screen.getByLabelText("In the ground from")).toHaveValue("2026-05-01")
    expect(screen.getByLabelText("Until")).toHaveValue("2026-09-30")
  })

  it("moves the planting to the dates the user picks", () => {
    show([planting("p1", "tomato", "2026-05-01", "2026-09-30")], "p1")
    fireEvent.change(screen.getByLabelText("Until"), { target: { value: "2026-10-15" } })
    expect(editorStore.getState().plan.plantings[0]?.inGround).toEqual({
      from: "2026-05-01",
      to: "2026-10-15",
    })
  })
})
