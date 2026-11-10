import type { Plant } from "./schema"

/**
 * Sample crops for the walking skeleton. The full dataset replaces this list
 * later; every entry is checked against `PlantSchema` in the tests.
 *
 * Spacing and temperature figures are typical values for open-ground growing
 * in a temperate climate. Companion pairs are traditional guidance.
 */
export const PLANTS: readonly Plant[] = [
  {
    id: "tomato",
    name: { pt: "Tomate", en: "Tomato" },
    latin: "Solanum lycopersicum",
    family: "solanaceae",
    frost: "tender",
    spacing: { inRowCm: 50, rowCm: 90 },
    temps: { germMinSoilC: 10, transplantMinNightC: 10, maxDayC: 35 },
    daysToHarvest: [60, 85],
    indoorsWeeks: 6,
    companions: { good: ["carrot", "lettuce", "onion"], bad: [] },
    color: "#d94a3a",
  },
  {
    id: "lettuce",
    name: { pt: "Alface", en: "Lettuce" },
    latin: "Lactuca sativa",
    family: "asteraceae",
    frost: "half-hardy",
    spacing: { inRowCm: 25, rowCm: 30 },
    temps: { germMinSoilC: 2, transplantMinNightC: 2, maxDayC: 27 },
    daysToHarvest: [45, 75],
    indoorsWeeks: 4,
    companions: { good: ["carrot", "onion", "tomato"], bad: [] },
    color: "#8bc34a",
  },
  {
    id: "carrot",
    name: { pt: "Cenoura", en: "Carrot" },
    latin: "Daucus carota subsp. sativus",
    family: "apiaceae",
    frost: "half-hardy",
    spacing: { inRowCm: 5, rowCm: 25 },
    temps: { germMinSoilC: 5, maxDayC: 30 },
    daysToHarvest: [70, 110],
    companions: { good: ["green-bean", "lettuce", "onion", "tomato"], bad: [] },
    color: "#f08a24",
  },
  {
    id: "onion",
    name: { pt: "Cebola", en: "Onion" },
    latin: "Allium cepa",
    family: "amaryllidaceae",
    frost: "hardy",
    spacing: { inRowCm: 10, rowCm: 30 },
    temps: { germMinSoilC: 2 },
    daysToHarvest: [90, 120],
    indoorsWeeks: 8,
    companions: { good: ["carrot", "lettuce", "tomato"], bad: ["green-bean"] },
    color: "#c9a227",
  },
  {
    id: "green-bean",
    name: { pt: "Feijão-verde", en: "Green bean" },
    latin: "Phaseolus vulgaris",
    family: "fabaceae",
    frost: "tender",
    spacing: { inRowCm: 10, rowCm: 45 },
    temps: { germMinSoilC: 15, maxDayC: 32 },
    daysToHarvest: [50, 65],
    companions: { good: ["carrot"], bad: ["onion"] },
    color: "#3f8f4f",
  },
]

const PLANTS_BY_ID: ReadonlyMap<string, Plant> = new Map(PLANTS.map((plant) => [plant.id, plant]))

/** Looks a plant up by id. */
export function getPlant(id: string): Plant | undefined {
  return PLANTS_BY_ID.get(id)
}
