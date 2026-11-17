import type { ReactElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { I18nextProvider } from "react-i18next"
import { Document, type SiteAssets } from "./Document"
import { Landing } from "./Landing"
import { NotFound } from "./NotFound"
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
