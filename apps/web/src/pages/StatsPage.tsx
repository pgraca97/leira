import { useQuery } from "@tanstack/react-query"
import { Link } from "@tanstack/react-router"
import { type ReactNode, useEffect, useId } from "react"
import { useTranslation } from "react-i18next"
import { AppHeader } from "../components/AppHeader"
import { Notice } from "../components/Notice"
import { currentLanguage } from "../i18n"
import { useBackend } from "../lib/backend"
import { StatsForbiddenError } from "../lib/stats"
import { WeeksChart } from "../stats/WeeksChart"

/**
 * The Supabase free plan's limits that would be reached first. Megabytes are
 * read as a million bytes, the smaller reading, so the bar errs towards full.
 * https://supabase.com/pricing
 */
const FREE_DATABASE_BYTES = 500_000_000
const FREE_MONTHLY_USERS = 50_000

/** Where the numbers this page does not have are kept. */
const ELSEWHERE = [
  { key: "webAnalytics", href: "https://dash.cloudflare.com/?to=/:account/web-analytics" },
  { key: "workers", href: "https://dash.cloudflare.com/?to=/:account/workers-and-pages" },
  { key: "supabase", href: "https://supabase.com/dashboard/org/_/usage" },
] as const

/**
 * How the app is used, for its admins only: who comes back, how many gardens
 * there are, and how close the free tiers are. Nothing links here; the owner
 * keeps the address.
 */
export function StatsPage() {
  const { t } = useTranslation()
  const backend = useBackend()
  const stats = useQuery({ queryKey: ["stats"], queryFn: () => backend.stats.usage() })

  useEffect(() => {
    document.title = t("stats.title")
  }, [t])

  if (stats.error instanceof StatsForbiddenError) {
    return (
      <div className="flex h-full flex-col">
        <AppHeader />
        <Notice kind="info" message={t("stats.forbidden")}>
          <Link to="/" className="text-emerald-800 underline">
            {t("garden.back")}
          </Link>
        </Notice>
      </div>
    )
  }

  const locale = currentLanguage()
  const numbers = new Intl.NumberFormat(locale)
  const megabytes = new Intl.NumberFormat(locale, {
    style: "unit",
    unit: "megabyte",
    maximumFractionDigits: 1,
  })

  return (
    <div className="flex h-full flex-col">
      <AppHeader />
      <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 overflow-y-auto p-4">
        <h1 className="text-xl font-semibold text-stone-900">{t("stats.title")}</h1>

        {stats.isPending && <Notice kind="status" message={t("stats.loading")} />}
        {stats.isError && (
          <Notice
            kind="error"
            message={t("stats.loadFailed")}
            action={{ label: t("common.retry"), onClick: () => void stats.refetch() }}
          />
        )}

        {stats.data && (
          <>
            <p className="-mt-4 text-sm text-stone-600">
              {t("stats.note")}{" "}
              {t("stats.counted", {
                date: new Intl.DateTimeFormat(locale, {
                  dateStyle: "medium",
                  timeStyle: "short",
                }).format(new Date(stats.data.generatedAt)),
              })}
            </p>

            <Section title={t("stats.people")} hint={t("stats.guestsHint")}>
              <Figures
                items={[
                  [t("stats.withGarden"), stats.data.people.withGarden],
                  [t("stats.accounts"), stats.data.people.accounts],
                  [t("stats.guests"), stats.data.people.guests],
                ]}
                format={numbers.format}
              />
            </Section>

            <Section title={t("stats.gardens")}>
              <Figures
                items={[
                  [t("stats.gardensTotal"), stats.data.gardens.total],
                  [t("stats.editedLast7Days"), stats.data.gardens.editedLast7Days],
                  [t("stats.editedLast30Days"), stats.data.gardens.editedLast30Days],
                  [t("stats.shared"), stats.data.gardens.shared],
                  [t("stats.withLocation"), stats.data.gardens.withLocation],
                ]}
                format={numbers.format}
              />
            </Section>

            <Section title={t("stats.weeks")} hint={t("stats.weeksHint")}>
              <WeeksChart weeks={stats.data.weeks} locale={locale} />
            </Section>

            <Section title={t("stats.limits")} hint={t("stats.limitsHint")}>
              <Meter
                label={t("stats.database")}
                share={stats.data.limits.databaseBytes / FREE_DATABASE_BYTES}
                text={t("stats.used", {
                  used: megabytes.format(stats.data.limits.databaseBytes / 1_000_000),
                  limit: megabytes.format(FREE_DATABASE_BYTES / 1_000_000),
                })}
              />
              <Meter
                label={t("stats.monthlyUsers")}
                share={stats.data.limits.monthlyUsers / FREE_MONTHLY_USERS}
                text={t("stats.used", {
                  used: numbers.format(stats.data.limits.monthlyUsers),
                  limit: numbers.format(FREE_MONTHLY_USERS),
                })}
              />
            </Section>

            <Section title={t("stats.elsewhere")}>
              <ul className="flex list-disc flex-col gap-1 pl-5 text-sm">
                {ELSEWHERE.map(({ key, href }) => (
                  <li key={key}>
                    <a
                      href={href}
                      target="_blank"
                      rel="noreferrer"
                      className="text-emerald-800 underline-offset-2 hover:underline"
                    >
                      {t(`stats.${key}`)}
                    </a>
                  </li>
                ))}
              </ul>
            </Section>
          </>
        )}
      </main>
    </div>
  )
}

function Section({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  const id = useId()
  return (
    <section aria-labelledby={id} className="flex flex-col gap-2">
      <h2 id={id} className="font-semibold text-stone-900">
        {title}
      </h2>
      {hint && <p className="text-xs text-stone-600">{hint}</p>}
      {children}
    </section>
  )
}

/** A row of headline numbers, each under its label. */
function Figures({
  items,
  format,
}: {
  items: [label: string, value: number][]
  format(value: number): string
}) {
  return (
    <dl className="grid grid-cols-2 gap-2 sm:grid-cols-3">
      {items.map(([label, value]) => (
        <div key={label} className="rounded-md border border-stone-200 bg-white p-3">
          <dt className="text-xs text-stone-600">{label}</dt>
          <dd className="text-2xl font-semibold text-stone-900 tabular-nums">{format(value)}</dd>
        </div>
      ))}
    </dl>
  )
}

/** How much of a limit is used, as a bar. The text beside it says the same in numbers. */
function Meter({ label, share, text }: { label: string; share: number; text: string }) {
  // A sliver stays visible even when the use is a rounding error.
  const width = `${Math.max(1, Math.min(100, share * 100))}%`
  return (
    <div className="flex flex-col gap-1">
      <div className="flex flex-wrap justify-between gap-x-4 text-sm">
        <span className="text-stone-700">{label}</span>
        <span className="text-stone-900 tabular-nums">{text}</span>
      </div>
      <div aria-hidden="true" className="h-2 overflow-hidden rounded-full bg-stone-200">
        <div className="h-full rounded-full bg-emerald-700" style={{ width }} />
      </div>
    </div>
  )
}
