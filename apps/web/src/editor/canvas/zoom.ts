import type { Point } from "@leira/core"

/**
 * The arithmetic of zooming the canvas, kept apart from Phaser so it can be
 * tested without one. Zoom is "screen pixels per centimetre", in the device
 * pixels the canvas is drawn in.
 */

/** Closest zoom, in CSS pixels per centimetre. */
const MAX_ZOOM_PX_PER_CM = 8
/** How far out the view may zoom, relative to the zoom that fits the whole garden. */
const MIN_ZOOM_FACTOR = 0.5
/** How much one press of a zoom button changes the zoom. */
export const ZOOM_STEP = 1.25
/** Two zooms closer than this are the same one: they differ by rounding only. */
const EPSILON = 1e-6

export interface ZoomLimits {
  min: number
  max: number
}

/** What the view can still do, for the controls that change it. */
export interface ViewState {
  canZoomIn: boolean
  canZoomOut: boolean
  /** The view is the one that fits the whole garden, untouched since. */
  fitted: boolean
}

/**
 * How far the view may zoom, given the zoom that fits the whole garden.
 * A garden so small that fitting it takes more than the usual closest zoom
 * can still be fitted.
 */
export function zoomLimits(fitZoom: number, pixelRatio: number): ZoomLimits {
  return {
    min: fitZoom * MIN_ZOOM_FACTOR,
    max: Math.max(fitZoom, MAX_ZOOM_PX_PER_CM * pixelRatio),
  }
}

export function clampZoom(zoom: number, limits: ZoomLimits): number {
  return Math.min(Math.max(zoom, limits.min), limits.max)
}

/**
 * The camera scroll that shows the garden point `world` at the screen point
 * `screen`. Zooming about a point is changing the zoom and then scrolling so
 * the point stays where it was: under the cursor, or between two fingers.
 */
export function scrollToKeep(
  world: Point,
  screen: Point,
  zoom: number,
  view: { width: number; height: number }
): { scrollX: number; scrollY: number } {
  return {
    scrollX: world.x - view.width / 2 - (screen.x - view.width / 2) / zoom,
    scrollY: world.y - view.height / 2 - (screen.y - view.height / 2) / zoom,
  }
}

/** The zoom after two fingers that started `startDistance` apart are now `distance` apart. */
export function pinchZoom(startZoom: number, startDistance: number, distance: number): number {
  return startDistance > 0 ? (startZoom * distance) / startDistance : startZoom
}

export function viewState(zoom: number, limits: ZoomLimits, fitted: boolean): ViewState {
  return {
    canZoomIn: zoom < limits.max - EPSILON,
    canZoomOut: zoom > limits.min + EPSILON,
    fitted,
  }
}
