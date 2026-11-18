import { addDays, addMonths, type IsoDate, yearOf } from "./dates"
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
 * The day to show instead when nothing is in the ground on `date`: the first
 * day a crop goes in after it, or else the last day one was in before it. The
 * day itself when something is in the ground then; null with no crops at all.
 */
export function nearestPlantedDay(plan: GardenPlan, date: IsoDate): IsoDate | null {
  if (plan.plantings.some((planting) => isInGround(planting, date))) return date
  let after: IsoDate | null = null
  let before: IsoDate | null = null
  for (const { inGround } of plan.plantings) {
    if (inGround.from > date && (!after || inGround.from < after)) after = inGround.from
    if (inGround.to < date && (!before || inGround.to > before)) before = inGround.to
  }
  return after ?? before
}

/**
 * The plan for a quick look, as in a thumbnail: as it stands on the day, or
 * whole when nothing is in the ground then, so a garden resting over winter
 * does not look bare.
 */
export function glancePlan(plan: GardenPlan, date: IsoDate): GardenPlan {
  const onDay = plantingsInGround(plan, date)
  return onDay.plantings.length > 0 ? onDay : plan
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
    if (plant.perennial) {
      // A picking job each season, done once a harvest of that year is on record. The
      // last stage is then renewing the plants, which is what "clear" means for them.
      for (const season of pickingIn(planting, plant, schedule.inGround)) {
        const year = season.from.slice(0, 5)
        const picked = planting.harvests?.find((harvest) => harvest.date.startsWith(year))
        stages.push({
          date: picked?.date ?? season.from,
          kind: "harvest",
          done: picked !== undefined,
        })
      }
    } else if (schedule.harvest) {
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
 * The crops being picked on a day: from their first harvest (recorded, or
 * else the usual day) until they leave the ground, and for a perennial only
 * in its picking months. Not one already cleared.
 */
export function harvestingOn(
  plan: GardenPlan,
  getPlant: (id: string) => Plant | undefined,
  date: IsoDate
): Planting[] {
  return plan.plantings.filter((planting) => {
    const plant = getPlant(planting.plantId)
    if (!plant || planting.cleared) return false
    return pickingIn(planting, plant, { from: date, to: date }).length > 0
  })
}

/** The part of a stretch inside another, or null when they do not meet. */
function clip(range: DateRange, within: DateRange): DateRange | null {
  const from = range.from > within.from ? range.from : within.from
  const to = range.to < within.to ? range.to : within.to
  return from <= to ? { from, to } : null
}

/** Months in order, as runs of consecutive ones: [4, 5, 6, 9] is 4 to 6, then 9. */
function monthRuns(months: readonly number[]): [number, number][] {
  const runs: [number, number][] = []
  for (const month of months) {
    const last = runs.at(-1)
    if (last && month === last[1] + 1) last[1] = month
    else runs.push([month, month])
  }
  return runs
}

function monthStart(year: number, month: number): IsoDate {
  return `${year}-${String(month).padStart(2, "0")}-01`
}

/**
 * The days within `range` a crop is picked on. For an annual, its harvest
 * from the schedule. A perennial is picked in its picking months of each
 * year, from when it is first ready (the usual days after going in, or an
 * earlier harvest on record) until it leaves the ground: one stretch a
 * season, in order.
 */
export function pickingIn(planting: Planting, plant: Plant, range: DateRange): DateRange[] {
  if (!plant.perennial) {
    const { harvest } = plantingSchedule(planting, plant)
    const part = harvest && clip(harvest, range)
    return part ? [part] : []
  }
  const usual = addDays(planting.inGround.from, plant.daysToHarvest[0])
  const first = planting.harvests?.[0]?.date
  const life = clip(
    { from: first && first < usual ? first : usual, to: planting.inGround.to },
    range
  )
  if (!life) return []
  const seasons: DateRange[] = []
  for (let year = yearOf(life.from); year <= yearOf(life.to); year++) {
    for (const [firstMonth, lastMonth] of monthRuns(plant.perennial.pickMonths)) {
      const season = {
        from: monthStart(year, firstMonth),
        to: addDays(addMonths(monthStart(year, lastMonth), 1), -1),
      }
      const part = clip(season, life)
      if (part) seasons.push(part)
    }
  }
  return seasons
}

/** How far ahead "this week" looks for jobs. */
export const TASK_AHEAD_DAYS = 7

/**
 * How long a job not done stays on a list after its day. Long enough to catch
 * up on a job that slipped, short enough that crops planted before anyone kept
 * records do not fill the list with jobs nobody is going to tick.
 */
export const TASK_LOOKBACK_DAYS = 30

/** The jobs still to do: those that slipped in the last month, then the coming week's. */
export function tasksThisWeek(
  plan: GardenPlan,
  getPlant: (id: string) => Plant | undefined,
  today: IsoDate
): GardenTask[] {
  return gardenTasks(plan, getPlant, {
    from: addDays(today, -TASK_LOOKBACK_DAYS),
    to: addDays(today, TASK_AHEAD_DAYS),
  }).filter((task) => !task.done)
}

/**
 * The day to record a job on when it is only ticked off: today where the
 * planting's other dates allow it, otherwise the day it was planned for. A
 * sowing of seedlings ticked after they went out, say, was not done today.
 *
 * Null when neither will do, because the planned day is still to come: a crop
 * not yet in the ground cannot have been picked or cleared, and nothing is
 * recorded as done on a day that has not arrived.
 */
export function defaultDoneDate(
  planting: Planting,
  task: Pick<GardenTask, "kind" | "date">,
  today: IsoDate
): IsoDate | null {
  const { min, max } = doneDateBounds(planting, task.kind)
  if ((!min || min <= today) && (!max || today <= max)) return today
  return task.date <= today ? task.date : null
}
