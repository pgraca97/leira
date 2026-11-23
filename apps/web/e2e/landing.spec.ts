import { expect, type Page, test } from "@playwright/test"

/** Counts the guests the auth server is asked to make while the page is open. */
function countSignUps(page: Page): string[] {
  const signUps: string[] = []
  page.on("request", (request) => {
    if (request.url().includes("/auth/v1/signup")) signUps.push(request.url())
  })
  return signUps
}

test("a newcomer reads the landing page without becoming a guest, then starts", async ({
  page,
}) => {
  const signUps = countSignUps(page)
  await page.goto("/")
  await expect(
    page.getByRole("heading", { level: 1, name: "Planeia a tua horta, canteiro a canteiro" })
  ).toBeVisible()
  await expect(page.getByRole("img", { name: /horta de exemplo/ })).toBeVisible()
  expect(signUps).toEqual([])

  // The page is in Portuguese, but this browser asks for English: the page wins.
  await page.getByRole("link", { name: "Começar a planear" }).first().click()
  await expect(page).toHaveURL(/\/gardens$/)
  await expect(page.getByRole("button", { name: "Nova horta" })).toBeVisible()
  expect(signUps).toHaveLength(1)
})

test("the landing page is in English at /en/", async ({ page }) => {
  await page.goto("/en/")
  await expect(
    page.getByRole("heading", { level: 1, name: "Plan your vegetable garden, bed by bed" })
  ).toBeVisible()
  await page.locator("header summary").click()
  await page.getByRole("banner").getByRole("link", { name: "Português" }).click()
  await expect(page).toHaveURL(/\/$/)
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "Planeia a tua horta, canteiro a canteiro"
  )
})

test("the privacy page opens in the language of the landing page", async ({ page }) => {
  // This browser asks for English, and the page is in Portuguese: the page wins.
  await page.goto("/")
  await page.getByRole("link", { name: "Privacidade" }).click()
  await expect(page).toHaveURL(/\/privacy$/)
  await expect(page.getByRole("heading", { level: 1, name: "Privacidade" })).toBeVisible()
  // No gardens here yet: the header offers the same start as the landing page.
  await expect(
    page.getByRole("banner").getByRole("link", { name: "Começar a planear" })
  ).toBeVisible()
  await expect(page.getByRole("link", { name: "As minhas hortas" })).toHaveCount(0)
})

test("a language picked on the landing page is the one the app opens in", async ({ page }) => {
  await page.goto("/en/")
  // An earlier choice, from the app's own menu.
  await page.evaluate(() => localStorage.setItem("garden.language", "en"))
  await page.locator("header summary").click()
  await page.getByRole("banner").getByRole("link", { name: "Português" }).click()
  await expect(page).toHaveURL(/\/$/)
  await page.getByRole("link", { name: "Começar a planear" }).first().click()
  await expect(page.getByRole("button", { name: "Nova horta" })).toBeVisible()
})

test("someone who used the app goes straight back to it, unless they came from it", async ({
  page,
}) => {
  await page.goto("/gardens")
  await expect(page.getByRole("button", { name: "New garden" })).toBeVisible()

  // Typed in, or from a bookmark or a search: no referrer from this site.
  await page.goto("/")
  await expect(page).toHaveURL(/\/gardens$/)
  await expect(page.getByRole("button", { name: "New garden" })).toBeVisible()

  // The app's own name leads to the landing page, and it stays there.
  await page.getByRole("link", { name: "Leira" }).click()
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible()
  await expect(page).toHaveURL(/\/$/)
  // Its header leads back to the gardens rather than to a start.
  const header = page.getByRole("banner")
  await expect(header.getByRole("link", { name: /^(My gardens|As minhas hortas)$/ })).toBeVisible()
  await expect(
    header.getByRole("link", { name: /^(Start planning|Começar a planear)$/ })
  ).toHaveCount(0)
})

test("the app's pages stay out of search results", async ({ request }) => {
  for (const path of ["/gardens", "/gardens/missing", "/shared/missing", "/stats"]) {
    const response = await request.get(path)
    expect(response.status(), path).toBe(200)
    expect(response.headers()["x-robots-tag"], path).toBe("noindex")
  }
  const privacy = await request.get("/privacy")
  expect(privacy.headers()["x-robots-tag"]).toBeUndefined()

  const landing = await request.get("/")
  expect(landing.headers()["x-robots-tag"]).toBeUndefined()
  expect(await landing.text()).toContain('<link rel="canonical"')
  // An unknown address gets the 404 page only once built: the dev server
  // hands it to the Worker. The renderer's tests cover that page.
})

test("a phone can add the app to its home screen", async ({ request }) => {
  const manifest = await request.get("/manifest.webmanifest")
  expect(manifest.ok()).toBe(true)
  const { start_url, icons } = await manifest.json()
  expect(start_url).toBe("/gardens")
  for (const { src } of [...icons, { src: "/apple-touch-icon.png" }]) {
    const icon = await request.get(src)
    expect(icon.headers()["content-type"], src).toBe("image/png")
  }
})
