import { describe, expect, it } from "vitest"
import { LANGUAGES } from "../i18n/languages"
import { NOT_FOUND_LANGUAGE_SCRIPT, notFoundInChosenLanguage } from "./notFoundLanguage"

function visit(overrides: Partial<Parameters<typeof notFoundInChosenLanguage>[0]> = {}) {
  return notFoundInChosenLanguage(
    {
      pageLanguage: "pt-PT",
      chosen: null,
      pathname: "/canteiros",
      search: "",
      hash: "",
      ...overrides,
    },
    LANGUAGES
  )
}

describe("where a 404 page sends someone who chose the other language", () => {
  it("nowhere, when they never chose one: the address picks the page", () => {
    expect(visit()).toBeNull()
  })

  it("nowhere, when the page is already in their language", () => {
    expect(visit({ chosen: "pt" })).toBeNull()
    expect(visit({ pageLanguage: "en", chosen: "en", pathname: "/en/beds" })).toBeNull()
  })

  // The English 404 page answers every unknown address under /en/, so the
  // address they typed stays in sight.
  it("to the same address under /en/, for English", () => {
    expect(visit({ chosen: "en", search: "?a=1", hash: "#b" })).toBe("/en/canteiros?a=1#b")
  })

  it("to the same address without /en/, for Portuguese", () => {
    expect(visit({ pageLanguage: "en", chosen: "pt", pathname: "/en/beds" })).toBe("/beds")
  })

  it("nowhere, for a language the app does not have", () => {
    expect(visit({ chosen: "fr" })).toBeNull()
  })
})

describe("the 404 page's script", () => {
  it("reads the choice from where the app keeps it", () => {
    expect(NOT_FOUND_LANGUAGE_SCRIPT).toContain('"garden.language"')
    expect(NOT_FOUND_LANGUAGE_SCRIPT).toContain("location.replace")
  })
})
