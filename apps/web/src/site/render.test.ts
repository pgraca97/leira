// @vitest-environment jsdom
import { describe, expect, it } from "vitest"
import { en } from "../i18n/en"
import { pt } from "../i18n/pt"
import { renderSite } from "./render"
import { SITE_URL, SOURCE_URL } from "./site"

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
  {
    path: "index.html",
    url: `${SITE_URL}/`,
    lang: "pt-PT",
    locale: "pt_PT",
    strings: pt,
    where: "Os meses são os do norte e centro de Portugal continental.",
  },
  {
    path: "en/index.html",
    url: `${SITE_URL}/en/`,
    lang: "en",
    locale: "en_GB",
    strings: en,
    where: "The months are those of the north and centre of mainland Portugal.",
  },
])("the landing page at $path", ({ path, url, lang, locale, strings, where }) => {
  const doc = page(path)

  it("says where the sowing months hold", () => {
    expect(doc.body.textContent).toContain(where)
  })

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

  it("can be added to a phone's home screen", () => {
    for (const path of ["index.html", "en/index.html"]) {
      const doc = page(path)
      expect(doc.querySelector('link[rel="manifest"]')?.getAttribute("href")).toBe(
        "/manifest.webmanifest"
      )
      expect(doc.querySelector('link[rel="apple-touch-icon"]')?.getAttribute("href")).toBe(
        "/apple-touch-icon.png"
      )
      expect(meta(doc, 'name="theme-color"')).toBe("#3f6212")
    }
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

  it("sends a returning visitor on to the app before anything is drawn", () => {
    const head = [...doc.head.children]
    const first = head.find((element) => element.tagName === "SCRIPT")
    expect(first?.getAttribute("src")).toBeNull()
    expect(first?.textContent).toContain("/gardens")
    expect(first?.textContent).toContain("auth-token")
    // Before the styles, which the browser would otherwise fetch first.
    const styles = head.findIndex((element) => element.matches('link[rel="stylesheet"]'))
    expect(head.indexOf(first as Element)).toBeLessThan(styles)
  })

  it("shows the example garden as a drawing", () => {
    expect(doc.querySelector("main svg[role='img']")).not.toBeNull()
  })

  it("links to the privacy page and to the other language", () => {
    const hrefs = [...doc.querySelectorAll("a")].map((link) => link.getAttribute("href"))
    expect(hrefs).toContain("/privacy")
    expect(hrefs).toContain(path === "index.html" ? "/en/" : "/")
  })

  // The script then hands the page's language, or the one picked, to the app.
  it("marks every way into the app, and every language link", () => {
    for (const link of doc.querySelectorAll('a[href="/gardens"], a[href="/privacy"]')) {
      expect(link.hasAttribute("data-app-link"), link.outerHTML).toBe(true)
    }
    const languages = [...doc.querySelectorAll("a[data-language]")]
    expect(languages.map((link) => link.getAttribute("hreflang"))).toEqual(
      expect.arrayContaining(["pt", "en"])
    )
  })

  it("chooses the language with the same menu as the app, after the way in", () => {
    const header = doc.querySelector("header > div")
    expect(header?.lastElementChild?.matches("details")).toBe(true)
    expect(header?.firstElementChild?.getAttribute("href")).toBe("/gardens")
  })

  // The page's script marks the page when the browser holds a session.
  it("offers a start to a newcomer, and the gardens to someone who has them", () => {
    const way = doc.querySelector("header a[href='/gardens']")
    const labels = [...(way?.children ?? [])].map((label) => label.textContent)
    expect(labels).toEqual([strings.landing.start, strings.garden.back])
  })

  it("switches language from the foot with a plain link, like its other links", () => {
    const foot = doc.querySelector("footer")
    expect(foot?.querySelector("details")).toBeNull()
    const other = foot?.querySelector("a[data-language]")
    expect(other?.getAttribute("href")).toBe(path === "index.html" ? "/en/" : "/")
  })

  // The AGPL asks that people using the app can reach its source.
  it("links to the source code from the foot", () => {
    expect(SOURCE_URL).toBe("https://github.com/pgraca97/leira")
    const source = doc.querySelector(`footer a[href="${SOURCE_URL}"]`)
    expect(source).not.toBeNull()
    expect(source?.textContent).toBe(strings.landing.source)
  })

  it("has one main heading", () => {
    expect(doc.querySelectorAll("h1")).toHaveLength(1)
    expect(doc.querySelector("h1")?.textContent).toBe(strings.landing.hero.title)
  })
})

describe("robots.txt", () => {
  const robots = files.find((file) => file.path === "robots.txt")?.content ?? ""
  const lines = robots.split("\n")

  it("lets every crawler in", () => {
    expect(lines).toContain("User-agent: *")
    expect(lines).toContain("Allow: /")
  })

  // A crawler that runs the app there would sign a guest in for nothing.
  it("keeps crawlers out of the app and the API", () => {
    for (const path of ["/gardens", "/stats", "/app", "/api/"]) {
      expect(lines).toContain(`Disallow: ${path}`)
    }
  })

  // They must be read to be seen: their pages say noindex themselves.
  it("lets crawlers read shared gardens and the privacy page", () => {
    expect(robots).not.toContain("Disallow: /shared")
    expect(robots).not.toContain("Disallow: /privacy")
  })

  it("points to the sitemap", () => {
    expect(lines).toContain(`Sitemap: ${SITE_URL}/sitemap.xml`)
  })
})

describe("sitemap.xml", () => {
  const xml = files.find((file) => file.path === "sitemap.xml")?.content ?? ""
  const doc = new DOMParser().parseFromString(xml, "application/xml")
  const urls = [...doc.getElementsByTagName("url")]
  const location = (url: Element) => url.getElementsByTagName("loc")[0]?.textContent

  it("is well-formed XML", () => {
    expect(doc.getElementsByTagName("parsererror")).toHaveLength(0)
    expect(doc.documentElement.namespaceURI).toBe("http://www.sitemaps.org/schemas/sitemap/0.9")
  })

  it("lists the pages meant to be found, and only those", () => {
    expect(urls.map(location)).toEqual([`${SITE_URL}/`, `${SITE_URL}/en/`, `${SITE_URL}/privacy`])
  })

  it("ties each landing page to its other language", () => {
    for (const url of urls.slice(0, 2)) {
      const alternates = [
        ...url.getElementsByTagNameNS("http://www.w3.org/1999/xhtml", "link"),
      ].map((link) => [link.getAttribute("hreflang"), link.getAttribute("href")])
      expect(alternates).toEqual([
        ["pt-PT", `${SITE_URL}/`],
        ["en", `${SITE_URL}/en/`],
        ["x-default", `${SITE_URL}/`],
      ])
    }
  })
})

describe.each([
  { path: "404.html", home: "/", strings: pt },
  { path: "en/404.html", home: "/en/", strings: en },
])("the 404 page at $path", ({ path, home, strings }) => {
  const doc = page(path)

  // A mistyped address is not a way into the app.
  it("lets anyone read it", () => {
    for (const script of doc.querySelectorAll("script:not([src]):not([type])")) {
      expect(script.textContent).not.toContain("auth-token")
    }
  })

  it("switches to the language the visitor chose before anything is drawn", () => {
    const head = [...doc.head.children]
    const first = head.find((element) => element.tagName === "SCRIPT")
    expect(first?.getAttribute("src")).toBeNull()
    expect(first?.textContent).toContain('"garden.language"')
    const styles = head.findIndex((element) => element.matches('link[rel="stylesheet"]'))
    expect(head.indexOf(first as Element)).toBeLessThan(styles)
  })

  it("stays out of search results", () => {
    expect(meta(doc, 'name="robots"')).toBe("noindex")
    expect(doc.querySelector('link[rel="canonical"]')).toBeNull()
  })

  it("has the header of every page, with the language but no way into the app", () => {
    const header = doc.querySelector("body header")
    expect(header?.querySelector(`a[href="${home}"]`)?.textContent).toContain("Leira")
    expect(header?.querySelector("details summary")).not.toBeNull()
    expect(header?.querySelector('a[href="/gardens"]')).toBeNull()
  })

  it("says the page does not exist and leads back home", () => {
    expect(doc.querySelector("h1")?.textContent).toBe(strings.landing.notFound.title)
    const back = [...doc.querySelectorAll("a")].find(
      (link) => link.textContent === strings.landing.notFound.home
    )
    expect(back?.getAttribute("href")).toBe(home)
  })
})
