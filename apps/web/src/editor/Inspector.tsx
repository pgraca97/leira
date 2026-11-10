import { getPlant, plantingFill } from "@garden/core"
import { useTranslation } from "react-i18next"
import { dangerButtonClass, toggleButtonClass } from "../components/ui"
import { currentLanguage } from "../i18n"
import { editorStore, selectedBed, selectedPlanting } from "./store"
import { useEditor } from "./useEditor"

/**
 * Lists what is on the plan and describes the selected item. It is also the
 * way to read and select the plan's contents without using the canvas.
 */
export function Inspector() {
  const { t } = useTranslation()
  const plan = useEditor((state) => state.plan)
  const selection = useEditor((state) => state.selection)
  const { select, removeSelection } = editorStore.getState()
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

  const bed = selectedBed({ plan, selection })
  const planted = plantings.find((item) => item.planting === selectedPlanting({ plan, selection }))
  const selectedRect = bed?.rect ?? planted?.planting.rect
  const metres = new Intl.NumberFormat(language, { maximumFractionDigits: 2 })

  return (
    <aside className="flex max-h-72 flex-col gap-4 overflow-y-auto border-t border-stone-200 bg-white p-3 lg:max-h-none lg:border-t-0 lg:border-l">
      <header>
        <h2 className="font-semibold text-stone-900">{t("inspector.title")}</h2>
        <p className="text-sm text-stone-600">
          {t("inspector.size", {
            width: metres.format(plan.widthCm / 100),
            height: metres.format(plan.heightCm / 100),
          })}
          {totalPlants > 0 && ` · ${t("inspector.totalPlants", { count: totalPlants })}`}
        </p>
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
              : t("inspector.bedName", {
                  number: plan.beds.indexOf(bed as NonNullable<typeof bed>) + 1,
                })}
          </p>
          <p className="text-sm text-stone-600">
            {t("inspector.dimensions", { width: selectedRect.w, height: selectedRect.h })}
          </p>
          {planted?.plant && (
            <p className="text-sm text-stone-600">
              {t(`inspector.layout.${planted.planting.layout}`)}
              {" · "}
              {t("inspector.spacing", {
                inRow: planted.plant.spacing.inRowCm,
                row: planted.plant.spacing.rowCm,
              })}
            </p>
          )}
          <button type="button" className={`${dangerButtonClass} mt-2`} onClick={removeSelection}>
            {t("inspector.delete")}
          </button>
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
    </aside>
  )
}
