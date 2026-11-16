import { monthRanges } from "@leira/core"
import type { TFunction } from "i18next"

/** A month's name, 1 to 12, as the language writes it mid-sentence. */
export function monthName(month: number, language: string): string {
  return new Intl.DateTimeFormat(language, { month: "long", timeZone: "UTC" }).format(
    new Date(Date.UTC(2026, month - 1, 1))
  )
}

/** A crop's months in the ground in words: "April to June", "March to April and September to October". */
export function seasonText(months: readonly number[], language: string, t: TFunction): string {
  const ranges = monthRanges(months)
  if (ranges.length === 1 && ranges[0]?.[0] === 1 && ranges[0][1] === 12) return t("season.allYear")
  return new Intl.ListFormat(language, { type: "conjunction" }).format(
    ranges.map(([from, to]) =>
      from === to
        ? monthName(from, language)
        : t("season.range", { from: monthName(from, language), to: monthName(to, language) })
    )
  )
}
