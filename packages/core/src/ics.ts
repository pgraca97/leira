import { addDays, type IsoDate } from "./dates"

/** Something to put on a calendar for a whole day. */
export interface CalendarEvent {
  /**
   * Stays the same for the same event however often the file is made, so a
   * calendar that imports it again updates the event instead of adding it twice.
   */
  uid: string
  date: IsoDate
  summary: string
  description?: string
}

/** Escapes the characters iCalendar text reserves (RFC 5545, section 3.3.11). */
function text(value: string): string {
  return value
    .replaceAll("\\", "\\\\")
    .replaceAll(";", "\\;")
    .replaceAll(",", "\\,")
    .replaceAll(/\r?\n/g, "\\n")
}

/** How many bytes one character takes in UTF-8. Worked out by hand: this package has no platform APIs. */
function utf8Bytes(character: string): number {
  const code = character.codePointAt(0) ?? 0
  if (code < 0x80) return 1
  if (code < 0x800) return 2
  return code < 0x10000 ? 3 : 4
}

/**
 * Splits a line longer than 75 bytes into several, each continuation starting
 * with a space, as the format asks. Counted in bytes of UTF-8 and cut between
 * characters, so an accented letter is never split in two.
 */
function fold(line: string): string[] {
  const parts: string[] = []
  let part = ""
  let size = 0
  for (const character of line) {
    const bytes = utf8Bytes(character)
    if (size + bytes > 75) {
      parts.push(part)
      // The space that starts a continuation counts towards its 75 bytes.
      part = " "
      size = 1
    }
    part += character
    size += bytes
  }
  return [...parts, part]
}

const compact = (date: IsoDate) => date.replaceAll("-", "")

/**
 * A calendar file (iCalendar, the `.ics` that phone and desktop calendars
 * import) with one all-day event per entry. `stamp` is the moment the file is
 * made, as an ISO date and time in UTC: it is passed in so this stays pure.
 */
export function icsCalendar(
  events: readonly CalendarEvent[],
  options: { name: string; stamp: string }
): string {
  // 2026-11-16T12:30:45.000Z becomes 20261116T123045Z.
  const stamp = `${options.stamp.slice(0, 19).replaceAll(/[-:]/g, "")}Z`
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Leira//Garden jobs//EN",
    "CALSCALE:GREGORIAN",
    `X-WR-CALNAME:${text(options.name)}`,
    ...events.flatMap((event) => [
      "BEGIN:VEVENT",
      `UID:${event.uid}@leira`,
      `DTSTAMP:${stamp}`,
      `DTSTART;VALUE=DATE:${compact(event.date)}`,
      // An all-day event ends at the start of the following day.
      `DTEND;VALUE=DATE:${compact(addDays(event.date, 1))}`,
      `SUMMARY:${text(event.summary)}`,
      ...(event.description ? [`DESCRIPTION:${text(event.description)}`] : []),
      "END:VEVENT",
    ]),
    "END:VCALENDAR",
  ]
  return `${lines.flatMap(fold).join("\r\n")}\r\n`
}
