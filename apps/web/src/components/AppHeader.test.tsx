// @vitest-environment jsdom
import "../test/setup"
import "../i18n"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it } from "vitest"
import { AppHeader } from "./AppHeader"

/** The language menu's button, named by the language it shows. */
const languageMenu = () =>
  screen.getByText("English", { selector: "summary span" }).closest("summary") as HTMLElement

function showHeader() {
  render(
    <>
      <AppHeader secondary={<button type="button">Save image</button>}>
        <a href="/">All gardens</a>
      </AppHeader>
      <main>The page</main>
    </>
  )
  return screen.getByRole("button", { name: "More" })
}

describe("AppHeader", () => {
  // A full page load, not a route: the landing page is a static file, not part of the app.
  it("leads to the landing page from the name", () => {
    render(<AppHeader />)
    expect(screen.getByRole("link", { name: "Leira" })).toHaveAttribute("href", "/")
  })

  it("has no menu when the page has nothing to put in it", () => {
    render(<AppHeader />)
    expect(screen.queryByRole("button", { name: "More" })).toBeNull()
    expect(languageMenu()).toBeVisible()
  })

  it("starts with the menu of secondary controls closed", () => {
    expect(showHeader()).toHaveAttribute("aria-expanded", "false")
  })

  it("names the controls the menu button opens: the page's, and the language", () => {
    const more = showHeader()
    const menu = document.getElementById(more.getAttribute("aria-controls") ?? "")
    expect(menu).toContainElement(screen.getByRole("button", { name: "Save image" }))
    expect(menu).toContainElement(languageMenu())
    expect(menu).not.toContainElement(screen.getByRole("link", { name: "All gardens" }))
  })

  it("opens and closes the menu with its button", async () => {
    const more = showHeader()
    await userEvent.click(more)
    expect(more).toHaveAttribute("aria-expanded", "true")
    await userEvent.click(more)
    expect(more).toHaveAttribute("aria-expanded", "false")
  })

  it("closes the menu on Escape and gives the button the focus back", async () => {
    const more = showHeader()
    await userEvent.click(more)
    await userEvent.click(screen.getByRole("button", { name: "Save image" }))
    await userEvent.keyboard("{Escape}")
    expect(more).toHaveAttribute("aria-expanded", "false")
    expect(more).toHaveFocus()
  })

  it("closes the menu when the page is pressed, and stays open for a press inside", async () => {
    const more = showHeader()
    await userEvent.click(more)
    await userEvent.click(screen.getByRole("button", { name: "Save image" }))
    expect(more).toHaveAttribute("aria-expanded", "true")
    await userEvent.click(screen.getByText("The page"))
    expect(more).toHaveAttribute("aria-expanded", "false")
  })
})
