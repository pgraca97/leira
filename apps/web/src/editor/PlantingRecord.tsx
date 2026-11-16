import {
  doneDateBounds,
  HARVEST_UNITS,
  type Harvest,
  type HarvestUnit,
  harvestTotals,
  type IsoDate,
  PLAN_LIMITS,
  type Planting,
  toIsoDate,
} from "@leira/core"
import { type FormEvent, useState } from "react"
import { useTranslation } from "react-i18next"
import { CommitField } from "../components/CommitField"
import { buttonClass, inputClass } from "../components/ui"
import { currentLanguage } from "../i18n"
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
 * Reads an amount as people type it: a comma or a point for the decimals.
 * Undefined when nothing was typed, null when it is not a plain number.
 */
function parseAmount(typed: string): number | null | undefined {
  const text = typed.trim()
  if (text === "") return undefined
  // Number() alone would also take "1e3" and "0x10", which nobody means here.
  return /^\d+([.,]\d+)?$/.test(text) ? Number(text.replace(",", ".")) : null
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
  const bounds = doneDateBounds(planting, "harvest")
  const [date, setDate] = useState<IsoDate>(() => {
    // Today, unless the crop was not in the ground today.
    const today = toIsoDate(new Date())
    if (bounds.min && today < bounds.min) return bounds.min
    return bounds.max && today > bounds.max ? bounds.max : today
  })
  const [amount, setAmount] = useState("")
  const [unit, setUnit] = useState<HarvestUnit>("kg")
  const [refused, setRefused] = useState(false)

  const harvests = planting.harvests ?? []
  // Dates carry no zone, so they are formatted in UTC to stay on the same day everywhere.
  const dateFormat = new Intl.DateTimeFormat(language, { dateStyle: "medium", timeZone: "UTC" })
  const day = (value: IsoDate) => dateFormat.format(new Date(`${value}T00:00:00Z`))
  const number = new Intl.NumberFormat(language, { maximumFractionDigits: 3 })
  const amountOf = (quantity: number, of: HarvestUnit) =>
    of === "kg"
      ? t("record.kg", { amount: number.format(quantity) })
      : t("record.units", { count: quantity, amount: number.format(quantity) })

  const totals = harvestTotals(planting)
  const total = new Intl.ListFormat(language, { type: "conjunction" }).format(
    HARVEST_UNITS.filter((of) => totals[of] > 0).map((of) => amountOf(totals[of], of))
  )

  const record = (event: FormEvent) => {
    event.preventDefault()
    const quantity = parseAmount(amount)
    const harvest: Harvest =
      quantity === undefined ? { date } : { date, quantity: quantity ?? 0, unit }
    // An amount that is not a number goes in as 0, which the plan refuses like any other bad amount.
    const taken = addHarvest(planting.id, harvest)
    setRefused(!taken)
    if (taken) setAmount("")
  }

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
      {/* The browser's own checks are off: its messages come in the browser's language, not the app's. */}
      <form noValidate className="flex flex-wrap items-end gap-2" onSubmit={record}>
        <label className="flex flex-col text-xs text-stone-600">
          {t("record.pickedOn")}
          <input
            type="date"
            className={inputClass}
            value={date}
            min={bounds.min}
            max={bounds.max}
            onChange={(event) => setDate(event.target.value)}
          />
        </label>
        <label className="flex flex-col text-xs text-stone-600">
          {t("record.amount")}
          <input
            type="text"
            inputMode="decimal"
            className={`${inputClass} w-20`}
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
          />
        </label>
        <label className="flex flex-col text-xs text-stone-600">
          {t("record.unit")}
          <select
            className={inputClass}
            value={unit}
            onChange={(event) => setUnit(event.target.value as HarvestUnit)}
          >
            {HARVEST_UNITS.map((of) => (
              <option key={of} value={of}>
                {t(`record.unitName.${of}`)}
              </option>
            ))}
          </select>
        </label>
        <button
          type="submit"
          className={buttonClass}
          disabled={harvests.length >= PLAN_LIMITS.maxHarvests}
        >
          {t("record.add")}
        </button>
      </form>
      {refused && (
        <p role="alert" className="text-sm text-red-800">
          {t("record.harvestRefused")}
        </p>
      )}
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
