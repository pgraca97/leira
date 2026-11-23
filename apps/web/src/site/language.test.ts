import { describe, expect, it } from "vitest"
import { chooseLanguage } from "./language"

function storage(entries: Record<string, string> = {}) {
  const map = new Map(Object.entries(entries))
  return {
    map,
    setItem: (key: string, value: string) => void map.set(key, value),
  }
}

describe("a language chosen on the static pages", () => {
  it("is kept for the app", () => {
    const saved = storage()
    chooseLanguage(saved, "en")
    expect(saved.map.get("garden.language")).toBe("en")
  })

  it("reads Portugal's Portuguese as the app's Portuguese", () => {
    const saved = storage()
    chooseLanguage(saved, "pt-PT")
    expect(saved.map.get("garden.language")).toBe("pt")
  })

  // The page the visitor reads, or the one they picked in its menu, is the
  // language they want: an older choice made in the app gives way to it.
  it("replaces any earlier choice", () => {
    const saved = storage({ "garden.language": "en" })
    chooseLanguage(saved, "pt-PT")
    expect(saved.map.get("garden.language")).toBe("pt")
  })

  it("is ignored when the app does not have it", () => {
    const saved = storage({ "garden.language": "en" })
    chooseLanguage(saved, "fr")
    expect(saved.map.get("garden.language")).toBe("en")
  })
})
