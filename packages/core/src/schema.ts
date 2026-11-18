import { z } from "zod"

/**
 * Version of the stored plan document. Bump it, and add a step to
 * `migratePlan`, whenever the shape of `GardenPlan` changes: also when old
 * documents still fit, because an older copy of the app left open in a tab
 * would drop the fields it does not know when it saves.
 *
 * 2: what happened to a planting (marks, harvests, notes) and garden notes.
 * 3: a planting's variety as free text, in place of an id nothing ever set.
 */
export const PLAN_SCHEMA_VERSION = 3

/** Upper bounds that keep a plan document small enough to store and draw. */
export const PLAN_LIMITS = {
  maxSideCm: 10_000,
  minSideCm: 100,
  maxBeds: 500,
  maxPlantings: 2_000,
  maxHarvests: 200,
  maxHarvestQuantity: 10_000,
  maxPlantingNotes: 2_000,
  maxPlanNotes: 5_000,
  maxVariety: 60,
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

/** `units` counts what is not weighed: heads of lettuce, pumpkins, bunches. */
export const HARVEST_UNITS = ["kg", "units"] as const
export type HarvestUnit = (typeof HARVEST_UNITS)[number]

/** One picking. The amount is optional: "picked some today" is worth recording too. */
export const HarvestSchema = z
  .object({
    date: isoDate,
    quantity: z.number().positive().max(PLAN_LIMITS.maxHarvestQuantity).optional(),
    unit: z.enum(HARVEST_UNITS).optional(),
  })
  .refine((harvest) => (harvest.quantity === undefined) === (harvest.unit === undefined), {
    error: "quantity and unit come together",
  })
export type Harvest = z.infer<typeof HarvestSchema>

export const PlantingSchema = z.object({
  id: z.uuid(),
  plantId: z.string().min(1).max(64),
  /**
   * The variety, as the gardener names it ("Coração de Boi"). Free text and not
   * a pick from a catalogue: there are thousands, and the ones that matter to
   * a garden are local.
   */
  variety: z.string().min(1).max(PLAN_LIMITS.maxVariety).optional(),
  rect: RectSchema,
  layout: z.enum(PLANTING_LAYOUTS),
  /** The days the crop occupies the soil, first and last day included. */
  inGround: z
    .object({ from: isoDate, to: isoDate })
    .refine((range) => range.from <= range.to, { error: "from must not be after to" }),
  /** The day seedlings were really sown under cover. Absent until it is recorded. */
  sowDate: isoDate.optional(),
  /** Present once the crop is really in the ground: `inGround.from` is then the day it went in. */
  planted: z.literal(true).optional(),
  /** Present once the crop is really out: `inGround.to` is then the day it came out. */
  cleared: z.literal(true).optional(),
  /** What was picked, oldest first. */
  harvests: z.array(HarvestSchema).max(PLAN_LIMITS.maxHarvests).optional(),
  notes: z.string().max(PLAN_LIMITS.maxPlantingNotes).optional(),
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
  notes: z.string().max(PLAN_LIMITS.maxPlanNotes).optional(),
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

/** A named place a search turned up, to choose as a garden's location. */
export const PlaceSchema = z.object({
  /** Short enough to be kept as a location's name. */
  name: z.string().min(1).max(120),
  /**
   * The municipality or county, where the provider knows it: in Portugal the
   * concelho, which tells apart the many villages that share a name.
   */
  area: z.string().min(1).max(120).optional(),
  /** The district, state or province, where the provider knows it. */
  region: z.string().min(1).max(120).optional(),
  /** Country code, e.g. "PT". */
  country: z.string().min(1).max(60).optional(),
  lat: z.number().min(-90).max(90),
  lon: z.number().min(-180).max(180),
})
export type Place = z.infer<typeof PlaceSchema>

/**
 * The answer to a place search: best match first, none when nothing matches.
 * Ten, since a village name can be shared by eight places in Portugal alone.
 */
export const PlacesSchema = z.array(PlaceSchema).max(10)

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

/**
 * What a crop is grown for, as a gardener looks for it in a list: the fruit,
 * the leaves (cabbages and their heads too), the root, the bulb, the pods, the
 * herb or the flower. Botany is `family`, which rotation needs; this is for
 * finding a crop. In the order the list shows them.
 */
export const PLANT_GROUPS = ["fruit", "leaf", "root", "bulb", "legume", "herb", "flower"] as const
export type PlantGroup = (typeof PLANT_GROUPS)[number]

/** `tender` dies at the first frost, `half-hardy` survives a light one, `hardy` a hard one. */
export const FROST_TOLERANCES = ["tender", "half-hardy", "hardy"] as const
export type FrostTolerance = (typeof FROST_TOLERANCES)[number]

/** Months of the year, 1 to 12, in order and without repeats. */
const MonthsSchema = z
  .array(z.int().min(1).max(12))
  .min(1)
  .refine(
    (months) => months.every((month, index) => index === 0 || month > (months[index - 1] ?? 0)),
    { error: "months must be in order, without repeats" }
  )

export const PlantSchema = z.object({
  id: z.string().regex(/^[a-z][a-z0-9-]*$/),
  name: z.object({ pt: z.string().min(1), en: z.string().min(1) }),
  latin: z.string().min(1),
  /** Botanical family: crop rotation works on families, not single crops. */
  family: z.enum(PLANT_FAMILIES),
  group: z.enum(PLANT_GROUPS),
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
  /**
   * The months, 1 to 12 and in order, when the crop can go in the ground in the
   * open air: sown where it grows, or planted out when it is raised indoors.
   * They are for the north and centre of mainland Portugal.
   */
  groundMonths: MonthsSchema,
  /**
   * Set for a crop that stays in the ground for years: how many it usually
   * lasts before it is renewed, and the months it is picked in each year.
   */
  perennial: z.object({ years: z.int().min(2).max(20), pickMonths: MonthsSchema }).optional(),
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

/** One day of forecast: the coldest and warmest it gets, and the weather that dominates. */
export const ForecastDaySchema = z
  .object({
    date: isoDate,
    minC: z.number(),
    maxC: z.number(),
    condition: z.enum(WEATHER_CONDITIONS),
    /**
     * The soil's mean temperature that day, 6 cm down, where most seeds sit.
     * Absent when no provider gave one: the air forecast stands without it.
     */
    soilC: z.number().optional(),
  })
  .refine((day) => day.minC <= day.maxC, { error: "minC must not exceed maxC" })
export type ForecastDay = z.infer<typeof ForecastDaySchema>

/** A forecast: consecutive days, the first one being today where the garden is. */
export const ForecastSchema = z.array(ForecastDaySchema).max(16)
export type Forecast = z.infer<typeof ForecastSchema>
