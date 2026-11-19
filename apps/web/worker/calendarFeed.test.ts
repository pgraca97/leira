import { emptyPlan, type Planting } from "@leira/core"
import { describe, expect, it } from "vitest"
import { calendarFeed } from "./calendarFeed"

// Tomato: sown indoors 6 weeks before going out, on 20 March.
const TOMATOES: Planting = {
  id: "tomatoes",
  plantId: "tomato",
  rect: { x: 0, y: 0, w: 100, h: 100 },
  layout: "block",
  inGround: { from: "2026-05-01", to: "2026-09-30" },
}
const GARDEN = { name: "Allotment 12", plan: { ...emptyPlan(), plantings: [TOMATOES] } }

const lines = (text: string) => text.split("\r\n")
const starts = (text: string) => lines(text).filter((line) => line.startsWith("DTSTART"))

describe("calendarFeed", () => {
  it("names the calendar after the app and the garden, and asks to be read again", () => {
    const feed = lines(calendarFeed(GARDEN, { language: "en", now: new Date("2026-04-10T12:00Z") }))
    expect(feed).toContain("X-WR-CALNAME:Leira · Allotment 12")
    expect(feed).toContain("REFRESH-INTERVAL;VALUE=DURATION:PT6H")
  })

  it("writes the jobs in the language asked, each with a reminder at 9 on its day", () => {
    const en = lines(calendarFeed(GARDEN, { language: "en", now: new Date("2026-04-10T12:00Z") }))
    expect(en).toContain("SUMMARY:Plant out Tomato")
    expect(en.filter((line) => line === "TRIGGER:PT9H")).toHaveLength(
      en.filter((line) => line === "BEGIN:VEVENT").length
    )
    expect(en).toContain("DESCRIPTION:Allotment 12")

    const pt = lines(calendarFeed(GARDEN, { language: "pt", now: new Date("2026-04-10T12:00Z") }))
    expect(pt).toContain("SUMMARY:Transplantar Tomate")
  })

  it("keeps a late job on its day for 30 days, then lets it go", () => {
    // Sowing indoors was due on 20 March and is not ticked.
    const soon = calendarFeed(GARDEN, { language: "en", now: new Date("2026-04-10T12:00Z") })
    expect(starts(soon)[0]).toBe("DTSTART;VALUE=DATE:20260320")
    const later = calendarFeed(GARDEN, { language: "en", now: new Date("2026-05-01T12:00Z") })
    expect(starts(later)).not.toContain("DTSTART;VALUE=DATE:20260320")
  })

  it("counts the days as they are in Portugal, not in UTC", () => {
    // 23:30 UTC on 19 April is already 20 April in Lisbon, 31 days after the sowing.
    const feed = calendarFeed(GARDEN, { language: "en", now: new Date("2026-04-19T23:30Z") })
    expect(starts(feed)).not.toContain("DTSTART;VALUE=DATE:20260320")
  })

  it("leaves out the jobs done", () => {
    const ticked: Planting = { ...TOMATOES, planted: true }
    const planted = { ...GARDEN, plan: { ...GARDEN.plan, plantings: [ticked] } }
    const feed = lines(
      calendarFeed(planted, { language: "en", now: new Date("2026-04-10T12:00Z") })
    )
    expect(feed).not.toContain("SUMMARY:Plant out Tomato")
    expect(feed).not.toContain("SUMMARY:Sow Tomato indoors")
    expect(feed).toContain("SUMMARY:Start picking Tomato")
  })
})
