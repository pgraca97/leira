// @vitest-environment jsdom
import "../test/setup"
import { emptyPlan, getPlant, PLANTS, startsOn } from "@leira/core"
import { act, render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { i18n } from "../i18n"
import { Palette } from "./Palette"
import { seasonText } from "./season"
import { editorStore } from "./store"
import { ToolGuide } from "./ToolGuide"

beforeEach(() => {
  // Today is 15 April 2026. Only the clock is faked, so the test tools' timers keep running.
  vi.useFakeTimers({ now: new Date(2026, 3, 15, 10, 0), toFake: ["Date"] })
  editorStore.getState().loadPlan(emptyPlan())
  // The guide says what the palette's tools do, so the two are tested together.
  render(
    <>
      <Palette />
      <ToolGuide />
    </>
  )
})

afterEach(async () => {
  vi.useRealTimers()
  await act(() => i18n.changeLanguage("en"))
})

/** The names on the plant buttons, in the order they are shown. */
function shownPlants(): string[] {
  // "Plants" in English, "Plantas" in Portuguese.
  const plants = screen.getByRole("region", { name: /^Plant(s|as)$/ })
  return within(plants)
    .queryAllByRole("button")
    .map((button) => button.textContent ?? "")
}

const search = () => screen.getByRole("searchbox", { name: "Search plants" })

describe("the plant list", () => {
  it("is in alphabetical order", () => {
    const names = shownPlants()
    expect(names.length).toBeGreaterThanOrEqual(40)
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b, "en")))
    expect(names.slice(0, 3)).toEqual(["Aubergine", "Basil", "Beetroot"])
  })

  it("is ordered by the names of the language in use", async () => {
    await act(() => i18n.changeLanguage("pt"))
    const names = shownPlants()
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b, "pt")))
    expect(names[0]).toBe("Abóbora")
  })

  it("narrows to the plants whose name contains what is typed", async () => {
    await userEvent.type(search(), "bean")
    expect(shownPlants()).toEqual(["Broad bean", "Green bean"])
  })

  it("ignores case and accents", async () => {
    await act(() => i18n.changeLanguage("pt"))
    await userEvent.type(screen.getByRole("searchbox"), "FEIJAO")
    expect(shownPlants()).toEqual(["Feijão-verde"])
  })

  it("finds plants by their botanical name", async () => {
    await userEvent.type(search(), "allium")
    expect(shownPlants()).toEqual(["Chives", "Garlic", "Leek", "Onion"])
  })

  it("finds plants by their family, the unit crop rotation works in", async () => {
    await userEvent.type(search(), "nightshades")
    expect(shownPlants()).toEqual([
      "Aubergine",
      "Chilli pepper",
      "Potato",
      "Sweet pepper",
      "Tomato",
    ])
  })

  it("says so when nothing matches, and comes back when the search is cleared", async () => {
    await userEvent.type(search(), "triffid")
    expect(shownPlants()).toEqual([])
    expect(screen.getByText("No plant matches “triffid”.")).toBeVisible()

    await userEvent.clear(search())
    expect(shownPlants().length).toBeGreaterThanOrEqual(40)
  })

  it("keeps the chosen plant chosen while it is filtered out of view", async () => {
    await userEvent.click(screen.getByRole("button", { name: "Tomato" }))
    await userEvent.type(search(), "bean")
    expect(editorStore.getState().tool).toEqual({ kind: "plant", plantId: "tomato" })
  })
})

describe("companions of the chosen plant", () => {
  it("names the crops that grow well next to it, and the ones to keep away", async () => {
    await userEvent.click(screen.getByRole("button", { name: "Strawberry" }))
    expect(
      screen.getByText("Grows well next to: Garlic, Leek, Lettuce, Onion, Spinach.")
    ).toBeVisible()
    expect(screen.getByText("Keep away from: Cabbage.")).toBeVisible()
  })

  it("leaves out the line it has nothing to say on", async () => {
    await userEvent.click(screen.getByRole("button", { name: "Melon" }))
    expect(screen.getByText("Grows well next to: Radish, Sweetcorn.")).toBeVisible()
    expect(screen.queryByText(/Keep away from/)).toBeNull()

    await userEvent.click(screen.getByRole("button", { name: "Florence fennel" }))
    expect(screen.getByText("Keep away from: Coriander, Green bean, Tomato.")).toBeVisible()
    expect(screen.queryByText(/Grows well next to/)).toBeNull()
  })

  it("shows no advice until a plant is chosen", () => {
    expect(screen.queryByText(/Grows well next to/)).toBeNull()
    expect(screen.queryByText(/Keep away from/)).toBeNull()
  })
})

