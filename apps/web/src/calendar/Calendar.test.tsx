// @vitest-environment jsdom
import "../test/setup"
import "../i18n"
import { emptyPlan, type Planting } from "@leira/core"
import { render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { editorStore } from "../editor/store"
import { Calendar } from "./Calendar"

function planting(id: string, plantId: string, from: string, to: string): Planting {
  return {
    id,
    plantId,
    rect: { x: 0, y: 0, w: 100, h: 100 },
    layout: "block",
    inGround: { from, to },
  }
}

// Tomato: 6 weeks indoors, first picking 60 days after planting out.
const TOMATOES = planting("tomatoes", "tomato", "2026-05-01", "2026-09-30")
// Carrot: sown direct, first picking after 70 days.
const CARROTS = planting("carrots", "carrot", "2026-03-15", "2026-07-03")
const NEXT_YEAR = planting("next", "lettuce", "2027-04-01", "2027-06-01")

let opened: string[]

function show(plantings: Planting[]) {
  editorStore.getState().loadPlan({ ...emptyPlan(), plantings })
  opened = []
  render(<Calendar onOpenPlanting={(id) => opened.push(id)} />)
}

beforeEach(() => {
  // Only the clock is faked, so timers that the test tools rely on keep running.
  vi.useFakeTimers({ now: new Date(2026, 3, 20, 10, 0), toFake: ["Date"] })
})

afterEach(() => {
  vi.useRealTimers()
})

describe("the year's plantings", () => {
  it("opens on the current year", () => {
    show([TOMATOES])
    expect(screen.getByRole("heading", { name: "2026" })).toBeVisible()
  })

  it("describes each planting's stages, earliest in the ground first", () => {
    show([TOMATOES, CARROTS])
    const rows = within(screen.getByRole("list", { name: "Plantings in 2026" })).getAllByRole(
      "button"
    )
    expect(rows.map((row) => row.getAttribute("aria-label"))).toEqual([
      "Carrot × 400: in the ground Mar 15 to Jul 3, picking from May 24",
      "Tomato × 4: sown indoors Mar 20, in the ground May 1 to Sep 30, picking from Jun 30",
    ])
  })

  it("leaves out plantings of other years until the user goes there", async () => {
    show([TOMATOES, NEXT_YEAR])
    expect(screen.queryByRole("button", { name: /^Lettuce/ })).toBeNull()

    await userEvent.click(screen.getByRole("button", { name: "Next year" }))
    expect(screen.getByRole("heading", { name: "2027" })).toBeVisible()
    expect(screen.getByRole("button", { name: /^Lettuce/ })).toBeVisible()
    expect(screen.queryByRole("button", { name: /^Tomato/ })).toBeNull()

    await userEvent.click(screen.getByRole("button", { name: "Previous year" }))
    expect(screen.getByRole("button", { name: /^Tomato/ })).toBeVisible()
  })

  it("shows a crop raised indoors late in the year before it is planted out", async () => {
    // Onion: 8 weeks indoors. Planted out in January, so the seedlings start in November.
    show([planting("onions", "onion", "2027-01-10", "2027-06-01")])
    expect(screen.getByRole("button", { name: /^Onion/ })).toBeVisible()
  })

  it("says so when nothing is planted that year", () => {
    show([NEXT_YEAR])
    expect(screen.getByText("Nothing is planted in 2026.")).toBeVisible()
  })

  it("opens a planting on the plan when its row is clicked", async () => {
    show([TOMATOES, CARROTS])
    await userEvent.click(screen.getByRole("button", { name: /^Carrot/ }))
    expect(opened).toEqual(["carrots"])
  })
})

describe("coming up", () => {
  it("lists the jobs of the next 30 days, soonest first", () => {
    // Today is 20 April 2026.
    show([TOMATOES, CARROTS, planting("beans", "green-bean", "2026-05-20", "2026-07-24")])
    const tasks = within(screen.getByRole("list", { name: "Coming up" })).getAllByRole("listitem")
    expect(tasks.map((task) => task.textContent)).toEqual([
      "May 1Plant out Tomato",
      "May 20Sow Green bean",
    ])
  })

  it("includes today's jobs and leaves out yesterday's", () => {
    show([
      planting("today", "carrot", "2026-04-20", "2026-08-08"),
      planting("yesterday", "carrot", "2026-04-19", "2026-08-07"),
    ])
    const tasks = within(screen.getByRole("list", { name: "Coming up" })).getAllByRole("listitem")
    expect(tasks.map((task) => task.textContent)).toEqual(["Apr 20Sow Carrot"])
  })

  it("says so when there is nothing to do", () => {
    show([NEXT_YEAR])
    expect(screen.getByText("Nothing to do in the next 30 days.")).toBeVisible()
  })
})
