import {
  addDays,
  type GardenPlan,
  getPlant,
  type IsoDate,
  icsCalendar,
  TASK_LOOKBACK_DAYS,
} from "@leira/core"
import { jobEvents } from "../src/calendar/jobEvents"
import type { Language } from "../src/i18n/languages"
import { fill, STRINGS, TIME_ZONE } from "./strings"
import { supabaseClient } from "./supabase"

/** How far ahead the feed reaches: a year covers every season once. */
const AHEAD_DAYS = 365
/** When on its day each job reminds, for the calendar apps that follow the hint. */
const ALARM = "PT9H"
/** How often a calendar that subscribes is asked to read the feed again. */
const REFRESH = "PT6H"

/**
 * The garden behind a calendar link, as the database hands it over, or null
 * when no link has that token. The database function is the only way in for
 * a caller with no session, and it leaves out what the plan keeps private.
 */
export async function fetchGardenCalendar(env: Env, token: string): Promise<unknown> {
  const client = supabaseClient(env)
  if (!client) throw new Error("Supabase is not configured")
  const { data, error } = await client.rpc("garden_calendar", { feed_token: token })
  if (error) throw new Error(error.message)
  return Array.isArray(data) ? (data[0] ?? null) : null
}

/** The day it is in Portugal at `now`, where the gardens are. */
function todayIn(now: Date): IsoDate {
  // The Canadian English format is the ISO one: 2026-04-20.
  return new Intl.DateTimeFormat("en-CA", { timeZone: TIME_ZONE }).format(now)
}

/**
 * A garden's jobs as a calendar file to subscribe to: the ones still to do,
 * from a month back (a late job stays on its day, as in the app's calendar)
 * to a year ahead, each with a reminder on its morning.
 */
export function calendarFeed(
  garden: { name: string; plan: GardenPlan },
  options: { language: Language; now: Date }
): string {
  const today = todayIn(options.now)
  const words = STRINGS[options.language].calendar.task
  const events = jobEvents(
    garden.plan,
    getPlant,
    { from: addDays(today, -TASK_LOOKBACK_DAYS), to: addDays(today, AHEAD_DAYS) },
    {
      language: options.language,
      words: (word, name) => fill(words[word], { name }),
      description: garden.name,
    }
  )
  return icsCalendar(events, {
    name: `Leira · ${garden.name}`,
    stamp: options.now.toISOString(),
    alarm: ALARM,
    refresh: REFRESH,
  })
}
