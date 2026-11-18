import { type IsoDate, PLAN_LIMITS, type Planting, toIsoDate } from "@leira/core"
import { useTranslation } from "react-i18next"
import { CommitField } from "../components/CommitField"
import { currentLanguage } from "../i18n"
import { HarvestForm, useHarvestWords } from "./HarvestForm"
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

/**
 * What a planting gave and what there is to say about it: its harvests,
 * oldest first, with a form to record one, and free notes. Give it the
 * planting's id as `key`, so a half-filled form does not follow the selection
 * to another planting.
 */
export function PlantingRecord({ planting }: { planting: Planting }) {
  const { t } = useTranslation()
  const language = currentLanguage()
  const { addHarvest, removeHarvest, setPlantingNotes } = editorStore.getState()
  const harvests = planting.harvests ?? []
  // Dates carry no zone, so they are formatted in UTC to stay on the same day everywhere.
  const dateFormat = new Intl.DateTimeFormat(language, { dateStyle: "medium", timeZone: "UTC" })
  const day = (value: IsoDate) => dateFormat.format(new Date(`${value}T00:00:00Z`))
  const { amountOf, totalOf } = useHarvestWords()
  const total = totalOf(planting)

  return (
    <section aria-labelledby="record-harvests" className="mt-3 flex flex-col gap-1.5">
      <h4 id="record-harvests" className="text-xs font-semibold text-stone-700">
        {t("record.harvests")}
      </h4>
      {harvests.length > 0 && (
        <ul aria-labelledby="record-harvests" className="flex flex-col text-sm text-stone-800">
          {harvests.map((harvest, index) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: harvests have no id, and two can be alike
            <li key={index} className="flex items-center gap-2">
              <span className="w-24 shrink-0 text-stone-600">{day(harvest.date)}</span>
              <span className="flex-1">
                {harvest.quantity && harvest.unit
                  ? amountOf(harvest.quantity, harvest.unit)
                  : t("record.noAmount")}
              </span>
              <button
                type="button"
                className="rounded-sm px-1.5 text-stone-500 hover:bg-stone-100 hover:text-red-700"
                aria-label={t("record.remove", { date: day(harvest.date) })}
                onClick={() => removeHarvest(planting.id, index)}
              >
                <span aria-hidden="true">×</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {total && (
        <p className="text-sm font-medium text-stone-800">{t("record.total", { total })}</p>
      )}
      <HarvestForm planting={planting} onAdd={(harvest) => addHarvest(planting.id, harvest)} />
      <CommitField
        multiline
        label={t("record.notes")}
        className="mt-0.5"
        maxLength={PLAN_LIMITS.maxPlantingNotes}
        value={planting.notes ?? ""}
        onCommit={(typed) => setPlantingNotes(planting.id, typed)}
      />
    </section>
  )
}
