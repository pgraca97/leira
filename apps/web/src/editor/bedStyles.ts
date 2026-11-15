import type { BedKind } from "@leira/core"

/** How each kind of bed is painted: soil, a pot, glass, gravel, a shed. */
export const BED_STYLE: Record<BedKind, { fill: string; alpha: number; edge: string }> = {
  bed: { fill: "#8a5a3c", alpha: 1, edge: "#5b3a26" },
  container: { fill: "#c2703d", alpha: 1, edge: "#8f4a22" },
  greenhouse: { fill: "#cfe8ef", alpha: 0.7, edge: "#5b8a99" },
  path: { fill: "#cbbf9f", alpha: 1, edge: "#9c9070" },
  structure: { fill: "#78716c", alpha: 1, edge: "#44403c" },
}

/** Colours of the ground itself, shared by the canvas and the exported picture. */
export const GROUND_STYLE = {
  fill: "#d9e8c2",
  edge: "#57534e",
  grid: "#1c1917",
  unknownPlant: "#78716c",
} as const
