import type { SiteLanguage } from "./site"

/**
 * What a link preview needs about the site, kept apart from `site.ts` so the
 * Worker can read it without pulling i18next in.
 */

/** The picture a link preview shows, 1200 by 630 as the previews expect. */
export const PREVIEW_IMAGE = { path: "/og.png", width: 1200, height: 630 }

/** The language as Open Graph names it. */
export const OG_LOCALE: Record<SiteLanguage, string> = { pt: "pt_PT", en: "en_GB" }
