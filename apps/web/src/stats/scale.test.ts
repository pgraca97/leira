import { describe, expect, it } from "vitest"
import { niceCeiling } from "./scale"

describe("the top of a chart's scale", () => {
  it.each([
    [0, 1],
    [1, 1],
    [2, 2],
    [3, 5],
    [5, 5],
    [7, 10],
    [12, 20],
    [30, 50],
    [51, 100],
    [157, 200],
  ])("for a largest value of %i is %i", (largest, top) => {
    expect(niceCeiling(largest)).toBe(top)
  })
})
