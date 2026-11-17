import { en } from "../src/i18n/en"
import type { Language } from "../src/i18n/languages"
import { pt } from "../src/i18n/pt"
import type { MailMessage } from "./mail"

/**
 * The app's own strings. They are plain objects with no i18next behind them,
 * so the Worker reads them directly and a missing key fails the typecheck.
 */
const STRINGS = { en, pt }

/** Dates the way the privacy page writes them: "17 December 2026", "17 de dezembro de 2026". */
const DATE_LOCALE: Record<Language, string> = { en: "en-GB", pt: "pt-PT" }

/** The language as an HTML `lang` attribute names it. The Portuguese is Portugal's. */
const LANGUAGE_TAG: Record<Language, string> = { en: "en", pt: "pt-PT" }

/**
 * The Worker runs in UTC, and nearly everyone using the app is in Portugal:
 * near midnight the two can fall on different days.
 */
const TIME_ZONE = "Europe/Lisbon"

/**
 * The confirmation of a request to delete an account: when it goes, how to
 * keep it, and whom to ask. `gardensUrl` is where signing in again starts.
 */
export function deletionEmail(options: {
  language: Language
  deleteOn: Date
  gardensUrl: string
}): Omit<MailMessage, "to"> {
  const { language, deleteOn, gardensUrl } = options
  const strings = STRINGS[language]
  const words = strings.email.deletion
  const date = new Intl.DateTimeFormat(DATE_LOCALE[language], {
    dateStyle: "long",
    timeZone: TIME_ZONE,
  }).format(deleteOn)

  const paragraphs = [words.requested, words.keep, words.meant, words.contact, strings.app.name]
  const text = { date, url: gardensUrl }
  const html = {
    date: escapeHtml(date),
    url: `<a href="${escapeHtml(gardensUrl)}">${escapeHtml(gardensUrl)}</a>`,
  }

  return {
    subject: fill(words.subject, text),
    text: paragraphs.map((paragraph) => fill(paragraph, text)).join("\n\n"),
    html: [
      "<!doctype html>",
      `<html lang="${LANGUAGE_TAG[language]}">`,
      '<body style="font-family: system-ui, sans-serif; font-size: 16px; line-height: 1.5; color: #1c1917">',
      // Escaping leaves the `{{name}}` placeholders as they are, so they are filled after.
      ...paragraphs.map((paragraph) => `<p>${fill(escapeHtml(paragraph), html)}</p>`),
      "</body>",
      "</html>",
    ].join("\n"),
  }
}

/** Fills `{{name}}` placeholders the way i18next does, so the strings read the same in the app. */
function fill(template: string, values: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (placeholder, name: string) => {
    return values[name] ?? placeholder
  })
}

function escapeHtml(text: string): string {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;")
}
