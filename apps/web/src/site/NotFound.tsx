import { useTranslation } from "react-i18next"
import { primaryButtonClass } from "../components/ui"
import { SiteFooter } from "./Landing"
import { HOME, type SiteLanguage } from "./site"

/** What an address with nothing behind it shows, with a 404. */
export function NotFound({ language }: { language: SiteLanguage }) {
  const { t } = useTranslation()
  return (
    <div className="flex min-h-full flex-col">
      <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col items-start gap-4 px-4 py-16">
        <a
          href={HOME[language]}
          className="flex items-center gap-2 text-lg font-semibold text-emerald-900"
        >
          <img src="/favicon.svg" alt="" className="size-6" />
          Leira
        </a>
        <h1 className="text-3xl font-semibold text-stone-900">{t("landing.notFound.title")}</h1>
        <p className="text-stone-600">{t("landing.notFound.body")}</p>
        <a href={HOME[language]} className={primaryButtonClass}>
          {t("landing.notFound.home")}
        </a>
      </main>
      <SiteFooter language={language} />
    </div>
  )
}
