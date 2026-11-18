import { emptyPlan } from "@leira/core"
import { describe, expect, it } from "vitest"
import { imageSize, MAX_PIXELS, MAX_SIDE_PX } from "./imageSize"

const garden = (widthCm: number, heightCm: number) => ({ ...emptyPlan(), widthCm, heightCm })

describe("imageSize", () => {
  it("draws a small garden at four pixels a centimetre, margin included", () => {
    expect(imageSize(garden(600, 400))).toEqual({ width: 2560, height: 1760 })
  })

  it("keeps a large square garden under the pixels a phone's canvas takes", () => {
    const { width, height } = imageSize(garden(1000, 1000))
    expect(width * height).toBeLessThanOrEqual(MAX_PIXELS)
    expect(width).toBe(height)
  })

  it("keeps a long, narrow garden under the longest side a browser draws", () => {
    const { width, height } = imageSize(garden(5000, 100))
    expect(width).toBeLessThanOrEqual(MAX_SIDE_PX)
    expect(width / height).toBeCloseTo(5040 / 140, 0)
  })
})
