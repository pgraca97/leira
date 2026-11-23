import { LANGUAGE_STORAGE_KEY, LANGUAGES } from "../i18n/languages"

/** What a 404 page knows about its visitor before anything is drawn. */
export interface NotFoundVisit {
  /** The page's own `lang`, such as `pt-PT`. */
  pageLanguage: string
  /** The language the visitor chose, as the app keeps it, or null. */
  chosen: string | null
  pathname: string
  search: string
  hash: string
}

/**
 * Where to send a visitor whose chosen language is not the 404 page's, or
 * null to show them this one. Which 404 page answers depends only on the
 * address: under /en/ the English one, anywhere else the Portuguese one. So
 * the address moves into, or out of, /en/, and the one they typed stays in
 * sight. Moving out of /en/ can land on a page that exists, which is better
 * still.
 *
 * It runs inlined in the page, as its own source text: everything it needs
 * is inside it or passed in.
 */
export function notFoundInChosenLanguage(
  visit: NotFoundVisit,
  languages: readonly string[]
): string | null {
  const page = visit.pageLanguage.split("-")[0]
  const chosen = visit.chosen
  if (chosen === null || chosen === page || languages.indexOf(chosen) === -1) return null
  const rest = visit.search + visit.hash
  if (chosen === "en") return `/en${visit.pathname}${rest}`
  return visit.pathname.indexOf("/en/") === 0 ? visit.pathname.slice(3) + rest : null
}

/** The 404 pages' first script: it reads the choice and moves on when it differs. */
export const NOT_FOUND_LANGUAGE_SCRIPT = `(function (target, key, languages) {
  try {
    var to = target({
      pageLanguage: document.documentElement.lang,
      chosen: localStorage.getItem(key),
      pathname: location.pathname,
      search: location.search,
      hash: location.hash
    }, languages);
    if (to) location.replace(to);
  } catch (error) {}
})(${notFoundInChosenLanguage.toString()}, ${JSON.stringify(LANGUAGE_STORAGE_KEY)}, ${JSON.stringify(LANGUAGES)})`
