import { z } from "zod"

/**
 * Version of the stored plan document. Bump it, and add a migration, whenever
 * the shape of `GardenPlan` changes in a way old documents do not satisfy.
 */
export const PLAN_SCHEMA_VERSION = 1

/** Upper bounds that keep a plan document small enough to store and draw. */
export const PLAN_LIMITS = {
  maxSideCm: 10_000,
  minSideCm: 100,
  maxBeds: 500,
  maxPlantings: 2_000,
} as const

const isoDate = z.iso.date()
const coordinateCm = z.int().min(-PLAN_LIMITS.maxSideCm).max(PLAN_LIMITS.maxSideCm)
const sideCm = z.int().min(1).max(PLAN_LIMITS.maxSideCm)

export const RectSchema = z.object({
  x: coordinateCm,
  y: coordinateCm,
  w: sideCm,
  h: sideCm,
})

export const BED_KINDS = ["bed", "container", "greenhouse", "path", "structure"] as const
export type BedKind = (typeof BED_KINDS)[number]

export const BedSchema = z.object({
  id: z.uuid(),
  name: z.string().max(60),
  kind: z.enum(BED_KINDS),
  rect: RectSchema,
})
export type Bed = z.infer<typeof BedSchema>

/**
 * How plants are arranged inside a planting's rectangle:
 * - `single`: one plant in the centre
 * - `row`: rows along the longer side, using in-row and between-row spacing
 * - `block`: an even grid at the in-row spacing, as in a wide bed
 * - `sfg`: square foot gardening, a set number of plants per 30 cm square
 */
export const PLANTING_LAYOUTS = ["single", "row", "block", "sfg"] as const
export type PlantingLayout = (typeof PLANTING_LAYOUTS)[number]

export const PlantingSchema = z.object({
  id: z.uuid(),
  plantId: z.string().min(1).max(64),
  varietyId: z.string().min(1).max(64).optional(),
  rect: RectSchema,
  layout: z.enum(PLANTING_LAYOUTS),
  /** The days the crop occupies the soil, first and last day included. */
  inGround: z
    .object({ from: isoDate, to: isoDate })
    .refine((range) => range.from <= range.to, { error: "from must not be after to" }),
  sowDate: isoDate.optional(),
})
export type Planting = z.infer<typeof PlantingSchema>

export const GardenPlanSchema = z.object({
  schemaVersion: z.literal(PLAN_SCHEMA_VERSION),
  widthCm: z.int().min(PLAN_LIMITS.minSideCm).max(PLAN_LIMITS.maxSideCm),
  heightCm: z.int().min(PLAN_LIMITS.minSideCm).max(PLAN_LIMITS.maxSideCm),
  /** Size of one grid cell. Rectangles snap to multiples of it. */
  cellCm: z.int().min(5).max(100),
  beds: z.array(BedSchema).max(PLAN_LIMITS.maxBeds),
  plantings: z.array(PlantingSchema).max(PLAN_LIMITS.maxPlantings),
})
export type GardenPlan = z.infer<typeof GardenPlanSchema>

/** A new, empty plan: 6 m by 4 m on a 10 cm grid. */
export function emptyPlan(): GardenPlan {
  return {
    schemaVersion: PLAN_SCHEMA_VERSION,
    widthCm: 600,
    heightCm: 400,
    cellCm: 10,
    beds: [],
    plantings: [],
  }
}

/** Where a garden is, for weather and climate lookups. */
export const GardenLocationSchema = z.object({
  lat: z.number().min(-90).max(90),
  lon: z.number().min(-180).max(180),
  name: z.string().max(120).optional(),
})
export type GardenLocation = z.infer<typeof GardenLocationSchema>

/**
 * Rounds a coordinate before it is stored. Two decimals is about 1 km: enough
 * for weather, and it keeps the exact position of someone's home out of the
 * database.
 */
export function roundCoordinate(value: number, decimals = 2): number {
  const factor = 10 ** decimals
  return Math.round(value * factor) / factor + 0
}

export const PLANT_FAMILIES = [
  "amaranthaceae",
  "amaryllidaceae",
  "apiaceae",
  "asteraceae",
  "brassicaceae",
  "cucurbitaceae",
  "fabaceae",
  "lamiaceae",
  "poaceae",
  "rosaceae",
  "solanaceae",
  "other",
] as const
export type PlantFamily = (typeof PLANT_FAMILIES)[number]

/** `tender` dies at the first frost, `half-hardy` survives a light one, `hardy` a hard one. */
export const FROST_TOLERANCES = ["tender", "half-hardy", "hardy"] as const
export type FrostTolerance = (typeof FROST_TOLERANCES)[number]

export const PlantSchema = z.object({
  id: z.string().regex(/^[a-z][a-z0-9-]*$/),
  name: z.object({ pt: z.string().min(1), en: z.string().min(1) }),
  latin: z.string().min(1),
  /** Botanical family: crop rotation works on families, not single crops. */
  family: z.enum(PLANT_FAMILIES),
  frost: z.enum(FROST_TOLERANCES),
  spacing: z.object({
    /** Distance between plants along a row. */
    inRowCm: z.int().min(1).max(500),
    /** Distance between rows. */
    rowCm: z.int().min(1).max(500),
  }),
  temps: z.object({
    /** Coldest soil the seed still germinates in. */
    germMinSoilC: z.number().optional(),
    /** Coldest night a transplant should face outdoors. */
    transplantMinNightC: z.number().optional(),
    /** Daytime heat above which the crop bolts or drops flowers. */
    maxDayC: z.number().optional(),
  }),
  /** Days from going in the ground (sown direct or transplanted) to harvest: earliest, latest. */
  daysToHarvest: z
    .tuple([z.int().min(1), z.int().min(1)])
    .refine(([min, max]) => min <= max, { error: "min must not exceed max" }),
  /** Weeks to raise seedlings indoors before transplanting. Absent for crops sown direct. */
  indoorsWeeks: z.int().min(1).max(20).optional(),
  /** Traditional companion planting pairs, by plant id. */
  companions: z.object({
    good: z.array(z.string()),
    bad: z.array(z.string()),
  }),
  /** Stand-in colour for the canvas, calendar and charts until sprites exist. */
  color: z.string().regex(/^#[0-9a-f]{6}$/),
})
export type Plant = z.infer<typeof PlantSchema>

export const WEATHER_CONDITIONS = [
  "clear",
  "clouds",
  "fog",
  "drizzle",
  "rain",
  "thunderstorm",
  "snow",
] as const
export type WeatherCondition = (typeof WEATHER_CONDITIONS)[number]

/** Current weather, in a shape that does not depend on which provider served it. */
export const WeatherNowSchema = z.object({
  tempC: z.number(),
  feelsLikeC: z.number(),
  humidityPct: z.number().min(0).max(100),
  windMs: z.number().min(0),
  condition: z.enum(WEATHER_CONDITIONS),
  isDay: z.boolean(),
  placeName: z.string().nullable(),
  observedAt: z.iso.datetime(),
})
export type WeatherNow = z.infer<typeof WeatherNowSchema>
