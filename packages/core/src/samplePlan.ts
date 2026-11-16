import { type IsoDate, yearOf } from "./dates"
import type { Rect } from "./geometry"
import { getPlant } from "./plants"
import { plantingSchedule } from "./schedule"
import {
  emptyPlan,
  type GardenPlan,
  type Harvest,
  type Planting,
  type PlantingLayout,
} from "./schema"

/** The month the example turns to the year to come: October, when the summer crops come out. */
const NEW_SEASON_MONTH = 10

/**
 * A small garden that shows what the planner does, for someone who has not
 * drawn one yet: two beds, crops that follow the seasons of a mild climate,
 * one mistake in the crop rotation and neighbours that get on well and badly.
 *
 * The dates follow the year the plan is made in, so the calendar and the jobs
 * coming up always have something to show. From October it plans the year to
 * come, as a gardener would: this year's tomatoes become "last year's" and the
 * broad beans are sown now.
 *
 * Everything due before today is recorded as done, as if the garden had been
 * kept up: seedlings sown, crops planted, picked and cleared. Last year's
 * tomatoes also say how much they gave. Today's jobs are left to do.
 *
 * `newId` supplies the ids, so this stays a pure function.
 */
export function samplePlan(today: IsoDate, newId: () => string): GardenPlan {
  const month = Number(today.slice(5, 7))
  const year = yearOf(today) + (month >= NEW_SEASON_MONTH ? 1 : 0)
  const day = (monthDay: string, yearsBefore = 0): IsoDate => `${year - yearsBefore}-${monthDay}`

  const planting = (
    plantId: string,
    rect: Rect,
    from: IsoDate,
    to: IsoDate,
    layout: PlantingLayout = "row"
  ): Planting => ({ id: newId(), plantId, rect, layout, inGround: { from, to } })

  /** The planting with every stage due before today recorded on the day it was due. */
  const keptUp = (planned: Planting, picked?: Harvest[]): Planting => {
    const plant = getPlant(planned.plantId)
    if (!plant) return planned
    const { indoors, inGround, harvest } = plantingSchedule(planned, plant)
    const harvests = picked ?? (harvest && harvest.from < today ? [{ date: harvest.from }] : [])
    return {
      ...planned,
      ...(indoors && indoors.from < today ? { sowDate: indoors.from } : {}),
      ...(inGround.from < today ? { planted: true as const } : {}),
      ...(inGround.to < today ? { cleared: true as const } : {}),
      ...(harvests.length > 0 ? { harvests } : {}),
    }
  }

  // The beds are 30 cm apart and the crops stop 10 cm from the edges, so the
  // onions and the broad beans face each other across the path, 50 cm apart:
  // just close enough to count as neighbours.
  return {
    ...emptyPlan(),
    beds: [
      { id: newId(), name: "", kind: "bed", rect: { x: 30, y: 40, w: 260, h: 320 } },
      { id: newId(), name: "", kind: "bed", rect: { x: 320, y: 40, w: 250, h: 320 } },
    ],
    plantings: [
      // The rotation mistake: potatoes where tomatoes, their relatives, grew the year before.
      // The tomatoes only took half of that ground, which also keeps the two names apart.
      // Their harvests are always in the past, even on the day the example turns to a new year.
      keptUp(
        planting(
          "tomato",
          { x: 160, y: 50, w: 120, h: 140 },
          day("05-01", 1),
          day("10-05", 1),
          "block"
        ),
        [
          { date: day("07-20", 1), quantity: 6.5, unit: "kg" },
          { date: day("08-15", 1), quantity: 9, unit: "kg" },
        ]
      ),
      ...[
        planting("potato", { x: 40, y: 50, w: 240, h: 140 }, day("03-01"), day("07-10")),
        // Carrots and onions keep each other's pests away.
        planting("carrot", { x: 40, y: 210, w: 110, h: 140 }, day("04-01"), day("08-10")),
        planting("onion", { x: 170, y: 210, w: 110, h: 140 }, day("01-29"), day("07-15")),
        planting("basil", { x: 330, y: 50, w: 100, h: 140 }, day("05-10"), day("09-08"), "block"),
        // A block, not rows: this corner is too narrow for two rows of tomatoes.
        planting("tomato", { x: 450, y: 50, w: 110, h: 140 }, day("05-01"), day("10-05"), "block"),
        // Broad beans are sown in autumn and picked in spring. The first sowing
        // sits across the path from the onions, which are said to stunt them.
        planting("broad-bean", { x: 330, y: 210, w: 100, h: 140 }, day("10-05", 1), day("05-15")),
        planting("broad-bean", { x: 450, y: 210, w: 110, h: 140 }, day("11-04", 1), day("05-31")),
      ].map((planned) => keptUp(planned)),
    ],
  }
}
