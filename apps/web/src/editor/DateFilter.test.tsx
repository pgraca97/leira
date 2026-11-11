// @vitest-environment jsdom
import "../test/setup"
import "../i18n"
import { emptyPlan } from "@garden/core"
import { fireEvent, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it } from "vitest"
import { DateFilter } from "./DateFilter"
import { editorStore } from "./store"

beforeEach(() => {
  editorStore.getState().loadPlan(emptyPlan())
  render(<DateFilter />)
})

describe("DateFilter", () => {
  it("shows the whole plan until a day is picked", () => {
    expect(screen.getByLabelText("Show the garden on")).toHaveValue("")
    expect(screen.queryByRole("button", { name: "Show everything" })).toBeNull()
  })

  it("shows the garden on the day the user picks", () => {
    fireEvent.change(screen.getByLabelText("Show the garden on"), {
      target: { value: "2027-04-10" },
    })
    expect(editorStore.getState().viewDate).toBe("2027-04-10")
  })

  it("goes back to the whole plan", async () => {
    editorStore.getState().setViewDate("2027-04-10")
    await userEvent.click(await screen.findByRole("button", { name: "Show everything" }))
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
})
