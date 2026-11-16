import { readFileSync } from "node:fs"
import { expect, type Page, test } from "@playwright/test"

/** Drags across the canvas, in fractions of its size, the way a mouse would. */
async function dragOnCanvas(page: Page, from: [number, number], to: [number, number]) {
  const canvas = page.getByTestId("garden-canvas")
  await expect(canvas).toHaveAttribute("data-status", "ready")
  const box = await canvas.boundingBox()
  if (!box) throw new Error("The canvas is not on the page")
  const at = ([x, y]: [number, number]) => [box.x + box.width * x, box.y + box.height * y] as const
  await page.mouse.move(...at(from))
  await page.mouse.down()
  await page.mouse.move(...at(to), { steps: 8 })
  await page.mouse.up()
}

test("a garden survives a reload", async ({ page }) => {
  await page.goto("/")
  await page.getByRole("button", { name: "New garden" }).click()

  const name = page.getByRole("textbox", { name: "Garden name" })
  await expect(name).toHaveValue("My garden")
  await name.fill("Allotment 12")

  await page.getByRole("button", { name: "Bed", exact: true }).click()
  await dragOnCanvas(page, [0.4, 0.4], [0.6, 0.6])
  await expect(page.getByRole("button", { name: /^Bed 1/ })).toBeVisible()
  await expect(page.getByText("Saved", { exact: true })).toBeVisible()

  await page.reload()
  await expect(page.getByRole("textbox", { name: "Garden name" })).toHaveValue("Allotment 12")
  await expect(page.getByRole("button", { name: /^Bed 1/ })).toBeVisible()

  await page.getByRole("link", { name: "All gardens" }).click()
  await expect(page.getByRole("link", { name: "Allotment 12" })).toBeVisible()
})

test("a bed can be moved and resized, and stays that way", async ({ page }) => {
  await page.goto("/")
  await page.getByRole("button", { name: "New garden" }).click()
  await page.getByRole("button", { name: "Bed", exact: true }).click()
  // The 6 m by 4 m garden fills the canvas width apart from a margin, so these
  // fractions land on the garden whatever the exact zoom.
  await dragOnCanvas(page, [0.4, 0.4], [0.5, 0.5])

  const selected = page.getByRole("region", { name: "Selected" })
  const position = selected.getByText(/cm from the left/)
  const size = selected.getByText(/^\d+ × \d+ cm$/)
  const positionBefore = await position.textContent()
  const sizeBefore = await size.textContent()

  // Drag the bed by its middle: it moves and keeps its size.
  await dragOnCanvas(page, [0.45, 0.45], [0.6, 0.55])
  await expect(position).not.toHaveText(positionBefore ?? "")
  await expect(size).toHaveText(sizeBefore ?? "")
  const positionMoved = await position.textContent()

  // Drag its bottom-right handle: it grows and its top-left corner stays put.
  await dragOnCanvas(page, [0.65, 0.6], [0.7, 0.7])
  await expect(size).not.toHaveText(sizeBefore ?? "")
  await expect(position).toHaveText(positionMoved ?? "")
  const sizeResized = await size.textContent()

  // One undo per drag.
  await page.getByRole("button", { name: "Undo" }).click()
  await expect(size).toHaveText(sizeBefore ?? "")
  await page.getByRole("button", { name: "Redo" }).click()
  await expect(size).toHaveText(sizeResized ?? "")

  await expect(page.getByText("Saved", { exact: true })).toBeVisible()
  await page.reload()
  await page.getByRole("button", { name: /^Bed 1/ }).click()
  await expect(position).toHaveText(positionMoved ?? "")
  await expect(size).toHaveText(sizeResized ?? "")
})

test("a planting shows on the calendar and on the day it is in the ground", async ({ page }) => {
  await page.goto("/")
  await page.getByRole("button", { name: "New garden" }).click()
  await page.getByRole("button", { name: "Tomato" }).click()
  await dragOnCanvas(page, [0.4, 0.4], [0.6, 0.6])
  const planting = page.getByRole("region", { name: "Plantings" }).getByRole("button")
  await expect(planting).toHaveCount(1)

  // Ten years on, today's tomatoes are long gone.
  const year = new Date().getFullYear()
  await page.getByLabel("Show the garden on").fill(`${year + 10}-06-01`)
  await expect(planting).toContainText("not in the ground")
  await page.getByRole("button", { name: "Show everything" }).click()
  await expect(planting).not.toContainText("not in the ground")

  await page.getByRole("link", { name: "Calendar" }).click()
  const line = page.getByRole("button", { name: /^Tomato × \d+: .*in the ground/ })
  await expect(line).toBeVisible()
  await expect(page.getByRole("list", { name: "Coming up" })).toContainText("Tomato")

  await line.click()
  await expect(page.getByTestId("garden-canvas")).toBeVisible()
  await expect(page.getByRole("region", { name: "Selected" })).toContainText("Tomato")
})

