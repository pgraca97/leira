// @vitest-environment jsdom
import "../test/setup"
import "../i18n"
import { emptyPlan, type GardenPlan } from "@leira/core"
import { act, render, screen } from "@testing-library/react"
import { beforeEach, describe, expect, it } from "vitest"
import { editorStore } from "../editor/store"
import { PrintSheet } from "./PrintSheet"

/** Tomatoes one summer, potatoes in the same spot the next spring. */
const twoYears: GardenPlan = {
  ...emptyPlan(),
  plantings: [
    {
      id: "p1",
      plantId: "tomato",
      rect: { x: 100, y: 100, w: 100, h: 100 },
      layout: "block",
      inGround: { from: "2026-05-01", to: "2026-09-30" },
    },
    {
      id: "p2",
      plantId: "potato",
      rect: { x: 100, y: 100, w: 100, h: 100 },
      layout: "block",
      inGround: { from: "2027-03-01", to: "2027-07-15" },
    },
  ],
}

beforeEach(() => {
  editorStore.getState().loadPlan(twoYears)
  editorStore.getState().setViewDate(null)
  render(<PrintSheet gardenName="Allotment 12" />)
})

describe("PrintSheet", () => {
  it("lists every planting while the whole plan is shown", () => {
    expect(screen.getByRole("row", { name: /Tomato/ })).toBeInTheDocument()
    expect(screen.getByRole("row", { name: /Potato/ })).toBeInTheDocument()
    expect(screen.queryByText(/^On /)).toBeNull()
  })

  it("prints only what is in the ground on the day shown, and says which day", () => {
    act(() => editorStore.getState().setViewDate("2027-04-10"))
    expect(screen.getByRole("row", { name: /Potato/ })).toBeInTheDocument()
    expect(screen.queryByRole("row", { name: /Tomato/ })).toBeNull()
    expect(screen.getByText("On Apr 10, 2027")).toBeInTheDocument()
    // The picture follows the day too.
    const picture = screen.getByRole("img", { name: "Allotment 12" })
    expect(picture).toHaveTextContent("Potato")
    expect(picture).not.toHaveTextContent("Tomato")
  })

  it("adds what the garden gave in the year of the day shown", () => {
    const [tomato, potato] = twoYears.plantings
    act(() => {
      editorStore.getState().loadPlan({
        ...twoYears,
        plantings: [
          { ...tomato!, harvests: [{ date: "2026-07-01", quantity: 2, unit: "kg" }] },
          potato!,
        ],
      })
      editorStore.getState().setViewDate("2026-07-15")
    })
    const table = screen.getByRole("table", { name: "Harvested in 2026" })
    expect(table).toHaveTextContent("Tomato2 kg1")
  })
})
