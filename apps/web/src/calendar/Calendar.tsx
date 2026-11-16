import {
  addDays,
  type DateRange,
  type GardenPlan,
  gardenTasks,
  getPlant,
  type IsoDate,
  type Plant,
  type Planting,
  type PlantingSchedule,
  plantingFill,
  plantingSchedule,
  toIsoDate,
  yearOf,
} from "@leira/core"
import { type ReactNode, useState } from "react"
import { useTranslation } from "react-i18next"
import { buttonClass } from "../components/ui"
import { useEditor } from "../editor/useEditor"
import { currentLanguage } from "../i18n"
import { yearSpan } from "./layout"

/** How far ahead the list of jobs looks. */
const TASK_HORIZON_DAYS = 30

const headingClass = "text-xs font-semibold tracking-wide text-stone-500 uppercase"

interface Row {
  planting: Planting
  plant: Plant
  schedule: PlantingSchedule
  label: string
}

/**
 * The calendar of the garden being edited. It reads the plan from the editor
 * store, so it always shows what the editor holds.
 */
export function Calendar({ onOpenPlanting }: { onOpenPlanting(plantingId: string): void }) {
  const plan = useEditor((state) => state.plan)
  return <PlanCalendar plan={plan} onOpenPlanting={onOpenPlanting} />
}

interface PlanCalendarProps {
  plan: GardenPlan
  /** Opens a planting from its line. Without it the lines are only to read. */
  onOpenPlanting?(plantingId: string): void
}

/**
 * A plan's year at a glance: one line per planting with its time indoors,
 * in the ground and in harvest, and the jobs coming up next.
 */
