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

test("the interface switches to Portuguese", async ({ page }) => {
  await page.goto("/")
  await page.getByRole("combobox", { name: "Language" }).selectOption("pt")
  await expect(page.getByRole("heading", { name: "As tuas hortas" })).toBeVisible()
})
