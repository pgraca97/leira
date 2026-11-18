import { gardenFile, gardenLosses } from "@leira/core"
import { useMutation } from "@tanstack/react-query"
import { useEffect, useRef } from "react"
import { useTranslation } from "react-i18next"
import { buttonClass, dangerButtonClass } from "../components/ui"
import { downloadText } from "../export/downloadFile"
import { fileNameFor } from "../export/fileName"
import { currentLanguage } from "../i18n"
import { useBackend } from "../lib/backend"
import type { GardenSummary } from "../lib/gardens"

/**
 * Asks once more before a garden goes, in its own row: what goes with it, and
 * a last chance to keep a copy. Years of harvests and notes can sit in one
 * garden, and a stray tap on "Delete" should not be enough to lose them.
 */
export function DeleteGarden({
  garden,
  deleting,
  onCancel,
  onDelete,
}: {
  garden: GardenSummary
  deleting: boolean
  onCancel(): void
  onDelete(): void
}) {
  const { t } = useTranslation()
  const backend = useBackend()
  const cancel = useRef<HTMLButtonElement>(null)

  // The safe answer takes the focus, so Enter or a second tap keeps the garden.
  useEffect(() => cancel.current?.focus(), [])

  // The list holds no location, so the file is made from the whole garden, like the editor's.
  const save = useMutation({
    mutationFn: async () => {
      const { name, plan, location } = await backend.gardens.get(garden.id)
      const file = gardenFile({ name, plan, location }, new Date())
      downloadText(JSON.stringify(file, null, 2), "application/json", fileNameFor(name, "json"))
    },
  })

  const losses = garden.plan ? gardenLosses(garden.plan) : null
  const lost = [
    losses?.plantings ? t("gardens.lossPlantings", { count: losses.plantings }) : null,
    losses?.harvests ? t("gardens.lossHarvests", { count: losses.harvests }) : null,
    losses?.notes ? t("gardens.lossNotes") : null,
  ].filter((part): part is string => part !== null)
  // British English, as the rest of the app: no comma before "and".
  const listLocale = currentLanguage() === "en" ? "en-GB" : "pt-PT"
  const items = new Intl.ListFormat(listLocale, { type: "conjunction" }).format(lost)

  return (
    <div className="flex basis-full flex-col gap-2 border-t border-stone-200 pt-2 text-sm">
      <p>
        {t("gardens.confirmDelete", { name: garden.name })}{" "}
        {lost.length > 0 && <>{t("gardens.deleteLosses", { items })} </>}
        {t("gardens.deleteFinal")}
      </p>
      {save.isError && (
        <p role="alert" className="text-red-800">
          {t("gardens.saveFailed")}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className={buttonClass}
          disabled={save.isPending}
          onClick={() => save.mutate()}
        >
          {t("export.file")}
        </button>
        <button
          ref={cancel}
          type="button"
          className={`${buttonClass} ml-auto`}
          disabled={deleting}
          onClick={onCancel}
        >
          {t("gardens.deleteCancel")}
        </button>
        <button type="button" className={dangerButtonClass} disabled={deleting} onClick={onDelete}>
          {t("gardens.deleteConfirm")}
        </button>
      </div>
    </div>
  )
}
