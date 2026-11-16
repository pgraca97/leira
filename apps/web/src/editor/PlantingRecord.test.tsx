// @vitest-environment jsdom
import "../test/setup"
import "../i18n"
import { emptyPlan, type Planting } from "@leira/core"
import { fireEvent, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { Inspector } from "./Inspector"
import { editorStore } from "./store"

function planting(from: string, to: string, record: Partial<Planting> = {}): Planting {
  return {
    id: "p1",
    plantId: "tomato",
    rect: { x: 0, y: 0, w: 100, h: 100 },
    layout: "block",
    inGround: { from, to },
    ...record,
  }
}

/** Shows the inspector with one planting, selected: its record is part of that panel. */
function show(selected: Planting) {
  editorStore.getState().loadPlan({ ...emptyPlan(), plantings: [selected] })
  editorStore.getState().select({ kind: "planting", id: selected.id })
  render(<Inspector />)
}

const stored = () => editorStore.getState().plan.plantings[0]

beforeEach(() => {
  // Today is 1 July 2026. Only the clock is faked, so the test tools' timers keep running.
  vi.useFakeTimers({ now: new Date(2026, 6, 1, 10, 0), toFake: ["Date"] })
})

afterEach(() => {
  vi.useRealTimers()
})

describe("marking a crop as in the ground", () => {
  it("confirms the planting day that is already there", async () => {
    show(planting("2026-05-01", "2026-09-30"))
    await userEvent.click(screen.getByRole("checkbox", { name: "In the ground" }))

    expect(stored()).toMatchObject({ planted: true, inGround: { from: "2026-05-01" } })
    expect(screen.getByRole("checkbox", { name: "In the ground" })).toBeChecked()
  })

  it("uses today for a planting day still to come", async () => {
    show(planting("2026-07-10", "2026-09-30"))
    await userEvent.click(screen.getByRole("checkbox", { name: "In the ground" }))

    expect(stored()).toMatchObject({ planted: true, inGround: { from: "2026-07-01" } })
    expect(screen.getByLabelText("In the ground from")).toHaveValue("2026-07-01")
  })

  it("takes the mark off and keeps the day", async () => {
    show(planting("2026-05-06", "2026-09-30", { planted: true }))
    await userEvent.click(screen.getByRole("checkbox", { name: "In the ground" }))

    expect(stored()).not.toHaveProperty("planted")
    expect(stored()?.inGround.from).toBe("2026-05-06")
  })
})

describe("marking a crop as cleared", () => {
  it("confirms a last day that has passed", async () => {
    show(planting("2026-03-01", "2026-06-15"))
    await userEvent.click(screen.getByRole("checkbox", { name: "Cleared" }))

    expect(stored()).toMatchObject({ cleared: true, inGround: { to: "2026-06-15" } })
  })

  it("uses today for a last day still to come", async () => {
    show(planting("2026-05-01", "2026-09-30"))
    await userEvent.click(screen.getByRole("checkbox", { name: "Cleared" }))

    expect(stored()).toMatchObject({ cleared: true, inGround: { to: "2026-07-01" } })
  })

  it("says so when the crop cannot have been cleared yet, and marks nothing", async () => {
    // Not due in the ground for another month: it cannot have come out today.
    show(planting("2026-08-01", "2026-10-30"))
    await userEvent.click(screen.getByRole("checkbox", { name: "Cleared" }))

    expect(screen.getByRole("alert")).toHaveTextContent("does not fit this planting's other dates")
    expect(stored()).not.toHaveProperty("cleared")
    expect(screen.getByRole("checkbox", { name: "Cleared" })).not.toBeChecked()
  })

  it("stops saying so once a mark is taken", async () => {
    show(planting("2026-08-01", "2026-10-30"))
    await userEvent.click(screen.getByRole("checkbox", { name: "Cleared" }))
    await userEvent.click(screen.getByRole("checkbox", { name: "In the ground" }))

    expect(screen.queryByRole("alert")).toBeNull()
  })
})

describe("changing the dates of a crop that was picked", () => {
  it("says so when the new dates leave a harvest outside them", () => {
    show(planting("2026-03-01", "2026-09-30", { harvests: [{ date: "2026-06-12" }] }))
    fireEvent.change(screen.getByLabelText("In the ground from"), {
      target: { value: "2026-06-20" },
    })

    expect(screen.getByRole("alert")).toHaveTextContent("does not fit this planting's other dates")
    expect(stored()?.inGround.from).toBe("2026-03-01")
  })

  it("stops saying so once the dates fit", () => {
    show(planting("2026-03-01", "2026-09-30", { harvests: [{ date: "2026-06-12" }] }))
    const from = screen.getByLabelText("In the ground from")
    fireEvent.change(from, { target: { value: "2026-06-20" } })
    fireEvent.change(from, { target: { value: "2026-06-10" } })

    expect(screen.queryByRole("alert")).toBeNull()
    expect(stored()?.inGround.from).toBe("2026-06-10")
  })
})
