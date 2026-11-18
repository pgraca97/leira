import { addDays, daysBetween, type IsoDate } from "./dates"
import { intersection } from "./geometry"
import { type GrowingSite, seasonMonths } from "./greenhouse"
import type { DateRange } from "./schedule"
import type { Bed, BedKind, GardenPlan, Plant, PlantFamily, Planting } from "./schema"

/** The kinds of area crops grow in. Paths and structures are drawn as beds too, but hold none. */
const GROWING: readonly BedKind[] = ["bed", "container", "greenhouse"]

/**
 * The bed a planting belongs to: the growing area that holds most of its
 * ground. A planting is not tied to a bed in the plan, only drawn over one, so
 * this is worked out from where the two lie. Null on open ground.
 */
export function bedOfPlanting(plan: GardenPlan, planting: Planting): Bed | null {
  let best: Bed | null = null
  let bestArea = 0
  for (const bed of plan.beds) {
    if (!GROWING.includes(bed.kind)) continue
    const shared = intersection(bed.rect, planting.rect)
    const area = shared ? shared.w * shared.h : 0
    // On a tie the later bed wins: it is the one drawn on top.
    if (area > 0 && area >= bestArea) {
      best = bed
      bestArea = area
    }
  }
  return best
}

/**
 * Where a planting grows: in a greenhouse, in the open (a bed, a container or
 * open ground), or off the soil, when it is drawn on a path or structure and
 * on no growing area at all.
 */
export function siteOf(plan: GardenPlan, planting: Planting): GrowingSite {
  const bed = bedOfPlanting(plan, planting)
  if (bed) return bed.kind === "greenhouse" ? "greenhouse" : "open"
  const onHardGround = plan.beds.some(
    (other) => !GROWING.includes(other.kind) && intersection(other.rect, planting.rect)
  )
  return onHardGround ? "off-soil" : "open"
}

/** The plantings drawn on a path or structure, in the plan's order. */
export function findOffSoil(plan: GardenPlan): string[] {
  return plan.plantings
    .filter((planting) => siteOf(plan, planting) === "off-soil")
    .map((planting) => planting.id)
}

/** A bed over a stretch of time: what grows in it, and when it stands empty. */
export interface BedSeason {
  /** Null for the plantings that are on no bed. */
  bed: Bed | null
  /** The plantings in the ground at some point of the stretch, earliest first. */
  plantings: Planting[]
  /** When nothing at all is in the bed, for long enough to grow something. */
  free: DateRange[]
}

/**
 * Every growing bed between two days, in the plan's order, then the plantings
 * on no bed, if there are any.
 *
 * A bed is free only while nothing is in it: crops side by side make one
 * occupied stretch. That undersells a half-empty bed, but "free" then always
 * means the whole bed, which is what a following crop is planned on. Gaps
 * shorter than `minFreeDays` are left out: nothing is grown in a week.
 */
export function bedSeasons(plan: GardenPlan, range: DateRange, minFreeDays = 14): BedSeason[] {
  const growing = plan.beds.filter((bed) => GROWING.includes(bed.kind))
  const byBed = new Map<Bed | null, Planting[]>(growing.map((bed) => [bed, []]))
  for (const planting of plan.plantings) {
    if (planting.inGround.to < range.from || planting.inGround.from > range.to) continue
    const bed = bedOfPlanting(plan, planting)
    byBed.set(bed, [...(byBed.get(bed) ?? []), planting])
  }

  return [...byBed].map(([bed, plantings]) => {
    const sorted = plantings.toSorted((a, b) => a.inGround.from.localeCompare(b.inGround.from))
    const free: DateRange[] = []
    if (bed) {
      // Walk the plantings in order, keeping the first day the bed might be empty again.
      let empty = range.from
      const close = (until: IsoDate) => {
        if (daysBetween(empty, until) + 1 >= minFreeDays) free.push({ from: empty, to: until })
      }
      for (const { inGround } of sorted) {
        if (inGround.from > empty) close(addDays(inGround.from, -1))
        if (inGround.to >= empty) empty = addDays(inGround.to, 1)
      }
      if (empty <= range.to) close(range.to)
    }
    return { bed, plantings: sorted, free }
  })
}

/**
 * The crops a free stretch of ground has room for: those that can go in on
 * some day of it, in season, and be done before it ends. "Done" is the long
 * end of the crop's days to harvest, the same stay a new planting is given.
 *
 * In a greenhouse the season is a month longer at each end. Families in
 * `avoid` are left out: those the ground should rest from (`familiesToRest`).
 */
export function cropsThatFit(
  window: DateRange,
  plants: readonly Plant[],
  options: { site?: GrowingSite; avoid?: ReadonlySet<PlantFamily> } = {}
): Plant[] {
  const { site = "open", avoid } = options
  return plants.filter((plant) => {
    if (avoid?.has(plant.family)) return false
    const months = seasonMonths(plant, site)
    // The first day of the window that is in the crop's season: the window's
    // own first day, or else the first of the next month that is.
    let day = window.from
    while (day <= window.to && !months.includes(Number(day.slice(5, 7)))) {
      const month = Number(day.slice(5, 7))
      const year = Number(day.slice(0, 4))
      day = month === 12 ? `${year + 1}-01-01` : `${year}-${String(month + 1).padStart(2, "0")}-01`
    }
    return day <= window.to && addDays(day, plant.daysToHarvest[1]) <= window.to
  })
}
