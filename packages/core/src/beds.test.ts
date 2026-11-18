import { describe, expect, it } from "vitest"
import { bedOfPlanting, bedSeasons, cropsThatFit, findOffSoil, siteOf } from "./beds"
import { PLANTS } from "./plants"
import { type Bed, emptyPlan, type GardenPlan, type Plant, type Planting } from "./schema"

function bed(id: string, x: number, kind: Bed["kind"] = "bed"): Bed {
  return { id, name: "", kind, rect: { x, y: 0, w: 100, h: 200 } }
}

function planting(id: string, x: number, from: string, to: string, w = 50): Planting {
  return {
    id,
    plantId: "lettuce",
    rect: { x, y: 0, w, h: 100 },
    layout: "row",
    inGround: { from, to },
  }
}

const LEFT = bed("left", 0)
const RIGHT = bed("right", 200)
const YEAR = { from: "2026-01-01", to: "2026-12-31" }

describe("bedOfPlanting", () => {
  const plan: GardenPlan = { ...emptyPlan(), beds: [LEFT, RIGHT, bed("path", 100, "path")] }

  it("is the bed the planting sits on", () => {
    expect(bedOfPlanting(plan, planting("a", 210, "2026-03-01", "2026-05-01"))?.id).toBe("right")
  })

  it("is the bed that holds most of a planting drawn across two", () => {
    // From 60 to 260: 40 cm on the left bed, 60 on the right.
    expect(bedOfPlanting(plan, planting("a", 60, "2026-03-01", "2026-05-01", 200))?.id).toBe(
      "right"
    )
  })

  it("is no bed for a planting on open ground, or on a path", () => {
    expect(bedOfPlanting(plan, planting("a", 400, "2026-03-01", "2026-05-01"))).toBeNull()
    expect(bedOfPlanting(plan, planting("a", 110, "2026-03-01", "2026-05-01", 80))).toBeNull()
  })

  it("counts containers and greenhouses as places to grow", () => {
    const pots: GardenPlan = { ...emptyPlan(), beds: [bed("pot", 0, "container")] }
    expect(bedOfPlanting(pots, planting("a", 10, "2026-03-01", "2026-05-01"))?.id).toBe("pot")
  })
})

describe("bedSeasons", () => {
  const spring = planting("spring", 0, "2026-03-01", "2026-05-31")
  const beside = planting("beside", 50, "2026-05-15", "2026-07-10")
  const autumn = planting("autumn", 0, "2026-10-01", "2027-02-28")
  const loose = planting("loose", 400, "2026-04-01", "2026-06-01")
  const plan: GardenPlan = {
    ...emptyPlan(),
    beds: [LEFT, bed("path", 100, "path"), RIGHT],
    plantings: [autumn, loose, beside, spring],
  }

  it("gives each growing bed its plantings, earliest first, and the rest last", () => {
    const seasons = bedSeasons(plan, YEAR)
    expect(
      seasons.map((season) => [season.bed?.id ?? null, season.plantings.map((p) => p.id)])
    ).toEqual([
      ["left", ["spring", "beside", "autumn"]],
      ["right", []],
      [null, ["loose"]],
    ])
  })

  it("finds when a bed has nothing in it, counting crops side by side as one stretch", () => {
    const [left, right] = bedSeasons(plan, YEAR)
    expect(left?.free).toEqual([
      { from: "2026-01-01", to: "2026-02-28" },
      { from: "2026-07-11", to: "2026-09-30" },
    ])
    expect(right?.free).toEqual([YEAR])
  })

  it("leaves out gaps too short to grow anything in", () => {
    const tight: GardenPlan = {
      ...emptyPlan(),
      beds: [LEFT],
      plantings: [
        planting("a", 0, "2026-01-01", "2026-06-30"),
        // 13 days apart: one short of the default 14.
        planting("b", 0, "2026-07-14", "2026-12-31"),
      ],
    }
    expect(bedSeasons(tight, YEAR)[0]?.free).toEqual([])
    expect(bedSeasons(tight, YEAR, 13)[0]?.free).toEqual([{ from: "2026-07-01", to: "2026-07-13" }])
  })

  it("keeps to the days asked about", () => {
    const [left] = bedSeasons(plan, { from: "2026-08-01", to: "2026-11-30" })
    expect(left?.plantings.map((p) => p.id)).toEqual(["autumn"])
    expect(left?.free).toEqual([{ from: "2026-08-01", to: "2026-09-30" }])
  })

  it("has no entry for loose plantings when there are none", () => {
    const tidy = { ...plan, plantings: [spring] }
    expect(bedSeasons(tidy, YEAR).map((season) => season.bed?.id)).toEqual(["left", "right"])
  })
})

