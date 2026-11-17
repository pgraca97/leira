import {
  addDays,
  BED_KINDS,
  type BedKind,
  findCompanions,
  findOutOfSeason,
  findRotationConflicts,
  getPlant,
  isInGround,
  PLAN_LIMITS,
  PLANTING_LAYOUTS,
  type PlantingLayout,
  plantingFill,
  plantingSchedule,
} from "@leira/core"
import { type ReactNode, useState } from "react"
import { useTranslation } from "react-i18next"
import { CommitField } from "../components/CommitField"
import { dangerButtonClass, inputClass, toggleButtonClass } from "../components/ui"
import { currentLanguage } from "../i18n"
import { cropName } from "./cropName"
import { PlantingMarks, PlantingRecord } from "./PlantingRecord"
import { monthName, seasonText } from "./season"
import { editorStore, isSelected, selectedBed, selectedPlanting } from "./store"
import { useEditor } from "./useEditor"

/** Years a botanical family should stay away from ground it has just used. */
const ROTATION_YEARS = 3

/**
 * Lists what is on the plan and describes the selected item. It is also the
 * way to read and select the plan's contents without using the canvas.
 * `children` go below the lists.
 */
export function Inspector({ children }: { children?: ReactNode }) {
  const { t } = useTranslation()
  const plan = useEditor((state) => state.plan)
  const selection = useEditor((state) => state.selection)
  const viewDate = useEditor((state) => state.viewDate)
  const {
    select,
    removeSelection,
    setPlantingDates,
    setPlantingLayout,
    setPlantingSowDate,
    updateBed,
    setPlanSize,
    setPlanNotes,
    setPlantingVariety,
  } = editorStore.getState()
  const [sizeRefused, setSizeRefused] = useState(false)
  // The planting whose last change of dates or marks was refused. Kept by id,
  // so the message does not follow the selection to another planting.
  const [datesRefusedFor, setDatesRefusedFor] = useState<string | null>(null)
  const noteDates = (plantingId: string, taken: boolean) =>
    setDatesRefusedFor(taken ? null : plantingId)
  const language = currentLanguage()

  const plantings = plan.plantings.map((planting) => {
    const plant = getPlant(planting.plantId)
    return {
      planting,
      plant,
      name: cropName(planting, plant, language),
      count: plant ? plantingFill(planting, plant).count : 0,
      // Still listed, so it can be found and selected, but marked as away.
      away: viewDate !== null && !isInGround(planting, viewDate),
    }
  })
  const totalPlants = plantings.reduce((sum, item) => sum + item.count, 0)

  const nameOf = (plantingId: string) =>
    plantings.find((item) => item.planting.id === plantingId)?.name ?? ""
  const conflicts = findRotationConflicts(plan, getPlant, { years: ROTATION_YEARS })
  const plantNameOf = (plantingId: string) => {
    const item = plantings.find((entry) => entry.planting.id === plantingId)
    return item?.plant?.name[language] ?? ""
  }
  const companions = findCompanions(plan, getPlant)
  const outOfSeason = findOutOfSeason(plan, getPlant)

  const bed = selectedBed({ plan, selection })
  const planted = plantings.find((item) => item.planting === selectedPlanting({ plan, selection }))
  const selectedRect = bed?.rect ?? planted?.planting.rect
  // A crop sown straight into the ground is sown the day it goes in, which is
  // already a field: only seedlings raised under cover have a sowing day of their own.
  const sownIndoors =
    planted?.plant && (planted.plant.indoorsWeeks || planted.planting.sowDate)
      ? {
          recorded: planted.planting.sowDate ?? "",
          estimate: plantingSchedule(planted.planting, planted.plant).indoors?.from,
        }
      : null
  // Dates carry no zone, so they are formatted in UTC to stay on the same day everywhere.
  const dateFormat = new Intl.DateTimeFormat(language, { dateStyle: "medium", timeZone: "UTC" })
  const metres = new Intl.NumberFormat(language, { maximumFractionDigits: 2, useGrouping: false })

  /** Stores a garden side typed in metres ("8", "8.5" or "8,5"), keeping the other side. */
  const resize = (side: "widthCm" | "heightCm", typed: string): boolean => {
    const centimetres = Math.round(Number(typed.trim().replace(",", ".")) * 100)
    const resized =
      typed.trim() !== "" &&
      Number.isFinite(centimetres) &&
      (centimetres === plan[side] ||
        setPlanSize(
          side === "widthCm" ? centimetres : plan.widthCm,
          side === "heightCm" ? centimetres : plan.heightCm
        ))
    setSizeRefused(!resized)
    return resized
  }

  return (
    <aside className="flex flex-col gap-4 border-t border-stone-200 bg-white p-3 lg:overflow-y-auto lg:border-t-0 lg:border-l">
      <header>
        <h2 className="font-semibold text-stone-900">{t("inspector.title")}</h2>
        <div className="mt-1 flex gap-2">
          <CommitField
            label={t("inspector.widthM")}
            className="w-20"
            inputMode="decimal"
            value={metres.format(plan.widthCm / 100)}
            onCommit={(typed) => resize("widthCm", typed)}
          />
          <CommitField
            label={t("inspector.lengthM")}
            className="w-20"
            inputMode="decimal"
            value={metres.format(plan.heightCm / 100)}
            onCommit={(typed) => resize("heightCm", typed)}
          />
        </div>
        {sizeRefused && (
          <p role="alert" className="mt-1 text-sm text-red-800">
            {t("inspector.sizeRefused")}
          </p>
        )}
        {totalPlants > 0 && (
          <p className="mt-1 text-sm text-stone-600">
            {t("inspector.totalPlants", { count: totalPlants })}
          </p>
        )}
      </header>

      {plan.beds.length === 0 && plan.plantings.length === 0 && (
        <p className="text-sm text-stone-600">{t("inspector.empty")}</p>
      )}

      {selectedRect && (
        <section aria-labelledby="inspector-selected" className="rounded-md bg-stone-100 p-3">
          <h3
            id="inspector-selected"
            className="text-xs font-semibold tracking-wide text-stone-500 uppercase"
          >
            {t("inspector.selected")}
          </h3>
          <p className="font-medium text-stone-900">
            {planted
              ? t("inspector.plantingSummary", { name: planted.name, count: planted.count })
              : bed?.name ||
                t("inspector.bedName", {
                  number: plan.beds.indexOf(bed as NonNullable<typeof bed>) + 1,
                })}
          </p>
          <p className="text-sm text-stone-600">
            {t("inspector.dimensions", { width: selectedRect.w, height: selectedRect.h })}
          </p>
          <p className="text-sm text-stone-600">
            {t("inspector.position", { x: selectedRect.x, y: selectedRect.y })}
          </p>
          {bed && (
            <div className="mt-2 flex flex-wrap gap-2">
              <CommitField
                label={t("inspector.name")}
                className="w-36"
                maxLength={60}
                value={bed.name}
                onCommit={(name) => updateBed(bed.id, { name })}
              />
              <label className="flex flex-col text-xs text-stone-600">
                {t("inspector.kindLabel")}
                <select
                  className={inputClass}
                  value={bed.kind}
                  onChange={(event) => updateBed(bed.id, { kind: event.target.value as BedKind })}
                >
                  {BED_KINDS.map((kind) => (
                    <option key={kind} value={kind}>
                      {t(`inspector.kind.${kind}`)}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          )}
          {planted?.plant && (
            <p className="text-sm text-stone-600">
              {t("inspector.spacing", {
                inRow: planted.plant.spacing.inRowCm,
                row: planted.plant.spacing.rowCm,
              })}
            </p>
          )}
          {planted && (
            <div className="mt-2">
              <CommitField
                label={t("inspector.variety")}
                className="w-48"
                maxLength={PLAN_LIMITS.maxVariety}
                value={planted.planting.variety ?? ""}
                onCommit={(variety) => setPlantingVariety(planted.planting.id, variety)}
              />
            </div>
          )}
          {planted && (
            <label className="mt-2 flex flex-col items-start text-xs text-stone-600">
              {t("inspector.layoutLabel")}
              <select
                className={inputClass}
                value={planted.planting.layout}
                onChange={(event) =>
                  setPlantingLayout(planted.planting.id, event.target.value as PlantingLayout)
                }
              >
                {PLANTING_LAYOUTS.map((layout) => (
                  <option key={layout} value={layout}>
                    {t(`inspector.layout.${layout}`)}
                  </option>
                ))}
              </select>
            </label>
          )}
          {planted && (
            <div className="mt-2 flex flex-wrap gap-2">
              <label className="flex flex-col text-xs text-stone-600">
                {t("inspector.inGroundFrom")}
                <input
                  type="date"
                  className={inputClass}
                  value={planted.planting.inGround.from}
                  max={planted.planting.inGround.to}
                  onChange={(event) =>
                    noteDates(
                      planted.planting.id,
                      setPlantingDates(planted.planting.id, {
                        ...planted.planting.inGround,
                        from: event.target.value,
                      })
                    )
                  }
                />
              </label>
              <label className="flex flex-col text-xs text-stone-600">
                {t("inspector.inGroundTo")}
                <input
                  type="date"
                  className={inputClass}
                  value={planted.planting.inGround.to}
                  min={planted.planting.inGround.from}
                  onChange={(event) =>
                    noteDates(
                      planted.planting.id,
                      setPlantingDates(planted.planting.id, {
                        ...planted.planting.inGround,
                        to: event.target.value,
                      })
                    )
                  }
                />
              </label>
            </div>
          )}
          {planted && (
            <PlantingMarks
              planting={planted.planting}
              onResult={(taken) => noteDates(planted.planting.id, taken)}
            />
          )}
          {planted && datesRefusedFor === planted.planting.id && (
            <p role="alert" className="mt-1 text-sm text-red-800">
              {t("record.refused")}
            </p>
          )}
          {planted && sownIndoors && (
            <div className="mt-2 flex flex-col items-start text-xs text-stone-600">
              <label className="flex flex-col">
                {t("inspector.sownIndoors")}
                <input
                  type="date"
                  className={inputClass}
                  value={sownIndoors.recorded}
                  max={addDays(planted.planting.inGround.from, -1)}
                  onChange={(event) =>
                    setPlantingSowDate(planted.planting.id, event.target.value || null)
                  }
                />
              </label>
              {!sownIndoors.recorded && sownIndoors.estimate && (
                <p className="mt-0.5">
                  {t("inspector.sownEstimate", {
                    date: dateFormat.format(new Date(`${sownIndoors.estimate}T00:00:00Z`)),
                  })}
                </p>
              )}
            </div>
          )}
          {planted && <PlantingRecord key={planted.planting.id} planting={planted.planting} />}
          <button type="button" className={`${dangerButtonClass} mt-2`} onClick={removeSelection}>
            {t("inspector.delete")}
          </button>
        </section>
      )}

      {conflicts.length > 0 && (
        <section aria-labelledby="inspector-rotation">
          <h3
            id="inspector-rotation"
            className="mb-1 text-xs font-semibold tracking-wide text-amber-800 uppercase"
          >
            {t("rotation.title")}
          </h3>
          <ul className="flex flex-col gap-1">
            {conflicts.map((conflict) => (
              <li key={`${conflict.plantingId}:${conflict.previousPlantingId}`}>
                <button
                  type="button"
                  className={`${toggleButtonClass} bg-amber-50 text-amber-900`}
                  aria-pressed={isSelected(selection, {
                    kind: "planting",
                    id: conflict.plantingId,
                  })}
                  onClick={() => select({ kind: "planting", id: conflict.plantingId })}
                >
                  {t("rotation.conflict", {
                    name: nameOf(conflict.plantingId),
                    previous: nameOf(conflict.previousPlantingId),
                    when:
                      conflict.yearsApart === 0
                        ? t("rotation.sameYear")
                        : t("rotation.yearsBefore", { count: conflict.yearsApart }),
                    years: ROTATION_YEARS,
                    family: t(`rotation.family.${conflict.family}`),
                  })}
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {outOfSeason.length > 0 && (
        <section aria-labelledby="inspector-season">
          <h3
            id="inspector-season"
            className="mb-1 text-xs font-semibold tracking-wide text-amber-800 uppercase"
          >
            {t("season.title")}
          </h3>
          <ul className="flex flex-col gap-1">
            {outOfSeason.map((late) => (
              <li key={late.plantingId}>
                <button
                  type="button"
                  className={`${toggleButtonClass} bg-amber-50 text-amber-900`}
                  aria-pressed={isSelected(selection, { kind: "planting", id: late.plantingId })}
                  onClick={() => select({ kind: "planting", id: late.plantingId })}
                >
                  {t("season.outOfSeason", {
                    name: plantNameOf(late.plantingId),
                    month: monthName(late.month, language),
                    season: seasonText(getPlant(late.plantId)?.groundMonths ?? [], language, t),
                  })}
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {companions.length > 0 && (
        <section aria-labelledby="inspector-companions">
          <h3
            id="inspector-companions"
            className="mb-1 text-xs font-semibold tracking-wide text-stone-500 uppercase"
          >
            {t("companions.title")}
          </h3>
          <ul className="flex flex-col gap-1">
            {companions.map((pair) => {
              const names = {
                first: plantNameOf(pair.plantingId),
                second: plantNameOf(pair.otherPlantingId),
              }
              return (
                <li key={`${pair.plantingId}:${pair.otherPlantingId}`}>
                  {pair.relation === "bad" ? (
                    <button
                      type="button"
                      className={`${toggleButtonClass} bg-amber-50 text-amber-900`}
                      aria-pressed={isSelected(selection, {
                        kind: "planting",
                        id: pair.plantingId,
                      })}
                      onClick={() => select({ kind: "planting", id: pair.plantingId })}
                    >
                      {t("companions.bad", names)}
                    </button>
                  ) : (
                    <p className="px-3 py-1 text-sm text-emerald-800">
                      {t("companions.good", names)}
                    </p>
                  )}
                </li>
              )
            })}
          </ul>
        </section>
      )}

      {plantings.length > 0 && (
        <section aria-labelledby="inspector-plantings">
          <h3
            id="inspector-plantings"
            className="mb-1 text-xs font-semibold tracking-wide text-stone-500 uppercase"
          >
            {t("inspector.plantings")}
          </h3>
          <ul>
            {plantings.map(({ planting, plant, name, count, away }) => (
              <li key={planting.id}>
                <button
                  type="button"
                  className={toggleButtonClass}
                  aria-pressed={isSelected(selection, { kind: "planting", id: planting.id })}
                  onClick={() => select({ kind: "planting", id: planting.id })}
                >
                  <span
                    aria-hidden="true"
                    className="size-3 shrink-0 rounded-full bg-stone-400"
                    style={plant ? { backgroundColor: plant.color } : undefined}
                  />
                  <span className={away ? "flex-1 opacity-60" : "flex-1"}>
                    {t("inspector.plantingSummary", { name, count })}
                  </span>
                  {away && (
                    <span className="text-xs text-stone-500">{t("inspector.notInGround")}</span>
                  )}
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {plan.beds.length > 0 && (
        <section aria-labelledby="inspector-beds">
          <h3
            id="inspector-beds"
            className="mb-1 text-xs font-semibold tracking-wide text-stone-500 uppercase"
          >
            {t("inspector.beds")}
          </h3>
          <ul>
            {plan.beds.map((item, index) => (
              <li key={item.id}>
                <button
                  type="button"
                  className={toggleButtonClass}
                  aria-pressed={isSelected(selection, { kind: "bed", id: item.id })}
                  onClick={() => select({ kind: "bed", id: item.id })}
                >
                  <span className="flex-1">
                    {item.name || t("inspector.bedName", { number: index + 1 })}
                  </span>
                  <span className="text-xs text-stone-500">
                    {t("inspector.dimensions", { width: item.rect.w, height: item.rect.h })}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <CommitField
        multiline
        label={t("record.gardenNotes")}
        maxLength={PLAN_LIMITS.maxPlanNotes}
        value={plan.notes ?? ""}
        onCommit={setPlanNotes}
      />

      {children}
    </aside>
  )
}
