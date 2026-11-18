import { createContext, type ReactNode, useContext, useMemo, useState } from "react"
import { useTranslation } from "react-i18next"
import { buttonClass } from "../components/ui"
import { currentLanguage } from "../i18n"
import { useBackend } from "../lib/backend"

/** What to tell the visitor about their account, until they close it. */
export type AccountNotice =
  /** `requested`: it will go on `deleteOn`. `cancelled`: signing in again kept it. */
  | { kind: "requested" | "cancelled"; deleteOn: Date }
  /** Signing in brought along what the guest this browser was had made. */
  | { kind: "handedOver"; gardens: number; templates: number }

interface AccountNoticeState {
  notice: AccountNotice | null
  setNotice(notice: AccountNotice | null): void
  /** Whether the account panel is open. A page can open it too, to offer keeping the gardens. */
  panelOpen: boolean
  setPanelOpen(open: boolean): void
}

const AccountNoticeContext = createContext<AccountNoticeState | null>(null)

/**
 * Holds the notice for every page of the session. The account panel that
 * asks for a deletion is gone by the time the gardens list shows, so the
 * notice lives above both, and so does whether the panel is open.
 */
export function AccountNoticeProvider({ children }: { children: ReactNode }) {
  const backend = useBackend()
  const [notice, setNotice] = useState<AccountNotice | null>(() => {
    if (backend.cancelledDeletion) return { kind: "cancelled", deleteOn: backend.cancelledDeletion }
    const brought = backend.handedOver
    return brought && brought.gardens + brought.templates > 0
      ? { kind: "handedOver", ...brought }
      : null
  })
  const [panelOpen, setPanelOpen] = useState(false)
  const value = useMemo(() => ({ notice, setNotice, panelOpen, setPanelOpen }), [notice, panelOpen])
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

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900">
      <p role="status" className="min-w-48 flex-1">
        <NoticeText notice={notice} />
      </p>
      <button type="button" className={buttonClass} onClick={() => setNotice(null)}>
        {t("account.deletionDismiss")}
      </button>
    </div>
  )
}

function NoticeText({ notice }: { notice: AccountNotice }) {
  const { t } = useTranslation()
  if (notice.kind === "handedOver") {
    const gardens = t("gardens.importGardens", { count: notice.gardens })
    const templates = t("gardens.importTemplates", { count: notice.templates })
    if (notice.gardens > 0 && notice.templates > 0) {
      return t("account.handedOverBoth", { gardens, templates })
    }
    return t("account.handedOver", { items: notice.gardens > 0 ? gardens : templates })
  }
  const date = deletionDate(notice.deleteOn)
  return notice.kind === "requested"
    ? t("account.deletionRequested", { date })
    : t("account.deletionCancelled", { date })
}
