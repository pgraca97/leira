import { emptyPlan, getPlant, type Planting } from "@leira/core"
import { describe, expect, it } from "vitest"
import { jobEvents } from "./jobEvents"

function planting(id: string, plantId: string, from: string, to: string): Planting {
  return {
    id,
    plantId,
    rect: { x: 0, y: 0, w: 100, h: 100 },
    layout: "block",
    inGround: { from, to },
  }
}

// Tomato: 6 weeks indoors, first picking 60 days after planting out.
const TOMATOES = planting("tomatoes", "tomato", "2026-05-01", "2026-09-30")
// Strawberry: a perennial, picked from April to June each year.
const STRAWBERRIES = planting("berries", "strawberry", "2026-03-01", "2029-02-28")

const words = (word: string, name: string) => `${word}: ${name}`

describe("jobEvents", () => {
  it("makes one event per job still to do in the range, with the words it is given", () => {
    const events = jobEvents(
      { ...emptyPlan(), plantings: [TOMATOES] },
      getPlant,
      { from: "2026-04-20", to: "2026-12-31" },
      { language: "en", words, description: "Back garden" }
    )
    expect(events).toEqual([
      {
        uid: "tomatoes-transplant",
        date: "2026-05-01",
        summary: "transplant: Tomato",
        description: "Back garden",
      },
      {
        uid: "tomatoes-harvest",
        date: "2026-06-30",
        summary: "harvest: Tomato",
        description: "Back garden",
      },
      {
        uid: "tomatoes-clear",
        date: "2026-09-30",
        summary: "clear: Tomato",
        description: "Back garden",
      },
    ])
  })

  it("leaves out the jobs done, and keeps late ones on their day", () => {
    const events = jobEvents(
      { ...emptyPlan(), plantings: [{ ...TOMATOES, planted: true }] },
      getPlant,
      // From before the tomatoes were sown indoors: that job is late, not done.
      { from: "2026-03-01", to: "2026-12-31" },
      { language: "en", words }
    )
    expect(events.map((event) => event.uid)).toEqual(["tomatoes-harvest", "tomatoes-clear"])
  })

  it("names the crop and its variety in the language asked", () => {
    const [first] = jobEvents(
      { ...emptyPlan(), plantings: [{ ...TOMATOES, variety: "Roma" }] },
      getPlant,
      { from: "2026-04-20", to: "2026-12-31" },
      { language: "pt", words }
    )
    expect(first?.summary).toBe("transplant: Tomate 'Roma'")
  })

  it("keeps a perennial's picking of each year apart, and calls its end renewing", () => {
    const events = jobEvents(
      { ...emptyPlan(), plantings: [STRAWBERRIES] },
      getPlant,
      { from: "2026-03-01", to: "2029-12-31" },
      { language: "en", words }
    )
    const uids = events.map((event) => event.uid)
    expect(uids).toContain("berries-harvest-2026")
    expect(uids).toContain("berries-harvest-2027")
    expect(events.at(-1)?.summary).toBe("renew: Strawberry")
  })
})
