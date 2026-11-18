// @vitest-environment jsdom
import "../test/setup"
import "../i18n"
import { type Bed, emptyPlan, type GardenPlan, type Planting } from "@leira/core"
import { fireEvent, render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { editorStore } from "../editor/store"
import { downloadText } from "../export/downloadFile"
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

vi.mock("../export/downloadFile", () => ({ downloadText: vi.fn() }))

let opened: string[]

function show(plantings: Planting[]) {
  editorStore.getState().loadPlan({ ...emptyPlan(), plantings })
  opened = []
  render(<Calendar gardenName="Back garden" onOpenPlanting={(id) => opened.push(id)} />)
}

beforeEach(() => {
  vi.mocked(downloadText).mockClear()
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

  it("names a planting's variety, on its line, in its jobs and in what to get", () => {
    show([{ ...planting("roma", "tomato", "2026-05-01", "2026-09-30"), variety: "Roma" }])
    expect(screen.getByRole("button", { name: /^Tomato 'Roma' × 4:/ })).toBeVisible()
    expect(screen.getByRole("checkbox", { name: "Plant out Tomato 'Roma'" })).toBeVisible()
    expect(
      within(screen.getByRole("list", { name: /^To get for/ })).getByRole("listitem")
    ).toHaveTextContent("Tomato 'Roma'4 plants")
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

  it("shows the year of the day the plan is shown on", () => {
    editorStore.getState().loadPlan({ ...emptyPlan(), plantings: [TOMATOES, NEXT_YEAR] })
    editorStore.getState().setViewDate("2027-05-01")
    render(<Calendar gardenName="Back garden" onOpenPlanting={() => {}} />)
    expect(screen.getByRole("heading", { name: "2027" })).toBeVisible()
  })

  it("moves the plan's day a year with it, so both show the same season", async () => {
    show([TOMATOES])
    await userEvent.click(screen.getByRole("button", { name: "Next year" }))
    expect(editorStore.getState().viewDate).toBe("2027-04-20")
  })

  it("starts from today when the plan shows every season", async () => {
    show([TOMATOES])
    editorStore.getState().setViewDate(null)
    await userEvent.click(screen.getByRole("button", { name: "Previous year" }))
    expect(screen.getByRole("heading", { name: "2025" })).toBeVisible()
    expect(editorStore.getState().viewDate).toBe("2025-04-20")
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

  it("points to the year that has crops when the one shown has none", async () => {
    show([NEXT_YEAR])
    await userEvent.click(screen.getByRole("button", { name: "Go to 2027" }))
    expect(screen.getByRole("heading", { name: "2027" })).toBeVisible()
    expect(editorStore.getState().viewDate).toBe("2027-04-01")
  })

  it("opens a planting on the plan when its row is clicked", async () => {
    show([TOMATOES, CARROTS])
    await userEvent.click(screen.getByRole("button", { name: /^Carrot/ }))
    expect(opened).toEqual(["carrots"])
  })
})

describe("the crops being picked", () => {
  // Sown on 20 January, so picking began on 31 March; 1.5 kg recorded so far.
  const PICKING: Planting = {
    ...planting("picking", "carrot", "2026-01-20", "2026-07-03"),
    planted: true,
    harvests: [{ date: "2026-04-10", quantity: 1.5, unit: "kg" }],
  }
  const picking = () => screen.getByRole("region", { name: "Picking now" })

  it("lists each one with what it gave so far", () => {
    show([PICKING, TOMATOES])
    const rows = within(picking()).getAllByRole("listitem")
    expect(rows).toHaveLength(1)
    expect(rows[0]).toHaveTextContent("Carrot × 400")
    expect(rows[0]).toHaveTextContent("1.5 kg")
  })

  it("records another harvest in a few taps, picked today", async () => {
    show([PICKING])
    await userEvent.click(
      within(picking()).getByRole("button", { name: "Record harvest: Carrot × 400" })
    )
    await userEvent.type(within(picking()).getByLabelText("Amount"), "2")
    await userEvent.click(within(picking()).getByRole("button", { name: "Record harvest" }))

    expect(editorStore.getState().plan.plantings[0]?.harvests).toEqual([
      { date: "2026-04-10", quantity: 1.5, unit: "kg" },
      { date: "2026-04-20", quantity: 2, unit: "kg" },
    ])
    // The form closes, and the total counts the new one.
    expect(within(picking()).queryByLabelText("Amount")).toBeNull()
    expect(picking()).toHaveTextContent("3.5 kg")
  })

  it("closes the form without recording anything", async () => {
    show([PICKING])
    await userEvent.click(within(picking()).getByRole("button", { name: /^Record harvest:/ }))
    await userEvent.click(within(picking()).getByRole("button", { name: "Cancel" }))
    expect(within(picking()).queryByLabelText("Amount")).toBeNull()
    expect(editorStore.getState().plan.plantings[0]?.harvests).toHaveLength(1)
  })

  it("is left out when nothing is being picked", () => {
    show([TOMATOES])
    expect(screen.queryByRole("region", { name: "Picking now" })).toBeNull()
  })

  it("is left out where the plan cannot change", () => {
    render(
      <PlanCalendar
        plan={{ ...emptyPlan(), plantings: [PICKING] }}
        day={null}
        onDayChange={() => {}}
      />
    )
    expect(screen.queryByRole("region", { name: "Picking now" })).toBeNull()
  })
})

describe("what the garden gave", () => {
  const ROMA: Planting = {
    ...TOMATOES,
    variety: "Roma",
    harvests: [{ date: "2026-07-01", quantity: 1.5, unit: "kg" }, { date: "2026-07-10" }],
  }
  const PULLED: Planting = {
    ...CARROTS,
    harvests: [{ date: "2026-06-01", quantity: 20, unit: "units" }],
  }
  const rows = () =>
    within(screen.getByRole("table", { name: "Harvested in 2026" }))
      .getAllByRole("row")
      .map((row) => row.textContent)

  it("adds up the year's harvests by crop and variety, and in all", () => {
    show([PULLED, ROMA])
    expect(rows()).toEqual([
      "CropPickedHarvests",
      "Tomato 'Roma'1.5 kg2",
      "Carrot20 units1",
      "Total1.5 kg and 20 units3",
    ])
  })

  it("follows the year shown", async () => {
    show([PULLED, ROMA])
    await userEvent.click(screen.getByRole("button", { name: "Next year" }))
    expect(screen.queryByRole("table", { name: /^Harvested in/ })).toBeNull()
  })

  it("counts the harvests where the amounts are not shared", () => {
    const counted = { ...ROMA, harvests: [{ date: "2026-07-01" }, { date: "2026-07-10" }] }
    render(
      <PlanCalendar
        plan={{ ...emptyPlan(), plantings: [counted] }}
        day={null}
        onDayChange={() => {}}
      />
    )
    expect(rows()).toEqual(["CropPickedHarvests", "Tomato 'Roma'2", "Total2"])
  })

  it("is left out of a year with no harvests", () => {
    show([TOMATOES])
    expect(screen.queryByRole("table", { name: /^Harvested in/ })).toBeNull()
  })
})

describe("a perennial", () => {
  // Strawberries in for three years from October 2025, picked April to June.
  const BED = planting("bed", "strawberry", "2025-10-01", "2028-09-30")

  it("shows its years in the ground and this year's picking", () => {
    show([BED])
    expect(screen.getByRole("button", { name: /^Strawberry/ })).toHaveAccessibleName(
      /: perennial, in the ground Oct 1, 2025 to Sep 30, 2028, picking Apr 1 to Jun 30$/
    )
  })

  it("has a picking job each spring and is renewed at the end, not cleared", () => {
    const ending = planting("ending", "strawberry", "2023-05-01", "2026-05-10")
    show([ending])
    const jobs = within(screen.getByRole("list", { name: "Jobs" }))
      .getAllByRole("listitem")
      .map((job) => job.textContent)
    expect(jobs).toEqual([
      expect.stringContaining("Start picking Strawberry"),
      expect.stringContaining("Renew Strawberry"),
    ])
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

  it("does not take a job that cannot have been done yet, and says why", async () => {
    // Sown in five days' time and out again in May: it cannot have been cleared today.
    show([planting("short", "carrot", "2026-04-25", "2026-05-10")])
    expect(jobs()).toEqual(["Apr 25Sow Carrot", "May 10Clear Carrotnot in the ground yet"])
    expect(screen.getByRole("checkbox", { name: "Clear Carrot" })).toBeDisabled()

    // Once it is in the ground, it can come out.
    await userEvent.click(screen.getByRole("checkbox", { name: "Sow Carrot" }))
    expect(screen.getByRole("checkbox", { name: "Clear Carrot" })).toBeEnabled()
    await userEvent.click(screen.getByRole("checkbox", { name: "Clear Carrot" }))
    expect(stored()).toMatchObject({
      cleared: true,
      inGround: { from: "2026-04-20", to: "2026-04-20" },
    })
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
    render(<PlanCalendar plan={plan} day={null} onDayChange={() => {}} />)
    expect(jobs()).toEqual(["Apr 15Sow Carrotdone", "Apr 18Sow Carrotoverdue"])
    expect(screen.queryByRole("checkbox")).toBeNull()
    expect(screen.queryByLabelText(/done on/)).toBeNull()
  })
})

describe("the year by bed", () => {
  const bed = (id: string, name: string, x: number, kind: Bed["kind"] = "bed"): Bed => ({
    id,
    name,
    kind,
    rect: { x, y: 0, w: 200, h: 200 },
  })
  const at = (planted: Planting, x: number): Planting => ({
    ...planted,
    rect: { ...planted.rect, x },
  })

  function showBeds(beds: Bed[], plantings: Planting[]) {
    editorStore.getState().loadPlan({ ...emptyPlan(), beds, plantings })
    opened = []
    render(<Calendar gardenName="Back garden" onOpenPlanting={(id) => opened.push(id)} />)
  }

  const byBed = () => userEvent.click(screen.getByRole("button", { name: "By bed" }))
  const groups = () => screen.getAllByRole("group").map((group) => group.getAttribute("aria-label"))
  const linesOf = (name: string) =>
    within(screen.getByRole("group", { name }))
      .queryAllByRole("button")
      .map((line) => line.getAttribute("aria-label")?.split(":")[0])
  const freeOf = (name: string) =>
    within(screen.getByRole("group", { name }))
      .queryAllByText(/^Free /)
      .map((line) => line.textContent)

  it("starts as one list, and groups the plantings under their beds when asked", async () => {
    showBeds(
      [bed("b1", "", 0), bed("path", "", 250, "path"), bed("b2", "Herbs", 500)],
      [
        at(TOMATOES, 510),
        at(CARROTS, 10),
        at(planting("loose", "lettuce", "2026-04-01", "2026-06-01"), 900),
      ]
    )
    expect(screen.queryByRole("group")).toBeNull()
    expect(screen.getByRole("button", { name: "By planting" })).toHaveAttribute(
      "aria-pressed",
      "true"
    )

    await byBed()
    // Beds are numbered as the plan lists them, so the path between them takes number 2.
    expect(groups()).toEqual(["Bed 1", "Herbs", "Outside the beds"])
    expect(linesOf("Bed 1")).toEqual(["Carrot × 400"])
    expect(linesOf("Herbs")).toEqual(["Tomato × 4"])
    expect(linesOf("Outside the beds")).toEqual(["Lettuce × 16"])
  })

  it("still opens a planting from its line", async () => {
    showBeds([bed("b1", "", 0)], [at(CARROTS, 10)])
    await byBed()
    await userEvent.click(screen.getByRole("button", { name: /^Carrot/ }))
    expect(opened).toEqual(["carrots"])
  })

  it("says when a bed stands empty, and what there is still room for", async () => {
    // Today is 20 April 2026. The carrots are in from 15 March to 3 July.
    showBeds([bed("b1", "", 0)], [at(CARROTS, 10)])
    await byBed()

    const [before, after] = freeOf("Bed 1")
    // Nothing is planned into a window that has passed.
    expect(before).toBe("Free Jan 1 to Mar 14")
    expect(after).toMatch(/^Free Jul 4 to Dec 31: room for .*Radish/)
    expect(freeOf("Bed 1")).toHaveLength(2)
  })

  it("does not offer the family the bed should rest from", async () => {
    // Radishes, a cabbage, out on 30 April: the rotation would flag another one.
    const radishes = planting("radishes", "radish", "2026-03-15", "2026-04-30")
    showBeds([bed("b1", "", 0), bed("b2", "Herbs", 500)], [at(radishes, 10)])
    await byBed()
    expect(freeOf("Herbs")[0]).toMatch(/Radish/)
    const after = freeOf("Bed 1").at(-1)
    expect(after).toMatch(/^Free May 1 to Dec 31: room for /)
    expect(after).not.toMatch(/Radish|Rocket|Turnip|Cabbage|Kale|Broccoli/)
  })

  it("offers the whole year of a bed with nothing in it, from today on", async () => {
    showBeds([bed("b1", "", 0), bed("b2", "Herbs", 500)], [at(CARROTS, 10)])
    await byBed()

    const herbs = screen.getByRole("group", { name: "Herbs" })
    expect(within(herbs).getByText("Nothing planted here in 2026.")).toBeVisible()
    expect(freeOf("Herbs")).toHaveLength(1)
    expect(freeOf("Herbs")[0]).toMatch(/^Free Jan 1 to Dec 31: room for .* and \d+ more$/)
  })

  it("has nothing to say about beds when none is drawn", async () => {
    showBeds([], [TOMATOES])
    await byBed()
    expect(groups()).toEqual(["Outside the beds"])
    expect(screen.getByText("No beds drawn yet.")).toBeVisible()
  })

  it("goes back to one list", async () => {
    showBeds([bed("b1", "", 0)], [at(CARROTS, 10)])
    await byBed()
    await userEvent.click(screen.getByRole("button", { name: "By planting" }))
    expect(screen.queryByRole("group")).toBeNull()
    expect(screen.getByRole("button", { name: /^Carrot/ })).toBeVisible()
  })
})

describe("what to get for the year", () => {
  const needs = () =>
    within(screen.getByRole("list", { name: /^To get for/ }))
      .getAllByRole("listitem")
      .map((need) => need.textContent)

  it("adds up the plants of each crop still to go in the ground, by name", () => {
    show([
      TOMATOES,
      CARROTS,
      planting("more", "tomato", "2026-06-01", "2026-10-15"),
      { ...planting("in", "tomato", "2026-04-10", "2026-09-01"), planted: true },
    ])
    expect(screen.getByRole("heading", { name: "To get for 2026" })).toBeVisible()
    expect(needs()).toEqual(["Carrot400 plants", "Tomato8 plants"])
  })

  it("follows the year being shown", async () => {
    show([TOMATOES, NEXT_YEAR])
    await userEvent.click(screen.getByRole("button", { name: "Next year" }))
    expect(screen.getByRole("heading", { name: "To get for 2027" })).toBeVisible()
    expect(needs()).toEqual(["Lettuce16 plants"])
  })

  it("is left out when there is nothing to get", () => {
    show([{ ...TOMATOES, planted: true }])
    expect(screen.queryByRole("heading", { name: /^To get for/ })).toBeNull()
  })
})

describe("taking the jobs to another calendar", () => {
  it("saves the jobs still to do, from today on, as a calendar file named after the garden", async () => {
    // Today is 20 April 2026. The carrots went in on 15 March and are ticked.
    show([TOMATOES, { ...CARROTS, planted: true }])
    await userEvent.click(screen.getByRole("button", { name: "Add to my calendar (.ics)" }))

    expect(downloadText).toHaveBeenCalledTimes(1)
    const [file, type, name] = vi.mocked(downloadText).mock.calls[0] ?? []
    expect(name).toBe("back-garden.ics")
    expect(type).toBe("text/calendar")
    expect(file).toContain("X-WR-CALNAME:Back garden")
    const summaries = String(file)
      .split("\r\n")
      .filter((line) => line.startsWith("SUMMARY:") || line.startsWith("DTSTART"))
    expect(summaries).toEqual([
      "DTSTART;VALUE=DATE:20260501",
      "SUMMARY:Plant out Tomato",
      "DTSTART;VALUE=DATE:20260524",
      "SUMMARY:Start picking Carrot",
      "DTSTART;VALUE=DATE:20260630",
      "SUMMARY:Start picking Tomato",
      "DTSTART;VALUE=DATE:20260703",
      "SUMMARY:Clear Carrot",
      "DTSTART;VALUE=DATE:20260930",
      "SUMMARY:Clear Tomato",
    ])
  })

  it("is not offered where there is no garden name to save under", () => {
    render(
      <PlanCalendar
        plan={{ ...emptyPlan(), plantings: [TOMATOES] }}
        day={null}
        onDayChange={() => {}}
      />
    )
    expect(screen.queryByRole("button", { name: /\.ics/ })).toBeNull()
  })

  it("is not offered when no job is left to do", () => {
    show([])
    expect(screen.queryByRole("button", { name: /\.ics/ })).toBeNull()
  })
})
