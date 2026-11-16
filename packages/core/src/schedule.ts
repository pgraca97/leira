import { addDays, type IsoDate } from "./dates"
import { doneDateBounds } from "./records"
import type { GardenPlan, Plant, Planting } from "./schema"

/** A stretch of days, first and last included. */
export interface DateRange {
  from: IsoDate
  to: IsoDate
}

/** The stages of one planting over time. */
export interface PlantingSchedule {
  /** Raising seedlings under cover before they go out. Null for crops sown direct. */
  indoors: DateRange | null
  /** The days the crop occupies the soil. */
  inGround: DateRange
  /** When the crop can be picked. Null when it leaves the ground before it is ready. */
  harvest: DateRange | null
}

/**
 * Works out a planting's stages. Seedlings start the crop's usual number of
 * weeks before planting out, unless the planting records the day it was
 * actually sown. Picking starts at the crop's earliest days-to-harvest, or on
 * the day of the first harvest once one is recorded, and lasts for as long as
 * the crop stays in the ground.
 */
export function plantingSchedule(planting: Planting, plant: Plant): PlantingSchedule {
  const { inGround, sowDate } = planting

  let indoorsFrom: IsoDate | null = null
  if (sowDate && sowDate < inGround.from) indoorsFrom = sowDate
  else if (plant.indoorsWeeks) indoorsFrom = addDays(inGround.from, -7 * plant.indoorsWeeks)

  const harvestFrom = planting.harvests?.[0]?.date ?? addDays(inGround.from, plant.daysToHarvest[0])
  return {
    indoors: indoorsFrom ? { from: indoorsFrom, to: addDays(inGround.from, -1) } : null,
    inGround,
    harvest: harvestFrom <= inGround.to ? { from: harvestFrom, to: inGround.to } : null,
  }
}

/** Whether a planting occupies the soil on a day. */
export function isInGround(planting: Planting, date: IsoDate): boolean {
  return planting.inGround.from <= date && date <= planting.inGround.to
}

/** The plan as it stands on a day: every bed, and only the crops then in the ground. */
export function plantingsInGround(plan: GardenPlan, date: IsoDate): GardenPlan {
  return { ...plan, plantings: plan.plantings.filter((planting) => isInGround(planting, date)) }
}

/**
 * `sow-indoors`: start seedlings under cover. `transplant`: plant them out.
 * `sow`: sow straight into the ground. `harvest`: picking can begin.
 * `clear`: the crop's last day in the ground.
 */
export type GardenTaskKind = "sow-indoors" | "transplant" | "sow" | "harvest" | "clear"

export interface GardenTask {
  /** The day the job is planned for, or the day it was done once that is recorded. */
  date: IsoDate
  kind: GardenTaskKind
  plantingId: string
  plantId: string
  /** Whether the planting records the job as done. */
  done: boolean
}

/**
 * The jobs a plan implies between two days, both included, in date order.
 * Plantings of a crop the lookup does not know are skipped: without the crop
 * there is no telling when to sow or pick it.
 *
 * A job that is not done is left out once a later stage of its planting is
 * done: a crop already in the ground has no seedlings left to sow.
 */
export function gardenTasks(
  plan: GardenPlan,
  getPlant: (id: string) => Plant | undefined,
  range: DateRange
): GardenTask[] {
  const tasks: GardenTask[] = []
  for (const planting of plan.plantings) {
    const plant = getPlant(planting.plantId)
    if (!plant) continue
    const schedule = plantingSchedule(planting, plant)
    // In the order they happen, so "a later stage" is one further down the list.
    const stages: Pick<GardenTask, "date" | "kind" | "done">[] = []
    if (schedule.indoors) {
      stages.push({
        date: schedule.indoors.from,
        kind: "sow-indoors",
        done: schedule.indoors.from === planting.sowDate,
      })
    }
    stages.push({
      date: schedule.inGround.from,
      kind: schedule.indoors ? "transplant" : "sow",
      done: planting.planted === true,
    })
    if (schedule.harvest) {
      stages.push({
        date: schedule.harvest.from,
        kind: "harvest",
        done: (planting.harvests?.length ?? 0) > 0,
      })
    }
    stages.push({ date: schedule.inGround.to, kind: "clear", done: planting.cleared === true })

    const lastDone = stages.map((stage) => stage.done).lastIndexOf(true)
    stages.forEach((stage, position) => {
      const overtaken = !stage.done && position < lastDone
      if (overtaken || stage.date < range.from || stage.date > range.to) return
      tasks.push({ ...stage, plantingId: planting.id, plantId: plant.id })
    })
  }
  // Array.prototype.sort is stable, so tasks on the same day keep the plan's order.
  return tasks.sort((a, b) => a.date.localeCompare(b.date))
}

/**
 * The day to record a job on when it is only ticked off: today where the
 * planting's other dates allow it, otherwise the day it was planned for. A
 * sowing of seedlings ticked after they went out, say, was not done today.
 */
export function defaultDoneDate(
  planting: Planting,
  task: Pick<GardenTask, "kind" | "date">,
  today: IsoDate
): IsoDate {
  const { min, max } = doneDateBounds(planting, task.kind)
  return (!min || min <= today) && (!max || today <= max) ? today : task.date
}
