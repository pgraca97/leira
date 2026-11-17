import { z } from "zod"
import { type Clipboard, ClipboardSchema } from "./clipboard"
import { StoredPlanSchema } from "./migrate"
import {
  type GardenLocation,
  GardenLocationSchema,
  type GardenPlan,
  roundCoordinate,
} from "./schema"

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

/** The longest names the database keeps. */
const NAME_MAX = { garden: 80, template: 60 } as const

/**
 * Why a whole file cannot be imported: it is not an export at all, it comes
 * from a newer version of the app, or nothing in it can be read.
 */
export type ExportFileProblem = "unreadable" | "newer" | "empty"

export interface ImportedGarden {
  name: string
  plan: GardenPlan
  location: GardenLocation | null
}

export interface ImportedTemplate {
  name: string
  items: Clipboard
}

export type ExportFileReading =
  | {
      ok: true
      gardens: ImportedGarden[]
      templates: ImportedTemplate[]
      /** The gardens and templates in the file that could not be read. */
      skipped: number
    }
  | { ok: false; problem: ExportFileProblem }

// Only the outside is checked here. A plan and a template's items carry
// their own versions, so each is read on its own: one garden this version
// cannot read does not refuse the rest of the file.
const OutsideSchema = z.object({
  format: z.unknown(),
  gardens: z.array(z.unknown()).optional(),
  templates: z.array(z.unknown()).optional(),
})

const GardenEntrySchema = z.object({
  name: z.string().catch(""),
  plan: StoredPlanSchema,
  location: GardenLocationSchema.nullable().catch(null),
})

const TemplateEntrySchema = z.object({
  name: z.string().catch(""),
  items: ClipboardSchema,
})

/**
 * A name the database takes: trimmed, cut by characters (not UTF-16 units,
 * which could split an emoji in half), and the fallback when nothing is left.
 */
function importedName(name: string, max: number, fallback: string): string {
  const cut = Array.from(name.trim()).slice(0, max).join("").trimEnd()
  return cut || fallback
}

/**
 * Reads an exported file, the account's or one garden's, for import.
 * Everything is checked before anything is written: what comes back is safe
 * to save as it is. A garden or template that cannot be read is counted in
 * `skipped` and left out, and a location that cannot be read is dropped.
 *
 * `fallbackNames` name a garden or template whose name is empty.
 */
export function readExportFile(
  text: string,
  fallbackNames: { garden: string; template: string }
): ExportFileReading {
  let json: unknown
  try {
    json = JSON.parse(text)
  } catch {
    return { ok: false, problem: "unreadable" }
  }
  const outside = OutsideSchema.safeParse(json)
  if (!outside.success) return { ok: false, problem: "unreadable" }
  const { format, gardens = [], templates = [] } = outside.data
  if (format !== EXPORT_FORMAT) {
    const newer = typeof format === "number" && Number.isInteger(format) && format > EXPORT_FORMAT
    return { ok: false, problem: newer ? "newer" : "unreadable" }
  }

  const readGardens = gardens.flatMap((entry): ImportedGarden[] => {
    const parsed = GardenEntrySchema.safeParse(entry)
    if (!parsed.success) return []
    const { name, plan, location } = parsed.data
    return [
      {
        name: importedName(name, NAME_MAX.garden, fallbackNames.garden),
        plan,
        // As the app stores it: to about a kilometre, never someone's door.
        location: location && {
          ...location,
          lat: roundCoordinate(location.lat),
          lon: roundCoordinate(location.lon),
        },
      },
    ]
  })
  const readTemplates = templates.flatMap((entry): ImportedTemplate[] => {
    const parsed = TemplateEntrySchema.safeParse(entry)
    if (!parsed.success) return []
    const { name, items } = parsed.data
    return [{ name: importedName(name, NAME_MAX.template, fallbackNames.template), items }]
  })

  if (readGardens.length === 0 && readTemplates.length === 0) {
    return { ok: false, problem: "empty" }
  }
  return {
    ok: true,
    gardens: readGardens,
    templates: readTemplates,
    skipped: gardens.length - readGardens.length + templates.length - readTemplates.length,
  }
}
