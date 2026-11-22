import { describe, expect, it } from "vitest"
import { sharePreviewHead } from "./sharePreview"

/** The head of the built app shell, as Vite writes it. */
const SHELL = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta
      name="description"
      content="Plan your vegetable garden: beds, plant spacing, sowing dates and crop rotation."
    />
    <title>Leira: plan your vegetable garden</title>
    <script type="module" crossorigin src="/assets/app.js"></script>
  </head>
  <body>
    <div id="root"></div>
  </body>
</html>`

const URL_OF_LINK = "https://leira.test/shared/33333333-3333-4333-8333-333333333333"

/** The value of a meta tag, by its `property` or `name`, read back from the page. */
function meta(html: string, key: string): string[] {
  const pattern = new RegExp(`<meta (?:property|name)="${key}" content="([^"]*)"`, "g")
  return [...html.matchAll(pattern)].map((match) => match[1] ?? "")
}

describe("sharePreviewHead", () => {
  it("names the garden in the title and the preview, in Portuguese", () => {
    const html = sharePreviewHead(SHELL, { name: "Horta da Avó", url: URL_OF_LINK })
    expect(html.match(/<title>/g)).toHaveLength(1)
    expect(html).toContain("<title>Horta da Avó · Leira</title>")
    expect(meta(html, "og:title")).toEqual(["Horta da Avó · Leira"])
    expect(meta(html, "og:site_name")).toEqual(["Leira"])
    expect(meta(html, "og:type")).toEqual(["website"])
    expect(meta(html, "og:locale")).toEqual(["pt_PT"])
    expect(meta(html, "og:url")).toEqual([URL_OF_LINK])
    expect(meta(html, "twitter:card")).toEqual(["summary_large_image"])
  })

  it("replaces the shell's description with the one for a shared garden", () => {
    const html = sharePreviewHead(SHELL, { name: "Horta da Avó", url: URL_OF_LINK })
    const [description] = meta(html, "description")
    expect(description).toMatch(/^Uma horta planeada na Leira/)
    expect(meta(html, "og:description")).toEqual([description])
    expect(html).not.toContain("Plan your vegetable garden")
  })

  it("shows the site's picture, from the link's own address", () => {
    const html = sharePreviewHead(SHELL, { name: "Horta", url: URL_OF_LINK })
    expect(meta(html, "og:image")).toEqual(["https://leira.test/og.png"])
    expect(meta(html, "og:image:width")).toEqual(["1200"])
    expect(meta(html, "og:image:height")).toEqual(["630"])
  })

  it("leaves the query out of the link it names", () => {
    const html = sharePreviewHead(SHELL, { name: "Horta", url: `${URL_OF_LINK}?view=calendar` })
    expect(meta(html, "og:url")).toEqual([URL_OF_LINK])
  })

  // The name is whatever the owner typed, and it lands in the app's own page.
  it("writes a name that looks like HTML as text", () => {
    const name = `</title><script>alert("hi")</script> & 'co'`
    const html = sharePreviewHead(SHELL, { name, url: URL_OF_LINK })
    expect(html).not.toContain("<script>alert")
    expect(html).toContain(
      "<title>&lt;/title&gt;&lt;script&gt;alert(&quot;hi&quot;)&lt;/script&gt; &amp; &#39;co&#39; · Leira</title>"
    )
    expect(html.match(/<script/g)).toHaveLength(1)
  })

  it("writes a name with replacement patterns in it as it was typed", () => {
    const html = sharePreviewHead(SHELL, { name: "Horta $& $` $'", url: URL_OF_LINK })
    expect(meta(html, "og:title")).toEqual(["Horta $&amp; $` $&#39; · Leira"])
    expect(html.match(/<html/g)).toHaveLength(1)
  })

  it("keeps the rest of the shell as it was", () => {
    const html = sharePreviewHead(SHELL, { name: "Horta", url: URL_OF_LINK })
    expect(html).toContain('<script type="module" crossorigin src="/assets/app.js"></script>')
    expect(html).toContain('<div id="root"></div>')
  })

  it("leaves a page with no head alone", () => {
    const page = "<div id=root></div>"
    expect(sharePreviewHead(page, { name: "Horta", url: URL_OF_LINK })).toBe(page)
  })
})