describe("what can be started now", () => {
  const WAYS = { "sow-indoors": "sow under cover", sow: "sow", transplant: "plant out" }
  /** What the list should hold on a day: each crop that can be started, and how. */
  const startable = (date: string) =>
    PLANTS.filter((plant) => startsOn(plant, date).length > 0)
      .sort((a, b) => a.name.en.localeCompare(b.name.en, "en"))
      .map(
        (plant) =>
          plant.name.en +
          startsOn(plant, date)
            .map((way) => WAYS[way])
            .join(", ")
      )
  const startNow = () => screen.getByRole("checkbox", { name: "To sow or plant now" })

  it("narrows the list to the crops of the month, saying how each is started", async () => {
    await userEvent.click(startNow())
    expect(shownPlants()).toEqual(startable("2026-04-15"))
    expect(shownPlants().length).toBeLessThan(PLANTS.length)
  })

  it("shows every crop again, without the hows, when it is switched off", async () => {
    await userEvent.click(startNow())
    await userEvent.click(startNow())
    expect(shownPlants()).toHaveLength(PLANTS.length)
    expect(shownPlants()).toContain("Tomato")
  })

  it("follows the day the garden is shown on", async () => {
    act(() => editorStore.getState().setViewDate("2026-12-15"))
    await userEvent.click(startNow())
    expect(shownPlants()).toEqual(startable("2026-12-15"))
  })

  it("narrows further with the search", async () => {
    await userEvent.click(startNow())
    await userEvent.type(search(), "nightshades")
    const nightshades = PLANTS.filter((plant) => plant.family === "solanaceae").map(
      (plant) => plant.name.en
    )
    expect(shownPlants().length).toBeGreaterThan(0)
    for (const shown of shownPlants()) {
      expect(nightshades.some((name) => shown.startsWith(name))).toBe(true)
    }
    expect(shownPlants()).toEqual(
      startable("2026-04-15").filter((shown) => nightshades.some((name) => shown.startsWith(name)))
    )
  })
})

describe("the season of the chosen plant", () => {
  it("says when it goes in the ground", async () => {
    const tomato = getPlant("tomato")
    await userEvent.click(screen.getByRole("button", { name: "Tomato" }))
    const season = seasonText(tomato?.groundMonths ?? [], "en", i18n.getFixedT("en"))
    expect(screen.getByText(`Goes in the ground: ${season}.`)).toBeVisible()
  })

  it("says nothing until a plant is chosen", () => {
    expect(screen.queryByText(/^Goes in the ground/)).toBeNull()
  })
})

describe("selecting several items", () => {
  it("is a button that stays pressed, and says how it works", async () => {
    const button = screen.getByRole("button", { name: "Select several" })
    expect(button).toHaveAttribute("aria-pressed", "false")

    await userEvent.click(button)
    expect(editorStore.getState().selectingMany).toBe(true)
    expect(button).toHaveAttribute("aria-pressed", "true")
    expect(screen.getByText(/Tap items to add them to the selection/)).toBeInTheDocument()

    await userEvent.click(button)
    expect(editorStore.getState().selectingMany).toBe(false)
  })

  it("lets go once a drawing tool is picked", async () => {
    await userEvent.click(screen.getByRole("button", { name: "Select several" }))
    await userEvent.click(screen.getByRole("button", { name: "Bed" }))
    expect(screen.getByRole("button", { name: "Select several" })).toHaveAttribute(
      "aria-pressed",
      "false"
    )
  })
})
