import { describe, expect, it } from "vitest"
import { yearSpan } from "./layout"

describe("yearSpan", () => {
  it("places a range inside the year as a share of its days", () => {
    // 2026 has 365 days; 1 January to 31 December covers all of them.
    expect(yearSpan({ from: "2026-01-01", to: "2026-12-31" }, 2026)).toEqual({ start: 0, width: 1 })
    const january = yearSpan({ from: "2026-01-01", to: "2026-01-31" }, 2026)
    expect(january?.start).toBe(0)
    expect(january?.width).toBeCloseTo(31 / 365)
  })

  it("counts the last day as part of the range", () => {
    const oneDay = yearSpan({ from: "2026-07-01", to: "2026-07-01" }, 2026)
    expect(oneDay?.start).toBeCloseTo(181 / 365)
    expect(oneDay?.width).toBeCloseTo(1 / 365)
  })

  it("clips a range that starts before or ends after the year", () => {
    expect(yearSpan({ from: "2025-11-01", to: "2026-01-31" }, 2026)).toEqual({
      start: 0,
      width: 31 / 365,
    })
    const overwintering = yearSpan({ from: "2026-12-01", to: "2027-03-01" }, 2026)
    expect(overwintering?.start).toBeCloseTo(334 / 365)
    expect((overwintering?.start ?? 0) + (overwintering?.width ?? 0)).toBeCloseTo(1)
  })

  it("returns null for a range wholly outside the year", () => {
    expect(yearSpan({ from: "2025-03-01", to: "2025-12-31" }, 2026)).toBeNull()
    expect(yearSpan({ from: "2027-01-01", to: "2027-02-01" }, 2026)).toBeNull()
  })

  it("uses 366 days in a leap year", () => {
    expect(yearSpan({ from: "2028-12-31", to: "2028-12-31" }, 2028)?.width).toBeCloseTo(1 / 366)
  })
})
