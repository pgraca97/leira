import { type ExportFileProblem, readExportFile } from "@leira/core"
import type { TFunction } from "i18next"
import type { Backend } from "../lib/backend"
import { TemplateLimitError } from "../lib/templates"

/**
 * The largest file the import opens. Far more than a real export holds, and
 * a file much larger would freeze the tab while it is read.
 */
export const IMPORT_MAX_BYTES = 20 * 1024 * 1024

export type ImportOutcome =
  | { kind: "refused"; problem: ExportFileProblem | "tooLarge" }
  | {
      kind: "imported"
      gardens: number
      templates: number
      /** What the file held that could not be read, and was never written. */
      skipped: number
      /** Templates not saved because the user reached the most one may keep. */
      leftOut: number
      /** A save failed, and nothing after it was tried. */
      stopped: boolean
    }

/**
 * Adds what an exported file holds to the user's gardens and templates, as
 * new copies under the names in the file. Nothing is replaced, and share
 * links do not come back: their tokens are made by the server.
 *
 * The whole file is read and checked before the first save. The saves then
 * go one by one, with no transaction around them, so a failure part way
 * leaves what came in before it, and the outcome says how much that was.
 */
export async function importFile(
  backend: Pick<Backend, "gardens" | "templates">,
  file: File,
  fallbackNames: { garden: string; template: string }
): Promise<ImportOutcome> {
  if (file.size > IMPORT_MAX_BYTES) return { kind: "refused", problem: "tooLarge" }
  const read = readExportFile(await file.text(), fallbackNames)
  if (!read.ok) return { kind: "refused", problem: read.problem }

  let gardens = 0
  let templates = 0
  let leftOut = 0
  let stopped = false
  try {
    for (const { name, plan, location } of read.gardens) {
      await backend.gardens.create(name, plan, location)
      gardens += 1
    }
    for (const [index, { name, items }] of read.templates.entries()) {
      try {
        await backend.templates.save(name, items)
      } catch (error) {
        if (!(error instanceof TemplateLimitError)) throw error
        // Every later one would be refused the same way.
        leftOut = read.templates.length - index
        break
      }
      templates += 1
    }
  } catch {
    stopped = true
  }
  return { kind: "imported", gardens, templates, skipped: read.skipped, leftOut, stopped }
}

/** What to tell the user about an import, and whether it went wrong. */
export function importMessage(
  outcome: ImportOutcome,
  t: TFunction
): { text: string; failed: boolean } {
  if (outcome.kind === "refused") {
    const refusals = {
      tooLarge: "gardens.importTooLarge",
      unreadable: "gardens.importUnreadable",
      newer: "gardens.importNewer",
      empty: "gardens.importEmpty",
    } as const
    return { text: t(refusals[outcome.problem]), failed: true }
  }

  const { gardens, templates, skipped, leftOut, stopped } = outcome
  if (stopped && gardens + templates === 0) return { text: t("gardens.importFailed"), failed: true }

  const counts = [
    gardens > 0 ? t("gardens.importGardens", { count: gardens }) : null,
    templates > 0 ? t("gardens.importTemplates", { count: templates }) : null,
  ].filter((count) => count !== null)
  const sentences = [
    counts.length === 2
      ? t("gardens.importDoneBoth", { gardens: counts[0], templates: counts[1] })
      : counts.length === 1
        ? t("gardens.importDone", { items: counts[0] })
        : t("gardens.importNone"),
    skipped > 0 ? t("gardens.importSkipped", { count: skipped }) : null,
    leftOut > 0 ? t("gardens.importLeftOut", { count: leftOut }) : null,
    stopped ? t("gardens.importStopped") : null,
  ]
  return { text: sentences.filter((sentence) => sentence !== null).join(" "), failed: stopped }
}
