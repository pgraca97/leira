import type { Plant } from "./schema"

/*
 * How an unheated greenhouse or polytunnel, the kind a home garden has,
 * changes the advice. Checked on 2026-11-18:
 *
 * - Nights: on a clear night, when frost comes, a single layer of plastic can
 *   end up 2 to 3 °C colder than the air outside, and at best about 3 °C
 *   warmer (Wien et al., Cornell and Penn State, "Low tunnel temperatures",
 *   2008). So frost and cold-night warnings stay as in the open.
 * - Days: a vented house runs 5 to 15 °C above the air outside in the sun, and
 *   tomato pollen fails above about 32 °C (Koppert; Agroportal, "Considerações
 *   gerais sobre a cultura do tomateiro"). The RHS advises vents and shade.
 * - Soil: no clean figure was found; 2 °C warmer is an estimate.
 * - Season: about a month earlier in spring and later in autumn (Utah State
 *   University Extension, "What is a high tunnel?"; UK and Irish guides say 2
 *   to 6 weeks). No Portuguese calendar for greenhouses was found.
 */

/** How much hotter than the forecast a sunny day is inside, at the least. */
export const GREENHOUSE_HEAT_OFFSET_C = 8
/** How much warmer than in the open the soil is inside. An estimate. */
export const GREENHOUSE_SOIL_OFFSET_C = 2
/** Months the season gains at each end under cover. */
export const GREENHOUSE_EXTRA_MONTHS = 1

/** Where a planting grows, as far as the advice is concerned. */
export type GrowingSite = "open" | "greenhouse" | "off-soil"

/**
 * The months a crop can go in the ground at a site. In a greenhouse each
 * stretch of its season starts a month sooner and ends a month later, with
 * December running on into January.
 */
export function seasonMonths(plant: Pick<Plant, "groundMonths">, site: GrowingSite): number[] {
  const own = plant.groundMonths
  if (site !== "greenhouse") return [...own]
  const months = new Set(own)
  const wrap = (month: number) => ((month - 1 + 12) % 12) + 1
  for (const month of own) {
    for (let step = 1; step <= GREENHOUSE_EXTRA_MONTHS; step++) {
      months.add(wrap(month - step))
      months.add(wrap(month + step))
    }
  }
  return [...months].sort((a, b) => a - b)
}
