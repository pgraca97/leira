// @vitest-environment jsdom
import "../test/setup"
import "../i18n"
import { emptyPlan, type Planting } from "@leira/core"
import { fireEvent, render, screen, within } from "@testing-library/react"
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

describe("the harvests of a planting", () => {
  const GROWING = planting("2026-03-01", "2026-09-30", { planted: true })
  const PICKED = planting("2026-03-01", "2026-09-30", {
    harvests: [
      { date: "2026-06-12", quantity: 1.2, unit: "kg" },
      { date: "2026-06-20" },
      { date: "2026-06-24", quantity: 12, unit: "units" },
      { date: "2026-06-28", quantity: 3.5, unit: "kg" },
    ],
  })

  const harvests = () =>
    within(screen.getByRole("list", { name: "Harvests" }))
      .getAllByRole("listitem")
      // The words of each line, without the cross on its delete button.
      .map((harvest) => harvest.textContent?.replace("×", ""))

  async function record(amount: string) {
    if (amount) await userEvent.type(screen.getByLabelText("Amount"), amount)
    await userEvent.click(screen.getByRole("button", { name: "Record harvest" }))
  }

  it("records a harvest with its amount, picked today unless another day is given", async () => {
    show(GROWING)
    expect(screen.getByLabelText("Picked on")).toHaveValue("2026-07-01")
    await record("1,5")

    expect(stored()?.harvests).toEqual([{ date: "2026-07-01", quantity: 1.5, unit: "kg" }])
    expect(harvests()).toEqual(["Jul 1, 20261.5 kg"])
    expect(screen.getByLabelText("Amount")).toHaveValue("")
  })

  it.each(["1.5", " 1,5 "])("reads %j as one and a half", async (typed) => {
    show(GROWING)
    await record(typed)
    expect(stored()?.harvests?.[0]?.quantity).toBe(1.5)
  })

  it("records a harvest with no amount", async () => {
    show(GROWING)
    await record("")

    expect(stored()?.harvests).toEqual([{ date: "2026-07-01" }])
    expect(harvests()).toEqual(["Jul 1, 2026no amount"])
  })

  it("counts what is not weighed", async () => {
    show(GROWING)
    await userEvent.selectOptions(screen.getByLabelText("Unit"), "units")
    await record("12")

    expect(stored()?.harvests).toEqual([{ date: "2026-07-01", quantity: 12, unit: "units" }])
    expect(harvests()).toEqual(["Jul 1, 202612 units"])
  })

  it.each(["0", "-2", "abc", "20000", "1,5,2", "1e3"])(
    "refuses %j as an amount, and says what a harvest needs",
    async (typed) => {
      show(GROWING)
      await record(typed)

      expect(screen.getByRole("alert")).toHaveTextContent("an amount above 0, up to 10000")
      expect(stored()).not.toHaveProperty("harvests")
      // What was typed stays, to be corrected.
      expect(screen.getByLabelText("Amount")).toHaveValue(typed)
    }
  )

  it("refuses a harvest from before the crop went in", async () => {
    show(GROWING)
    expect(screen.getByLabelText("Picked on")).toHaveAttribute("min", "2026-03-01")
    fireEvent.change(screen.getByLabelText("Picked on"), { target: { value: "2026-02-20" } })
    await record("2")

    expect(screen.getByRole("alert")).toBeVisible()
    expect(stored()).not.toHaveProperty("harvests")
  })

  it("stops saying so once a harvest is recorded", async () => {
    show(GROWING)
    await record("abc")
    await userEvent.clear(screen.getByLabelText("Amount"))
    await record("2")

    expect(screen.queryByRole("alert")).toBeNull()
  })

  it("keeps the crop in the ground until a harvest later than its planned last day", async () => {
    show(planting("2026-03-01", "2026-06-20"))
    await record("2")

    expect(screen.getByLabelText("Until")).toHaveValue("2026-07-01")
  })

  it("lists the harvests oldest first and adds up what was picked, by unit", () => {
    show(PICKED)
    expect(harvests()).toEqual([
      "Jun 12, 20261.2 kg",
      "Jun 20, 2026no amount",
      "Jun 24, 202612 units",
      "Jun 28, 20263.5 kg",
    ])
    expect(screen.getByText("Total: 4.7 kg and 12 units")).toBeVisible()
  })

  it("gives no total when nothing was weighed or counted", () => {
    show(planting("2026-03-01", "2026-09-30", { harvests: [{ date: "2026-06-20" }] }))
    expect(screen.queryByText(/^Total/)).toBeNull()
  })

  it("deletes one harvest", async () => {
    show(PICKED)
    await userEvent.click(
      screen.getByRole("button", { name: "Delete the harvest of Jun 20, 2026" })
    )

    expect(stored()?.harvests).toHaveLength(3)
    expect(harvests()).toEqual(["Jun 12, 20261.2 kg", "Jun 24, 202612 units", "Jun 28, 20263.5 kg"])
  })

  it("shows no list for a crop not picked yet", () => {
    show(GROWING)
    expect(screen.queryByRole("list", { name: "Harvests" })).toBeNull()
  })
})
