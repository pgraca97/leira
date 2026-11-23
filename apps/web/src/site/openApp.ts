/** What the landing page knows about its visitor before anything is drawn. */
export interface Arrival {
  /** The keys in this browser's storage for the site. */
  storageKeys: string[]
  /** The page the visitor came from, or "" when the browser does not say. */
  referrer: string
  origin: string
  search: string
  hash: string
}

/**
 * Whether this browser holds a session, by the name supabase-js stores it
 * under, `sb-<project>-auth-token`. `openAppTarget` keeps its own copy of the
 * test: it runs as its own source text and cannot call this.
 */
export function hasStoredSession(storageKeys: string[]): boolean {
  return storageKeys.some((key) => /^sb-.+-auth-token$/.test(key))
}

/**
 * Where to send a visitor who has used the app in this browser, or null to
 * show them the page. Someone with a session came for their gardens, not for
 * the pitch. Every visitor of the app has one, guests too, so it tells them
 * apart with no call to the server. Someone who followed a link from this
 * site meant to come here, so they stay.
 *
 * It runs inlined in the page, as its own source text: everything it needs
 * is inside it.
 */
export function openAppTarget(arrival: Arrival): string | null {
  // The name supabase-js stores a session under, `sb-<project>-auth-token`.
  const hasSession = arrival.storageKeys.some((key) => /^sb-.+-auth-token$/.test(key))
  if (!hasSession) return null
  let fromThisSite = false
  try {
    fromThisSite = new URL(arrival.referrer).origin === arrival.origin
  } catch {
    // No referrer, or one that is not an address: not from here.
  }
  if (fromThisSite) return null
  // Whatever the address carries goes along: a sign-in that falls back to `/`
  // still finishes in the app.
  return `/gardens${arrival.search}${arrival.hash}`
}

/**
 * The landing page's first script: it reads the browser and leaves for the
 * app when `openAppTarget` says so. Someone with a session who stays gets
 * the page marked `data-session`, so its header offers the way back to the
 * gardens rather than a start. It runs before anything is drawn, so the
 * wrong one never shows. Storage can be blocked, and then the page simply
 * shows.
 */
export const OPEN_APP_SCRIPT = `(function (target, hasSession) {
  try {
    var keys = Object.keys(localStorage);
    var to = target({
      storageKeys: keys,
      referrer: document.referrer,
      origin: location.origin,
      search: location.search,
      hash: location.hash
    });
    if (to) location.replace(to);
    else if (hasSession(keys)) document.documentElement.setAttribute("data-session", "");
  } catch (error) {}
})(${openAppTarget.toString()}, ${hasStoredSession.toString()})`