export function PlanCalendar({ plan, onOpenPlanting }: PlanCalendarProps) {
  const { t } = useTranslation()
  const language = currentLanguage()
  const today = toIsoDate(new Date())
  const [year, setYear] = useState(() => yearOf(today))

  // Dates carry no zone, so they are formatted in UTC to stay on the same day everywhere.
  const dayFormat = new Intl.DateTimeFormat(language, {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  })
  const day = (date: IsoDate) => dayFormat.format(new Date(`${date}T00:00:00Z`))
  const monthFormat = new Intl.DateTimeFormat(language, { month: "short", timeZone: "UTC" })
  const months = Array.from({ length: 12 }, (_, month) =>
    monthFormat.format(new Date(Date.UTC(year, month, 1)))
  )

  const rows: Row[] = plan.plantings
    .flatMap((planting) => {
      const plant = getPlant(planting.plantId)
      if (!plant) return []
      const schedule = plantingSchedule(planting, plant)
      // From the first day of any stage to the last day in the ground.
      const whole = {
        from: schedule.indoors?.from ?? schedule.inGround.from,
        to: schedule.inGround.to,
      }
      if (!yearSpan(whole, year)) return []
      const name = t("inspector.plantingSummary", {
        name: plant.name[language],
        count: plantingFill(planting, plant).count,
      })
      const stages = [
        schedule.indoors && t("calendar.rowIndoors", { date: day(schedule.indoors.from) }),
        t("calendar.rowInGround", {
          from: day(schedule.inGround.from),
          to: day(schedule.inGround.to),
        }),
        schedule.harvest && t("calendar.rowHarvest", { date: day(schedule.harvest.from) }),
      ].filter(Boolean)
      return [{ planting, plant, schedule, label: `${name}: ${stages.join(", ")}` }]
    })
    .sort((a, b) => a.schedule.inGround.from.localeCompare(b.schedule.inGround.from))

  const tasks = gardenTasks(plan, getPlant, {
    from: today,
    to: addDays(today, TASK_HORIZON_DAYS),
  })
  const todayMark = yearSpan({ from: today, to: today }, year)

  return (
    <main className="mx-auto flex h-full w-full max-w-5xl flex-col gap-6 overflow-y-auto p-4">
      <section aria-labelledby="calendar-year" className="flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <button
            type="button"
            className={buttonClass}
            aria-label={t("calendar.previousYear")}
            onClick={() => setYear(year - 1)}
          >
            <span aria-hidden="true">‹</span>
          </button>
          <h2 id="calendar-year" className="w-16 text-center text-xl font-semibold text-stone-900">
            {year}
          </h2>
          <button
            type="button"
            className={buttonClass}
            aria-label={t("calendar.nextYear")}
            onClick={() => setYear(year + 1)}
          >
            <span aria-hidden="true">›</span>
          </button>
          <Legend />
        </div>

        {rows.length === 0 ? (
          <p className="text-sm text-stone-600">{t("calendar.empty", { year })}</p>
        ) : (
          <div className="overflow-x-auto rounded-md border border-stone-200 bg-white">
            <div className="min-w-[40rem]">
              <div
                aria-hidden="true"
                className="grid grid-cols-[10rem_1fr] border-b border-stone-200"
              >
                <span />
                <div className="grid grid-cols-12 text-center text-xs text-stone-500">
                  {months.map((month) => (
                    <span key={month} className="border-l border-stone-200 py-1">
                      {month}
                    </span>
                  ))}
                </div>
              </div>
              <ul aria-label={t("calendar.rowsLabel", { year })}>
                {rows.map((row) => (
                  <li key={row.planting.id} className="border-b border-stone-100 last:border-b-0">
                    <RowFrame
                      label={row.label}
                      onOpen={onOpenPlanting && (() => onOpenPlanting(row.planting.id))}
                    >
                      <span className="truncate px-3 py-2 text-sm text-stone-800">
                        {row.label.slice(0, row.label.indexOf(":"))}
                      </span>
                      <span className="relative block h-9">
                        <MonthLines />
                        <Bar
                          range={row.schedule.indoors}
                          year={year}
                          color={row.plant.color}
                          stage="indoors"
                        />
                        <Bar
                          range={row.schedule.inGround}
                          year={year}
                          color={row.plant.color}
                          stage="inGround"
                        />
                        <Bar
                          range={row.schedule.harvest}
                          year={year}
                          color={row.plant.color}
                          stage="harvest"
                        />
                        {todayMark && (
                          <span
                            className="absolute inset-y-0 w-px bg-stone-900"
                            style={{ left: `${todayMark.start * 100}%` }}
                          />
                        )}
                      </span>
                    </RowFrame>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}
      </section>

      <section aria-labelledby="calendar-tasks" className="flex flex-col gap-2">
        <h2 id="calendar-tasks" className={headingClass}>
          {t("calendar.comingUp")}
        </h2>
        {tasks.length === 0 ? (
          <p className="text-sm text-stone-600">
            {t("calendar.noTasks", { days: TASK_HORIZON_DAYS })}
          </p>
        ) : (
          <ul aria-labelledby="calendar-tasks" className="flex flex-col gap-1">
            {tasks.map((task) => (
              <li
                key={`${task.plantingId}:${task.kind}`}
                className="flex items-baseline gap-3 rounded-md border border-stone-200 bg-white px-3 py-2 text-sm"
              >
                <span className="w-16 shrink-0 font-medium text-stone-500">{day(task.date)}</span>
                <span className="text-stone-900">
                  {t(`calendar.task.${task.kind}`, {
                    name: getPlant(task.plantId)?.name[language] ?? task.plantId,
                  })}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  )
}

type Stage = "indoors" | "inGround" | "harvest"

/** How each stage is told apart: striped while indoors, pale in the ground, solid in harvest. */
function stageStyle(stage: Stage, color: string): React.CSSProperties {
  if (stage === "indoors") {
    return {
      backgroundImage: `repeating-linear-gradient(135deg, ${color}99 0 3px, transparent 3px 6px)`,
      border: `1px solid ${color}`,
    }
  }
  return { backgroundColor: stage === "inGround" ? `${color}55` : color }
}

const rowClass = "grid w-full grid-cols-[10rem_1fr] items-center text-left"

/**
 * One line of the calendar: a button when it opens its planting, plain
 * content when there is nothing to open. Either way the label says in words
 * what the bars draw.
 */
function RowFrame({
  label,
  onOpen,
  children,
}: {
  label: string
  onOpen?: () => void
  children: ReactNode
}) {
  if (onOpen) {
    return (
      <button
        type="button"
        aria-label={label}
        className={`${rowClass} hover:bg-stone-50 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-emerald-700`}
        onClick={onOpen}
      >
        {children}
      </button>
    )
  }
  return (
    <div className={rowClass}>
      <span className="sr-only">{label}</span>
      {/* Hidden from screen readers: the words above already say all of it. */}
      <span aria-hidden="true" className="contents">
        {children}
      </span>
    </div>
  )
}

function Bar({
  range,
  year,
  color,
  stage,
}: {
  range: DateRange | null
  year: number
  color: string
  stage: Stage
}) {
  const span = range && yearSpan(range, year)
  if (!span) return null
  return (
    <span
      className={`absolute rounded-sm ${stage === "harvest" ? "inset-y-3.5" : "inset-y-2"}`}
      style={{
        left: `${span.start * 100}%`,
        width: `${span.width * 100}%`,
        ...stageStyle(stage, color),
      }}
    />
  )
}

/** Faint lines between the months, behind the bars. */
function MonthLines() {
  return (
    <span aria-hidden="true" className="absolute inset-0 grid grid-cols-12">
      {Array.from({ length: 12 }, (_, month) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: twelve fixed columns that never reorder
        <span key={month} className="border-l border-stone-100" />
      ))}
    </span>
  )
}

function Legend() {
  const { t } = useTranslation()
  const sample = "#57534e"
  const stages: Stage[] = ["indoors", "inGround", "harvest"]
  return (
    <ul className="ml-auto flex flex-wrap gap-x-4 gap-y-1 text-xs text-stone-600">
      {stages.map((stage) => (
        <li key={stage} className="flex items-center gap-1.5">
          <span
            aria-hidden="true"
            className="h-3 w-5 rounded-sm"
            style={stageStyle(stage, sample)}
          />
          {t(`calendar.legend.${stage}`)}
        </li>
      ))}
    </ul>
  )
}
