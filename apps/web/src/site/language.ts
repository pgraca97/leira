import { isLanguage, LANGUAGE_STORAGE_KEY } from "../i18n/languages"

/**
 * Makes the app open in the language of the page the visitor was reading,
 * unless they already chose one there. Otherwise someone reading the English
 * page in a Portuguese browser would land in a Portuguese app.
 */
export function rememberPageLanguage(
  storage: Pick<Storage, "getItem" | "setItem">,
  pageLanguage: string
): void {
  // `pt-PT` on the page is the app's `pt`.
  const language = pageLanguage.split("-")[0]
  if (!isLanguage(language) || storage.getItem(LANGUAGE_STORAGE_KEY) !== null) return
  storage.setItem(LANGUAGE_STORAGE_KEY, language)
}

/**
 * Keeps a language picked from the static pages' menu. It is the same
 * choice as the app's menu makes, so it replaces any earlier one.
 */
export function chooseLanguage(storage: Pick<Storage, "setItem">, language: string): void {
  if (isLanguage(language)) storage.setItem(LANGUAGE_STORAGE_KEY, language)
}
