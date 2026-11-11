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
    <p role="status" className="text-sm text-stone-500">
      {t(`save.${status}`)}
    </p>
  )
}
