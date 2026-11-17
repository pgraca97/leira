import { type ReactNode, useCallback, useContext, useId, useRef, useState } from "react"
import { useTranslation } from "react-i18next"
import { AccountMenu } from "../account/AccountMenu"
import { BackendContext } from "../lib/backend"
import { LanguageSwitcher } from "./LanguageSwitcher"
import { buttonClass } from "./ui"
import { useDismiss } from "./useDismiss"

interface AppHeaderProps {
  /** The page's own controls: what must stay in sight on any screen. */
  children?: ReactNode
  /**
   * Controls of the page that can wait behind a menu on a narrow screen. With
   * any of these, the account and the language go behind that menu too, so the
   * header keeps to two lines on a phone.
   */
  secondary?: ReactNode
}

/** The bar across the top of every page. */
export function AppHeader({ children, secondary }: AppHeaderProps) {
  const { t } = useTranslation()
  // The header also shows while the app is still connecting, with no account to ask about.
  const connected = useContext(BackendContext) !== null
  const general = (
    <>
      {connected && <AccountMenu />}
      <LanguageSwitcher />
    </>
  )

  return (
    <header className="flex flex-wrap print:hidden items-center gap-x-4 gap-y-2 border-b border-stone-200 bg-white px-4 py-2">
      {/* A full page load: the landing page is a static file, not a page of the app. */}
      <a href="/" className="flex items-center gap-2 font-semibold text-emerald-900">
        <img src="/favicon.svg" alt="" className="size-5" />
        {t("app.name")}
      </a>
      <div className="flex flex-1 flex-wrap items-center justify-end gap-x-4 gap-y-2">
        {children}
        {secondary ? (
          <NarrowScreenMenu>
            {secondary}
            {general}
          </NarrowScreenMenu>
        ) : (
          general
        )}
      </div>
    </header>
  )
}

/**
 * Shows its controls in the header's row on a wide screen. On a narrow one
 * they wait in a panel behind a "More" button. The controls are the same
 * elements either way: only where they are drawn changes.
 */
function NarrowScreenMenu({ children }: { children: ReactNode }) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const container = useRef<HTMLDivElement>(null)
  const toggle = useRef<HTMLButtonElement>(null)
  const panelId = useId()
  const close = useCallback(() => setOpen(false), [])

  useDismiss(open, close, container, toggle)

  return (
    // `sm:contents` takes this box out of the layout on a wide screen, so the
    // controls line up with the rest of the header as if it were not there.
    <div ref={container} className="relative sm:contents">
      <button
        ref={toggle}
        type="button"
        className={`${buttonClass} sm:hidden`}
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen(!open)}
      >
        {t("common.more")}
      </button>
      <div
        id={panelId}
        className={`${
          open ? "flex" : "hidden"
        } absolute top-full right-0 z-20 mt-2 flex-col items-end gap-3 rounded-md border border-stone-200 bg-white p-3 shadow-lg sm:contents`}
      >
        {children}
      </div>
    </div>
  )
}
