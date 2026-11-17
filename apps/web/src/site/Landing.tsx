import { type GardenPlan, PLANTS, samplePlan, toIsoDate } from "@leira/core"
import { useTranslation } from "react-i18next"
import { primaryButtonClass } from "../components/ui"
import { PlanSvg } from "../export/PlanSvg"
import { HOME, type SiteLanguage } from "./site"

/** Where the app starts. Not a router link: these pages are not part of the app. */
export const APP_PATH = "/gardens"

const FEATURES = ["grid", "crops", "advice", "weather", "calendar", "share"] as const

const linkClass =
  "underline decoration-stone-300 underline-offset-2 hover:text-stone-900 hover:decoration-stone-500"

/** The page a newcomer, or a search engine, sees first. */
export function Landing({ language }: { language: SiteLanguage }) {
  const { t } = useTranslation()
  const other: SiteLanguage = language === "pt" ? "en" : "pt"

  return (
    <div className="flex min-h-full flex-col">
      <header className="mx-auto flex w-full max-w-5xl flex-wrap items-center justify-between gap-4 px-4 py-4">
        <a
          href={HOME[language]}
          className="flex items-center gap-2 text-lg font-semibold text-emerald-900"
        >
          <img src="/favicon.svg" alt="" className="size-6" />
          Leira
        </a>
        <nav className="flex items-center gap-4 text-sm text-stone-600">
          <OtherLanguage language={other} />
          <a href={APP_PATH} className={primaryButtonClass} data-start>
            {t("landing.start")}
          </a>
        </nav>
      </header>

      <main className="flex-1">
        <section className="mx-auto grid w-full max-w-5xl items-center gap-10 px-4 pt-8 pb-16 md:grid-cols-2">
          <div className="flex flex-col gap-5">
            <h1 className="text-4xl font-semibold tracking-tight text-balance text-stone-900 sm:text-5xl">
              {t("landing.hero.title")}
            </h1>
            <p className="text-lg text-pretty text-stone-600">{t("landing.hero.body")}</p>
            <div className="flex flex-col items-start gap-2">
              <a
                href={APP_PATH}
                className="inline-flex items-center rounded-md bg-emerald-700 px-6 py-3 text-base font-semibold text-white hover:bg-emerald-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700"
                data-start
              >
                {t("landing.start")}
              </a>
              <p className="text-sm text-stone-500">{t("landing.noSignUp")}</p>
            </div>
          </div>
          <figure className="flex flex-col gap-2">
            <div className="overflow-hidden rounded-xl border border-stone-200 bg-white p-3 shadow-sm">
              <PlanSvg
                plan={exampleInMay()}
                locale={language}
                title={t("landing.hero.drawing")}
                // At this size the names of side-by-side crops run into each other.
                labels={false}
                className="h-auto w-full"
              />
            </div>
            <figcaption className="text-center text-sm text-stone-500">
              {t("landing.hero.caption")}
            </figcaption>
          </figure>
        </section>

        <section className="border-y border-stone-200 bg-white">
          <div className="mx-auto w-full max-w-5xl px-4 py-14">
            <h2 className="text-2xl font-semibold text-stone-900">{t("landing.features.title")}</h2>
            <ul className="mt-8 grid gap-x-8 gap-y-8 sm:grid-cols-2 lg:grid-cols-3">
              {FEATURES.map((feature) => (
                <li key={feature} className="flex flex-col gap-2">
                  <h3 className="font-semibold text-emerald-900">
                    {t(`landing.features.${feature}.title`, { number: PLANTS.length })}
                  </h3>
                  <p className="text-sm leading-relaxed text-stone-600">
                    {t(`landing.features.${feature}.body`)}
                  </p>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section className="mx-auto w-full max-w-5xl px-4 py-14">
          <div className="flex max-w-prose flex-col gap-3">
            <h2 className="text-2xl font-semibold text-stone-900">{t("landing.name.title")}</h2>
            <p className="text-stone-600">{t("landing.name.body")}</p>
            <a href={APP_PATH} className={`${primaryButtonClass} self-start`} data-start>
              {t("landing.start")}
            </a>
          </div>
        </section>
      </main>

      <SiteFooter language={language} />
    </div>
  )
}

/** The foot of every static page. */
export function SiteFooter({ language }: { language: SiteLanguage }) {
  const { t } = useTranslation()
  return (
    <footer className="border-t border-stone-200">
      <div className="mx-auto flex w-full max-w-5xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-6 text-sm text-stone-500">
        <span>Leira</span>
        <a href="/privacy" className={linkClass}>
          {t("landing.privacy")}
        </a>
        <OtherLanguage language={language === "pt" ? "en" : "pt"} />
      </div>
    </footer>
  )
}

/** A link to the same page in the other language, named in that language. */
function OtherLanguage({ language }: { language: SiteLanguage }) {
  const { t } = useTranslation()
  return (
    <a href={HOME[language]} hrefLang={language} lang={language} className={linkClass}>
      {t(`language.${language}`)}
    </a>
  )
}

/**
 * The example garden a first visit can start from, on the day its last crop
 * goes in: the fullest it gets, and without last year's crops on top of this
 * year's. It is built from the same code as the app's example, so the picture
 * never falls behind it.
 */
function exampleInMay(): GardenPlan {
  let count = 0
  const plan = samplePlan(toIsoDate(new Date()), () => `example-${++count}`)
  const day = plan.plantings
    .map((planting) => planting.inGround.from)
    .sort()
    .at(-1)
  if (!day) return plan
  return {
    ...plan,
    plantings: plan.plantings.filter(({ inGround }) => inGround.from <= day && day <= inGround.to),
  }
}
