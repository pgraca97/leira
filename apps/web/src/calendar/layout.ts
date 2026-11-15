import { type DateRange, daysBetween } from "@leira/core"

/** A bar on a one-year timeline: where it starts and how wide it is, as shares of the year. */
export interface YearSpan {
  start: number
  width: number
}

/**
 * Where a range of days falls on the timeline of one year. The part outside
 * the year is cut off; a range wholly outside gives null.
 */
export function yearSpan(range: DateRange, year: number): YearSpan | null {
  const first = `${year}-01-01`
  const last = `${year}-12-31`
  if (range.to < first || range.from > last) return null

  const days = daysBetween(first, last) + 1
  const from = range.from < first ? first : range.from
  const to = range.to > last ? last : range.to
  return {
    start: daysBetween(first, from) / days,
    // Both ends are part of the range, so a single day still has a width.
    width: (daysBetween(from, to) + 1) / days,
  }
}
