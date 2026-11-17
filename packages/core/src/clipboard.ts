import { z } from "zod"
import { addMonths } from "./dates"
import { boundsOf, chosenItems, shifted } from "./edit"
import { clampRect, snap } from "./geometry"
import { type PlanItemRef, planBounds } from "./plan"
import { withoutPlantingRecords } from "./records"
import { BedSchema, type GardenPlan, PLAN_LIMITS, type Planting, PlantingSchema } from "./schema"

/**
 * Items copied out of a garden, to paste into it or into another one. They
 * keep the places they had, so a paste lands where they came from. `format`
 * says how to read a clipboard kept by an older version of the app.
 */
export const ClipboardSchema = z.object({
  format: z.literal(1),
  beds: z.array(BedSchema).max(PLAN_LIMITS.maxBeds),
  plantings: z.array(PlantingSchema).max(PLAN_LIMITS.maxPlantings),
})

export type Clipboard = z.infer<typeof ClipboardSchema>

/**
 * The chosen items, ready to paste. A copied crop comes with nothing recorded,
 * as a duplicate does. Null when none of the items is there.
 */
export function copyItems(plan: GardenPlan, refs: readonly PlanItemRef[]): Clipboard | null {
  const { beds, plantings } = chosenItems(plan, refs)
  if (beds.length === 0 && plantings.length === 0) return null
  return { format: 1, beds, plantings: plantings.map(withoutPlantingRecords) }
}

/**
 * Adds copies of the clipboard's items to a plan, under new ids, where they
 * were in the garden they came from. They move as one block: onto the plan's
 * grid, and pulled inside a smaller garden, keeping their layout. With
 * `yearsLater`, every crop goes in the ground that many years later, which is
 * how next year is planned in the same garden.
 *
 * Returns null when there is nothing to paste, when the block is larger than
 * the garden, or when the plan cannot hold every item: half a paste would be
 * a surprise.
 */
export function pasteItems(
  plan: GardenPlan,
  clipboard: Clipboard,
  options: { newId: () => string; yearsLater?: number }
): { plan: GardenPlan; refs: PlanItemRef[] } | null {
  const { beds, plantings } = clipboard
  if (beds.length === 0 && plantings.length === 0) return null
  if (
    plan.beds.length + beds.length > PLAN_LIMITS.maxBeds ||
    plan.plantings.length + plantings.length > PLAN_LIMITS.maxPlantings
  ) {
    return null
  }

  const block = boundsOf([...beds, ...plantings].map((item) => item.rect))
  if (block.w > plan.widthCm || block.h > plan.heightCm) return null
  const target = clampRect(
    { ...block, x: snap(block.x, plan.cellCm), y: snap(block.y, plan.cellCm) },
    planBounds(plan)
  )
  const shiftX = target.x - block.x
  const shiftY = target.y - block.y
  const months = 12 * (options.yearsLater ?? 0)
  const later = (planting: Planting): Planting =>
    months === 0
      ? planting
      : {
          ...planting,
          inGround: {
            from: addMonths(planting.inGround.from, months),
            to: addMonths(planting.inGround.to, months),
          },
        }

  const bedCopies = beds.map((bed) => ({ ...shifted(bed, shiftX, shiftY), id: options.newId() }))
  const plantingCopies = plantings.map((planting) => ({
    ...later(shifted(planting, shiftX, shiftY)),
    id: options.newId(),
  }))

  return {
    plan: {
      ...plan,
      beds: [...plan.beds, ...bedCopies],
      plantings: [...plan.plantings, ...plantingCopies],
    },
    refs: [
      ...bedCopies.map((bed): PlanItemRef => ({ kind: "bed", id: bed.id })),
      ...plantingCopies.map((planting): PlanItemRef => ({ kind: "planting", id: planting.id })),
    ],
  }
}
