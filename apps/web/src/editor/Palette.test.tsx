// @vitest-environment jsdom
import "../test/setup"
import "../i18n"
import { emptyPlan } from "@garden/core"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it } from "vitest"
import { Palette } from "./Palette"
import { editorStore } from "./store"

beforeEach(() => {
  editorStore.getState().loadPlan(emptyPlan())
  render(<Palette />)
})

describe("companions of the chosen plant", () => {
  it("names the crops that grow well next to it, and the ones to keep away", async () => {
    await userEvent.click(screen.getByRole("button", { name: "Green bean" }))
    expect(screen.getByText("Grows well next to: Carrot.")).toBeVisible()
    expect(screen.getByText("Keep away from: Onion.")).toBeVisible()
  })

  it("lists several companions in the order of the palette", async () => {
    await userEvent.click(screen.getByRole("button", { name: "Onion" }))
    expect(screen.getByText("Grows well next to: Tomato, Lettuce, Carrot.")).toBeVisible()
    expect(screen.getByText("Keep away from: Green bean.")).toBeVisible()
  })

  it("leaves out the line it has nothing to say on", async () => {
    await userEvent.click(screen.getByRole("button", { name: "Tomato" }))
    expect(screen.getByText("Grows well next to: Lettuce, Carrot, Onion.")).toBeVisible()
    expect(screen.queryByText(/Keep away from/)).toBeNull()
  })

  it("shows no advice until a plant is chosen", () => {
    expect(screen.queryByText(/Grows well next to/)).toBeNull()
    expect(screen.queryByText(/Keep away from/)).toBeNull()
  })
})
