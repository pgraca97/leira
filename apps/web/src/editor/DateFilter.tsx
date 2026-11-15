import { addMonths } from "@leira/core"
import { useTranslation } from "react-i18next"
import { buttonClass, inputClass } from "../components/ui"
import { editorStore } from "./store"
import { useEditor } from "./useEditor"

/**
 * Picks the day the garden is shown on. A plan holds several seasons at once;
 * with a day picked, the canvas shows only what is in the ground then, and new
 * plantings start on that day.
 */
export function DateFilter() {
  const { t } = useTranslation()
  const viewDate = useEditor((state) => state.viewDate)
  const { setViewDate } = editorStore.getState()

  return (
    <div className="flex flex-wrap items-center gap-1 rounded-md bg-white/90 p-1 text-sm text-stone-700 shadow-sm">
      <label className="flex items-center gap-2 pl-1">
        {t("dateFilter.label")}
        <input
          type="date"
          className={inputClass}
          value={viewDate ?? ""}
          onChange={(event) => setViewDate(event.target.value)}
        />
      </label>
      {viewDate && (
        <>
          <button
            type="button"
            className={buttonClass}
            aria-label={t("dateFilter.previousMonth")}
            onClick={() => setViewDate(addMonths(viewDate, -1))}
          >
            <span aria-hidden="true">‹</span>
          </button>
          <button
            type="button"
            className={buttonClass}
            aria-label={t("dateFilter.nextMonth")}
            onClick={() => setViewDate(addMonths(viewDate, 1))}
          >
            <span aria-hidden="true">›</span>
          </button>
          <button type="button" className={buttonClass} onClick={() => setViewDate(null)}>
            {t("dateFilter.showAll")}
          </button>
        </>
      )}
    </div>
  )
}
