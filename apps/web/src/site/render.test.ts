// @vitest-environment jsdom
import { describe, expect, it } from "vitest"
import { en } from "../i18n/en"
import { pt } from "../i18n/pt"
import { renderSite } from "./render"
import { SITE_URL } from "./site"

const ASSETS = { css: ["/assets/app-abc.css"], script: "/assets/site-def.js" }
const files = renderSite(ASSETS)

function page(path: string): Document {
  const file = files.find((candidate) => candidate.path === path)
  if (!file) throw new Error(`No page at ${path}`)
  return new DOMParser().parseFromString(file.content, "text/html")
}

const meta = (doc: Document, selector: string) =>
  doc.querySelector(`meta[${selector}]`)?.getAttribute("content")

describe("the site", () => {
  it("writes the landing page and the 404 page in both languages", () => {
    expect(files.map((file) => file.path)).toEqual(
      expect.arrayContaining(["index.html", "en/index.html", "404.html", "en/404.html"])
    )
  })

  it("never uses an em dash", () => {
    for (const file of files) expect(file.content).not.toContain("—")
  })

  it("starts every page as an HTML5 document", () => {
    for (const file of files.filter((candidate) => candidate.path.endsWith(".html"))) {
      expect(file.content.startsWith("<!doctype html>")).toBe(true)
    }
  })
})

describe.each([
  { path: "index.html", url: `${SITE_URL}/`, lang: "pt-PT", locale: "pt_PT", strings: pt },
  { path: "en/index.html", url: `${SITE_URL}/en/`, lang: "en", locale: "en_GB", strings: en },
])("the landing page at $path", ({ path, url, lang, locale, strings }) => {
  const doc = page(path)

  it("says which language it is in", () => {
    expect(doc.documentElement.lang).toBe(lang)
  })

  it("has a title and a description for search results", () => {
    expect(doc.title).toBe(strings.landing.meta.title)
    expect(meta(doc, 'name="description"')).toBe(strings.landing.meta.description)
  })

  it("names its own address and the one in the other language", () => {
    expect(doc.querySelector('link[rel="canonical"]')?.getAttribute("href")).toBe(url)
    const alternates = Object.fromEntries(
      [...doc.querySelectorAll('link[rel="alternate"][hreflang]')].map((link) => [
        link.getAttribute("hreflang"),
        link.getAttribute("href"),
      ])
    )
    expect(alternates).toEqual({
      "pt-PT": `${SITE_URL}/`,
      en: `${SITE_URL}/en/`,
      "x-default": `${SITE_URL}/`,
    })
  })

  it("gives a link preview its title, text and picture", () => {
    expect(meta(doc, 'property="og:title"')).toBe(strings.landing.meta.title)
    expect(meta(doc, 'property="og:description"')).toBe(strings.landing.meta.description)
    expect(meta(doc, 'property="og:url"')).toBe(url)
    expect(meta(doc, 'property="og:image"')).toBe(`${SITE_URL}/og.png`)
    expect(meta(doc, 'property="og:locale"')).toBe(locale)
    expect(meta(doc, 'name="twitter:card"')).toBe("summary_large_image")
  })

  it("describes the app to search engines as a free web application", () => {
    const script = doc.querySelector('script[type="application/ld+json"]')
    const data = JSON.parse(script?.textContent ?? "null")
    expect(data).toMatchObject({
      "@context": "https://schema.org",
      "@type": "WebApplication",
      name: "Leira",
      url,
      inLanguage: lang,
      offers: { "@type": "Offer", price: "0" },
    })
  })

  it("loads the app's styles and the page's small script", () => {
    expect(doc.querySelector('link[rel="stylesheet"]')?.getAttribute("href")).toBe(
      "/assets/app-abc.css"
    )
    expect(doc.querySelector('script[type="module"]')?.getAttribute("src")).toBe(
      "/assets/site-def.js"
    )
  })

  it("leads into the app", () => {
    const starts = [...doc.querySelectorAll("a")].filter(
      (link) => link.textContent === strings.landing.start
    )
    expect(starts.length).toBeGreaterThan(0)
    for (const link of starts) expect(link.getAttribute("href")).toBe("/gardens")
  })

  it("shows the example garden as a drawing", () => {
    expect(doc.querySelector("main svg[role='img']")).not.toBeNull()
  })

  it("links to the privacy page and to the other language", () => {
    const hrefs = [...doc.querySelectorAll("a")].map((link) => link.getAttribute("href"))
    expect(hrefs).toContain("/privacy")
    expect(hrefs).toContain(path === "index.html" ? "/en/" : "/")
  })

  it("has one main heading", () => {
    expect(doc.querySelectorAll("h1")).toHaveLength(1)
    expect(doc.querySelector("h1")?.textContent).toBe(strings.landing.hero.title)
  })
})

describe.each([
  { path: "404.html", home: "/", strings: pt },
  { path: "en/404.html", home: "/en/", strings: en },
])("the 404 page at $path", ({ path, home, strings }) => {
  const doc = page(path)

  it("stays out of search results", () => {
    expect(meta(doc, 'name="robots"')).toBe("noindex")
    expect(doc.querySelector('link[rel="canonical"]')).toBeNull()
  })

  it("says the page does not exist and leads back home", () => {
    expect(doc.querySelector("h1")?.textContent).toBe(strings.landing.notFound.title)
    const back = [...doc.querySelectorAll("a")].find(
      (link) => link.textContent === strings.landing.notFound.home
    )
    expect(back?.getAttribute("href")).toBe(home)
  })
})
