import {
  addDays,
  bedOfPlanting,
  bedSeasons,
  cropsThatFit,
  type DateRange,
  defaultDoneDate,
  doneDateBounds,
  type GardenPlan,
  type GardenTask,
  type GardenTaskKind,
  gardenTasks,
  getPlant,
  type IsoDate,
  PLANTS,
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
import { buttonClass, inputClass, viewLinkClass } from "../components/ui"
import { useEditor } from "../editor/useEditor"
import { currentLanguage } from "../i18n"
import { type YearSpan, yearSpan } from "./layout"

/** How many crops a free stretch of a bed names before it only counts the rest. */
const FITS_SHOWN = 4

/** How far ahead the list of jobs looks. */
const TASK_HORIZON_DAYS = 30
/**
 * How long a job stays on the list after its day. Long enough to catch up on
 * a job that slipped, short enough that crops planted before anyone kept
 * records do not fill the list with jobs nobody is going to tick.
 */
const TASK_LOOKBACK_DAYS = 30

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
  const recordTask = useEditor((state) => state.recordTask)
  return <PlanCalendar plan={plan} onOpenPlanting={onOpenPlanting} onRecordTask={recordTask} />
}

interface PlanCalendarProps {
  plan: GardenPlan
  /** Opens a planting from its line. Without it the lines are only to read. */
  onOpenPlanting?(plantingId: string): void
  /**
   * Records a job as done on a day, or as still to do when given null.
   * Without it the jobs only show what was done.
   */
  onRecordTask?(plantingId: string, kind: GardenTaskKind, date: IsoDate | null): boolean
}

/**
 * A plan's year at a glance: one line per planting with its time indoors,
 * in the ground and in harvest, and the jobs around today: the ones coming
 * up, the ones that slipped, and the ones just done.
 */
