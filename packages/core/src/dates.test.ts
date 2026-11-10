import { describe, expect, it } from "vitest"
import { addDays, toIsoDate, yearOf } from "./dates"

describe("toIsoDate", () => {
  it("formats the local calendar day with zero padding", () => {
    expect(toIsoDate(new Date(2026, 2, 5, 23, 59))).toBe("2026-03-05")
  })
})

describe("addDays", () => {
  it("crosses month and year boundaries", () => {
    expect(addDays("2026-01-31", 1)).toBe("2026-02-01")
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01")
  })

  it("handles leap days", () => {
    expect(addDays("2028-02-28", 1)).toBe("2028-02-29")
    expect(addDays("2027-02-28", 1)).toBe("2027-03-01")
  })

  it("subtracts with a negative count", () => {
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28")
  })

  it("is not shifted by daylight saving changes", () => {
    // Clocks change in Europe on 2026-03-29 and 2026-10-25.
    expect(addDays("2026-03-28", 2)).toBe("2026-03-30")
    expect(addDays("2026-10-24", 2)).toBe("2026-10-26")
  })
})

describe("yearOf", () => {
  it("reads the calendar year", () => {
    expect(yearOf("2026-11-10")).toBe(2026)
  })
})
