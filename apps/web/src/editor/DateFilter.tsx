import { addMonths, type GardenPlan, type IsoDate, nearestPlantedDay } from "@leira/core"
import { useTranslation } from "react-i18next"
import { buttonClass, inputClass } from "../components/ui"
import { currentLanguage } from "../i18n"
import { editorStore } from "./store"
import { useEditor } from "./useEditor"

/**
 * Picks the day the garden is shown on. A plan holds several seasons at once;
 * with a day picked, only what is in the ground then is shown. On a day with
 * nothing in the ground it says so and offers the nearest day that has crops,
 * so a garden opened in winter does not look lost.
 */
export function DateFilter({
  value,
  onChange,
  plan,
}: {
  value: IsoDate | null
  onChange(date: IsoDate | null): void
  plan: GardenPlan
}) {
  const { t } = useTranslation()
  const nearest = value ? nearestPlantedDay(plan, value) : null
  const dateFormat = new Intl.DateTimeFormat(currentLanguage(), {
    dateStyle: "medium",
    timeZone: "UTC",
  })

  return (
    <div className="flex flex-wrap items-center gap-1 rounded-md bg-white/90 p-1 text-sm text-stone-700 shadow-sm">
      <label className="flex items-center gap-2 pl-1">
        {/* The full sentence does not fit beside undo and redo on a narrow screen. */}
        <span className="sm:hidden">{t("dateFilter.labelShort")}</span>
        <span className="hidden sm:inline">{t("dateFilter.label")}</span>
        <input
          type="date"
          aria-label={t("dateFilter.label")}
          className={inputClass}
          value={value ?? ""}
          onChange={(event) => onChange(event.target.value)}
        />
      </label>
      {value && (
        <>
          <button
            type="button"
            className={buttonClass}
            aria-label={t("dateFilter.previousMonth")}
            onClick={() => onChange(addMonths(value, -1))}
          >
            <span aria-hidden="true">‹</span>
          </button>
          <button
            type="button"
            className={buttonClass}
            aria-label={t("dateFilter.nextMonth")}
            onClick={() => onChange(addMonths(value, 1))}
          >
            <span aria-hidden="true">›</span>
          </button>
          <button type="button" className={buttonClass} onClick={() => onChange(null)}>
            {t("dateFilter.showAll")}
          </button>
        </>
      )}
      {nearest && nearest !== value && (
        <p role="status" className="flex basis-full flex-wrap items-center gap-2 pl-1">
          <span>{t("dateFilter.emptyDay")}</span>
          <button type="button" className={buttonClass} onClick={() => onChange(nearest)}>
            {t("dateFilter.showDay", {
              date: dateFormat.format(new Date(`${nearest}T00:00:00Z`)),
            })}
          </button>
        </p>
      )}
    </div>
  )
}

/** The editor's day picker: the day lives in the editor store, shared with the calendar. */
export function EditorDateFilter() {
  const viewDate = useEditor((state) => state.viewDate)
  const plan = useEditor((state) => state.plan)
  return <DateFilter value={viewDate} plan={plan} onChange={editorStore.getState().setViewDate} />
}
