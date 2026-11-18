import { type GardenPlan, getPlant, yearHarvest } from "@leira/core"
import { useTranslation } from "react-i18next"
import { cropName } from "../editor/cropName"
import { useHarvestWords } from "../editor/HarvestForm"
import { currentLanguage } from "../i18n"

/**
 * What the garden gave in a year: by crop and variety, the biggest first, and
 * in all. It answers "how much did the garden give?" and "which variety did
 * best?", which is what recording each harvest is for. Nothing when nothing
 * was picked that year. A harvest with no amount, or a shared garden whose
 * amounts are kept back, still counts as a harvest.
 */
export function YearHarvest({
  plan,
  year,
  className = "",
}: {
  plan: GardenPlan
  year: number
  className?: string
}) {
  const { t } = useTranslation()
  const language = currentLanguage()
  const { amountOf } = useHarvestWords()
  const { crops, total } = yearHarvest(plan, year)
  if (crops.length === 0) return null

  const amounts = (gave: { kg: number; units: number }) =>
    new Intl.ListFormat(language, { type: "conjunction" }).format(
      (["kg", "units"] as const).filter((of) => gave[of] > 0).map((of) => amountOf(gave[of], of))
    )
  const id = `harvested-${year}`
  const cell = "border-b border-stone-200 py-1 pr-3"

  return (
    <section aria-labelledby={id} className={`flex flex-col gap-2 ${className}`}>
      <h2 id={id} className="text-xs font-semibold tracking-wide text-stone-500 uppercase">
        {t("harvested.title", { year })}
      </h2>
      <table aria-labelledby={id} className="w-full border-collapse text-left text-sm">
        <thead className="text-stone-600">
          <tr>
            <th className={cell}>{t("harvested.crop")}</th>
            <th className={cell}>{t("harvested.picked")}</th>
            <th className={`${cell} text-right`}>{t("harvested.harvests")}</th>
          </tr>
        </thead>
        <tbody className="text-stone-900">
          {crops.map((crop) => (
            <tr key={`${crop.plantId}:${crop.variety ?? ""}`}>
              <td className={cell}>{cropName(crop, getPlant(crop.plantId), language)}</td>
              <td className={cell}>{amounts(crop)}</td>
              <td className={`${cell} text-right`}>{crop.harvests}</td>
            </tr>
          ))}
        </tbody>
        <tfoot className="font-medium text-stone-900">
          <tr>
            <th scope="row" className="py-1 pr-3">
              {t("harvested.total")}
            </th>
            <td className="py-1 pr-3">{amounts(total)}</td>
            <td className="py-1 text-right">{total.harvests}</td>
          </tr>
        </tfoot>
      </table>
    </section>
  )
}
