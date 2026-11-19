import { en } from "../src/i18n/en"
import { pt } from "../src/i18n/pt"

/**
 * The app's own strings. They are plain objects with no i18next behind them,
 * so the Worker reads them directly and a missing key fails the typecheck.
 */
export const STRINGS = { en, pt }

/**
 * The Worker runs in UTC, and nearly everyone using the app is in Portugal:
 * near midnight the two can fall on different days.
 */
export const TIME_ZONE = "Europe/Lisbon"

/** Fills `{{name}}` placeholders the way i18next does, so the strings read the same in the app. */
export function fill(template: string, values: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (placeholder, name: string) => {
    return values[name] ?? placeholder
  })
}
