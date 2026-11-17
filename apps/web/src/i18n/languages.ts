/**
 * The app's languages and where the visitor's choice is kept. Apart from
 * `./index`, which starts i18next as soon as it is imported, so the static
 * pages can read them without loading every string.
 */
export const LANGUAGES = ["pt", "en"] as const
export type Language = (typeof LANGUAGES)[number]

/** Where the chosen language is kept in the browser. */
export const LANGUAGE_STORAGE_KEY = "garden.language"

export function isLanguage(value: unknown): value is Language {
  return LANGUAGES.includes(value as Language)
}
