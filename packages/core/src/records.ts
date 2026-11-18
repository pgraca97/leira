import { addDays, type IsoDate } from "./dates"
import type { GardenTaskKind } from "./schedule"
import { type GardenPlan, type Harvest, PLAN_LIMITS, type Planting } from "./schema"

/**
 * What happened to a planting, as opposed to what was planned: the day it
 * really went in and came out, and what was picked. These edits keep the
 * recorded days in order (sown, planted, picked, cleared), so the schedule
 * never has to make sense of a crop picked before it was planted.
 *
 * Each one answers null when it refuses, and hands back the planting it was
 * given when nothing changes.
 */

function firstHarvest(planting: Planting): IsoDate | undefined {
  return planting.harvests?.[0]?.date
}

function lastHarvest(planting: Planting): IsoDate | undefined {
  return planting.harvests?.at(-1)?.date
}

/** The days a job can be recorded as done on, given the planting's other dates. */
export function doneDateBounds(
  planting: Planting,
  kind: GardenTaskKind
): { min?: IsoDate; max?: IsoDate } {
  const { from, to } = planting.inGround
  const first = firstHarvest(planting)
  const last = lastHarvest(planting)
  switch (kind) {
    case "sow-indoors":
      return { max: addDays(from, -1) }
    case "transplant":
    case "sow":
      return { max: first && first < to ? first : to }
    case "harvest":
      return planting.cleared ? { min: from, max: to } : { min: from }
    case "clear":
      return { min: last && last > from ? last : from }
  }
}

function within(date: IsoDate, bounds: { min?: IsoDate; max?: IsoDate }): boolean {
  return (!bounds.min || bounds.min <= date) && (!bounds.max || date <= bounds.max)
}

/**
 * Marks the crop as really in the ground since `date`, or takes the mark off
 * when given null, keeping the day. A sowing day that is no longer before the
 * planting day is forgotten: the schedule would ignore it.
 */
export function setPlanted(planting: Planting, date: IsoDate | null): Planting | null {
  if (date === null) {
    if (!planting.planted) return planting
    const { planted: _mark, ...rest } = planting
    return rest
  }
  if (planting.planted && planting.inGround.from === date) return planting
  if (!within(date, doneDateBounds(planting, "transplant"))) return null
  const { sowDate, ...rest } = planting
  return {
    ...rest,
    ...(sowDate && sowDate < date ? { sowDate } : {}),
    inGround: { ...planting.inGround, from: date },
    planted: true,
  }
}

/** Marks the crop as really out of the ground on `date`, or takes the mark off when given null. */
export function setCleared(planting: Planting, date: IsoDate | null): Planting | null {
  if (date === null) {
    if (!planting.cleared) return planting
    const { cleared: _mark, ...rest } = planting
    return rest
  }
  if (planting.cleared && planting.inGround.to === date) return planting
  if (!within(date, doneDateBounds(planting, "clear"))) return null
  return { ...planting, inGround: { ...planting.inGround, to: date }, cleared: true }
}

/**
 * Adds a harvest, keeping the list oldest first. A crop still being picked
 * after its planned last day is evidently still in the ground, so that day
 * moves, unless the crop was recorded as cleared.
 */
export function addHarvest(planting: Planting, harvest: Harvest): Planting | null {
  const harvests = planting.harvests ?? []
  if (harvests.length >= PLAN_LIMITS.maxHarvests) return null
  if (!within(harvest.date, doneDateBounds(planting, "harvest"))) return null
  const after = harvests.findIndex((other) => other.date > harvest.date)
  const position = after === -1 ? harvests.length : after
  return {
    ...planting,
    inGround:
      harvest.date > planting.inGround.to
        ? { ...planting.inGround, to: harvest.date }
        : planting.inGround,
    harvests: [...harvests.slice(0, position), harvest, ...harvests.slice(position)],
  }
}

/** Removes the harvest at a position in the list. */
export function removeHarvest(planting: Planting, index: number): Planting {
  const { harvests, ...rest } = planting
  if (!harvests?.[index]) return planting
  const left = harvests.filter((_harvest, position) => position !== index)
  return left.length > 0 ? { ...rest, harvests: left } : rest
}

/** What a planting gave, by unit. Harvests with no amount add nothing. */
export function harvestTotals(planting: Planting): { kg: number; units: number } {
  const totals = { kg: 0, units: 0 }
  for (const harvest of planting.harvests ?? []) {
    if (harvest.unit && harvest.quantity) totals[harvest.unit] += harvest.quantity
  }
  // Adding decimals leaves dust (0.1 + 0.2), and a gram is as fine as anyone weighs.
  const tidy = (sum: number) => Math.round(sum * 1000) / 1000
  return { kg: tidy(totals.kg), units: tidy(totals.units) }
}

