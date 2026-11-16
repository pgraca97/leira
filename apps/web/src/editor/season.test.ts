// @vitest-environment jsdom
import { describe, expect, it } from "vitest"
import { i18n } from "../i18n"
import { monthName, seasonText } from "./season"

describe("seasonText", () => {
  const en = i18n.getFixedT("en")
  const pt = i18n.getFixedT("pt")

  it("says a stretch of months from its first to its last", () => {
    expect(seasonText([4, 5, 6], "en", en)).toBe("April to June")
    expect(seasonText([4, 5, 6], "pt", pt)).toBe("abril a junho")
  })

  it("names a single month on its own", () => {
    expect(seasonText([7], "en", en)).toBe("July")
  })

  it("lists two seasons", () => {
    expect(seasonText([3, 4, 9, 10], "en", en)).toBe("March to April and September to October")
    expect(seasonText([3, 4, 9, 10], "pt", pt)).toBe("março a abril e setembro a outubro")
  })

  it("runs a winter season over the year's end", () => {
    expect(seasonText([1, 2, 10, 11, 12], "en", en)).toBe("October to February")
  })

  it("says so when the crop goes in all year", () => {
    expect(seasonText([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12], "en", en)).toBe("all year")
    expect(seasonText([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12], "pt", pt)).toBe("todo o ano")
  })
})

describe("monthName", () => {
  it("names a month in the language asked for", () => {
    expect(monthName(1, "en")).toBe("January")
    expect(monthName(12, "pt")).toBe("dezembro")
  })
})
