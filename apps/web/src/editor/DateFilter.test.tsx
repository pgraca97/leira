// @vitest-environment jsdom
import "../test/setup"
import "../i18n"
import { emptyPlan, type GardenPlan, toIsoDate } from "@leira/core"
import { fireEvent, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it } from "vitest"
import { EditorDateFilter } from "./DateFilter"
import { editorStore } from "./store"

const LETTUCE = {
  id: "lettuce",
  plantId: "lettuce",
  rect: { x: 0, y: 0, w: 100, h: 100 },
  layout: "row" as const,
  inGround: { from: "2027-03-15", to: "2027-05-30" },
}

function open(plan: GardenPlan) {
  editorStore.getState().loadPlan(plan)
  render(<EditorDateFilter />)
}

describe("EditorDateFilter", () => {
  beforeEach(() => open(emptyPlan()))

  it("shows the garden on today when it opens", () => {
    expect(screen.getByLabelText("Show the garden on")).toHaveValue(toIsoDate(new Date()))
    expect(screen.getByRole("button", { name: "Show all" })).toBeInTheDocument()
  })

  it("shows the garden on the day the user picks", () => {
    fireEvent.change(screen.getByLabelText("Show the garden on"), {
      target: { value: "2027-04-10" },
    })
    expect(editorStore.getState().viewDate).toBe("2027-04-10")
  })

  it("goes back to the whole plan", async () => {
    editorStore.getState().setViewDate("2027-04-10")
    await userEvent.click(await screen.findByRole("button", { name: "Show all" }))
    expect(editorStore.getState().viewDate).toBeNull()
    expect(screen.getByLabelText("Show the garden on")).toHaveValue("")
  })

  it("steps a month back and forward from the day shown", async () => {
    editorStore.getState().setViewDate("2027-01-31")
    await userEvent.click(await screen.findByRole("button", { name: "Next month" }))
    // The last day of January has no match in February: stay at the month's end.
    expect(editorStore.getState().viewDate).toBe("2027-02-28")
    await userEvent.click(screen.getByRole("button", { name: "Previous month" }))
    expect(editorStore.getState().viewDate).toBe("2027-01-28")
  })

  it("says nothing of an empty day in a garden with no crops", () => {
    expect(screen.queryByText("Nothing is in the ground on this day.")).toBeNull()
  })
})

describe("EditorDateFilter on an empty day", () => {
  beforeEach(() => {
    open({ ...emptyPlan(), plantings: [LETTUCE] })
    editorStore.getState().setViewDate("2027-01-10")
  })

  it("says so, and offers the nearest day with crops", async () => {
    expect(await screen.findByText("Nothing is in the ground on this day.")).toBeInTheDocument()
    await userEvent.click(screen.getByRole("button", { name: "Show Mar 15, 2027" }))
    expect(editorStore.getState().viewDate).toBe("2027-03-15")
    expect(screen.queryByText("Nothing is in the ground on this day.")).toBeNull()
  })

  it("says nothing with the whole plan in view", async () => {
    await userEvent.click(screen.getByRole("button", { name: "Show all" }))
    expect(screen.queryByText("Nothing is in the ground on this day.")).toBeNull()
  })
})
