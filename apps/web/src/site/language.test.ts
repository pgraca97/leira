import { describe, expect, it } from "vitest"
import { rememberPageLanguage } from "./language"

function storage(entries: Record<string, string> = {}) {
  const map = new Map(Object.entries(entries))
  return {
    map,
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => void map.set(key, value),
  }
}

describe("the language the app opens in, from the landing page", () => {
  it("is the page's, when the visitor never chose one", () => {
    const saved = storage()
    rememberPageLanguage(saved, "en")
    expect(saved.map.get("garden.language")).toBe("en")
  })

  it("reads Portugal's Portuguese as the app's Portuguese", () => {
    const saved = storage()
    rememberPageLanguage(saved, "pt-PT")
    expect(saved.map.get("garden.language")).toBe("pt")
  })

  it("stays the visitor's own choice once they made one", () => {
    const saved = storage({ "garden.language": "pt" })
    rememberPageLanguage(saved, "en")
    expect(saved.map.get("garden.language")).toBe("pt")
  })

  it("is left alone for a language the app does not have", () => {
    const saved = storage()
    rememberPageLanguage(saved, "fr")
    expect(saved.map.has("garden.language")).toBe(false)
  })
})
