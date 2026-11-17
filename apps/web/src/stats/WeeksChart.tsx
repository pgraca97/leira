import { useTranslation } from "react-i18next"
import type { UsageStats } from "../lib/stats"
import { niceCeiling } from "./scale"

type Week = UsageStats["weeks"][number]

/** Twelve dates do not fit under the bars on a phone, so every third week gets one, ending with this week. */
const LABEL_EVERY = 3

/**
 * People active each week, as stacked bars: those who had been here before at
 * the bottom, those here for the first time on top. Plain HTML rather than SVG,
 * so the labels keep their size on any screen. The same numbers are in a table
 * below, for screen readers and for reading exact values.
 */
export function WeeksChart({ weeks, locale }: { weeks: Week[]; locale: string }) {
  const { t } = useTranslation()
  const top = niceCeiling(Math.max(0, ...weeks.map((week) => week.active)))
  const numbers = new Intl.NumberFormat(locale)
  const days = new Intl.DateTimeFormat(locale, { day: "numeric", month: "short", timeZone: "UTC" })
  const weekLabel = (week: Week) => days.format(new Date(`${week.weekStart}T00:00:00Z`))
  const height = (value: number) => `${(value / top) * 100}%`
  const thisWeek = weeks.at(-1)

  return (
    <figure className="flex flex-col gap-2">
      <ul className="flex flex-wrap gap-4 text-xs text-stone-700">
        <li className="flex items-center gap-1.5">
          <span aria-hidden="true" className="size-3 rounded-sm bg-emerald-700" />
          {t("stats.cameBack")}
        </li>
        <li className="flex items-center gap-1.5">
          <span aria-hidden="true" className="size-3 rounded-sm bg-amber-600" />
          {t("stats.firstTime")}
        </li>
      </ul>

      <div
        role="img"
        aria-label={
          thisWeek &&
          t("stats.weeksSummary", { active: thisWeek.active, returning: thisWeek.returning })
        }
        className="relative h-40"
      >
        <div
          aria-hidden="true"
          className="absolute inset-y-0 left-0 w-7 text-[10px] text-stone-500"
        >
          <span className="absolute top-0 -translate-y-1/2 tabular-nums">
            {numbers.format(top)}
          </span>
          <span className="absolute bottom-0 translate-y-1/2 tabular-nums">0</span>
        </div>
        <div
          aria-hidden="true"
          className="absolute top-0 right-0 left-7 border-t border-stone-200"
        />
        <div className="absolute inset-y-0 right-0 left-7 flex items-end gap-1 border-b border-stone-300">
          {weeks.map((week) => {
            const firstTime = week.active - week.returning
            return (
              <div
                key={week.weekStart}
                title={t("stats.weekBar", {
                  date: weekLabel(week),
                  active: week.active,
                  returning: week.returning,
                })}
                className="flex h-full flex-1 flex-col justify-end gap-0.5 hover:opacity-80"
              >
                {/* Only the bar's top end is rounded, whichever segment that is. */}
                {firstTime > 0 && (
                  <div className="rounded-t bg-amber-600" style={{ height: height(firstTime) }} />
                )}
                {week.returning > 0 && (
                  <div
                    className={firstTime > 0 ? "bg-emerald-700" : "rounded-t bg-emerald-700"}
                    style={{ height: height(week.returning) }}
                  />
                )}
              </div>
            )
          })}
        </div>
      </div>
      <div aria-hidden="true" className="flex gap-1 pl-7 text-[10px] text-stone-500">
        {weeks.map((week, index) => (
          <span key={week.weekStart} className="flex-1 text-center whitespace-nowrap">
            {(weeks.length - 1 - index) % LABEL_EVERY === 0 ? weekLabel(week) : ""}
          </span>
        ))}
      </div>

      <details className="text-sm">
        <summary className="cursor-pointer text-emerald-800 underline-offset-2 hover:underline">
          {t("stats.showNumbers")}
        </summary>
        <table className="mt-2 w-full text-left tabular-nums">
          <thead className="text-xs text-stone-600">
            <tr>
              <th scope="col" className="py-1 font-medium">
                {t("stats.week")}
              </th>
              <th scope="col" className="py-1 text-right font-medium">
                {t("stats.active")}
              </th>
              <th scope="col" className="py-1 text-right font-medium">
                {t("stats.cameBack")}
              </th>
              <th scope="col" className="py-1 text-right font-medium">
                {t("stats.joined")}
              </th>
            </tr>
          </thead>
          <tbody className="text-stone-800">
            {weeks.map((week) => (
              <tr key={week.weekStart} className="border-t border-stone-200">
                <th scope="row" className="py-1 font-normal">
                  {weekLabel(week)}
                </th>
                <td className="py-1 text-right">{numbers.format(week.active)}</td>
                <td className="py-1 text-right">{numbers.format(week.returning)}</td>
                <td className="py-1 text-right">{numbers.format(week.newPeople)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </figure>
  )
}
