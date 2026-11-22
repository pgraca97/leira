import type { ReactNode } from "react"
import { OG_LOCALE, PREVIEW_IMAGE } from "./preview"
import { HOME, LANGUAGE_TAG, SITE_LANGUAGES, type SiteLanguage, siteUrl } from "./site"

/** The built files a page loads, by their hashed names. */
export interface SiteAssets {
  /** The app's styles: the pages share them, so they are cached across both. */
  css: string[]
  /** The pages' own small script. */
  script: string
}

interface DocumentProps {
  language: SiteLanguage
  title: string
  description: string
  assets: SiteAssets
  /**
   * The page's own path when it should be found in search, as the same page
   * in every language. Without it the page asks to be left out.
   */
  indexAs?: "home"
  /** What the page is, for search engines, as schema.org data. */
  structuredData?: object
  /** Runs before anything on the page is drawn or loaded. */
  inlineScript?: string
  children: ReactNode
}

/** A whole HTML page, head and body, for the static pages. */
export function Document({
  language,
  title,
  description,
  assets,
  indexAs,
  structuredData,
  inlineScript,
  children,
}: DocumentProps) {
  const url = indexAs ? siteUrl(HOME[language]) : null
  return (
    <html lang={LANGUAGE_TAG[language]}>
      <head>
        <meta charSet="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        {inlineScript && (
          // biome-ignore lint/security/noDangerouslySetInnerHtml: written here at build time, never from input
          <script dangerouslySetInnerHTML={{ __html: inlineScript }} />
        )}
        <title>{title}</title>
        <meta name="description" content={description} />
        <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
        {/* Added to a phone's home screen, it opens the app on the gardens. */}
        <link rel="manifest" href="/manifest.webmanifest" />
        <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
        <meta name="theme-color" content="#3f6212" />
        {url ? (
          <>
            <link rel="canonical" href={url} />
            {SITE_LANGUAGES.map((other) => (
              <link
                key={other}
                rel="alternate"
                hrefLang={LANGUAGE_TAG[other]}
                href={siteUrl(HOME[other])}
              />
            ))}
            {/* For a searcher in neither language: the Portuguese, since the crops are Portugal's. */}
            <link rel="alternate" hrefLang="x-default" href={siteUrl(HOME.pt)} />
            <meta property="og:type" content="website" />
            <meta property="og:site_name" content="Leira" />
            <meta property="og:title" content={title} />
            <meta property="og:description" content={description} />
            <meta property="og:url" content={url} />
            <meta property="og:image" content={siteUrl(PREVIEW_IMAGE.path)} />
            <meta property="og:image:width" content={String(PREVIEW_IMAGE.width)} />
            <meta property="og:image:height" content={String(PREVIEW_IMAGE.height)} />
            <meta property="og:locale" content={OG_LOCALE[language]} />
            {SITE_LANGUAGES.filter((other) => other !== language).map((other) => (
              <meta key={other} property="og:locale:alternate" content={OG_LOCALE[other]} />
            ))}
            <meta name="twitter:card" content="summary_large_image" />
          </>
        ) : (
          <meta name="robots" content="noindex" />
        )}
        {assets.css.map((href) => (
          <link key={href} rel="stylesheet" href={href} />
        ))}
        {structuredData && (
          <script
            type="application/ld+json"
            // biome-ignore lint/security/noDangerouslySetInnerHtml: written here at build time, never from input
            dangerouslySetInnerHTML={{ __html: jsonInScript(structuredData) }}
          />
        )}
        <script type="module" src={assets.script} />
      </head>
      <body>{children}</body>
    </html>
  )
}

/** JSON that cannot close the script element it sits in. */
function jsonInScript(data: object): string {
  return JSON.stringify(data).replace(/</g, "\\u003c")
}
