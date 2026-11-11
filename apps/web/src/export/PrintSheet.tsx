import { getPlant, type IsoDate, plantingFill } from "@garden/core"
import { useTranslation } from "react-i18next"
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
  const plan = useEditor((state) => state.plan)
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
