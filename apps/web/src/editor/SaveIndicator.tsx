import { useTranslation } from "react-i18next"
import { buttonClass } from "../components/ui"
import type { SaveStatus } from "./autosave"

interface SaveIndicatorProps {
  status: SaveStatus
  onRetry(): void
  /** Loads the garden again, dropping what could not be saved. */
  onReload(): void
}

/** Says whether the garden is saved, and what to do when it is not. */
export function SaveIndicator({ status, onRetry, onReload }: SaveIndicatorProps) {
  const { t } = useTranslation()

  if (status === "conflict" || status === "error") {
    const conflict = status === "conflict"
    return (
      <div
        role="alert"
        className="flex flex-wrap items-center gap-2 rounded-md bg-red-50 px-2 py-1 text-sm text-red-800"
      >
        <span>{t(conflict ? "save.conflict" : "save.error")}</span>
        <button type="button" className={buttonClass} onClick={conflict ? onReload : onRetry}>
          {t(conflict ? "save.reload" : "common.retry")}
        </button>
      </div>
    )
  }

  return (
    // Every label sits in the same cell, so the indicator is always as wide as
    // the longest one. Otherwise each save would change its width, and on a
    // phone that wraps the header and moves the garden. The others are drawn
    // from an attribute by CSS, so they are no part of the page's text.
    <p role="status" className="grid text-sm text-stone-500">
      {QUIET_STATUSES.filter((other) => other !== status).map((other) => (
        <span
          key={other}
          aria-hidden="true"
          data-label={t(`save.${other}`)}
          className="invisible col-start-1 row-start-1 whitespace-nowrap before:content-[attr(data-label)]"
        />
      ))}
      <span className="col-start-1 row-start-1 whitespace-nowrap">{t(`save.${status}`)}</span>
    </p>
  )
}

/** The states that need nothing from the user, and so share one small label. */
const QUIET_STATUSES = ["saved", "pending", "saving"] as const
