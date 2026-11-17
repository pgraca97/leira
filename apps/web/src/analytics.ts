import { type Config, loadConfig } from "./lib/config"

/**
 * Cloudflare Web Analytics: counts visits, pages and where people come from,
 * with no cookies and nothing kept in the browser. It follows the router's
 * page changes by itself.
 * https://developers.cloudflare.com/web-analytics/
 */
const BEACON_SRC = "https://static.cloudflareinsights.com/beacon.min.js"

/** Set in the owner's browser, so the owner's own visits do not count. */
const STOP_KEY = "leira.analytics"
const STOPPED = "off"

/**
 * Loads the visit counter on every page, the shared garden included. It stays
 * off where the Worker has no token (development, tests), and a failure only
 * costs the count, never the page.
 */
export async function startAnalytics(
  load: () => Promise<Pick<Config, "webAnalyticsToken">> = loadConfig
): Promise<void> {
  if (countingStopped()) return
  let token: string | undefined
  try {
    token = (await load()).webAnalyticsToken
  } catch {
    return
  }
  if (!token || document.querySelector("script[data-cf-beacon]")) return

  const script = document.createElement("script")
  script.type = "module"
  script.src = BEACON_SRC
  script.dataset.cfBeacon = JSON.stringify({ token })
  document.head.append(script)
}

/** Keeps this browser's visits out of the count from the next page load on. */
export function stopCountingThisBrowser(): void {
  try {
    localStorage.setItem(STOP_KEY, STOPPED)
  } catch {
    // Storage can be blocked (private mode, strict settings): the visits still count.
  }
}

function countingStopped(): boolean {
  try {
    return localStorage.getItem(STOP_KEY) === STOPPED
  } catch {
    return false
  }
}
