import { getPlant, type IsoDate, type WeatherRisk } from "@leira/core"
import { useTranslation } from "react-i18next"
import { currentLanguage } from "../i18n"

/** Says what a weather risk means for the crop, the same way wherever it shows. */
export function useRiskText(): (risk: WeatherRisk) => string {
  const { t } = useTranslation()
  const language = currentLanguage()
  // Dates carry no zone, so they are formatted in UTC to stay on the same day everywhere.
  const dayFormat = new Intl.DateTimeFormat(language, {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  })
  const day = (date: IsoDate) => dayFormat.format(new Date(`${date}T00:00:00Z`))
  const whole = new Intl.NumberFormat(language, { maximumFractionDigits: 0 })
  const degrees = (value: number) => t("weather.degrees", { value: whole.format(value) })

  return (risk) => {
    const plant = getPlant(risk.plantId)
    return t(`weather.${risk.site === "greenhouse" ? "riskGreenhouse" : "risk"}.${risk.kind}`, {
      date: day(risk.date),
      temp: degrees(risk.tempC),
      name: plant?.name[language] ?? risk.plantId,
      // Only the cold soil warning says what the seed needs.
      need: degrees(plant?.temps.germMinSoilC ?? 0),
    })
  }
}
