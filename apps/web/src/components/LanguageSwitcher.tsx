import { useTranslation } from "react-i18next"
import { currentLanguage, isLanguage, LANGUAGES } from "../i18n"

export function LanguageSwitcher() {
  const { t, i18n } = useTranslation()
  return (
    <select
      aria-label={t("language.label")}
      value={currentLanguage()}
      onChange={(event) => {
        if (isLanguage(event.target.value)) void i18n.changeLanguage(event.target.value)
      }}
      className="rounded-md border border-stone-300 bg-white px-2 py-1 text-sm text-stone-800"
    >
      {LANGUAGES.map((language) => (
        <option key={language} value={language}>
          {t(`language.${language}`)}
        </option>
      ))}
    </select>
  )
}
