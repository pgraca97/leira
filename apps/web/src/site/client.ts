import { startAnalytics } from "../analytics"
import { loadAnalyticsToken } from "./analyticsToken"
import { rememberPageLanguage } from "./language"

/**
 * The only script the static pages load, after they are drawn. The pages
 * are counted like the app, which matters most here: this is where visitors
 * arrive from a search or a link.
 */
void startAnalytics(loadAnalyticsToken)

// The way into the app carries the page's language along.
for (const start of document.querySelectorAll("[data-start]")) {
  start.addEventListener("click", () => {
    try {
      rememberPageLanguage(localStorage, document.documentElement.lang)
    } catch {
      // Storage can be blocked: the app then follows the browser's language.
    }
  })
}
