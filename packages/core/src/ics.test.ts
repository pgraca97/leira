import { describe, expect, it } from "vitest"
import { icsCalendar } from "./ics"

const STAMP = "2026-11-16T12:30:45.000Z"

describe("icsCalendar", () => {
  const text = icsCalendar(
    [
      { uid: "p1-sow", date: "2026-12-04", summary: "Sow Onion indoors" },
      { uid: "p2-clear", date: "2026-12-31", summary: "Clear Carrot", description: "Back garden" },
    ],
    { name: "Back garden", stamp: STAMP }
  )
  const lines = text.split("\r\n")

  it("is a calendar file, with lines ending the way the format asks", () => {
    expect(lines[0]).toBe("BEGIN:VCALENDAR")
    expect(lines).toContain("VERSION:2.0")
    expect(lines.some((line) => line.startsWith("PRODID:"))).toBe(true)
    expect(lines).toContain("X-WR-CALNAME:Back garden")
    expect(lines.at(-2)).toBe("END:VCALENDAR")
    // The file ends with a line break, and has no bare line feeds.
    expect(lines.at(-1)).toBe("")
    expect(text.replaceAll("\r\n", "")).not.toMatch(/[\r\n]/)
  })

  it("makes each job an event that takes the whole day", () => {
    expect(lines.filter((line) => line === "BEGIN:VEVENT")).toHaveLength(2)
    expect(lines).toContain("DTSTART;VALUE=DATE:20261204")
    // The end is the day after: an all-day event ends where the next day starts.
    expect(lines).toContain("DTEND;VALUE=DATE:20261205")
    expect(lines).toContain("DTEND;VALUE=DATE:20270101")
    expect(lines).toContain("SUMMARY:Sow Onion indoors")
    expect(lines).toContain("DESCRIPTION:Back garden")
  })

  it("gives each event an id that stays the same, so importing twice does not double it", () => {
    expect(lines).toContain("UID:p1-sow@leira")
    expect(lines).toContain("UID:p2-clear@leira")
    expect(lines.filter((line) => line === "DTSTAMP:20261116T123045Z")).toHaveLength(2)
  })

  it("escapes the characters the format reserves", () => {
    const escaped = icsCalendar(
      [{ uid: "a", date: "2026-12-04", summary: "Sow peas, beans; and more\\less\nnext" }],
      { name: "A, B", stamp: STAMP }
    )
    expect(escaped).toContain("SUMMARY:Sow peas\\, beans\\; and more\\\\less\\nnext\r\n")
    expect(escaped).toContain("X-WR-CALNAME:A\\, B\r\n")
  })

  it("folds lines longer than 75 bytes, without cutting a letter in two", () => {
    const long = `Semear ${"feijão-verde 🌱 ".repeat(12)}`.trim()
    const folded = icsCalendar([{ uid: "a", date: "2026-12-04", summary: long }], {
      name: "Horta",
      stamp: STAMP,
    })
    // Each byte of UTF-8 is one "%XX" or one plain character once percent-encoded.
    const bytes = (line: string) => encodeURIComponent(line).replace(/%[0-9A-F]{2}/g, "x").length
    for (const line of folded.split("\r\n")) expect(bytes(line)).toBeLessThanOrEqual(75)
    // Unfolded again, the text is whole: a fold is a line break and one space.
    expect(folded.replaceAll("\r\n ", "")).toContain(`SUMMARY:${long}\r\n`)
  })

  it("adds no alarm and no refresh hint unless asked", () => {
    expect(lines).not.toContain("BEGIN:VALARM")
    expect(lines.some((line) => line.startsWith("REFRESH-INTERVAL"))).toBe(false)
  })

  it("can ask for an alarm on each event, that long after its day starts", () => {
    const alarmed = icsCalendar(
      [
        { uid: "p1-sow", date: "2026-12-04", summary: "Sow Onion indoors" },
        { uid: "p2-clear", date: "2026-12-31", summary: "Clear Carrot" },
      ],
      { name: "Back garden", stamp: STAMP, alarm: "PT9H" }
    ).split("\r\n")
    expect(alarmed.filter((line) => line === "BEGIN:VALARM")).toHaveLength(2)
    expect(alarmed.filter((line) => line === "TRIGGER:PT9H")).toHaveLength(2)
    expect(alarmed).toContain("ACTION:DISPLAY")
    // A display alarm must say something: it says the job.
    const first = alarmed.indexOf("BEGIN:VALARM")
    expect(alarmed.slice(first, first + 5)).toEqual([
      "BEGIN:VALARM",
      "ACTION:DISPLAY",
      "DESCRIPTION:Sow Onion indoors",
      "TRIGGER:PT9H",
      "END:VALARM",
    ])
    // The alarm sits inside its event.
    expect(alarmed[first + 5]).toBe("END:VEVENT")
  })

  it("can say how often a subscribed calendar should look again", () => {
    const hinted = icsCalendar([], { name: "Horta", stamp: STAMP, refresh: "PT6H" }).split("\r\n")
    expect(hinted).toContain("REFRESH-INTERVAL;VALUE=DURATION:PT6H")
    expect(hinted).toContain("X-PUBLISHED-TTL:PT6H")
  })

  it("is still a calendar with no events", () => {
    const empty = icsCalendar([], { name: "Horta", stamp: STAMP }).split("\r\n")
    expect(empty[0]).toBe("BEGIN:VCALENDAR")
    expect(empty).not.toContain("BEGIN:VEVENT")
    expect(empty.at(-2)).toBe("END:VCALENDAR")
  })
})
