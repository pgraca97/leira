import type { Plant, Planting } from "@leira/core"

/**
 * What a planting grows, in words: the crop, and its variety when one is
 * named, in single quotes as gardeners write them: Tomato 'Roma'. A crop the
 * catalogue does not know goes by its id.
 */
export function cropName(
  planting: Pick<Planting, "plantId" | "variety">,
  plant: Plant | undefined,
  language: "pt" | "en"
): string {
  const crop = plant ? plant.name[language] : planting.plantId
  return planting.variety ? `${crop} '${planting.variety}'` : crop
}
