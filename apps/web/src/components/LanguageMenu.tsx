import { type MouseEvent, useCallback, useRef, useState } from "react"
import { useTranslation } from "react-i18next"
import { LANGUAGES, type Language } from "../i18n/languages"
import { buttonClass } from "./ui"
import { useDismiss } from "./useDismiss"

type LanguageMenuProps = {
  current: Language
} & (
  | {
      /** The app: the language changes in place. */
      onChoose: (language: Language) => void
      hrefs?: never
    }
  | {
      /** The static pages: each language is a page of its own, which crawlers follow. */
      hrefs: Record<Language, string>
      onChoose?: never
    }
)

const itemClass =
  "block w-full rounded px-3 py-1.5 text-left text-sm whitespace-nowrap text-stone-800 hover:bg-stone-100 aria-[current]:font-semibold aria-[current]:text-emerald-900"

/**
 * The one way to change language, in the app and on the static pages alike.
 * A `<details>` opens with no script, which the static pages need.
 */
export function LanguageMenu({ current, onChoose, hrefs }: LanguageMenuProps) {
  const { t } = useTranslation()
  const details = useRef<HTMLDetailsElement>(null)
  const summary = useRef<HTMLElement>(null)
  const [open, setOpen] = useState(false)
  const close = useCallback(() => {
    if (details.current) details.current.open = false
    setOpen(false)
  }, [])

  useDismiss(open, close, details, summary)

  const choose = (language: Language) => (event: MouseEvent) => {
    event.preventDefault()
    close()
    onChoose?.(language)
  }

  return (
    <details
      ref={details}
      className="relative"
      onToggle={(event) => setOpen(event.currentTarget.open)}
    >
      <summary
        ref={summary}
        className={`${buttonClass} cursor-pointer list-none [&::-webkit-details-marker]:hidden`}
      >
        <span className="sr-only">{t("language.label")}: </span>
        {/* A phone's header has no room for the whole name beside the page's action. */}
        <span lang={current} className="sm:hidden">
          {current.toUpperCase()}
        </span>
        <span lang={current} className="hidden sm:inline">
          {t(`language.${current}`)}
        </span>
        <svg viewBox="0 0 12 12" aria-hidden="true" className="size-3 text-stone-500">
          <path d="M3 4.5 6 7.5 9 4.5" fill="none" stroke="currentColor" strokeWidth="1.5" />
        </svg>
      </summary>
      <ul className="absolute top-full right-0 z-30 mt-1 flex min-w-full flex-col rounded-md border border-stone-200 bg-white p-1 shadow-lg">
        {LANGUAGES.map((language) => {
          const name = t(`language.${language}`)
          return (
            <li key={language}>
              {hrefs ? (
                <a
                  href={hrefs[language]}
                  hrefLang={language}
                  lang={language}
                  data-language={language}
                  aria-current={language === current ? "page" : undefined}
                  className={itemClass}
                >
                  {name}
                </a>
              ) : (
                <button
                  type="button"
                  lang={language}
                  aria-current={language === current ? "true" : undefined}
                  onClick={choose(language)}
                  className={itemClass}
                >
                  {name}
                </button>
              )}
            </li>
          )
        })}
      </ul>
    </details>
  )
}
