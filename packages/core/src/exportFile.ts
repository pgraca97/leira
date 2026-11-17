import { z } from "zod"
import { StoredPlanSchema } from "./migrate"
import { type GardenLocation, GardenLocationSchema, type GardenPlan } from "./schema"

/**
 * Version of the exported file, the same number the account's export
 * carries. Fields are only ever added to it, never renamed or removed, so
 * whatever reads a file of this format reads the later ones too.
 */
export const EXPORT_FORMAT = 1

/**
 * A file of gardens, as one garden's export writes it. It has the shape of
 * the account's export with only the gardens in it, so the same import reads
 * both. A plan in it is read whatever version wrote it.
 */
export const GardenFileSchema = z.object({
  format: z.literal(EXPORT_FORMAT),
  exportedAt: z.iso.datetime({ offset: true }),
  gardens: z.array(
    z.object({
      name: z.string(),
      plan: StoredPlanSchema,
      location: GardenLocationSchema.nullable(),
      updatedAt: z.iso.datetime({ offset: true }),
    })
  ),
})

export type GardenFile = z.infer<typeof GardenFileSchema>

/**
 * A file holding one garden as it stands at `now`, to keep or to import
 * again. The plan goes whole, notes and harvests included: the file is its
 * owner's, not a link for others.
 */
export function gardenFile(
  garden: { name: string; plan: GardenPlan; location: GardenLocation | null },
  now: Date
): GardenFile {
  const at = now.toISOString()
  const { name, plan, location } = garden
  return {
    format: EXPORT_FORMAT,
    exportedAt: at,
    gardens: [{ name, plan, location, updatedAt: at }],
  }
}
