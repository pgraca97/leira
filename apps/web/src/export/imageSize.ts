import type { GardenPlan } from "@leira/core"

/** Pixels per centimetre of garden in a saved image: a 6 m garden comes out 2560 px wide. */
const PIXELS_PER_CM = 4
/** Longest side of a saved image. Browsers refuse canvases much larger than this. */
export const MAX_SIDE_PX = 8000
/**
 * Most pixels in a saved image. Safari on iPhone and iPad refuses a canvas above
 * about 16.7 million, so a 10 x 10 m garden at full scale would not save there.
 */
export const MAX_PIXELS = 16_000_000
/** Matches the margin `PlanSvg` draws around the garden. */
const MARGIN_CM = 20

/** The picture's size in pixels: true to scale, capped so a huge garden still exports. */
export function imageSize(plan: GardenPlan): { width: number; height: number } {
  const width = plan.widthCm + 2 * MARGIN_CM
  const height = plan.heightCm + 2 * MARGIN_CM
  const scale = Math.min(
    PIXELS_PER_CM,
    MAX_SIDE_PX / Math.max(width, height),
    Math.sqrt(MAX_PIXELS / (width * height))
  )
  // Rounded down, so rounding never takes the picture back over a cap.
  return { width: Math.floor(width * scale), height: Math.floor(height * scale) }
}
