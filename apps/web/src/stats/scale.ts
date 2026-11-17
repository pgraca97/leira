/**
 * The smallest round number (1, 2 or 5 times a power of ten) at or above
 * `largest`, so the top of a chart reads as a plain number. Never below 1, so
 * an empty chart still has a scale.
 */
export function niceCeiling(largest: number): number {
  if (largest <= 1) return 1
  const power = 10 ** Math.floor(Math.log10(largest))
  for (const step of [1, 2, 5, 10]) {
    if (step * power >= largest) return step * power
  }
  return 10 * power
}
