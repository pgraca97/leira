// @vitest-environment jsdom
import "../test/setup"
import "../i18n"
import type { PlanItemRef } from "@leira/core"
import { type Bed, emptyPlan, getPlant, type Planting } from "@leira/core"
import { act, fireEvent, render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it } from "vitest"
import { i18n } from "../i18n"
import { Inspector } from "./Inspector"
import { monthName, seasonText } from "./season"
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
    expect(editorStore.getState().selection).toEqual([{ kind: "planting", id: "new" }])
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

describe("the day a planting was sown", () => {
  it("is asked for a crop raised under cover, showing the usual lead time until it is known", () => {
    show([planting("p1", "tomato", "2026-05-01", "2026-09-30")], "p1")
    expect(screen.getByLabelText("Sown indoors on")).toHaveValue("")
    // Tomatoes are sown six weeks before they go out.
    expect(screen.getByText("Estimated: Mar 20, 2026")).toBeVisible()
  })

  it("is not asked for a crop sown straight into the ground", () => {
    show([planting("p1", "potato", "2026-03-01", "2026-07-01")], "p1")
    expect(screen.queryByLabelText("Sown indoors on")).toBeNull()
  })

  it("records the day the user picks, which replaces the estimate", () => {
    show([planting("p1", "tomato", "2026-05-01", "2026-09-30")], "p1")
    const field = screen.getByLabelText("Sown indoors on")
    fireEvent.change(field, { target: { value: "2026-03-05" } })
    expect(editorStore.getState().plan.plantings[0]?.sowDate).toBe("2026-03-05")
    expect(field).toHaveValue("2026-03-05")
    expect(screen.queryByText(/Estimated/)).toBeNull()
  })

  it("only offers days before the crop goes in the ground", () => {
    show([planting("p1", "tomato", "2026-05-01", "2026-09-30")], "p1")
    expect(screen.getByLabelText("Sown indoors on")).toHaveAttribute("max", "2026-04-30")
  })

  it("goes back to the estimate when the field is cleared", () => {
    show([{ ...planting("p1", "tomato", "2026-05-01", "2026-09-30"), sowDate: "2026-03-05" }], "p1")
    fireEvent.change(screen.getByLabelText("Sown indoors on"), { target: { value: "" } })
    expect(editorStore.getState().plan.plantings[0]).not.toHaveProperty("sowDate")
    expect(screen.getByText("Estimated: Mar 20, 2026")).toBeVisible()
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

  it("never names another bed with what was typed for this one", async () => {
    const other: Bed = { ...BED, id: "b2", name: "", rect: { ...BED.rect, x: 500 } }
    editorStore.getState().loadPlan({ ...emptyPlan(), beds: [{ ...BED, name: "" }, other] })
    editorStore.getState().select(BED_REF)
    render(<Inspector />)
    await userEvent.type(screen.getByRole("textbox", { name: "Name" }), "Salad bar")

    // What a tap on the garden can do on a touch screen: pick another bed
    // while the field still has the focus.
    act(() => editorStore.getState().select({ kind: "bed", id: "b2" }))
    await userEvent.tab()
    expect(editorStore.getState().plan.beds[1]?.name).toBe("")
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

describe("plantings on the day being shown", () => {
  it("marks the crops that are not in the ground that day", () => {
    show([
      planting("spring", "lettuce", "2026-03-01", "2026-05-15"),
      planting("summer", "tomato", "2026-05-01", "2026-09-30", 300),
    ])
    expect(screen.queryByText("not in the ground")).toBeNull()

    act(() => editorStore.getState().setViewDate("2026-04-01"))
    const list = screen.getByRole("region", { name: "Plantings" })
    const [lettuce, tomato] = within(list).getAllByRole("button")
    expect(lettuce).not.toHaveTextContent("not in the ground")
    expect(tomato).toHaveTextContent("not in the ground")
  })
})

describe("companion planting", () => {
  it("warns about neighbours that grow poorly together and selects one on click", async () => {
    show([
      planting("beans", "green-bean", "2026-04-15", "2026-09-30"),
      planting("onions", "onion", "2026-04-15", "2026-09-30", 100),
    ])
    const region = screen.getByRole("region", { name: "Companion planting" })
    const warning = within(region).getByRole("button")
    expect(warning).toHaveTextContent(
      "Green bean and Onion grow poorly side by side. Move them apart."
    )
    await userEvent.click(warning)
    expect(editorStore.getState().selection).toEqual([{ kind: "planting", id: "beans" }])
  })

  it("notes neighbours that help each other", () => {
    show([
      planting("tomatoes", "tomato", "2026-04-15", "2026-09-30"),
      planting("carrots", "carrot", "2026-04-15", "2026-09-30", 100),
    ])
    const region = screen.getByRole("region", { name: "Companion planting" })
    expect(within(region).getByText("Tomato and Carrot grow well together.")).toBeVisible()
    expect(within(region).queryByRole("button")).toBeNull()
  })

  it("says nothing when no neighbours are known companions", () => {
    show([
      planting("beans", "green-bean", "2026-04-15", "2026-09-30"),
      planting("onions", "onion", "2026-04-15", "2026-09-30", 400),
    ])
    expect(screen.queryByRole("region", { name: "Companion planting" })).toBeNull()
  })
})

describe("the garden's notes", () => {
  it("are there to write whatever is selected, and stored when the field is left", async () => {
    show([planting("tomatoes", "tomato", "2026-05-01", "2026-09-30")], "tomatoes")
    await userEvent.type(screen.getByLabelText("Garden notes"), "The well ran dry in July.")
    await userEvent.tab()

    expect(editorStore.getState().plan.notes).toBe("The well ran dry in July.")
  })

  it("show what was written before", () => {
    editorStore.getState().loadPlan({ ...emptyPlan(), notes: "Dry year." })
    render(<Inspector />)

    expect(screen.getByLabelText("Garden notes")).toHaveValue("Dry year.")
    expect(screen.getByLabelText("Garden notes")).toHaveAttribute("maxlength", "5000")
  })
})

describe("out of season warnings", () => {
  const tomato = getPlant("tomato")
  if (!tomato) throw new Error("No tomato in the catalogue")
  const good = tomato.groundMonths[0] as number
  const bad = ([1, 12] as const).find((month) => !tomato.groundMonths.includes(month)) as number
  const day = (month: number) => `2026-${String(month).padStart(2, "0")}-10`

  it("warns about a crop that goes in the ground outside its season, and says when that is", () => {
    show([planting("early", "tomato", day(bad), "2026-12-31")])
    const warnings = screen.getByRole("region", { name: "Out of season" })
    expect(within(warnings).getByRole("button")).toHaveTextContent(
      `Tomato goes in the ground in ${monthName(bad, "en")}. Season: ${seasonText(tomato.groundMonths, "en", i18n.getFixedT("en"))}.`
    )
  })

  it("says the months are those of the north and centre", () => {
    show([planting("early", "tomato", day(bad), "2026-12-31")])
    expect(screen.getByRole("region", { name: "Out of season" })).toHaveTextContent(
      "Months for the north and centre of mainland Portugal."
    )
  })

  it("selects the planting to move when its warning is clicked", async () => {
    show([planting("early", "tomato", day(bad), "2026-12-31")])
    await userEvent.click(
      within(screen.getByRole("region", { name: "Out of season" })).getByRole("button")
    )
    expect(editorStore.getState().selection).toEqual([{ kind: "planting", id: "early" }])
  })

  it("stays quiet for a crop in season, and for one already in the ground", () => {
    show([
      planting("fine", "tomato", day(good), "2026-12-31"),
      { ...planting("done", "tomato", day(bad), "2026-12-31", 300), planted: true },
    ])
    expect(screen.queryByRole("region", { name: "Out of season" })).toBeNull()
  })
})

describe("the variety of the selected planting", () => {
  it("is typed in, and then names the planting wherever it is listed", async () => {
    show([planting("tomatoes", "tomato", "2026-05-01", "2026-09-30")], "tomatoes")
    await userEvent.type(screen.getByLabelText("Variety"), "Coração de Boi{Enter}")

    expect(editorStore.getState().plan.plantings[0]?.variety).toBe("Coração de Boi")
    const listed = within(screen.getByRole("region", { name: "Plantings" })).getByRole("button")
    expect(listed).toHaveTextContent("Tomato 'Coração de Boi' × 4")
  })

  it("never goes to another planting picked while the field still has the focus", async () => {
    show(
      [
        planting("tomatoes", "tomato", "2026-05-01", "2026-09-30"),
        planting("more", "tomato", "2026-05-01", "2026-09-30", 300),
      ],
      "tomatoes"
    )
    await userEvent.type(screen.getByLabelText("Variety"), "Coração de Boi")

    act(() => editorStore.getState().select({ kind: "planting", id: "more" }))
    await userEvent.tab()
    expect(editorStore.getState().plan.plantings[1]?.variety).toBeUndefined()
  })
})

describe("several items selected", () => {
  const LETTUCE = planting("lettuce", "lettuce", "2026-03-01", "2026-05-15")
  const LETTUCE_REF: PlanItemRef = { kind: "planting", id: "lettuce" }

  function showBoth() {
    editorStore.getState().loadPlan({ ...emptyPlan(), beds: [BED], plantings: [LETTUCE] })
    editorStore.getState().selectItems([BED_REF, LETTUCE_REF])
    render(<Inspector />)
  }

  it("says how many are selected, and of which kind", () => {
    showBoth()
    const selected = screen.getByRole("region", { name: "Selected" })
    expect(within(selected).getByText("2 selected: 1 bed, 1 crop")).toBeVisible()
    // The fields of one item make no sense for a group.
    expect(within(selected).queryByRole("textbox", { name: "Name" })).toBeNull()
  })

  it("duplicates them together", async () => {
    showBoth()
    await userEvent.click(screen.getByRole("button", { name: "Duplicate" }))
    const { plan, selection } = editorStore.getState()
    expect(plan.beds).toHaveLength(2)
    expect(plan.plantings).toHaveLength(2)
    expect(selection).toHaveLength(2)
  })

  it("deletes them together", async () => {
    showBoth()
    await userEvent.click(screen.getByRole("button", { name: "Delete" }))
    expect(editorStore.getState().plan.beds).toEqual([])
    expect(editorStore.getState().plan.plantings).toEqual([])
  })

  it("can all be let go of at once", async () => {
    showBoth()
    await userEvent.click(screen.getByRole("button", { name: "Clear selection" }))
    expect(editorStore.getState().selection).toEqual([])
  })

  it("grow by Shift-clicking the lists", async () => {
    editorStore.getState().loadPlan({ ...emptyPlan(), beds: [BED], plantings: [LETTUCE] })
    render(<Inspector />)
    // One session, so the Shift held down is still held for the click.
    const user = userEvent.setup()
    await user.click(screen.getByRole("button", { name: /^Herbs/ }))
    await user.keyboard("{Shift>}")
    await user.click(screen.getByRole("button", { name: /^Lettuce/ }))
    await user.keyboard("{/Shift}")
    expect(editorStore.getState().selection).toEqual([BED_REF, LETTUCE_REF])
  })
})

describe("copy and paste", () => {
  const LETTUCE = planting("lettuce", "lettuce", "2026-03-01", "2026-05-15")

  it("copies the item selected on its own", async () => {
    editorStore.getState().setClipboard(null)
    showBed()
    await userEvent.click(screen.getByRole("button", { name: "Copy" }))
    expect(editorStore.getState().clipboard?.beds).toEqual([BED])
  })

  it("copies several items selected together", async () => {
    editorStore.getState().loadPlan({ ...emptyPlan(), beds: [BED], plantings: [LETTUCE] })
    editorStore.getState().selectItems([BED_REF, { kind: "planting", id: "lettuce" }])
    render(<Inspector />)
    await userEvent.click(screen.getByRole("button", { name: "Copy" }))
    expect(editorStore.getState().clipboard?.plantings).toHaveLength(1)
  })

  it("says what is waiting to be pasted, and pastes it into the same year or the next", async () => {
    editorStore.getState().loadPlan({ ...emptyPlan(), plantings: [LETTUCE] })
    editorStore.getState().select({ kind: "planting", id: "lettuce" })
    editorStore.getState().copySelection()
    editorStore.getState().loadPlan(emptyPlan())
    render(<Inspector />)

    const clipboard = screen.getByRole("region", { name: "Copied" })
    expect(within(clipboard).getByText("1 crop")).toBeVisible()
    await userEvent.click(within(clipboard).getByRole("button", { name: "Paste" }))
    await userEvent.click(within(clipboard).getByRole("button", { name: "Paste into next year" }))
    expect(editorStore.getState().plan.plantings.map((item) => item.inGround.from)).toEqual([
      "2026-03-01",
      "2027-03-01",
    ])
  })

  it("offers no next year for beds alone, which have no dates", () => {
    editorStore.getState().setClipboard({ format: 1, beds: [BED], plantings: [] })
    editorStore.getState().loadPlan(emptyPlan())
    render(<Inspector />)
    const clipboard = screen.getByRole("region", { name: "Copied" })
    expect(within(clipboard).queryByRole("button", { name: "Paste into next year" })).toBeNull()
  })

  it("says so when what was copied does not fit", async () => {
    editorStore.getState().setClipboard({ format: 1, beds: [BED], plantings: [] })
    editorStore.getState().loadPlan({ ...emptyPlan(), widthCm: 150, heightCm: 150 })
    render(<Inspector />)
    await userEvent.click(screen.getByRole("button", { name: "Paste" }))
    expect(screen.getByRole("alert")).toHaveTextContent("does not fit this garden")
  })
})
