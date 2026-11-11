import { describe, expect, it } from "vitest"
import { fileNameFor } from "./fileName"

describe("fileNameFor", () => {
  it("turns a garden's name into a plain file name", () => {
    expect(fileNameFor("Allotment 12", "png")).toBe("allotment-12.png")
  })

  it("drops accents and punctuation", () => {
    expect(fileNameFor("  Horta da Avó: canteiros & vasos! ", "png")).toBe(
      "horta-da-avo-canteiros-vasos.png"
    )
  })

  it("falls back to a generic name when nothing usable is left", () => {
    expect(fileNameFor("🌱🌱", "png")).toBe("garden.png")
    expect(fileNameFor("", "svg")).toBe("garden.svg")
  })

  it("keeps the name short", () => {
    expect(fileNameFor("a".repeat(200), "png")).toBe(`${"a".repeat(60)}.png`)
  })
})
