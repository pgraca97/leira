// @vitest-environment jsdom
import "../test/setup"
import { emptyPlan } from "@garden/core"
import { act, render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { i18n } from "../i18n"
import { Palette } from "./Palette"
import { editorStore } from "./store"

beforeEach(() => {
  editorStore.getState().loadPlan(emptyPlan())
  render(<Palette />)
})

afterEach(async () => {
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
