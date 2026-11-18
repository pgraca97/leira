import {
  findWeatherRisks,
  type GardenPlan,
  type GardenTask,
  getPlant,
  type IsoDate,
  tasksThisWeek,
  toIsoDate,
  type WeatherRisk,
} from "@leira/core"
import { useQueries } from "@tanstack/react-query"
import { Link } from "@tanstack/react-router"
import { useTranslation } from "react-i18next"
import { taskWord } from "../calendar/taskWord"
import { cropName } from "../editor/cropName"
import { currentLanguage } from "../i18n"
import { useBackend } from "../lib/backend"
import type { GardenSummary } from "../lib/gardens"
import { forecastQuery } from "../weather/forecast"
import { useRiskText } from "../weather/riskText"

const headingClass = "text-xs font-semibold tracking-wide text-stone-500 uppercase"
const itemClass =
  "flex flex-wrap items-baseline gap-x-2 rounded-md px-2 py-1 text-sm text-stone-800 hover:bg-stone-100"

/**
 * What to do this week in every garden, at the top of the list: the jobs that
 * slipped, the coming week's, and the weather that puts a crop at risk. The
 * list is the first page on coming back, so it answers "what now?" without
 * opening each garden. A job is ticked in its garden's calendar, since every
 * change to a garden goes through the editor's autosave.
 */
export function ThisWeek({ gardens }: { gardens: readonly GardenSummary[] }) {
  const { t } = useTranslation()
  const backend = useBackend()
  const riskText = useRiskText()
  const language = currentLanguage()
  const today = toIsoDate(new Date())

  const planted = gardens.filter(
    (garden): garden is GardenSummary & { plan: GardenPlan } =>
      (garden.plan?.plantings.length ?? 0) > 0
  )
  // One forecast per place: gardens in one zone share it, as the server's cache does.
  const forecasts = useQueries({
    queries: planted.map((garden) => ({
      ...(garden.location
        ? forecastQuery(backend, garden.location)
        : { queryKey: ["forecast", "none"], queryFn: async () => [] }),
      enabled: garden.location !== null,
    })),
  })
  if (planted.length === 0) return null

  const named = gardens.length > 1
  const jobs: { garden: GardenSummary; task: GardenTask; text: string }[] = planted
    .flatMap((garden) =>
      tasksThisWeek(garden.plan, getPlant, today).map((task) => {
        const planting = garden.plan.plantings.find((item) => item.id === task.plantingId)
        const plant = getPlant(task.plantId)
        const name = planting && plant ? cropName(planting, plant, language) : task.plantId
        return { garden, task, text: t(`calendar.task.${taskWord(task.kind, plant)}`, { name }) }
      })
    )
    // Stable, so jobs on one day keep the gardens' order.
    .sort((a, b) => a.task.date.localeCompare(b.task.date))
  const risks: { garden: GardenSummary; risk: WeatherRisk }[] = planted.flatMap((garden, index) => {
    const forecast = forecasts[index]?.data
    return forecast
      ? findWeatherRisks(garden.plan, getPlant, forecast).map((risk) => ({ garden, risk }))
      : []
  })

  const dayFormat = new Intl.DateTimeFormat(language, {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  })
  const day = (date: IsoDate) => dayFormat.format(new Date(`${date}T00:00:00Z`))
  const gardenName = (garden: GardenSummary) =>
    named && <span className="text-stone-500"> · {garden.name}</span>

  return (
    <section
      aria-labelledby="this-week"
      className="flex flex-col gap-2 rounded-md border border-stone-200 bg-white p-3"
    >
      <h2 id="this-week" className="text-lg font-semibold text-stone-900">
        {t("week.title")}
      </h2>
      {risks.length > 0 && (
        <ul aria-label={t("week.warnings")} className="flex flex-col gap-1">
          {risks.map(({ garden, risk }) => (
            <li key={`${garden.id}:${risk.plantingId}:${risk.kind}`}>
              <Link
                to="/gardens/$gardenId"
                params={{ gardenId: garden.id }}
                className={`${itemClass} bg-amber-50 text-amber-900 hover:bg-amber-100`}
              >
                {riskText(risk)}
                {gardenName(garden)}
              </Link>
            </li>
          ))}
        </ul>
      )}
      {jobs.length > 0 ? (
        <>
          <h3 className={headingClass}>{t("week.jobsHeading")}</h3>
          <ul aria-label={t("week.jobs")} className="flex flex-col">
            {jobs.map(({ garden, task, text }) => (
              <li key={`${garden.id}:${task.plantingId}:${task.kind}:${task.date}`}>
                <Link
                  to="/gardens/$gardenId"
                  params={{ gardenId: garden.id }}
                  search={{ view: "calendar" }}
                  className={itemClass}
                >
                  <span className="w-14 shrink-0 text-stone-600">{day(task.date)}</span>{" "}
                  <span>
                    {text}
                    {gardenName(garden)}
                  </span>
                  {task.date < today && (
                    <>
                      {" "}
                      <span className="rounded-sm bg-red-50 px-1 text-xs font-medium text-red-800">
                        {t("week.late")}
                      </span>
                    </>
                  )}
                </Link>
              </li>
            ))}
          </ul>
        </>
      ) : (
        <p className="text-sm text-stone-600">{t("week.nothing")}</p>
      )}
    </section>
  )
}
