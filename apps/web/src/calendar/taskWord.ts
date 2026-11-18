import type { GardenTaskKind, Plant } from "@leira/core"

/**
 * Which words a job goes by, under `calendar.task`. The last job of a
 * perennial is renewing it: its plants are replaced after their years, not
 * cleared at the end of a season.
 */
export function taskWord(kind: GardenTaskKind, plant: Plant | undefined): GardenTaskKind | "renew" {
  return kind === "clear" && plant?.perennial ? "renew" : kind
}
