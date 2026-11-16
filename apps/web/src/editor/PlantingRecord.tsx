import { type IsoDate, type Planting, toIsoDate } from "@leira/core"
import { useTranslation } from "react-i18next"
import { editorStore } from "./store"

interface PlantingMarksProps {
  planting: Planting
  /** Told whether each tick was taken, so the panel can say when one was refused. */
  onResult(taken: boolean): void
}

/**
 * The two marks that turn a planting's dates from a plan into a record: it is
 * in the ground, it has been cleared. They sit under the date fields, and a
 * tick confirms the date shown there, or today when that date is still to
 * come: nothing has happened on a day that has not arrived.
 */
export function PlantingMarks({ planting, onResult }: PlantingMarksProps) {
  const { t } = useTranslation()
  const { recordTask } = editorStore.getState()
  const today = toIsoDate(new Date())

  // Sown direct or planted out, the mark is the same one: the crop is in the ground.
  const mark = (kind: "sow" | "clear", planned: IsoDate, checked: boolean) =>
    onResult(recordTask(planting.id, kind, checked ? (planned < today ? planned : today) : null))

  return (
    <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-stone-800">
      <label className="flex items-center gap-1.5">
        <input
          type="checkbox"
          className="size-4 accent-emerald-700"
          checked={planting.planted === true}
          onChange={(event) => mark("sow", planting.inGround.from, event.target.checked)}
        />
        {t("record.planted")}
      </label>
      <label className="flex items-center gap-1.5">
        <input
          type="checkbox"
          className="size-4 accent-emerald-700"
          checked={planting.cleared === true}
          onChange={(event) => mark("clear", planting.inGround.to, event.target.checked)}
        />
        {t("record.cleared")}
      </label>
    </div>
  )
}
