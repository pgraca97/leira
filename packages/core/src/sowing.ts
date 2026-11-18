import { siteOf } from "./beds"
import { addDays, type IsoDate } from "./dates"
import { seasonMonths } from "./greenhouse"
import type { GardenTaskKind } from "./schedule"
import type { GardenPlan, Plant } from "./schema"

/** What the season needs to know about a crop. */
type Seasonal = Pick<Plant, "groundMonths" | "indoorsWeeks">

/** The month of a date, 1 to 12. */
function monthOf(date: IsoDate): number {
  return Number(date.slice(5, 7))
}

/**
 * The ways a crop can be started on a day: sown where it grows, sown under
 * cover to go out later, or planted out as seedlings (raised or bought).
 * Empty when it is not the time for any of them.
 *
 * Seedlings are worth starting when they would be ready to go out in season,
 * so a crop that goes out in April is started in February.
 */
export function startsOn(
  plant: Seasonal,
  date: IsoDate
): Extract<GardenTaskKind, "sow-indoors" | "sow" | "transplant">[] {
  const inSeason = (day: IsoDate) => plant.groundMonths.includes(monthOf(day))
  if (!plant.indoorsWeeks) return inSeason(date) ? ["sow"] : []
  return [
    ...(inSeason(addDays(date, 7 * plant.indoorsWeeks)) ? (["sow-indoors"] as const) : []),
    ...(inSeason(date) ? (["transplant"] as const) : []),
  ]
}

/**
 * Months as stretches of consecutive ones, first and last included, to say
 * "April to June" instead of listing them. December runs on into January, so
 * a winter season is one stretch that starts in the autumn: [10, 2].
 */
export function monthRanges(months: readonly number[]): [number, number][] {
  const ranges: [number, number][] = []
  for (const month of months) {
    const last = ranges.at(-1)
    if (last && last[1] === month - 1) last[1] = month
    else ranges.push([month, month])
  }
  const first = ranges[0]
  const last = ranges.at(-1)
  // A year-round crop is one stretch already; do not join it to itself.
  if (first && last && first !== last && first[0] === 1 && last[1] === 12) {
    ranges.shift()
    last[1] = first[1]
  }
  return ranges
}

export interface OutOfSeason {
  plantingId: string
  plantId: string
  /** The month the planting goes in the ground, which is not one of its crop's. */
  month: number
}

/**
 * The plantings due in the ground outside their crop's season. A planting
 * recorded as already in the ground is left out: there is nothing left to
 * plan about a day that has happened. In a greenhouse the season is longer;
 * a planting on a path or structure has a warning of its own.
 */
export function findOutOfSeason(
  plan: GardenPlan,
  getPlant: (id: string) => Plant | undefined
): OutOfSeason[] {
  return plan.plantings.flatMap((planting) => {
    const plant = getPlant(planting.plantId)
    const month = monthOf(planting.inGround.from)
    if (!plant || planting.planted) return []
    const site = siteOf(plan, planting)
    if (site === "off-soil" || seasonMonths(plant, site).includes(month)) return []
    return [{ plantingId: planting.id, plantId: plant.id, month }]
  })
}
