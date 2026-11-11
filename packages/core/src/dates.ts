/**
 * Calendar dates travel as `YYYY-MM-DD` strings with no time and no zone, so a
 * sowing date means the same day wherever the plan is opened. ISO dates also
 * sort and compare correctly as plain strings.
 */
export type IsoDate = string

const DAY_MS = 86_400_000

/** The local calendar day of `date` as an ISO date. */
export function toIsoDate(date: Date): IsoDate {
  const year = String(date.getFullYear()).padStart(4, "0")
  const month = String(date.getMonth() + 1).padStart(2, "0")
  const day = String(date.getDate()).padStart(2, "0")
  return `${year}-${month}-${day}`
}

/** Adds (or subtracts) whole days. Works in UTC so daylight saving cannot shift the result. */
export function addDays(date: IsoDate, days: number): IsoDate {
  const shifted = new Date(Date.parse(`${date}T00:00:00Z`) + days * DAY_MS)
  return shifted.toISOString().slice(0, 10)
}

/**
 * Adds (or subtracts) whole months, keeping the day of the month. A day the
 * target month does not have becomes that month's last day: a month after
 * 31 January is 28 (or 29) February.
 */
export function addMonths(date: IsoDate, months: number): IsoDate {
  const [year = 0, month = 1, day = 1] = date.split("-").map(Number)
  const first = new Date(Date.UTC(year, month - 1 + months, 1))
  const lastDay = new Date(
    Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)
  ).getUTCDate()
  first.setUTCDate(Math.min(day, lastDay))
  return first.toISOString().slice(0, 10)
}

/** Whole days from `from` to `to`: negative when `to` comes first. */
export function daysBetween(from: IsoDate, to: IsoDate): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS)
}

/** The calendar year of an ISO date. */
export function yearOf(date: IsoDate): number {
  return Number(date.slice(0, 4))
}
