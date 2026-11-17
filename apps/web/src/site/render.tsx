import type { ReactElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { I18nextProvider } from "react-i18next"
import { Document, type SiteAssets } from "./Document"
import { Landing } from "./Landing"
import { NotFound } from "./NotFound"
import { OPEN_APP_SCRIPT } from "./openApp"
import { HOME, LANGUAGE_TAG, SITE_LANGUAGES, type SiteLanguage, siteStrings, siteUrl } from "./site"

export type { SiteAssets } from "./Document"

/** A file of the static site, by its path in the built files. */
export interface SiteFile {
  path: string
  content: string
}

/**
 * Every static page, in every language. They are written once, when the app
 * is built, so a search engine or a link preview reads them whole, with no
 * script to run, and serving them costs the Worker nothing.
 */
export function renderSite(assets: SiteAssets): SiteFile[] {
  return [
    ...pages(assets),
    { path: "robots.txt", content: robots() },
    { path: "sitemap.xml", content: sitemap() },
  ]
}

/**
 * The app's pages search engines may list: they work with no session. The
 * Worker leaves these out of its `noindex` too.
 */
const PUBLIC_APP_PAGES = ["/privacy"]

/**
 * What crawlers may read. The app's pages would sign a guest in for every
 * crawler that runs them. Shared gardens stay readable: their pages say
 * `noindex` themselves, and a crawler kept out would never see that.
 */
function robots(): string {
  return [
    "User-agent: *",
    "Allow: /",
    "Disallow: /gardens",
    "Disallow: /stats",
    "Disallow: /app",
    "Disallow: /api/",
    "",
    `Sitemap: ${siteUrl("/sitemap.xml")}`,
    "",
  ].join("\n")
}

/** The pages meant to be found, each landing page tied to its other language. */
function sitemap(): string {
  const alternates = [
    ...SITE_LANGUAGES.map((language) => [LANGUAGE_TAG[language], siteUrl(HOME[language])]),
    ["x-default", siteUrl(HOME.pt)],
  ]
    .map(([tag, href]) => `<xhtml:link rel="alternate" hreflang="${tag}" href="${href}"/>`)
    .join("")
  const urls = [
    ...SITE_LANGUAGES.map(
      (language) => `<url><loc>${siteUrl(HOME[language])}</loc>${alternates}</url>`
    ),
    ...PUBLIC_APP_PAGES.map((path) => `<url><loc>${siteUrl(path)}</loc></url>`),
  ]
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">
${urls.join("\n")}
</urlset>
`
}

function pages(assets: SiteAssets): SiteFile[] {
  return SITE_LANGUAGES.flatMap((language) => {
    const strings = siteStrings(language)
    const t = strings.t
    const folder = HOME[language].slice(1)
    const page = (node: ReactElement) =>
      `<!doctype html>${renderToStaticMarkup(<I18nextProvider i18n={strings}>{node}</I18nextProvider>)}`

    return [
      {
        path: `${folder}index.html`,
        content: page(
          <Document
            language={language}
            title={t("landing.meta.title")}
            description={t("landing.meta.description")}
            assets={assets}
            indexAs="home"
            structuredData={webApplication(language, t("landing.meta.description"))}
            inlineScript={OPEN_APP_SCRIPT}
          >
            <Landing language={language} />
          </Document>
        ),
      },
      {
        path: `${folder}404.html`,
        content: page(
          <Document
            language={language}
            title={`${t("landing.notFound.title")} | Leira`}
            description={t("landing.notFound.body")}
            assets={assets}
          >
            <NotFound language={language} />
          </Document>
        ),
      },
    ]
  })
}

/** What Leira is, as schema.org describes an app that runs in the browser. */
function webApplication(language: SiteLanguage, description: string) {
  return {
    "@context": "https://schema.org",
    "@type": "WebApplication",
    name: "Leira",
    url: siteUrl(HOME[language]),
    description,
    inLanguage: LANGUAGE_TAG[language],
    applicationCategory: "LifestyleApplication",
    operatingSystem: "Any",
    browserRequirements: "Requires JavaScript",
    offers: { "@type": "Offer", price: "0", priceCurrency: "EUR" },
  }
}
