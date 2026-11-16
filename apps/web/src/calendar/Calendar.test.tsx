// @vitest-environment jsdom
import "../test/setup"
import "../i18n"
import { emptyPlan, type GardenPlan, type Planting } from "@leira/core"
import { fireEvent, render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { editorStore } from "../editor/store"
import { Calendar, PlanCalendar } from "./Calendar"

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

describe("the jobs", () => {
  const jobs = () =>
    within(screen.getByRole("list", { name: "Jobs" }))
      .getAllByRole("listitem")
      .map((job) => job.textContent)
  const stored = () => editorStore.getState().plan.plantings[0]

  it("lists the jobs of the next 30 days, soonest first", () => {
    // Today is 20 April 2026.
    show([TOMATOES, CARROTS, planting("beans", "green-bean", "2026-05-20", "2026-07-24")])
    expect(jobs()).toEqual(["May 1Plant out Tomato", "May 20Sow Green bean"])
  })

  it("keeps a job of the last 30 days on the list, marked overdue", () => {
    show([
      planting("today", "carrot", "2026-04-20", "2026-08-08"),
      planting("yesterday", "carrot", "2026-04-19", "2026-08-07"),
      planting("a month ago", "carrot", "2026-03-21", "2026-07-09"),
      planting("longer ago", "carrot", "2026-03-20", "2026-07-08"),
    ])
    expect(jobs()).toEqual([
      "Mar 21Sow Carrotoverdue",
      "Apr 19Sow Carrotoverdue",
      "Apr 20Sow Carrot",
    ])
  })

  it("says so when there is nothing to do", () => {
    show([NEXT_YEAR])
    expect(screen.getByText("Nothing to do in the next 30 days.")).toBeVisible()
  })

  it("marks a job done today when it is ticked", async () => {
    show([planting("late", "carrot", "2026-04-15", "2026-08-03")])
    await userEvent.click(screen.getByRole("checkbox", { name: "Sow Carrot" }))

    expect(stored()).toMatchObject({
      planted: true,
      inGround: { from: "2026-04-20", to: "2026-08-03" },
    })
    expect(screen.getByRole("checkbox", { name: "Sow Carrot" })).toBeChecked()
    expect(jobs()).toEqual(["Apr 20Sow Carrot"])
  })

  it("marks a job done ahead of its day", async () => {
    show([planting("soon", "carrot", "2026-04-25", "2026-08-13")])
    await userEvent.click(screen.getByRole("checkbox", { name: "Sow Carrot" }))
    expect(stored()?.inGround.from).toBe("2026-04-20")
  })

  it("records a sowing of seedlings on its planned day when today is too late for it", async () => {
    // Cucumber: 3 weeks indoors. Due out two days ago, so the seedlings cannot be sown today.
    show([planting("cucumbers", "cucumber", "2026-04-18", "2026-08-30")])
    expect(jobs()).toEqual(["Mar 28Sow Cucumber indoorsoverdue", "Apr 18Plant out Cucumberoverdue"])

    await userEvent.click(screen.getByRole("checkbox", { name: "Sow Cucumber indoors" }))
    expect(stored()?.sowDate).toBe("2026-03-28")
    expect(screen.getByRole("checkbox", { name: "Sow Cucumber indoors" })).toBeChecked()
  })

  it("lets the day of a done job be corrected, up to today", async () => {
    show([planting("late", "carrot", "2026-04-15", "2026-08-03")])
    expect(screen.queryByLabelText("Sow Carrot: done on")).toBeNull()
    await userEvent.click(screen.getByRole("checkbox", { name: "Sow Carrot" }))

    const day = screen.getByLabelText("Sow Carrot: done on")
    expect(day).toHaveValue("2026-04-20")
    expect(day).toHaveAttribute("max", "2026-04-20")
    fireEvent.change(day, { target: { value: "2026-04-17" } })
    expect(stored()?.inGround.from).toBe("2026-04-17")
    expect(jobs()).toEqual(["Apr 17Sow Carrot"])
  })

  it("puts a job back to do when it is unticked", async () => {
    show([{ ...planting("done", "carrot", "2026-04-15", "2026-08-03"), planted: true }])
    await userEvent.click(screen.getByRole("checkbox", { name: "Sow Carrot" }))

    expect(stored()).not.toHaveProperty("planted")
    expect(jobs()).toEqual(["Apr 15Sow Carrotoverdue"])
  })

  it("starts the harvest when its job is ticked, and leaves undoing it to the planting", async () => {
    // Carrot: first picking after 70 days, so 21 April for one sown on 10 February.
    show([{ ...planting("ready", "carrot", "2026-02-10", "2026-06-30"), planted: true }])
    await userEvent.click(screen.getByRole("checkbox", { name: "Start picking Carrot" }))

    expect(stored()?.harvests).toEqual([{ date: "2026-04-20" }])
    expect(screen.getByRole("checkbox", { name: "Start picking Carrot" })).toBeDisabled()
    expect(screen.queryByLabelText("Start picking Carrot: done on")).toBeNull()
  })

  it("shows what was done without offering to change it, when it cannot change the plan", () => {
    const plan: GardenPlan = {
      ...emptyPlan(),
      plantings: [
        { ...planting("done", "carrot", "2026-04-15", "2026-08-03"), planted: true },
        planting("late", "carrot", "2026-04-18", "2026-08-06"),
      ],
    }
    render(<PlanCalendar plan={plan} />)
    expect(jobs()).toEqual(["Apr 15Sow Carrotdone", "Apr 18Sow Carrotoverdue"])
    expect(screen.queryByRole("checkbox")).toBeNull()
    expect(screen.queryByLabelText(/done on/)).toBeNull()
  })
})
