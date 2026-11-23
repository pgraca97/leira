import i18next, { type i18n } from "i18next"
import { en } from "../i18n/en"
import { pt } from "../i18n/pt"

/**
 * Where the site is published. Search engines and link previews need full
 * addresses, so this is written into every page. A domain of its own later is
 * a change here, plus redirects from this one.
 */
export const SITE_URL = "https://leira.paulodcgraca.workers.dev"

/** Where the code lives. The AGPL asks that people using the app can reach it. */
export const SOURCE_URL = "https://github.com/pgraca97/leira"

/** The languages the static pages are written in. Portuguese first: the crops are Portugal's. */
export const SITE_LANGUAGES = ["pt", "en"] as const
export type SiteLanguage = (typeof SITE_LANGUAGES)[number]

/** Each language's landing page. No address picks a language by itself: crawlers would only see one. */
export const HOME: Record<SiteLanguage, string> = { pt: "/", en: "/en/" }

/** The language as `lang` and `hreflang` name it. The Portuguese is Portugal's. */
export const LANGUAGE_TAG: Record<SiteLanguage, string> = { pt: "pt-PT", en: "en" }

/** A full address on the site. */
export function siteUrl(path: string): string {
  return `${SITE_URL}${path}`
}

/**
 * The strings of one language, on an instance of their own. The app's
 * `src/i18n` reads the browser's storage and sets the document's language as
 * soon as it is imported, and these pages are written where there is neither.
 */
export function siteStrings(language: SiteLanguage): i18n {
  const strings = i18next.createInstance()
  void strings.init({
    lng: language,
    resources: { [language]: { translation: language === "pt" ? pt : en } },
    // React already escapes what it renders.
    interpolation: { escapeValue: false },
    // The strings are all here: no reason to wait.
    initAsync: false,
  })
  return strings
}
