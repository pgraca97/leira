import { createContext, type ReactNode, useContext, useMemo, useState } from "react"
import { useTranslation } from "react-i18next"
import { buttonClass } from "../components/ui"
import { currentLanguage } from "../i18n"
import { useBackend } from "../lib/backend"

/** What to tell the visitor about their account's deletion, until they close it. */
export interface AccountNotice {
  /** `requested`: it will go on `deleteOn`. `cancelled`: signing in again kept it. */
  kind: "requested" | "cancelled"
  deleteOn: Date
}

interface AccountNoticeState {
  notice: AccountNotice | null
  setNotice(notice: AccountNotice | null): void
}

const AccountNoticeContext = createContext<AccountNoticeState | null>(null)

/**
 * Holds the notice for every page of the session. The account panel that
 * asks for a deletion is gone by the time the gardens list shows, so the
 * notice lives above both.
 */
export function AccountNoticeProvider({ children }: { children: ReactNode }) {
  const backend = useBackend()
  const [notice, setNotice] = useState<AccountNotice | null>(() =>
    backend.cancelledDeletion ? { kind: "cancelled", deleteOn: backend.cancelledDeletion } : null
  )
  const value = useMemo(() => ({ notice, setNotice }), [notice])
  return <AccountNoticeContext value={value}>{children}</AccountNoticeContext>
}

export function useAccountNotice(): AccountNoticeState {
  const state = useContext(AccountNoticeContext)
  if (!state) throw new Error("useAccountNotice needs an AccountNoticeProvider")
  return state
}

/** The day an account goes, written out in full: it is not a date to misread. */
export function deletionDate(date: Date): string {
  return new Intl.DateTimeFormat(currentLanguage(), { dateStyle: "long" }).format(date)
}

/** The notice, if there is one, with a button to close it. */
export function AccountNoticeBanner() {
  const { t } = useTranslation()
  const { notice, setNotice } = useAccountNotice()
  if (!notice) return null

  const date = deletionDate(notice.deleteOn)
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900">
      <p role="status" className="min-w-48 flex-1">
        {notice.kind === "requested"
          ? t("account.deletionRequested", { date })
          : t("account.deletionCancelled", { date })}
      </p>
      <button type="button" className={buttonClass} onClick={() => setNotice(null)}>
        {t("account.deletionDismiss")}
      </button>
    </div>
  )
}
