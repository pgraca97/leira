import type { IsoDate } from "./dates"
import { isInGround } from "./schedule"
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

/** A forecast day that threatens a planting. */
export interface WeatherRisk {
  plantingId: string
  plantId: string
  /** `frost`: the night is too cold for the crop. `heat`: the day is hotter than it tolerates. */
  kind: "frost" | "heat"
  /** The first day at risk, so there is time to act. */
  date: IsoDate
  /** That day's low for frost, or high for heat. */
  tempC: number
}

/**
 * Compares a forecast with what is in the ground. Each planting gets at most
 * one frost and one heat warning, for the first day at risk. Warnings come in
 * date order. Crops the lookup does not know are skipped.
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

    const maxDayC = plant.temps.maxDayC
    const heat = maxDayC === undefined ? undefined : exposed.find((day) => day.maxC >= maxDayC)
    if (heat) risks.push({ ...ids, kind: "heat", date: heat.date, tempC: heat.maxC })
  }
  // The sort is stable, so warnings for the same day stay in the plan's order.
  return risks.sort((a, b) => a.date.localeCompare(b.date))
}
