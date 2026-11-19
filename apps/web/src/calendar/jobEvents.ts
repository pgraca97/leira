import {
  type CalendarEvent,
  type DateRange,
  type GardenPlan,
  gardenTasks,
  type Plant,
} from "@leira/core"
import { cropName } from "../editor/cropName"
import { taskWord } from "./taskWord"

/** A job's words under `calendar.task`. */
export type TaskWord = ReturnType<typeof taskWord>

/**
 * The jobs still to do in a range, as calendar events. A late job stays on its
 * day and a job done is left out. Plain code with no i18next, so the Worker
 * builds the calendar feed with it too: `words` turns a job's word and the
 * crop's name into its text.
 */
export function jobEvents(
  plan: GardenPlan,
  getPlant: (id: string) => Plant | undefined,
  range: DateRange,
  options: {
    language: "pt" | "en"
    words(word: TaskWord, name: string): string
    /** What each event says under its title. */
    description?: string
  }
): CalendarEvent[] {
  return gardenTasks(plan, getPlant, range)
    .filter((task) => !task.done)
    .map((task) => {
      const plant = getPlant(task.plantId)
      const planting = plan.plantings.find((each) => each.id === task.plantingId) ?? task
      return {
        // The same id every time, so a calendar that reads the jobs again moves
        // one instead of doubling it. A perennial's picking comes back each
        // year: the year keeps those apart.
        uid:
          task.kind === "harvest" && plant?.perennial
            ? `${task.plantingId}-${task.kind}-${task.date.slice(0, 4)}`
            : `${task.plantingId}-${task.kind}`,
        date: task.date,
        summary: options.words(
          taskWord(task.kind, plant),
          cropName(planting, plant, options.language)
        ),
        ...(options.description ? { description: options.description } : {}),
      }
    })
}
