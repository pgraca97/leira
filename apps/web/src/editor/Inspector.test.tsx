// @vitest-environment jsdom
import "../test/setup"
import "../i18n"
import type { PlanItemRef } from "@garden/core"
import { type Bed, emptyPlan, type Planting } from "@garden/core"
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

const BED: Bed = { id: "b1", name: "Herbs", kind: "bed", rect: { x: 200, y: 100, w: 200, h: 100 } }
const BED_REF: PlanItemRef = { kind: "bed", id: "b1" }

function showBed() {
  editorStore.getState().loadPlan({ ...emptyPlan(), beds: [BED] })
  editorStore.getState().select(BED_REF)
  render(<Inspector />)
}

describe("the selected bed", () => {
  it("says where the bed is and how big", () => {
    showBed()
    const selected = screen.getByRole("region", { name: "Selected" })
    expect(within(selected).getByText("200 × 100 cm")).toBeVisible()
    expect(within(selected).getByText("200 cm from the left, 100 cm from the top")).toBeVisible()
  })

  it("renames the bed when the field is left", async () => {
    showBed()
    const name = screen.getByRole("textbox", { name: "Name" })
    expect(name).toHaveValue("Herbs")
    await userEvent.clear(name)
    await userEvent.type(name, "Salad bar")
    expect(editorStore.getState().plan.beds[0]?.name).toBe("Herbs")

    await userEvent.tab()
    expect(editorStore.getState().plan.beds[0]?.name).toBe("Salad bar")
  })

  it("renames the bed on Enter, as a single undo step", async () => {
    showBed()
    const name = screen.getByRole("textbox", { name: "Name" })
    await userEvent.clear(name)
    await userEvent.type(name, "Roots{Enter}")
    expect(editorStore.getState().plan.beds[0]?.name).toBe("Roots")
    expect(editorStore.temporal.getState().pastStates).toHaveLength(1)
  })

  it("drops the typed name on Escape", async () => {
    showBed()
    const name = screen.getByRole("textbox", { name: "Name" })
    await userEvent.type(name, " and more{Escape}")
    expect(name).toHaveValue("Herbs")
    await userEvent.tab()
    expect(editorStore.getState().plan.beds[0]?.name).toBe("Herbs")
  })

  it("changes what kind of area it is", async () => {
    showBed()
    await userEvent.selectOptions(screen.getByRole("combobox", { name: "Kind" }), "Greenhouse")
    expect(editorStore.getState().plan.beds[0]?.kind).toBe("greenhouse")
  })
})

describe("the selected planting's layout", () => {
  it("rearranges the plants and updates the count", async () => {
    // 100 cm × 100 cm of lettuce: rows give fewer plants than a square-foot grid.
    show([planting("p1", "lettuce", "2026-03-01", "2026-05-15")], "p1")
    const layout = screen.getByRole("combobox", { name: "Layout" })
    expect(layout).toHaveValue("block")

    await userEvent.selectOptions(layout, "Square foot")
    expect(editorStore.getState().plan.plantings[0]?.layout).toBe("sfg")
  })
})

describe("the garden's size", () => {
  it("shows the size in metres", () => {
    showBed()
    expect(screen.getByRole("textbox", { name: "Width (m)" })).toHaveValue("6")
    expect(screen.getByRole("textbox", { name: "Length (m)" })).toHaveValue("4")
  })

  it("resizes the garden, accepting a decimal comma", async () => {
    showBed()
    const width = screen.getByRole("textbox", { name: "Width (m)" })
    await userEvent.clear(width)
    await userEvent.type(width, "8,5{Enter}")
    expect(editorStore.getState().plan).toMatchObject({ widthCm: 850, heightCm: 400 })
  })

  it("refuses a size that would leave a bed outside, and says why", async () => {
    showBed()
    const width = screen.getByRole("textbox", { name: "Width (m)" })
    await userEvent.clear(width)
    await userEvent.type(width, "3{Enter}")

    expect(editorStore.getState().plan.widthCm).toBe(600)
    expect(width).toHaveValue("6")
    expect(screen.getByRole("alert")).toHaveTextContent(/large enough for everything on it/)
  })

  it("refuses something that is not a number", async () => {
    showBed()
    const length = screen.getByRole("textbox", { name: "Length (m)" })
    await userEvent.clear(length)
    await userEvent.type(length, "big{Enter}")
    expect(editorStore.getState().plan.heightCm).toBe(400)
    expect(screen.getByRole("alert")).toBeVisible()
  })
})