export function PlanCalendar({ plan, onOpenPlanting, onRecordTask }: PlanCalendarProps) {
  const { t } = useTranslation()
  const language = currentLanguage()
  const today = toIsoDate(new Date())
  const [year, setYear] = useState(() => yearOf(today))
  const [grouping, setGrouping] = useState<"planting" | "bed">("planting")

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
    from: addDays(today, -TASK_LOOKBACK_DAYS),
    to: addDays(today, TASK_HORIZON_DAYS),
  }).flatMap((task) => {
    const planting = plan.plantings.find((item) => item.id === task.plantingId)
    return planting ? [{ task, planting }] : []
  })
  const todayMark = yearSpan({ from: today, to: today }, year)

  // The free stretches are looked for to the end of the following year, so one
  // that runs past December is known for as long as it really is. That is the
  // room a crop is offered; the calendar draws the part inside the year.
  const yearEnd = `${year}-12-31`
  const seasons = bedSeasons(plan, { from: `${year}-01-01`, to: `${year + 1}-12-31` }).filter(
    (season) => season.bed
  )
  const bedIdOf = (row: Row) => bedOfPlanting(plan, row.planting)?.id ?? null
  const bedGroups = seasons.map(({ bed, free }) => ({
    bed,
    name: bed?.name || t("inspector.bedName", { number: bed ? plan.beds.indexOf(bed) + 1 : 0 }),
    rows: rows.filter((row) => bedIdOf(row) === bed?.id),
    free: free
      .filter((window) => window.from <= yearEnd)
      .map((window) => {
        const shown = { from: window.from, to: window.to < yearEnd ? window.to : yearEnd }
        const words = t("calendar.free", { from: day(shown.from), to: day(shown.to) })
        // Nothing is planned into days gone by: the room is what is left from today.
        // biome-ignore lint/complexity/useMathMinMax: dates are strings, which Math.max does not compare
        const room = { from: window.from > today ? window.from : today, to: window.to }
        // Quickest first: the crops most likely to be what a gap is for.
        const fits = cropsThatFit(room, PLANTS)
          .toSorted((a, b) => a.daysToHarvest[1] - b.daysToHarvest[1])
          .map((plant) => plant.name[language])
        const named = fits.slice(0, FITS_SHOWN)
        const crops =
          fits.length > FITS_SHOWN
            ? t("calendar.andMore", { crops: named.join(", "), count: fits.length - FITS_SHOWN })
            : new Intl.ListFormat(language, { type: "conjunction" }).format(named)
        return {
          ...shown,
          label: fits.length > 0 ? t("calendar.freeFits", { free: words, crops }) : words,
        }
      }),
  }))
  const looseRows = rows.filter((row) => bedIdOf(row) === null)
  const groups = [
    ...bedGroups,
    ...(looseRows.length > 0
      ? [{ bed: null, name: t("calendar.noBed"), rows: looseRows, free: [] }]
      : []),
  ]

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
          <div className="ml-2 flex gap-1">
            {(["planting", "bed"] as const).map((by) => (
              <button
                key={by}
                type="button"
                className={viewLinkClass}
                aria-pressed={grouping === by}
                onClick={() => setGrouping(by)}
              >
                {t(`calendar.by.${by}`)}
              </button>
            ))}
          </div>
          <Legend withFree={grouping === "bed"} />
        </div>

        {grouping === "bed" && seasons.length === 0 && (
          <p className="text-sm text-stone-600">{t("calendar.noBeds")}</p>
        )}
        {grouping === "planting" && rows.length === 0 ? (
          <p className="text-sm text-stone-600">{t("calendar.empty", { year })}</p>
        ) : grouping === "bed" && groups.length === 0 ? null : (
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
              {grouping === "bed" ? (
                groups.map((group) => (
                  // biome-ignore lint/a11y/useSemanticElements: a fieldset is for form controls, and this groups lines of a timeline
                  <div
                    key={group.bed?.id ?? "none"}
                    role="group"
                    aria-label={group.name}
                    className="border-b border-stone-200 last:border-b-0"
                  >
                    <div className={`${rowClass} bg-stone-50`}>
                      <span className="truncate px-3 py-1.5 text-sm font-semibold text-stone-900">
                        {group.name}
                      </span>
                      <span aria-hidden="true" className="relative block h-8">
                        <MonthLines />
                        {group.free.map((window) => (
                          <FreeBar key={window.from} range={window} year={year} />
                        ))}
                      </span>
                    </div>
                    {group.free.map((window) => (
                      <p key={window.from} className="px-3 py-1 text-xs text-stone-600">
                        {window.label}
                      </p>
                    ))}
                    {group.rows.length === 0 ? (
                      <p className="px-3 py-2 text-sm text-stone-600">
                        {t("calendar.bedEmpty", { year })}
                      </p>
                    ) : (
                      <ul aria-label={group.name}>
                        {group.rows.map((row) => (
                          <PlantingLine
                            key={row.planting.id}
                            row={row}
                            year={year}
                            todayMark={todayMark}
                            onOpen={onOpenPlanting}
                          />
                        ))}
                      </ul>
                    )}
                  </div>
                ))
              ) : (
                <ul aria-label={t("calendar.rowsLabel", { year })}>
                  {rows.map((row) => (
                    <PlantingLine
                      key={row.planting.id}
                      row={row}
                      year={year}
                      todayMark={todayMark}
                      onOpen={onOpenPlanting}
                    />
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}
      </section>

      <section aria-labelledby="calendar-tasks" className="flex flex-col gap-2">
        <h2 id="calendar-tasks" className={headingClass}>
          {t("calendar.tasks")}
        </h2>
        {tasks.length === 0 ? (
          <p className="text-sm text-stone-600">
            {t("calendar.noTasks", { days: TASK_HORIZON_DAYS })}
          </p>
        ) : (
          <ul aria-labelledby="calendar-tasks" className="flex flex-col gap-1">
            {tasks.map(({ task, planting }) => (
              <TaskRow
                key={`${task.plantingId}:${task.kind}`}
                task={task}
                planting={planting}
                day={day(task.date)}
                text={t(`calendar.task.${task.kind}`, {
                  name: getPlant(task.plantId)?.name[language] ?? task.plantId,
                })}
                today={today}
                onRecord={onRecordTask && ((date) => onRecordTask(planting.id, task.kind, date))}
              />
            ))}
          </ul>
        )}
      </section>
    </main>
  )
}

interface TaskRowProps {
  task: GardenTask
  planting: Planting
  /** The job's day, as the list writes days. */
  day: string
  /** The job in words: "Sow Carrot". */
  text: string
  today: IsoDate
  onRecord?(date: IsoDate | null): boolean
}

/**
 * One job. Where the plan can change, a tick marks it done and a done job
 * shows the day it was done on, to correct: ticking only knows about today.
 */
function TaskRow({ task, planting, day, text, today, onRecord }: TaskRowProps) {
  const { t } = useTranslation()
  const overdue = !task.done && task.date < today
  // A harvest is one of several: the planting's own list is where each is changed or removed.
  const firstHarvest = task.done && task.kind === "harvest"
  const bounds = doneDateBounds(planting, task.kind)
  // The day a tick would record. None means the job cannot have been done yet.
  const tickDay = defaultDoneDate(planting, task, today)
  const tooSoon = !task.done && tickDay === null
  const words = (
    <>
      <span className="w-16 shrink-0 font-medium text-stone-500">{day}</span>
      <span className={task.done ? "text-stone-500 line-through" : "text-stone-900"}>{text}</span>
    </>
  )
  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md border border-stone-200 bg-white px-3 py-2 text-sm">
      {onRecord ? (
        <label className="flex items-center gap-3">
          <input
            type="checkbox"
            className="size-4 accent-emerald-700"
            aria-label={text}
            checked={task.done}
            disabled={firstHarvest || tooSoon}
            onChange={(event) => onRecord(event.target.checked ? tickDay : null)}
          />
          {words}
        </label>
      ) : (
        words
      )}
      {overdue && (
        <span className="rounded-sm bg-amber-100 px-1.5 text-xs font-medium text-amber-900">
          {t("calendar.overdue")}
        </span>
      )}
      {onRecord && tooSoon && (
        <span className="text-xs text-stone-500">{t("calendar.tooSoon")}</span>
      )}
      {task.done && !onRecord && (
        <span className="text-xs text-stone-500">{t("calendar.done")}</span>
      )}
      {task.done && onRecord && !firstHarvest && (
        <input
          type="date"
          className={`${inputClass} ml-auto`}
          aria-label={t("calendar.doneOn", { task: text })}
          value={task.date}
          min={bounds.min}
          // Nothing was done on a day still to come.
          max={bounds.max && bounds.max < today ? bounds.max : today}
          // An emptied field is someone typing, not a day to record.
          onChange={(event) => event.target.value && onRecord(event.target.value)}
        />
      )}
    </li>
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

interface PlantingLineProps {
  row: Row
  year: number
  todayMark: YearSpan | null
  onOpen?(plantingId: string): void
}

/** One planting's line on the year: its name, and a bar for each of its stages. */
function PlantingLine({ row, year, todayMark, onOpen }: PlantingLineProps) {
  return (
    <li className="border-b border-stone-100 last:border-b-0">
      <RowFrame label={row.label} onOpen={onOpen && (() => onOpen(row.planting.id))}>
        <span className="truncate px-3 py-2 text-sm text-stone-800">
          {row.label.slice(0, row.label.indexOf(":"))}
        </span>
        <span className="relative block h-9">
          <MonthLines />
          <Bar range={row.schedule.indoors} year={year} color={row.plant.color} stage="indoors" />
          <Bar range={row.schedule.inGround} year={year} color={row.plant.color} stage="inGround" />
          <Bar range={row.schedule.harvest} year={year} color={row.plant.color} stage="harvest" />
          {todayMark && (
            <span
              className="absolute inset-y-0 w-px bg-stone-900"
              style={{ left: `${todayMark.start * 100}%` }}
            />
          )}
        </span>
      </RowFrame>
    </li>
  )
}

/** A stretch when a bed stands empty, drawn as an outline: room, not a crop. */
function FreeBar({ range, year }: { range: DateRange; year: number }) {
  const span = yearSpan(range, year)
  if (!span) return null
  return (
    <span
      className="absolute inset-y-1.5 rounded-sm border border-dashed border-emerald-700 bg-emerald-50"
      style={{ left: `${span.start * 100}%`, width: `${span.width * 100}%` }}
    />
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

function Legend({ withFree }: { withFree: boolean }) {
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
      {withFree && (
        <li className="flex items-center gap-1.5">
          <span
            aria-hidden="true"
            className="h-3 w-5 rounded-sm border border-dashed border-emerald-700 bg-emerald-50"
          />
          {t("calendar.legend.free")}
        </li>
      )}
    </ul>
  )
}
