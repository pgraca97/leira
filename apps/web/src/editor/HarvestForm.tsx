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
import { type FormEvent, useEffect, useRef, useState } from "react"
import { useTranslation } from "react-i18next"
import { buttonClass, inputClass } from "../components/ui"
import { currentLanguage } from "../i18n"

/**
 * Words for what was picked: one amount ("1.5 kg", "12 units"), and a
 * planting's total by unit ("3.2 kg and 12 units"), empty when nothing was
 * weighed or counted.
 */
export function useHarvestWords() {
  const { t } = useTranslation()
  const language = currentLanguage()
  const number = new Intl.NumberFormat(language, { maximumFractionDigits: 3 })
  const amountOf = (quantity: number, of: HarvestUnit) =>
    of === "kg"
      ? t("record.kg", { amount: number.format(quantity) })
      : t("record.units", { count: quantity, amount: number.format(quantity) })
  const totalOf = (planting: Planting) => {
    const totals = harvestTotals(planting)
    return new Intl.ListFormat(language, { type: "conjunction" }).format(
      HARVEST_UNITS.filter((of) => totals[of] > 0).map((of) => amountOf(totals[of], of))
    )
  }
  return { amountOf, totalOf }
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
 * The form to record one harvest of a planting: the day (today unless the
 * crop was not in the ground today), and an amount if it was weighed or
 * counted. Used in the planting's panel and in the calendar, so the rules on
 * days and amounts live in one place. `onAdd` says whether the plan took it.
 */
export function HarvestForm({
  planting,
  onAdd,
  onCancel,
}: {
  planting: Planting
  onAdd(harvest: Harvest): boolean
  /**
   * Offers to close the form without recording, where it opens on demand.
   * There the amount takes the focus: it is the one thing to type.
   */
  onCancel?(): void
}) {
  const { t } = useTranslation()
  const amountField = useRef<HTMLInputElement>(null)
  // Once, when the form opens: not again on every render while someone types.
  const opensOnDemand = onCancel !== undefined
  useEffect(() => {
    if (opensOnDemand) amountField.current?.focus()
  }, [opensOnDemand])
  const bounds = doneDateBounds(planting, "harvest")
  const today = toIsoDate(new Date())
  // Nothing is picked from a crop still to go in, nor on a day still to come.
  const notInGround = bounds.min !== undefined && today < bounds.min
  const latest = bounds.max && bounds.max < today ? bounds.max : today
  // Today, unless the crop was not in the ground today.
  const [date, setDate] = useState<IsoDate>(() => (notInGround ? today : latest))
  const [amount, setAmount] = useState("")
  const [unit, setUnit] = useState<HarvestUnit>("kg")
  const [refused, setRefused] = useState(false)
  const harvests = planting.harvests ?? []

  const record = (event: FormEvent) => {
    event.preventDefault()
    const quantity = parseAmount(amount)
    const harvest: Harvest =
      quantity === undefined ? { date } : { date, quantity: quantity ?? 0, unit }
    // An amount that is not a number goes in as 0, which the plan refuses like any other bad amount.
    const taken = onAdd(harvest)
    setRefused(!taken)
    if (taken) setAmount("")
  }

  return (
    <>
      {/* The browser's own checks are off: its messages come in the browser's language, not the app's. */}
      <form noValidate className="flex flex-wrap items-end gap-2" onSubmit={record}>
        <label className="flex flex-col text-xs text-stone-600">
          {t("record.pickedOn")}
          <input
            type="date"
            className={inputClass}
            value={date}
            min={bounds.min}
            max={latest}
            disabled={notInGround}
            onChange={(event) => setDate(event.target.value)}
          />
        </label>
        <label className="flex flex-col text-xs text-stone-600">
          {t("record.amount")}
          <input
            ref={amountField}
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
          disabled={notInGround || harvests.length >= PLAN_LIMITS.maxHarvests}
        >
          {t("record.add")}
        </button>
        {onCancel && (
          <button type="button" className={buttonClass} onClick={onCancel}>
            {t("record.cancel")}
          </button>
        )}
        {notInGround && (
          <span className="self-center text-xs text-stone-500">{t("calendar.tooSoon")}</span>
        )}
      </form>
      {refused && (
        <p role="alert" className="text-sm text-red-800">
          {t("record.harvestRefused")}
        </p>
      )}
    </>
  )
}
