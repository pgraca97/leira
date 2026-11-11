import { addDays, type IsoDate } from "./dates"
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
 * actually sown. Picking starts at the crop's earliest days-to-harvest and
 * lasts for as long as the crop stays in the ground.
 */
export function plantingSchedule(planting: Planting, plant: Plant): PlantingSchedule {
  const { inGround, sowDate } = planting

  let indoorsFrom: IsoDate | null = null
  if (sowDate && sowDate < inGround.from) indoorsFrom = sowDate
  else if (plant.indoorsWeeks) indoorsFrom = addDays(inGround.from, -7 * plant.indoorsWeeks)

  const harvestFrom = addDays(inGround.from, plant.daysToHarvest[0])
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
  date: IsoDate
  kind: GardenTaskKind
  plantingId: string
  plantId: string
}

/**
 * The jobs a plan implies between two days, both included, in date order.
 * Plantings of a crop the lookup does not know are skipped: without the crop
 * there is no telling when to sow or pick it.
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
    const add = (date: IsoDate, kind: GardenTaskKind) => {
      if (range.from <= date && date <= range.to) {
        tasks.push({ date, kind, plantingId: planting.id, plantId: plant.id })
      }
    }
    if (schedule.indoors) add(schedule.indoors.from, "sow-indoors")
    add(schedule.inGround.from, schedule.indoors ? "transplant" : "sow")
    if (schedule.harvest) add(schedule.harvest.from, "harvest")
    add(schedule.inGround.to, "clear")
  }
  // Array.prototype.sort is stable, so tasks on the same day keep the plan's order.
  return tasks.sort((a, b) => a.date.localeCompare(b.date))
}
