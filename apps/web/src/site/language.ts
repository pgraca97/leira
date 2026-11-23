import { isLanguage, LANGUAGE_STORAGE_KEY } from "../i18n/languages"

/**
 * Keeps the language of a static page for the app: the page the visitor was
 * reading when they went into the app, or the one they picked in its menu.
 * Either is the language they want now, so it replaces an older choice made
 * in the app. Otherwise someone who chose English months ago, reading the
 * Portuguese page, would follow "Privacidade" to an English page.
 */
export function chooseLanguage(storage: Pick<Storage, "setItem">, language: string): void {
  // `pt-PT` on the page is the app's `pt`.
  const base = language.split("-")[0]
  if (isLanguage(base)) storage.setItem(LANGUAGE_STORAGE_KEY, base)
}