describe("cropsThatFit", () => {
  const crop = (id: string, groundMonths: number[], days: number): Plant => ({
    ...(PLANTS[0] as Plant),
    id,
    groundMonths,
    daysToHarvest: [days - 10, days],
  })
  const quick = crop("quick", [7, 8], 30)
  const slow = crop("slow", [7, 8], 100)
  const later = crop("later", [9], 30)
  const spring = crop("spring", [3, 4], 30)
  const fits = (from: string, to: string) =>
    cropsThatFit({ from, to }, [quick, slow, later, spring]).map((plant) => plant.id)

  it("keeps the crops that can go in and be done before the window closes", () => {
    // 11 July to 30 September. "slow" would run into October, and so would
    // "later", which cannot go in before September.
    expect(fits("2026-07-11", "2026-09-30")).toEqual(["quick"])
  })

  it("starts a crop at the first day of its season inside the window", () => {
    // "later" goes in on 1 September and needs 30 days: 1 October is the first day it is done.
    expect(fits("2026-07-11", "2026-10-01")).toContain("later")
    expect(fits("2026-07-11", "2026-09-29")).not.toContain("later")
  })

  it("is empty when the window is in no crop's season", () => {
    expect(fits("2026-11-01", "2026-12-31")).toEqual([])
  })

  it("follows a window over the year's end", () => {
    expect(fits("2026-12-01", "2027-05-15")).toEqual(["spring"])
  })
})

describe("siteOf", () => {
  const plan: GardenPlan = {
    ...emptyPlan(),
    beds: [
      bed("open", 0),
      bed("glass", 200, "greenhouse"),
      bed("pot", 400, "container"),
      bed("path", 600, "path"),
      bed("shed", 800, "structure"),
    ],
  }
  const at = (x: number) => siteOf(plan, planting("a", x, "2026-03-01", "2026-05-01"))

  it("is the greenhouse for a crop in one", () => {
    expect(at(210)).toBe("greenhouse")
  })

  it("is open air in a bed, a container or on open ground", () => {
    expect(at(10)).toBe("open")
    expect(at(410)).toBe("open")
    expect(at(1000)).toBe("open")
  })

  it("is off the soil on a path or a structure", () => {
    expect(at(610)).toBe("off-soil")
    expect(at(810)).toBe("off-soil")
  })

  it("is the bed's for a crop partly on a path, since a bed holds part of it", () => {
    // From 460 to 640: 40 cm in the container (400 to 500), 40 on the path (600 to 700).
    expect(siteOf(plan, planting("a", 460, "2026-03-01", "2026-05-01", 180))).toBe("open")
  })
})

describe("findOffSoil", () => {
  it("lists the plantings drawn on a path or a structure, in the plan's order", () => {
    const plan: GardenPlan = {
      ...emptyPlan(),
      beds: [bed("open", 0), bed("path", 200, "path"), bed("shed", 400, "structure")],
      plantings: [
        planting("on shed", 410, "2026-03-01", "2026-05-01"),
        planting("in bed", 10, "2026-03-01", "2026-05-01"),
        planting("on path", 210, "2026-03-01", "2026-05-01"),
      ],
    }
    expect(findOffSoil(plan)).toEqual(["on shed", "on path"])
  })
})