/** What one crop, or one variety of it, gave in a year. */
export interface CropHarvest {
  plantId: string
  variety?: string
  kg: number
  units: number
  /** How many times it was picked, with an amount or without. */
  harvests: number
}

/**
 * What the garden gave in a year: by crop and variety, the most weighed first
 * (then the most counted, the most often picked), and in all. Only the
 * harvests picked that year count, whenever the crop went in.
 */
export function yearHarvest(
  plan: GardenPlan,
  year: number
): { crops: CropHarvest[]; total: Omit<CropHarvest, "plantId" | "variety"> } {
  const byCrop = new Map<string, CropHarvest>()
  const total = { kg: 0, units: 0, harvests: 0 }
  for (const planting of plan.plantings) {
    for (const harvest of planting.harvests ?? []) {
      if (!harvest.date.startsWith(`${year}-`)) continue
      const key = `${planting.plantId}\n${planting.variety ?? ""}`
      const crop = byCrop.get(key) ?? {
        plantId: planting.plantId,
        ...(planting.variety ? { variety: planting.variety } : {}),
        kg: 0,
        units: 0,
        harvests: 0,
      }
      crop.harvests += 1
      total.harvests += 1
      if (harvest.unit && harvest.quantity) {
        crop[harvest.unit] += harvest.quantity
        total[harvest.unit] += harvest.quantity
      }
      byCrop.set(key, crop)
    }
  }
  // Adding decimals leaves dust (0.1 + 0.2), and a gram is as fine as anyone weighs.
  const tidy = (sum: number) => Math.round(sum * 1000) / 1000
  const crops = [...byCrop.values()]
    .map((crop) => ({ ...crop, kg: tidy(crop.kg), units: tidy(crop.units) }))
    .sort((a, b) => b.kg - a.kg || b.units - a.units || b.harvests - a.harvests)
  return { crops, total: { ...total, kg: tidy(total.kg), units: tidy(total.units) } }
}

/**
 * Records a job as done on a day, or as not done when given null. The first
 * harvest is the one thing this does not undo: a planting can have many, and
 * each is removed on its own.
 */
export function recordTask(
  planting: Planting,
  kind: GardenTaskKind,
  date: IsoDate | null
): Planting | null {
  switch (kind) {
    case "sow-indoors": {
      if ((planting.sowDate ?? null) === date) return planting
      if (date !== null && !within(date, doneDateBounds(planting, kind))) return null
      const { sowDate: _previous, ...rest } = planting
      return date === null ? rest : { ...rest, sowDate: date }
    }
    case "transplant":
    case "sow":
      return setPlanted(planting, date)
    case "harvest":
      return date === null ? null : addHarvest(planting, { date })
    case "clear":
      return setCleared(planting, date)
  }
}

/** A planting as planned, with nothing recorded: what a copy of one starts as. */
export function withoutPlantingRecords(planting: Planting): Planting {
  const {
    sowDate: _sowDate,
    planted: _planted,
    cleared: _cleared,
    harvests: _harvests,
    notes: _notes,
    ...planned
  } = planting
  return planned
}

/** A plan with nothing recorded, for a copy of a garden: the copy has not happened yet. */
export function withoutRecords(plan: GardenPlan): GardenPlan {
  const { notes: _notes, ...rest } = plan
  return { ...rest, plantings: plan.plantings.map(withoutPlantingRecords) }
}

/**
 * A plan as a share link shows it: what was done and when, but not the
 * owner's notes or how much the garden gave. The database does the same to
 * what it hands a visitor (`private.public_plan`); keep the two alike.
 */
export function publicPlan(plan: GardenPlan): GardenPlan {
  const { notes: _notes, ...rest } = plan
  return {
    ...rest,
    plantings: plan.plantings.map(({ notes: _private, harvests, ...planting }) =>
      harvests ? { ...planting, harvests: harvests.map(({ date }) => ({ date })) } : planting
    ),
  }
}

/** What deleting a garden takes with it, to say so before it goes. */
export interface GardenLosses {
  plantings: number
  harvests: number
  /** Whether the garden or any planting holds a note with something in it. */
  notes: boolean
}

export function gardenLosses(plan: GardenPlan): GardenLosses {
  const written = (text: string | undefined) => Boolean(text?.trim())
  return {
    plantings: plan.plantings.length,
    harvests: plan.plantings.reduce((sum, planting) => sum + (planting.harvests?.length ?? 0), 0),
    notes: written(plan.notes) || plan.plantings.some((planting) => written(planting.notes)),
  }
}
