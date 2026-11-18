import { getPlant, type IsoDate, plantingFill } from "@leira/core"
import { useTranslation } from "react-i18next"
import { shownPlan } from "../editor/store"
import { useEditor } from "../editor/useEditor"
import { currentLanguage } from "../i18n"
import { PlanSvg } from "./PlanSvg"

/**
 * What goes on paper: the plan as a picture and a table of what is planted.
 * It is in the page all the time but only shows when printing, when the rest
 * of the app is hidden. That way the browser's own print command works too.
 */
export function PrintSheet({ gardenName }: { gardenName: string }) {
  const { t } = useTranslation()
  // On paper as on the screen: with a day picked, only what is in the ground then.
  const fullPlan = useEditor((state) => state.plan)
  const viewDate = useEditor((state) => state.viewDate)
  const plan = shownPlan({ plan: fullPlan, viewDate })
  const language = currentLanguage()
  // Dates carry no zone, so they are formatted in UTC to stay on the same day everywhere.
  const dateFormat = new Intl.DateTimeFormat(language, { dateStyle: "medium", timeZone: "UTC" })
  const day = (date: IsoDate) => dateFormat.format(new Date(`${date}T00:00:00Z`))

  const rows = plan.plantings
    .map((planting) => {
      const plant = getPlant(planting.plantId)
      return {
        planting,
        name: plant ? plant.name[language] : planting.plantId,
        count: plant ? plantingFill(planting, plant).count : null,
      }
    })
    .sort((a, b) => a.planting.inGround.from.localeCompare(b.planting.inGround.from))

  return (
    <div data-testid="print-sheet" className="hidden p-4 text-stone-900 print:block">
      <h1 className="mb-3 text-2xl font-semibold">{gardenName}</h1>
      {viewDate && <p className="-mt-2 mb-3">{t("export.onDay", { date: day(viewDate) })}</p>}
      <PlanSvg plan={plan} locale={language} title={gardenName} className="max-h-[60vh] w-full" />
      {rows.length > 0 && (
        <table className="mt-4 w-full border-collapse text-left text-sm">
          <thead>
            <tr className="border-b border-stone-400">
              <th className="py-1 pr-3 font-semibold">{t("export.plant")}</th>
              <th className="py-1 pr-3 font-semibold">{t("export.plants")}</th>
              <th className="py-1 pr-3 font-semibold">{t("inspector.inGroundFrom")}</th>
              <th className="py-1 font-semibold">{t("inspector.inGroundTo")}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ planting, name, count }) => (
              <tr key={planting.id} className="border-b border-stone-200">
                <td className="py-1 pr-3">{name}</td>
                <td className="py-1 pr-3">{count ?? "?"}</td>
                <td className="py-1 pr-3">{day(planting.inGround.from)}</td>
                <td className="py-1">{day(planting.inGround.to)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}