test("the plan can be saved as an image and printed", async ({ page }) => {
  await page.goto("/")
  await page.getByRole("button", { name: "New garden" }).click()
  await page.getByRole("textbox", { name: "Garden name" }).fill("Allotment 12")
  await page.getByRole("button", { name: "Tomato" }).click()
  await dragOnCanvas(page, [0.4, 0.4], [0.6, 0.6])

  const download = page.waitForEvent("download")
  await page.getByRole("button", { name: "Save image" }).click()
  const file = await download
  expect(file.suggestedFilename()).toBe("allotment-12.png")
  const bytes = readFileSync(await file.path())
  // Every PNG starts with these eight bytes; the size follows in the first chunk.
  expect(bytes.subarray(0, 8).toString("hex")).toBe("89504e470d0a1a0a")
  expect([bytes.readUInt32BE(16), bytes.readUInt32BE(20)]).toEqual([2560, 1760])

  // On paper the editor gives way to the sheet.
  await page.emulateMedia({ media: "print" })
  await expect(page.getByTestId("print-sheet")).toBeVisible()
  await expect(page.getByRole("heading", { name: "Allotment 12" })).toBeVisible()
  await expect(page.getByRole("row", { name: /Tomato/ })).toBeVisible()
  await expect(page.getByTestId("garden-canvas")).toBeHidden()
})

test("a visitor only sees their own gardens", async ({ browser }) => {
  const first = await browser.newContext()
  const firstPage = await first.newPage()
  await firstPage.goto("/")
  await firstPage.getByRole("button", { name: "New garden" }).click()
  await expect(firstPage.getByRole("textbox", { name: "Garden name" })).toBeVisible()
  const gardenUrl = firstPage.url()

  const second = await browser.newContext()
  const secondPage = await second.newPage()
  await secondPage.goto("/")
  await expect(secondPage.getByText(/You have no gardens yet/)).toBeVisible()
  await secondPage.goto(gardenUrl)
  await expect(secondPage.getByText(/does not exist, or it belongs to someone else/)).toBeVisible()

  await first.close()
  await second.close()
})

/** The local stack catches every email it sends in Mailpit. Returns the link in the newest one. */
async function emailedLink(address: string): Promise<string> {
  const mailpit = "http://127.0.0.1:54324/api/v1"
  for (let attempt = 0; attempt < 40; attempt++) {
    const search = await fetch(`${mailpit}/search?query=${encodeURIComponent(`to:${address}`)}`)
    const { messages } = (await search.json()) as { messages: { ID: string }[] }
    if (messages[0]) {
      const message = await fetch(`${mailpit}/message/${messages[0].ID}`)
      const { Text } = (await message.json()) as { Text: string }
      const link = Text.match(/https?:\/\/\S+\/auth\/v1\/verify\S+/)?.[0]
      if (link) return link.replace(/[)\]>.]+$/, "")
    }
    await new Promise((resolve) => setTimeout(resolve, 250))
  }
  throw new Error(`No email with a link arrived for ${address}`)
}

test("a guest keeps their gardens with an emailed link, then signs out", async ({ page }) => {
  const address = `gardener-${crypto.randomUUID()}@example.com`
  await page.goto("/")
  await page.getByRole("button", { name: "New garden" }).click()
  await page.getByRole("textbox", { name: "Garden name" }).fill("Kept for later")
  await expect(page.getByText("Saved", { exact: true })).toBeVisible()

  await page.getByRole("button", { name: "Keep your gardens" }).click()
  await expect(page.getByRole("button", { name: "Continue with Google" })).toBeVisible()
  await page.getByRole("textbox", { name: "Email" }).fill(address)
  await page.getByRole("button", { name: "Send link" }).click()
  await expect(page.getByText(`We sent a link to ${address}`)).toBeVisible()

  // Opening the link comes back to the app as the same user, now with an address.
  await page.goto(await emailedLink(address))
  await expect(page.getByRole("button", { name: address })).toBeVisible()
  await expect(page.getByRole("link", { name: "Kept for later" })).toBeVisible()
  // The session it carried is not left in the address bar.
  expect(new URL(page.url()).hash).toBe("")

  await page.getByRole("button", { name: address }).click()
  await page.getByRole("button", { name: "Sign out" }).click()
  await expect(page.getByRole("button", { name: "Keep your gardens" })).toBeVisible()
  await expect(page.getByText(/You have no gardens yet/)).toBeVisible()
})

test("a new visitor opens the example garden and finds the advice at work", async ({ page }) => {
  await page.goto("/")
  await page.getByRole("button", { name: "See an example" }).click()

  await expect(page.getByRole("textbox", { name: "Garden name" })).toHaveValue("Example garden")
  await expect(page.getByTestId("garden-canvas")).toHaveAttribute("data-status", "ready")
  await expect(page.getByRole("region", { name: "Crop rotation" })).toContainText(
    "Potato goes where Tomato grew"
  )
  await expect(page.getByRole("region", { name: "Companion planting" })).toContainText(
    "Onion and Broad bean grow poorly side by side"
  )

  // It is a garden like any other: it is kept, and listed.
  await page.getByRole("link", { name: "All gardens" }).click()
  await expect(page.getByRole("link", { name: "Example garden" })).toBeVisible()
  await expect(page.getByRole("button", { name: "See an example" })).toHaveCount(0)
})

