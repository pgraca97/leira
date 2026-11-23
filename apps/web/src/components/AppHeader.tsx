import { type ReactNode, useCallback, useContext, useId, useRef, useState } from "react"
import { useTranslation } from "react-i18next"
import { AccountMenu } from "../account/AccountMenu"
import { currentLanguage } from "../i18n"
import { BackendContext } from "../lib/backend"
import { HeaderBar } from "./HeaderBar"
import { LanguageMenu } from "./LanguageMenu"
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
  const { i18n } = useTranslation()
  // The header also shows while the app is still connecting, with no account to ask about.
  const connected = useContext(BackendContext) !== null
  // The account comes last: its panel opens downwards, and in the narrow
  // screen's menu anything below the button would sit under the panel.
  const general = (
    <>
      <LanguageMenu
        current={currentLanguage()}
        onChoose={(language) => void i18n.changeLanguage(language)}
      />
      {connected && <AccountMenu />}
    </>
  )

  return (
    // A full page load: the landing page is a static file, not a page of the app.
    <HeaderBar home="/">
      {children}
      {secondary ? (
        <NarrowScreenMenu>
          {secondary}
          {general}
        </NarrowScreenMenu>
      ) : (
        general
      )}
    </HeaderBar>
  )
}

/**
 * Shows its controls in the header's row on a wide screen. On a narrow one
 * they wait in a panel behind a "More" button. The controls are the same
 * elements either way: only where they are drawn changes. "Narrow" goes up
 * to 1024 px: below that, the editor's controls all in the row would take
 * two or three lines, which a tablet's garden needs more.
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
    // `lg:contents` takes this box out of the layout on a wide screen, so the
    // controls line up with the rest of the header as if it were not there.
    <div ref={container} className="relative lg:contents">
      <button
        ref={toggle}
        type="button"
        className={`${buttonClass} lg:hidden`}
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
        } absolute top-full right-0 z-20 mt-2 flex-col items-end gap-3 rounded-md border border-stone-200 bg-white p-3 shadow-lg lg:contents`}
      >
        {children}
      </div>
    </div>
  )
}
