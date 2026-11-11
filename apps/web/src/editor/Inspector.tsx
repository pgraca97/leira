import {
  BED_KINDS,
  type BedKind,
  findRotationConflicts,
  getPlant,
  PLANTING_LAYOUTS,
  type PlantingLayout,
  plantingFill,
} from "@garden/core"
import { type ReactNode, useState } from "react"
import { useTranslation } from "react-i18next"
import { CommitField } from "../components/CommitField"
import { dangerButtonClass, inputClass, toggleButtonClass } from "../components/ui"
import { currentLanguage } from "../i18n"
import { editorStore, selectedBed, selectedPlanting } from "./store"
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
  const { select, removeSelection, setPlantingDates, setPlantingLayout, updateBed, setPlanSize } =
    editorStore.getState()
  const [sizeRefused, setSizeRefused] = useState(false)
  const language = currentLanguage()

  const plantings = plan.plantings.map((planting) => {
    const plant = getPlant(planting.plantId)
    return {
      planting,
      plant,
      name: plant ? plant.name[language] : planting.plantId,
      count: plant ? plantingFill(planting, plant).count : 0,
    }
  })
  const totalPlants = plantings.reduce((sum, item) => sum + item.count, 0)

  const nameOf = (plantingId: string) =>
    plantings.find((item) => item.planting.id === plantingId)?.name ?? ""
  const conflicts = findRotationConflicts(plan, getPlant, { years: ROTATION_YEARS })

  const bed = selectedBed({ plan, selection })
  const planted = plantings.find((item) => item.planting === selectedPlanting({ plan, selection }))
  const selectedRect = bed?.rect ?? planted?.planting.rect
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
    <aside className="flex max-h-72 flex-col gap-4 overflow-y-auto border-t border-stone-200 bg-white p-3 lg:max-h-none lg:border-t-0 lg:border-l">
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
                    setPlantingDates(planted.planting.id, {
                      ...planted.planting.inGround,
                      from: event.target.value,
                    })
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
                    setPlantingDates(planted.planting.id, {
                      ...planted.planting.inGround,
                      to: event.target.value,
                    })
                  }
                />
              </label>
            </div>
          )}
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
                  aria-pressed={
                    selection?.kind === "planting" && selection.id === conflict.plantingId
                  }
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

      {plantings.length > 0 && (
        <section aria-labelledby="inspector-plantings">
          <h3
            id="inspector-plantings"
            className="mb-1 text-xs font-semibold tracking-wide text-stone-500 uppercase"
          >
            {t("inspector.plantings")}
          </h3>
          <ul>
            {plantings.map(({ planting, plant, name, count }) => (
              <li key={planting.id}>
                <button
                  type="button"
                  className={toggleButtonClass}
                  aria-pressed={selection?.kind === "planting" && selection.id === planting.id}
                  onClick={() => select({ kind: "planting", id: planting.id })}
                >
                  <span
                    aria-hidden="true"
                    className="size-3 shrink-0 rounded-full bg-stone-400"
                    style={plant ? { backgroundColor: plant.color } : undefined}
                  />
                  {t("inspector.plantingSummary", { name, count })}
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
                  aria-pressed={selection?.kind === "bed" && selection.id === item.id}
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

      {children}
    </aside>
  )
}