test("the canvas zooms with its buttons and goes back to fitting the garden", async ({ page }) => {
  await page.goto("/")
  await page.getByRole("button", { name: "New garden" }).click()
  await expect(page.getByTestId("garden-canvas")).toHaveAttribute("data-status", "ready")

  const fit = page.getByRole("button", { name: "Fit the garden to the view" })
  const zoomIn = page.getByRole("button", { name: "Zoom in" })
  const zoomOut = page.getByRole("button", { name: "Zoom out" })
  // A new garden opens fitted to the view.
  await expect(fit).toBeDisabled()

  await zoomIn.click()
  await expect(fit).toBeEnabled()
  await fit.click()
  await expect(fit).toBeDisabled()

  // The view goes out to half the size that fits, and no further.
  for (let press = 0; press < 4; press += 1) await zoomOut.click()
  await expect(zoomOut).toBeDisabled()
  await expect(zoomIn).toBeEnabled()
})

test.describe("on a touch screen", () => {
  test.use({ hasTouch: true })

  test("two fingers pinch the canvas to zoom, without drawing anything", async ({ page }) => {
    await page.goto("/")
    await page.getByRole("button", { name: "New garden" }).click()
    const canvas = page.getByTestId("garden-canvas")
    await expect(canvas).toHaveAttribute("data-status", "ready")
    const fit = page.getByRole("button", { name: "Fit the garden to the view" })
    await expect(fit).toBeDisabled()

    // With the bed tool, one finger draws. Two must still zoom.
    await page.getByRole("button", { name: "Bed", exact: true }).click()
    const box = await canvas.boundingBox()
    if (!box) throw new Error("The canvas is not on the page")
    const centre = { x: box.x + box.width / 2, y: box.y + box.height / 2 }
    const fingers = (apart: number) => [
      { x: centre.x - apart, y: centre.y, id: 1 },
      { x: centre.x + apart, y: centre.y, id: 2 },
    ]
    const session = await page.context().newCDPSession(page)
    const touch = (
      type: "touchStart" | "touchMove" | "touchEnd",
      touchPoints: { x: number; y: number; id: number }[]
    ) => session.send("Input.dispatchTouchEvent", { type, touchPoints })
    await touch("touchStart", fingers(40).slice(0, 1))
    await touch("touchStart", fingers(40))
    for (const apart of [60, 80, 100, 120]) await touch("touchMove", fingers(apart))
    await touch("touchEnd", [])

    await expect(fit).toBeEnabled()
    await expect(page.getByRole("button", { name: /^Bed 1/ })).toHaveCount(0)
  })
})

test.describe("on a phone", () => {
  const SCREEN = { width: 390, height: 844 }
  test.use({ viewport: SCREEN })

  test("the garden is in view on arrival, with room to work and nothing over it", async ({
    page,
  }) => {
    await page.goto("/")
    await page.getByRole("button", { name: "See an example" }).click()
    const canvas = page.getByTestId("garden-canvas")
    await expect(canvas).toHaveAttribute("data-status", "ready")
    const garden = await canvas.boundingBox()
    if (!garden) throw new Error("The canvas is not on the page")

    // Tall enough to draw on, and most of it on the first screen.
    expect(garden.height).toBeGreaterThanOrEqual(350)
    expect(garden.y).toBeLessThan(SCREEN.height / 2)

    // The controls sit above the garden, not on it.
    for (const control of [
      page.getByRole("button", { name: "Undo" }),
      page.getByRole("button", { name: "Redo" }),
      page.getByLabel("Show the garden on"),
    ]) {
      const box = await control.boundingBox()
      if (!box) throw new Error("A control is not on the page")
      expect(box.y + box.height).toBeLessThanOrEqual(garden.y)
    }

    // What is planted is listed below, a scroll away, never cut off.
    const plantings = page.getByRole("button", { name: /^Broad bean × 14/ }).last()
    await plantings.scrollIntoViewIfNeeded()
    await expect(plantings).toBeInViewport({ ratio: 1 })
    // Nothing is wider than the screen: the plants are swiped through in their own row.
    expect(garden.x + garden.width).toBeLessThanOrEqual(SCREEN.width)
    await expect(page.locator("html")).toHaveJSProperty("scrollWidth", SCREEN.width)
  })
})

test("the interface switches to Portuguese", async ({ page }) => {
  await page.goto("/")
  await page.getByRole("combobox", { name: "Language" }).selectOption("pt")
  await expect(page.getByRole("heading", { name: "As tuas hortas" })).toBeVisible()
})
