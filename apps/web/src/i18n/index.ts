import i18n from "i18next"
import { initReactI18next } from "react-i18next"
import { en } from "./en"
import { isLanguage, type Language, LANGUAGE_STORAGE_KEY as STORAGE_KEY } from "./languages"
import { pt } from "./pt"

export { isLanguage, LANGUAGES, type Language } from "./languages"

/** The saved choice, else the browser's language, else English. */
function initialLanguage(): Language {
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (isLanguage(saved)) return saved
  } catch {
    // Storage can be blocked (private mode, strict settings): fall through.
  }
  return navigator.language.toLowerCase().startsWith("pt") ? "pt" : "en"
}

declare module "i18next" {
  interface CustomTypeOptions {
    defaultNS: "translation"
    resources: { translation: typeof en }
  }
}

void i18n.use(initReactI18next).init({
  resources: { en: { translation: en }, pt: { translation: pt } },
  lng: initialLanguage(),
  fallbackLng: "en",
  // React already escapes what it renders.
  interpolation: { escapeValue: false },
})

function applyLanguage(language: string): void {
  document.documentElement.lang = language
}

applyLanguage(i18n.language)
i18n.on("languageChanged", (language) => {
  applyLanguage(language)
  try {
    localStorage.setItem(STORAGE_KEY, language)
  } catch {
    // Not saved: the choice still holds until the page is closed.
  }
})

/** The active language, narrowed to the ones the app ships. */
export function currentLanguage(): Language {
  return isLanguage(i18n.language) ? i18n.language : "en"
}

export { i18n }
