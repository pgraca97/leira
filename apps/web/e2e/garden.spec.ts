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

/** Clicks the canvas at a point given in fractions of its size. */
async function clickOnCanvas(page: Page, at: [number, number]) {
  const canvas = page.getByTestId("garden-canvas")
  await expect(canvas).toHaveAttribute("data-status", "ready")
  const box = await canvas.boundingBox()
  if (!box) throw new Error("The canvas is not on the page")
  await page.mouse.click(box.x + box.width * at[0], box.y + box.height * at[1])
}

/**
 * Where a point of a new 6 m by 4 m garden is on the page, in centimetres
 * from its top-left corner. It follows the canvas's own rule for a view nobody
 * has panned or zoomed: the whole garden fits, centred, 32 px from the edges.
 * Read afresh each time, once the canvas has stopped moving: it changes size
 * when the tools' hint does, and the garden is fitted to the new size a frame later.
 */
async function onGarden(page: Page, [x, y]: readonly [number, number]): Promise<[number, number]> {
  const canvas = page.getByTestId("garden-canvas")
  await expect(canvas).toHaveAttribute("data-status", "ready")
  await canvas.scrollIntoViewIfNeeded()
  // A string, because these tests are typed for Node, which has no requestAnimationFrame.
  const frame = () => page.evaluate("new Promise((settled) => requestAnimationFrame(settled))")
  let box = await canvas.boundingBox()
  for (let tries = 0; tries < 10; tries++) {
    await frame()
    await frame()
    const next = await canvas.boundingBox()
    if (JSON.stringify(next) === JSON.stringify(box)) break
    box = next
  }
  if (!box) throw new Error("The canvas is not on the page")
  const zoom = Math.min((box.width - 64) / 600, (box.height - 64) / 400)
  const left = box.x + box.width / 2 - 300 * zoom
  const top = box.y + box.height / 2 - 200 * zoom
  return [left + x * zoom, top + y * zoom]
}

/** Drags between two points of the garden, given in centimetres. */
async function dragOnGarden(
  page: Page,
  from: readonly [number, number],
  to: readonly [number, number]
) {
  await page.mouse.move(...(await onGarden(page, from)))
  await page.mouse.down()
  await page.mouse.move(...(await onGarden(page, to)), { steps: 8 })
  await page.mouse.up()
}

