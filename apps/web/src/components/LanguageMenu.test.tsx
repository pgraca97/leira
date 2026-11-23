// @vitest-environment jsdom
import "../test/setup"
import "../i18n"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"
import { LanguageMenu } from "./LanguageMenu"

const toggle = () => screen.getByText("English", { selector: "summary span" }).closest("summary")!
const menu = () => toggle().closest("details")!

describe("LanguageMenu", () => {
  it("names the current language, and what the control is for", () => {
    render(<LanguageMenu current="en" onChoose={() => {}} />)
    expect(toggle()).toHaveTextContent("Language:")
    expect(menu()).not.toHaveAttribute("open")
  })

  // A phone's header has no room for the whole name next to the page's action.
  it("has a short name for a narrow screen", () => {
    render(<LanguageMenu current="pt" onChoose={() => {}} />)
    const short = screen.getByText("PT", { selector: "summary span" })
    expect(short).toHaveClass("sm:hidden")
    expect(screen.getByText("Português", { selector: "summary span" })).toHaveClass("hidden")
  })

  it("changes the language in place in the app, and closes", async () => {
    const onChoose = vi.fn()
    render(<LanguageMenu current="en" onChoose={onChoose} />)
    await userEvent.click(toggle())
    expect(menu()).toHaveAttribute("open")
    expect(screen.getByRole("button", { name: "English" })).toHaveAttribute("aria-current", "true")
    await userEvent.click(screen.getByRole("button", { name: "Português" }))
    expect(onChoose).toHaveBeenCalledWith("pt")
    expect(menu()).not.toHaveAttribute("open")
  })

  it("closes on Escape and gives the focus back", async () => {
    render(<LanguageMenu current="en" onChoose={() => {}} />)
    await userEvent.click(toggle())
    await userEvent.keyboard("{Escape}")
    expect(menu()).not.toHaveAttribute("open")
    expect(toggle()).toHaveFocus()
  })

  // Crawlers follow links, so on the static pages each language is one.
  it("links to each language's page on the static pages", () => {
    render(<LanguageMenu current="en" hrefs={{ pt: "/", en: "/en/" }} />)
    const portuguese = screen.getByRole("link", { name: "Português", hidden: true })
    expect(portuguese).toHaveAttribute("href", "/")
    expect(portuguese).toHaveAttribute("hreflang", "pt")
    expect(portuguese).toHaveAttribute("data-language", "pt")
    expect(screen.getByRole("link", { name: "English", hidden: true })).toHaveAttribute(
      "aria-current",
      "page"
    )
  })
})
