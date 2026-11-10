import type { ReactNode } from "react"
import { useTranslation } from "react-i18next"
import { LanguageSwitcher } from "./LanguageSwitcher"

/** The bar across the top of every page. Pages put their own controls in `children`. */
export function AppHeader({ children }: { children?: ReactNode }) {
  const { t } = useTranslation()
  return (
    <header className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-stone-200 bg-white px-4 py-2">
      <p className="flex items-center gap-2 font-semibold text-emerald-900">
        <img src="/favicon.svg" alt="" className="size-5" />
        {t("app.name")}
      </p>
      <div className="flex flex-1 flex-wrap items-center justify-end gap-x-4 gap-y-2">
        {children}
        <LanguageSwitcher />
      </div>
    </header>
  )
}
