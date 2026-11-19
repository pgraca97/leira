import { describe, expect, it } from "vitest"
import app from "../app.html?raw"
import manifestText from "../public/manifest.webmanifest?raw"

/** The files in `public`, by the path the site serves them at. */
const served = Object.keys(import.meta.glob("../public/*")).map((path) =>
  path.replace("../public", "")
)

describe("installing on a phone", () => {
  const manifest = JSON.parse(manifestText)

  it("opens the app on the gardens, on its own like an app", () => {
    expect(manifest).toMatchObject({
      name: "Leira",
      short_name: "Leira",
      start_url: "/gardens",
      scope: "/",
      display: "standalone",
      theme_color: "#3f6212",
    })
  })

  it("has icons at the sizes phones ask for, one of them safe to mask", () => {
    const icons: { src: string; sizes: string; purpose?: string }[] = manifest.icons
    expect(icons.map((icon) => icon.sizes)).toEqual(expect.arrayContaining(["192x192", "512x512"]))
    expect(icons.some((icon) => icon.purpose === "maskable")).toBe(true)
    for (const icon of icons) expect(served).toContain(icon.src)
  })

  it("is linked from the app's page, with an icon for iPhones", () => {
    expect(app).toContain('<link rel="manifest" href="/manifest.webmanifest" />')
    expect(app).toContain('<link rel="apple-touch-icon" href="/apple-touch-icon.png" />')
    expect(app).toContain('<meta name="theme-color" content="#3f6212" />')
    expect(served).toContain("/apple-touch-icon.png")
  })
})
