import { describe, expect, it } from "vitest"
import { clampZoom, pinchZoom, scrollToKeep, viewState, ZOOM_STEP, zoomLimits } from "./zoom"

describe("zoomLimits", () => {
  it("lets the view go out to half the size that fits the garden", () => {
    expect(zoomLimits(2, 1).min).toBe(1)
  })

  it("lets the view go in to 8 screen pixels per centimetre, counted in device pixels", () => {
    expect(zoomLimits(2, 1).max).toBe(8)
    expect(zoomLimits(2, 2).max).toBe(16)
  })

  it("never stops short of the zoom that fits a tiny garden", () => {
    expect(zoomLimits(12, 1).max).toBe(12)
  })
})

describe("clampZoom", () => {
  const limits = { min: 1, max: 8 }

  it("keeps a zoom within the limits", () => {
    expect(clampZoom(3, limits)).toBe(3)
    expect(clampZoom(0.2, limits)).toBe(1)
    expect(clampZoom(20, limits)).toBe(8)
  })
})

describe("scrollToKeep", () => {
  const view = { width: 800, height: 600 }

  it("puts a point of the garden at the centre of the view", () => {
    expect(scrollToKeep({ x: 300, y: 200 }, { x: 400, y: 300 }, 2, view)).toEqual({
      scrollX: -100,
      scrollY: -100,
    })
  })

  it("keeps a point under the pointer when the zoom changes", () => {
    // The camera shows world x = scrollX + width / 2 + (screenX - width / 2) / zoom.
    const world = { x: 120, y: 80 }
    const screen = { x: 650, y: 100 }
    for (const zoom of [1, 2.5, 6]) {
      const { scrollX, scrollY } = scrollToKeep(world, screen, zoom, view)
      expect(scrollX + view.width / 2 + (screen.x - view.width / 2) / zoom).toBeCloseTo(world.x)
      expect(scrollY + view.height / 2 + (screen.y - view.height / 2) / zoom).toBeCloseTo(world.y)
    }
  })
})

describe("pinchZoom", () => {
  it("zooms in by as much as the fingers moved apart", () => {
    expect(pinchZoom(2, 100, 150)).toBe(3)
  })

  it("zooms out as the fingers close", () => {
    expect(pinchZoom(2, 100, 50)).toBe(1)
  })

  it("leaves the zoom alone when the fingers started on the same spot", () => {
    expect(pinchZoom(2, 0, 80)).toBe(2)
  })
})

describe("viewState", () => {
  const limits = { min: 1, max: 8 }

  it("can zoom both ways from the middle of the range", () => {
    expect(viewState(2, limits, false)).toEqual({
      canZoomIn: true,
      canZoomOut: true,
      fitted: false,
    })
  })

  it("cannot zoom past either end", () => {
    expect(viewState(8, limits, false).canZoomIn).toBe(false)
    expect(viewState(1, limits, false).canZoomOut).toBe(false)
  })

  it("passes on whether the view still fits the garden", () => {
    expect(viewState(2, limits, true).fitted).toBe(true)
  })
})

describe("ZOOM_STEP", () => {
  it("makes a press of a zoom button a visible but gentle change", () => {
    expect(ZOOM_STEP).toBeGreaterThan(1.1)
    expect(ZOOM_STEP).toBeLessThan(2)
  })
})
