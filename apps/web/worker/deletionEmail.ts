import type { Language } from "../src/i18n/languages"
import type { MailMessage } from "./mail"
import { fill, STRINGS, TIME_ZONE } from "./strings"

/** Dates the way the privacy page writes them: "17 December 2026", "17 de dezembro de 2026". */
const DATE_LOCALE: Record<Language, string> = { en: "en-GB", pt: "pt-PT" }

/** The language as an HTML `lang` attribute names it. The Portuguese is Portugal's. */
const LANGUAGE_TAG: Record<Language, string> = { en: "en", pt: "pt-PT" }

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

function escapeHtml(text: string): string {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;")
}
