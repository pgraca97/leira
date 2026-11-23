import { startAnalytics } from "../analytics"
import { loadAnalyticsToken } from "./analyticsToken"
import { chooseLanguage } from "./language"

/**
 * The only script the static pages load, after they are drawn. The pages
 * are counted like the app, which matters most here: this is where visitors
 * arrive from a search or a link.
 */
void startAnalytics(loadAnalyticsToken)

// Every way into the app carries the page's language along.
for (const link of document.querySelectorAll("[data-app-link]")) {
  link.addEventListener("click", () => {
    try {
      chooseLanguage(localStorage, document.documentElement.lang)
    } catch {
      // Storage can be blocked: the app then follows the browser's language.
    }
  })
}

// A language picked here is the visitor's choice, as it is in the app's menu.
for (const link of document.querySelectorAll<HTMLElement>("[data-language]")) {
  link.addEventListener("click", () => {
    try {
      chooseLanguage(localStorage, link.dataset.language ?? "")
    } catch {
      // Storage can be blocked: the page's language still reaches the app.
    }
  })
}
