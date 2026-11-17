import { addDays, type IsoDate } from "./dates"
import { isInGround, plantingSchedule } from "./schedule"
import type { ForecastDay, FrostTolerance, GardenPlan, Plant } from "./schema"

/**
 * The forecast night-time low at or below which a crop is at risk, by how
 * much frost it tolerates. Forecasts give air temperature at about two
 * metres: the ground is colder on a clear night, so tender crops are flagged
 * a little above freezing. These are rules of thumb, not guarantees.
 */
export const FROST_LIMIT_C: Record<FrostTolerance, number> = {
  tender: 2,
  "half-hardy": -2,
  hardy: -8,
}

/**
 * Days after planting out during which a seedling raised under cover is still
 * settling in. Until its roots take hold, a night that an established plant
 * shrugs off sets it back.
 */
export const SETTLING_DAYS = 7

/** A forecast day that threatens a planting. */
export interface WeatherRisk {
  plantingId: string
  plantId: string
  /**
   * `frost`: the night is too cold for the crop. `heat`: the day is hotter
   * than it tolerates. `cold`: the night is too cold for a seedling that has
   * just been, or is about to be, planted out. `coldSoil`: the soil is too
   * cold for the seed on the day it is due to be sown in place.
   */
  kind: "frost" | "heat" | "cold" | "coldSoil"
  /** The first day at risk, so there is time to act. */
  date: IsoDate
  /** That day's low for frost and cold, high for heat, or soil temperature for cold soil. */
  tempC: number
}

/**
 * Compares a forecast with what is in the ground. Each planting gets at most
 * one warning about cold nights and one about heat, for the first day at risk.
 * Frost outranks a merely cold night: a crop facing both only gets the frost
 * warning. A crop sown in place also gets a warning when the soil is too cold
 * on its sowing day. Warnings come in date order. Crops the lookup does not know are
 * skipped.
 */
export function findWeatherRisks(
  plan: GardenPlan,
  getPlant: (id: string) => Plant | undefined,
  forecast: readonly ForecastDay[]
): WeatherRisk[] {
  const days = [...forecast].sort((a, b) => a.date.localeCompare(b.date))
  const risks: WeatherRisk[] = []

  for (const planting of plan.plantings) {
    const plant = getPlant(planting.plantId)
    if (!plant) continue
    const exposed = days.filter((day) => isInGround(planting, day.date))
    const ids = { plantingId: planting.id, plantId: plant.id }

    const frost = exposed.find((day) => day.minC <= FROST_LIMIT_C[plant.frost])
    if (frost) risks.push({ ...ids, kind: "frost", date: frost.date, tempC: frost.minC })

    // Only crops raised under cover are planted out as seedlings. The limit
    // itself is still safe: it is the coldest night a transplant should face.
    const minNightC = plant.indoorsWeeks ? plant.temps.transplantMinNightC : undefined
    if (!frost && minNightC !== undefined) {
      const settled = addDays(planting.inGround.from, SETTLING_DAYS)
      const cold = exposed.find((day) => day.date <= settled && day.minC < minNightC)
      if (cold) risks.push({ ...ids, kind: "cold", date: cold.date, tempC: cold.minC })
    }

    // Seed sown in place only: a seedling raised under cover has already come
    // up, and its nights are the cold check's business. Once it is marked as
    // sown, the warning is too late to act on.
    const germMinSoilC = plant.temps.germMinSoilC
    if (
      germMinSoilC !== undefined &&
      !planting.planted &&
      !plantingSchedule(planting, plant).indoors
    ) {
      const sowing = days.find((day) => day.date === planting.inGround.from)
      if (sowing?.soilC !== undefined && sowing.soilC < germMinSoilC) {
        risks.push({ ...ids, kind: "coldSoil", date: sowing.date, tempC: sowing.soilC })
      }
    }

    const maxDayC = plant.temps.maxDayC
    const heat = maxDayC === undefined ? undefined : exposed.find((day) => day.maxC >= maxDayC)
    if (heat) risks.push({ ...ids, kind: "heat", date: heat.date, tempC: heat.maxC })
  }
  // The sort is stable, so warnings for the same day stay in the plan's order.
  return risks.sort((a, b) => a.date.localeCompare(b.date))
}