test("a garden survives a reload", async ({ page }) => {
  await page.goto("/gardens")
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
  await page.goto("/gardens")
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

test("beds picked with Shift move together, in one undo, and go together", async ({ page }) => {
  await page.goto("/gardens")
  await page.getByRole("button", { name: "New garden" }).click()
  for (const [from, to] of [
    [
      [0.35, 0.4],
      [0.42, 0.47],
    ],
    [
      [0.55, 0.4],
      [0.62, 0.47],
    ],
  ] as const) {
    await page.getByRole("button", { name: "Bed", exact: true }).click()
    await dragOnCanvas(page, [...from], [...to])
  }

  const position = page.getByRole("region", { name: "Selected" }).getByText(/cm from the left/)
  const positionOf = async (bed: string) => {
    await page.getByRole("button", { name: new RegExp(`^${bed}`) }).click()
    return position.textContent()
  }
  const before = [await positionOf("Bed 1"), await positionOf("Bed 2")]

  // Bed 2 is selected; Shift-click adds Bed 1, and dragging either takes both.
  await page.keyboard.down("Shift")
  await clickOnCanvas(page, [0.38, 0.43])
  await page.keyboard.up("Shift")
  await dragOnCanvas(page, [0.58, 0.43], [0.58, 0.53])
  const after = [await positionOf("Bed 1"), await positionOf("Bed 2")]
  expect(after[0]).not.toBe(before[0])
  expect(after[1]).not.toBe(before[1])

  // The group move was one step.
  await page.getByRole("button", { name: "Undo" }).click()
  expect([await positionOf("Bed 1"), await positionOf("Bed 2")]).toEqual(before)
  await page.getByRole("button", { name: "Redo" }).click()

  // Shift-drag over empty ground selects what lies inside the area; Delete removes it all.
  await clickOnCanvas(page, [0.48, 0.65])
  await page.keyboard.down("Shift")
  await dragOnCanvas(page, [0.3, 0.35], [0.7, 0.7])
  await page.keyboard.up("Shift")
  await page.keyboard.press("Delete")
  await expect(page.getByRole("button", { name: /^Bed \d/ })).toHaveCount(0)
})

test("this year's tomatoes are pasted into next year, and rotation says to move them", async ({
  page,
}) => {
  await page.goto("/gardens")
  await page.getByRole("button", { name: "New garden" }).click()
  await page.getByRole("button", { name: "Tomato" }).click()
  await dragOnCanvas(page, [0.4, 0.4], [0.6, 0.6])

  await page.getByRole("region", { name: "Selected" }).getByRole("button", { name: "Copy" }).click()
  await page
    .getByRole("region", { name: "Copied" })
    .getByRole("button", { name: "Paste into next year" })
    .click()

  const plantings = page.getByRole("region", { name: "Plantings" }).getByRole("button")
  await expect(plantings).toHaveCount(2)
  // Same ground, same family, a year apart: the rotation check speaks up at once.
  await expect(page.getByRole("region", { name: "Crop rotation" })).toContainText(
    "Tomato goes where Tomato grew 1 year before"
  )

  await expect(page.getByText("Saved", { exact: true })).toBeVisible()
  await page.reload()
  await expect(plantings).toHaveCount(2)
})

test("a bed saved as a template goes into another garden", async ({ page }) => {
  await page.goto("/gardens")
  await page.getByRole("button", { name: "New garden" }).click()
  await page.getByRole("button", { name: "Bed", exact: true }).click()
  await dragOnCanvas(page, [0.4, 0.4], [0.5, 0.5])

  const templates = page.getByRole("region", { name: "My templates" })
  await templates.getByRole("textbox", { name: "Template name" }).fill("Raised bed")
  await templates.getByRole("button", { name: "Save selection as template" }).click()
  await expect(templates.getByRole("button", { name: "Insert Raised bed" })).toBeVisible()
  await expect(page.getByText("Saved", { exact: true })).toBeVisible()

  await page.getByRole("link", { name: "All gardens" }).click()
  await page.getByRole("button", { name: "New garden" }).click()
  await expect(page.getByRole("button", { name: /^Bed \d/ })).toHaveCount(0)
  await templates.getByRole("button", { name: "Insert Raised bed" }).click()
  await expect(page.getByRole("button", { name: /^Bed 1/ })).toBeVisible()

  await expect(page.getByText("Saved", { exact: true })).toBeVisible()
  await page.reload()
  await expect(page.getByRole("button", { name: /^Bed 1/ })).toBeVisible()
})

test("a planting shows on the calendar and on the day it is in the ground", async ({ page }) => {
  await page.goto("/gardens")
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
  await expect(page.getByRole("list", { name: "Jobs" })).toContainText("Tomato")

  // The year's shopping list, and the jobs as a file a phone calendar takes.
  await expect(page.getByRole("list", { name: /^To get for/ })).toContainText("Tomato")
  const saved = page.waitForEvent("download")
  await page.getByRole("button", { name: "Add to my calendar (.ics)" }).click()
  const file = await saved
  expect(file.suggestedFilename()).toBe("my-garden.ics")
  const calendar = readFileSync(await file.path(), "utf8")
  expect(calendar).toContain("BEGIN:VCALENDAR")
  expect(calendar).toMatch(/SUMMARY:.*Tomato/)

  // By bed, a planting on open ground is listed apart, and there are no beds to show.
  await page.getByRole("button", { name: "By bed" }).click()
  await expect(page.getByRole("group", { name: "Outside the beds" })).toContainText("Tomato")
  await expect(page.getByText("No beds drawn yet.")).toBeVisible()
  await page.getByRole("button", { name: "By planting" }).click()

  await line.click()
  await expect(page.getByTestId("garden-canvas")).toBeVisible()
  await expect(page.getByRole("region", { name: "Selected" })).toContainText("Tomato")
})

test("the crop list narrows to what the month allows, and a crop says its season", async ({
  page,
}) => {
  await page.goto("/gardens")
  await page.getByRole("button", { name: "New garden" }).click()
  const crops = page.getByRole("region", { name: "Plants" }).getByRole("button")
  // Counted once the editor is up: before that the list is not there to count.
  await expect(page.getByRole("button", { name: "Tomato" })).toBeVisible()
  const all = await crops.count()

  // Whatever the month, some crops can be started and some cannot.
  await page.getByRole("checkbox", { name: "To sow or plant now" }).check()
  await expect(crops.first()).toContainText(/sow|plant out/)
  expect(await crops.count()).toBeLessThan(all)
  await page.getByRole("checkbox", { name: "To sow or plant now" }).uncheck()
  await expect(crops).toHaveCount(all)

  await page.getByRole("button", { name: "Tomato" }).click()
  await expect(page.getByText(/^Goes in the ground: /)).toBeVisible()

  // A tomato planted out in January is flagged, and the flag leads to it.
  const year = new Date().getFullYear()
  await page.getByLabel("Show the garden on").fill(`${year + 1}-01-15`)
  await dragOnCanvas(page, [0.4, 0.4], [0.6, 0.6])
  const warning = page.getByRole("region", { name: "Out of season" }).getByRole("button")
  await expect(warning).toContainText("Tomato goes in the ground in January")
})

test("the plan can be saved as an image and printed", async ({ page }) => {
  await page.goto("/gardens")
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

test("a garden saved as a file comes back whole after it is deleted", async ({ page }) => {
  await page.goto("/gardens")
  await page.getByRole("button", { name: "New garden" }).click()
  await page.getByRole("textbox", { name: "Garden name" }).fill("Plot to restore")
  await page.getByRole("button", { name: "Tomato" }).click()
  await dragOnCanvas(page, [0.4, 0.4], [0.6, 0.6])
  await expect(page.getByText("Saved", { exact: true })).toBeVisible()

  const download = page.waitForEvent("download")
  await page.getByRole("button", { name: "Save file" }).click()
  const file = await download
  expect(file.suggestedFilename()).toBe("plot-to-restore.json")
  const path = await file.path()
  const data = JSON.parse(readFileSync(path, "utf8"))
  expect(data.format).toBe(1)
  expect(data.gardens).toHaveLength(1)
  expect(data.gardens[0].plan.plantings).toHaveLength(1)

  await page.getByRole("link", { name: "All gardens" }).click()
  page.once("dialog", (dialog) => dialog.accept())
  await page.getByRole("button", { name: "Delete Plot to restore" }).click()
  await expect(page.getByText(/You have no gardens yet/)).toBeVisible()

  await page.getByLabel("Import").setInputFiles(path)
  await expect(page.getByRole("status").filter({ hasText: "Imported 1 garden." })).toBeVisible()
  // The tomatoes came back with it: the list pictures the plan itself.
  const restored = page.getByRole("listitem").filter({ hasText: "Plot to restore" })
  await expect(restored.locator("svg [data-planting]")).toHaveCount(1)
})

test("a visitor only sees their own gardens", async ({ browser }) => {
  const first = await browser.newContext()
  const firstPage = await first.newPage()
  await firstPage.goto("/gardens")
  await firstPage.getByRole("button", { name: "New garden" }).click()
  await expect(firstPage.getByRole("textbox", { name: "Garden name" })).toBeVisible()
  const gardenUrl = firstPage.url()

  const second = await browser.newContext()
  const secondPage = await second.newPage()
  await secondPage.goto("/gardens")
  await expect(secondPage.getByText(/You have no gardens yet/)).toBeVisible()
  await secondPage.goto(gardenUrl)
  await expect(secondPage.getByText(/does not exist, or it belongs to someone else/)).toBeVisible()

  await first.close()
  await second.close()
})

test("a garden opens from its share link with no account, until sharing stops", async ({
  page,
  browser,
}) => {
  await page.goto("/gardens")
  await page.getByRole("button", { name: "New garden" }).click()
  await page.getByRole("textbox", { name: "Garden name" }).fill("Shared allotment")
  await page.getByRole("button", { name: "Bed", exact: true }).click()
  await dragOnCanvas(page, [0.4, 0.4], [0.6, 0.6])
  await expect(page.getByText("Saved", { exact: true })).toBeVisible()

  await page.getByRole("button", { name: "Share" }).click()
  const panel = page.getByRole("dialog", { name: "Share this garden" })
  await panel.getByRole("button", { name: "Create link" }).click()
  const link = await panel.getByRole("textbox", { name: "Link" }).inputValue()
  expect(link).toMatch(/\/shared\/[0-9a-f-]{36}$/)

  // Someone else, in a browser that has never been here.
  const visitor = await browser.newContext()
  const shared = await visitor.newPage()
  await shared.goto(link)
  await expect(shared.getByRole("heading", { name: "Shared allotment" })).toBeVisible()
  await expect(
    shared.getByRole("img", { name: "Shared allotment" }).locator("[data-kind]")
  ).toHaveCount(1)
  await expect(shared.getByRole("textbox", { name: "Garden name" })).toHaveCount(0)
  // Looking did not sign the visitor in: Supabase left nothing in their browser.
  const sessionKeys = await shared.evaluate(() =>
    Object.keys(localStorage).filter((key) => key.startsWith("sb-"))
  )
  expect(sessionKeys).toEqual([])

  await shared.getByRole("link", { name: "Calendar" }).click()
  await expect(shared.getByRole("heading", { name: "Jobs" })).toBeVisible()

  // Sharing did not disturb the editor: the garden still saves.
  await page.keyboard.press("Escape")
  await page.getByRole("textbox", { name: "Garden name" }).fill("Private again")
  await expect(page.getByText("Saved", { exact: true })).toBeVisible()

  await page.getByRole("button", { name: "Share" }).click()
  await panel.getByRole("button", { name: "Stop sharing" }).click()
  await expect(panel.getByRole("button", { name: "Create link" })).toBeVisible()
  await shared.reload()
  await expect(shared.getByText(/does not open a garden/)).toBeVisible()

  await visitor.close()
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

/** Waits for an email to an address whose subject has `subject` in it, and returns its text. */
async function emailText(address: string, subject: string): Promise<string> {
  const mailpit = "http://127.0.0.1:54324/api/v1"
  const query = encodeURIComponent(`to:${address} subject:"${subject}"`)
  for (let attempt = 0; attempt < 40; attempt++) {
    const search = await fetch(`${mailpit}/search?query=${query}`)
    const { messages } = (await search.json()) as { messages: { ID: string }[] }
    if (messages[0]) {
      const message = await fetch(`${mailpit}/message/${messages[0].ID}`)
      return ((await message.json()) as { Text: string }).Text
    }
    await new Promise((resolve) => setTimeout(resolve, 250))
  }
  throw new Error(`No email about "${subject}" arrived for ${address}`)
}

test("what happened in a garden is kept, and its notes and amounts stay off a share link", async ({
  page,
  browser,
}) => {
  await page.goto("/gardens")
  await page.getByRole("button", { name: "New garden" }).click()
  await page.getByRole("button", { name: "Tomato" }).click()
  await dragOnCanvas(page, [0.4, 0.4], [0.6, 0.6])
  const planting = page.getByRole("region", { name: "Plantings" }).getByRole("button")
  await expect(planting).toHaveCount(1)

  // A job ticked on the calendar is still done after a reload.
  await page.getByRole("link", { name: "Calendar" }).click()
  const plantOut = page.getByRole("checkbox", { name: "Plant out Tomato" })
  await plantOut.check()
  await expect(page.getByText("Saved", { exact: true })).toBeVisible()
  await page.reload()
  await expect(plantOut).toBeChecked()

  // The planting's own panel knows it too, and takes a harvest and a note.
  await page.getByRole("link", { name: "Plan", exact: true }).click()
  await planting.click()
  await expect(page.getByRole("checkbox", { name: "In the ground" })).toBeChecked()
  await page.getByLabel("Amount").fill("1,5")
  await page.getByRole("button", { name: "Record harvest" }).click()
  const harvests = page.getByRole("list", { name: "Harvests" })
  await expect(harvests).toContainText("1.5 kg")
  // Found by role: a label's text, as Playwright reads it, takes in what its textarea holds.
  const notes = page.getByRole("textbox", { name: "Notes", exact: true })
  await notes.fill("Blight in August.")
  await notes.blur()
  await expect(page.getByText("Saved", { exact: true })).toBeVisible()

  await page.reload()
  await planting.click()
  await expect(harvests).toContainText("1.5 kg")
  await expect(notes).toHaveValue("Blight in August.")

  await page.getByRole("button", { name: "Share" }).click()
  const panel = page.getByRole("dialog", { name: "Share this garden" })
  await panel.getByRole("button", { name: "Create link" }).click()
  const link = await panel.getByRole("textbox", { name: "Link" }).inputValue()

  // A visitor sees what was done, with nothing to tick.
  const visitor = await browser.newContext()
  const shared = await visitor.newPage()
  await shared.goto(`${link}?view=calendar`)
  const jobs = shared.getByRole("list", { name: "Jobs" })
  await expect(jobs).toContainText("Plant out Tomatodone")
  await expect(shared.getByRole("checkbox")).toHaveCount(0)

  // And what the link hands over holds the harvest's day, not its amount or the note.
  const token = link.split("/").at(-1)
  const answer = await (await shared.request.get(`/api/shared/${token}`)).text()
  expect(answer).toContain("harvests")
  expect(answer).not.toContain("quantity")
  expect(answer).not.toContain("Blight")
  await visitor.close()
})

test("a guest keeps their gardens with an emailed link, then signs out", async ({ page }) => {
  const address = `gardener-${crypto.randomUUID()}@example.com`
  await page.goto("/gardens")
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

test("the privacy page opens on its own without making a guest, and from the account panel", async ({
  page,
}) => {
  const signUps: string[] = []
  page.on("request", (request) => {
    if (request.url().includes("/auth/v1/signup")) signUps.push(request.url())
  })
  await page.goto("/privacy")
  await expect(page.getByRole("heading", { level: 1, name: "Privacy" })).toBeVisible()
  await expect(page.getByRole("link", { name: "CNPD" })).toBeVisible()
  expect(signUps).toEqual([])

  await page.goto("/gardens")
  await page.getByRole("button", { name: "Keep your gardens" }).click()
  await page.getByRole("link", { name: "Privacy" }).click()
  await expect(page).toHaveURL(/\/privacy$/)
  await expect(page.getByRole("heading", { level: 1, name: "Privacy" })).toBeVisible()
})

test("a visitor takes their data away, then deletes everything", async ({ page }) => {
  await page.goto("/gardens")
  await page.getByRole("button", { name: "New garden" }).click()
  await page.getByRole("textbox", { name: "Garden name" }).fill("Short-lived plot")
  await expect(page.getByText("Saved", { exact: true })).toBeVisible()

  await page.getByRole("button", { name: "Keep your gardens" }).click()
  const download = page.waitForEvent("download")
  await page.getByRole("button", { name: "Download my data" }).click()
  const file = await download
  expect(file.suggestedFilename()).toMatch(/^leira-data-\d{4}-\d{2}-\d{2}\.json$/)
  const data = JSON.parse(readFileSync(await file.path(), "utf8"))
  expect(data.format).toBe(1)
  expect(data.gardens.map((garden: { name: string }) => garden.name)).toEqual(["Short-lived plot"])

  await page.getByRole("button", { name: "Delete account" }).click()
  await page.getByRole("button", { name: "Delete for good" }).click()
  await expect(page.getByText(/You have no gardens yet/)).toBeVisible()

  // The visitor goes on as a new guest, and the garden is not coming back.
  await page.reload()
  await expect(page.getByText(/You have no gardens yet/)).toBeVisible()
})

test("an account asked to be deleted stays when its owner signs in again", async ({ page }) => {
  const address = `leaving-${crypto.randomUUID()}@example.com`
  await page.goto("/gardens")
  await page.getByRole("button", { name: "New garden" }).click()
  await page.getByRole("textbox", { name: "Garden name" }).fill("Second thoughts")
  await expect(page.getByText("Saved", { exact: true })).toBeVisible()
  await page.getByRole("button", { name: "Keep your gardens" }).click()
  await page.getByRole("textbox", { name: "Email" }).fill(address)
  await page.getByRole("button", { name: "Send link" }).click()
  await page.goto(await emailedLink(address))
  await expect(page.getByRole("button", { name: address })).toBeVisible()

  await page.getByRole("button", { name: address }).click()
  await page.getByRole("button", { name: "Delete account" }).click()
  await expect(page.getByText(/will be deleted on .*, 30 days from now/)).toBeVisible()
  await page.getByRole("button", { name: "Delete my account" }).click()

  // The browser goes on as a new guest, told until when the account waits.
  await expect(page.getByText(/Your account will be deleted on/)).toBeVisible()
  // The Worker emailed the same, with the way back in.
  const confirmation = await emailText(address, "will be deleted on")
  expect(confirmation).toMatch(/sign in again at http:\/\/\S+\/gardens before/)
  await expect(page.getByRole("button", { name: "Keep your gardens" })).toBeVisible()
  await expect(page.getByText(/You have no gardens yet/)).toBeVisible()

  await page.getByRole("button", { name: "Keep your gardens" }).click()
  await page.getByRole("textbox", { name: "Email" }).fill(address)
  await page.getByRole("button", { name: "Send link" }).click()
  await expect(page.getByText(`We sent a link to ${address}`)).toBeVisible()
  await page.goto(await emailedLink(address))
  await expect(page.getByText(/Since you signed in again, it stays/)).toBeVisible()
  await expect(page.getByRole("link", { name: "Second thoughts" })).toBeVisible()
})

test("a new visitor opens the example garden and finds the advice at work", async ({ page }) => {
  await page.goto("/gardens")
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

test("the list pictures each garden and makes a copy that stands on its own", async ({ page }) => {
  await page.goto("/gardens")
  await page.getByRole("button", { name: "See an example" }).click()
  await expect(page.getByText("Saved", { exact: true })).toBeVisible()
  await page.getByRole("link", { name: "All gardens" }).click()

  const example = page.getByRole("listitem").filter({ hasText: "Example garden" })
  // The picture draws the plan itself: eight plantings on two beds.
  await expect(example.locator("svg [data-planting]")).toHaveCount(8)

  await page.getByRole("button", { name: "Duplicate Example garden" }).click()
  const copy = page.getByRole("link", { name: "Example garden (copy)" })
  await expect(copy).toBeVisible()
  await expect(page.getByRole("listitem")).toHaveCount(2)

  // The copy has the plan, and changing it leaves the original alone.
  await copy.click()
  await expect(page.getByRole("region", { name: "Crop rotation" })).toBeVisible()
  await page.getByRole("button", { name: /^Potato × 16/ }).click()
  await page
    .getByRole("region", { name: "Selected" })
    .getByRole("button", { name: "Delete" })
    .click()
  await expect(page.getByText("Saved", { exact: true })).toBeVisible()
  await page.getByRole("link", { name: "All gardens" }).click()
  await expect(
    page.getByRole("listitem").filter({ hasText: "(copy)" }).locator("svg [data-planting]")
  ).toHaveCount(7)
  await expect(
    page.getByRole("listitem").filter({ hasNotText: "(copy)" }).locator("svg [data-planting]")
  ).toHaveCount(8)
})

test("the canvas zooms with its buttons and goes back to fitting the garden", async ({ page }) => {
  await page.goto("/gardens")
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
    await page.goto("/gardens")
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
    await page.goto("/gardens")
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

  test("the garden stays put while the tools change and the garden saves", async ({ page }) => {
    await page.goto("/gardens")
    await page.getByRole("button", { name: "New garden" }).click()
    const canvas = page.getByTestId("garden-canvas")
    await expect(canvas).toHaveAttribute("data-status", "ready")
    const top = async () => (await canvas.boundingBox())?.y
    const start = await top()

    await page.getByRole("button", { name: "Bed", exact: true }).click()
    expect(await top()).toBe(start)
    await dragOnGarden(page, [200, 100], [400, 300])
    // Drawn but not saved yet, then saved: the indicator changes, the garden does not move.
    await expect(page.getByText("Unsaved", { exact: true })).toBeVisible()
    expect(await top()).toBe(start)
    await expect(page.getByText("Saved", { exact: true })).toBeVisible()
    expect(await top()).toBe(start)

    await page.getByRole("button", { name: "Select several" }).click()
    expect(await top()).toBe(start)
    // A crop's advice is the longest of all.
    await page.getByRole("button", { name: "Tomato", exact: true }).click()
    expect(await top()).toBe(start)
  })

  test("several beds are picked by touch, without a Shift key", async ({ page }) => {
    await page.goto("/gardens")
    await page.getByRole("button", { name: "New garden" }).click()
    for (const [from, to] of [
      [
        [50, 100],
        [200, 250],
      ],
      [
        [350, 100],
        [500, 250],
      ],
    ] as const) {
      await page.getByRole("button", { name: "Bed", exact: true }).click()
      await dragOnGarden(page, from, to)
      // The save indicator changes the header's height on a phone: let it settle first.
      await expect(page.getByText("Saved", { exact: true })).toBeVisible()
    }

    await page.getByRole("button", { name: "Select several" }).click()
    // Bed 2 is still selected from drawing it: a tap on Bed 1 adds it.
    await page.mouse.click(...(await onGarden(page, [120, 170])))
    const selected = page.getByRole("region", { name: "Selected" })
    await expect(selected.getByText("2 selected: 2 beds")).toBeVisible()

    // Let go of both, then drag over empty ground to draw an area around them.
    await selected.getByRole("button", { name: "Clear selection" }).click()
    await dragOnGarden(page, [10, 10], [590, 390])
    await expect(selected.getByText("2 selected: 2 beds")).toBeVisible()

    await selected.getByRole("button", { name: "Delete" }).click()
    await expect(page.getByRole("button", { name: /^Bed \d/ })).toHaveCount(0)
  })

  test("the header keeps to two lines, with the rest behind a menu", async ({ page }) => {
    await page.goto("/gardens")
    await page.getByRole("button", { name: "See an example" }).click()
    await expect(page.getByTestId("garden-canvas")).toHaveAttribute("data-status", "ready")

    const header = await page.getByRole("banner").boundingBox()
    if (!header) throw new Error("The header is not on the page")
    expect(header.height).toBeLessThanOrEqual(110)
    // What matters while drawing stays in sight.
    await expect(page.getByRole("textbox", { name: "Garden name" })).toBeVisible()
    await expect(page.getByText("Saved", { exact: true })).toBeVisible()

    const print = page.getByRole("button", { name: "Print" })
    const language = page.getByRole("combobox", { name: "Language" })
    await expect(print).toBeHidden()
    await expect(language).toBeHidden()
    await page.getByRole("button", { name: "More" }).click()
    await expect(print).toBeVisible()
    await language.selectOption("pt")
    await expect(page.getByRole("button", { name: "Mais" })).toBeVisible()
  })
})

test("the interface switches to Portuguese", async ({ page }) => {
  await page.goto("/gardens")
  await page.getByRole("combobox", { name: "Language" }).selectOption("pt")
  await expect(page.getByRole("heading", { name: "As tuas hortas" })).toBeVisible()
})
