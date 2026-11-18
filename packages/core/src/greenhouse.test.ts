import { describe, expect, it } from "vitest"
import { seasonMonths } from "./greenhouse"

describe("seasonMonths", () => {
  it("is the crop's own months in open air", () => {
    expect(seasonMonths({ groundMonths: [4, 5, 6] }, "open")).toEqual([4, 5, 6])
  })

  it("adds a month at each end in a greenhouse", () => {
    expect(seasonMonths({ groundMonths: [4, 5, 6] }, "greenhouse")).toEqual([3, 4, 5, 6, 7])
  })

  it("carries a winter season across the new year", () => {
    expect(seasonMonths({ groundMonths: [1, 2, 11, 12] }, "greenhouse")).toEqual([
      1, 2, 3, 10, 11, 12,
    ])
  })

  it("widens each stretch of a season split in two", () => {
    expect(seasonMonths({ groundMonths: [3, 4, 8, 9] }, "greenhouse")).toEqual([
      2, 3, 4, 5, 7, 8, 9, 10,
    ])
  })

  it("leaves a year-round crop as it is", () => {
    const all = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]
    expect(seasonMonths({ groundMonths: all }, "greenhouse")).toEqual(all)
  })
})
