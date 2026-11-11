import { describe, expect, it } from "vitest"
import { addDays, addMonths, daysBetween, toIsoDate, yearOf } from "./dates"

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

describe("addMonths", () => {
  it("keeps the day of the month", () => {
    expect(addMonths("2026-03-15", 1)).toBe("2026-04-15")
    expect(addMonths("2026-03-15", -2)).toBe("2026-01-15")
  })

  it("crosses year boundaries", () => {
    expect(addMonths("2026-11-10", 3)).toBe("2027-02-10")
    expect(addMonths("2026-02-10", -3)).toBe("2025-11-10")
  })

  it("stops at the end of a shorter month", () => {
    expect(addMonths("2027-01-31", 1)).toBe("2027-02-28")
    expect(addMonths("2028-01-31", 1)).toBe("2028-02-29")
    expect(addMonths("2026-05-31", -1)).toBe("2026-04-30")
  })
})

describe("daysBetween", () => {
  it("counts whole days from the first date to the second", () => {
    expect(daysBetween("2026-01-01", "2026-01-01")).toBe(0)
    expect(daysBetween("2026-01-01", "2026-12-31")).toBe(364)
    expect(daysBetween("2028-01-01", "2028-12-31")).toBe(365)
  })

  it("is negative when the second date comes first", () => {
    expect(daysBetween("2026-03-01", "2026-02-27")).toBe(-2)
  })

  it("is not thrown off by daylight saving changes", () => {
    expect(daysBetween("2026-03-28", "2026-03-30")).toBe(2)
  })
})
