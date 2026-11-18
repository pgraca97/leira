import { toIsoDate } from "@leira/core"
import { useEffect, useState } from "react"
import { useTranslation } from "react-i18next"
import { buttonClass, primaryButtonClass } from "../components/ui"
import type { GardenSummary } from "../lib/gardens"
import { useAccount } from "./AccountMenu"
import { useAccountNotice } from "./AccountNotice"

/** The first day this browser opened the garden list. */
const FIRST_VISIT_KEY = "leira.firstVisit"
/** Set once the guest says "not now": the reminder does not come back. */
const CLOSED_KEY = "leira.keepReminder"

function read(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    // Storage blocked: as on a first visit, which shows nothing.
    return null
  }
}

function write(key: string, value: string): void {
  try {
    localStorage.setItem(key, value)
  } catch {
    // Not kept: at worst the reminder waits, or shows again.
  }
}

/**
 * Asks a guest to keep their gardens, at the moment it matters: when they
 * come back on another day to a garden with crops in it. A guest's gardens
 * live in this browser only and go after a year without a visit, and the
 * header's button was the only word about it. "Not now" closes it for good.
 */
export function GuestReminder({ gardens }: { gardens: readonly GardenSummary[] }) {
  const { t } = useTranslation()
  const account = useAccount()
  const { setPanelOpen } = useAccountNotice()
  const today = toIsoDate(new Date())
  const [firstVisit] = useState(() => read(FIRST_VISIT_KEY) ?? today)
  const [closed, setClosed] = useState(() => read(CLOSED_KEY) !== null)

  useEffect(() => {
    if (read(FIRST_VISIT_KEY) === null) write(FIRST_VISIT_KEY, firstVisit)
  }, [firstVisit])

  const guest = account.data?.email === null
  const madeSomething = gardens.some((garden) => (garden.plan?.plantings.length ?? 0) > 0)
  if (!guest || closed || firstVisit >= today || !madeSomething) return null

  return (
    <section
      aria-label={t("guestReminder.label")}
      className="flex flex-wrap items-center gap-3 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900"
    >
      <p className="min-w-48 flex-1">{t("guestReminder.text")}</p>
      <div className="flex gap-2">
        <button
          type="button"
          className={buttonClass}
          onClick={() => {
            write(CLOSED_KEY, today)
            setClosed(true)
          }}
        >
          {t("guestReminder.notNow")}
        </button>
        <button
          type="button"
          className={primaryButtonClass}
          onClick={() => {
            window.scrollTo({ top: 0 })
            setPanelOpen(true)
          }}
        >
          {t("guestReminder.keep")}
        </button>
      </div>
    </section>
  )
}
