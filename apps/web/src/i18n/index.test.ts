// @vitest-environment jsdom
import "../test/setup"
import { afterEach, describe, expect, it } from "vitest"
import { i18n } from "."

function storageChange(key: string, newValue: string | null) {
  window.dispatchEvent(new StorageEvent("storage", { key, newValue }))
}

describe("the app's language", () => {
  afterEach(async () => {
    await i18n.changeLanguage("en")
  })

  // Another tab of the app, or a static page, chose it.
  it("follows a choice made in another tab", async () => {
    storageChange("garden.language", "pt")
    await expect.poll(() => i18n.language).toBe("pt")
  })

  it("ignores other keys and languages it does not have", async () => {
    storageChange("leira.clipboard", "pt")
    storageChange("garden.language", "fr")
    storageChange("garden.language", null)
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(i18n.language).toBe("en")
  })
})
