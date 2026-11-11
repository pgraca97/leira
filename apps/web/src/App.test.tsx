// @vitest-environment jsdom
import "./test/setup"
import "./i18n"
import { emptyPlan } from "@garden/core"
import { createMemoryHistory } from "@tanstack/react-router"
import { render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { App } from "./App"
import { editorStore } from "./editor/store"
import type { Garden } from "./lib/gardens"
import { type FakeBackend, fakeBackend } from "./test/fakeBackend"

// Phaser needs a real canvas, which jsdom does not have.
vi.mock("./editor/canvas/createGardenCanvas", () => ({
  createGardenCanvas: () => ({ destroy() {} }),
}))

const TOMATOES: Garden = {
  id: "11111111-1111-4111-8111-111111111111",
  name: "Tomato patch",
  location: null,
  plan: emptyPlan(),
  version: 1,
  updatedAt: "2026-11-01T10:00:00.000Z",
}
const HERBS: Garden = {
  ...TOMATOES,
  id: "22222222-2222-4222-8222-222222222222",
  name: "Herb spiral",
  updatedAt: "2026-11-05T10:00:00.000Z",
}

let backend: FakeBackend

function open(path: string, connect: () => Promise<FakeBackend> = async () => backend) {
  const history = createMemoryHistory({ initialEntries: [path] })
  render(<App connect={connect} history={history} autosaveDelayMs={10} />)
  return history
}

beforeEach(() => {
  backend = fakeBackend([TOMATOES, HERBS])
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe("the gardens list", () => {
  it("lists the user's gardens, the most recently changed first", async () => {
    open("/")
    const links = await screen.findAllByRole("link", { name: /Tomato patch|Herb spiral/ })
    expect(links.map((link) => link.textContent)).toEqual(["Herb spiral", "Tomato patch"])
  })

  it("invites the user to create a garden when there are none", async () => {
    backend = fakeBackend()
    open("/")
    expect(await screen.findByText(/You have no gardens yet/)).toBeVisible()
  })

  it("creates a garden and opens it in the editor", async () => {
    backend = fakeBackend()
    const history = open("/")
    await userEvent.click(await screen.findByRole("button", { name: "New garden" }))

    expect(await screen.findByRole("textbox", { name: "Garden name" })).toHaveValue("My garden")
    const [created] = [...backend.rows.values()]
    expect(history.location.pathname).toBe(`/gardens/${created?.id}`)
  })

  it("deletes a garden once the user confirms", async () => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(true)
    open("/")
    const item = (await screen.findByRole("link", { name: "Tomato patch" })).closest("li")
    await userEvent.click(within(item as HTMLElement).getByRole("button", { name: /Delete/ }))

    await waitFor(() => expect(screen.queryByRole("link", { name: "Tomato patch" })).toBeNull())
    expect(confirm).toHaveBeenCalledWith(expect.stringContaining("Tomato patch"))
    expect(backend.rows.has(TOMATOES.id)).toBe(false)
    expect(screen.getByRole("link", { name: "Herb spiral" })).toBeVisible()
  })

  it("keeps the garden when the user cancels the deletion", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(false)
    open("/")
    const item = (await screen.findByRole("link", { name: "Tomato patch" })).closest("li")
    await userEvent.click(within(item as HTMLElement).getByRole("button", { name: /Delete/ }))
    expect(backend.rows.has(TOMATOES.id)).toBe(true)
  })

  it("says so when the server cannot be reached, and connects on retry", async () => {
    let attempts = 0
    open("/", async () => {
      if (attempts++ === 0) throw new Error("offline")
      return backend
    })
    expect(await screen.findByRole("alert")).toHaveTextContent(/Could not connect/)
    await userEvent.click(screen.getByRole("button", { name: "Try again" }))
    expect(await screen.findByRole("link", { name: "Herb spiral" })).toBeVisible()
  })
})

describe("a garden's page", () => {
  it("loads the saved plan into the editor", async () => {
    const plan = { ...emptyPlan(), widthCm: 800 }
    backend = fakeBackend([{ ...TOMATOES, plan }])
    open(`/gardens/${TOMATOES.id}`)
    await screen.findByRole("textbox", { name: "Garden name" })
    expect(editorStore.getState().plan).toEqual(plan)
  })

  it("saves the plan shortly after it changes", async () => {
    open(`/gardens/${TOMATOES.id}`)
    await screen.findByRole("textbox", { name: "Garden name" })
    editorStore.getState().addBed({ x: 0, y: 0, w: 100, h: 200 })

    await waitFor(() => expect(backend.rows.get(TOMATOES.id)?.plan.beds).toHaveLength(1))
    expect(await screen.findByText("Saved")).toBeVisible()
  })

  it("saves a new name", async () => {
    open(`/gardens/${TOMATOES.id}`)
    const name = await screen.findByRole("textbox", { name: "Garden name" })
    await userEvent.clear(name)
    await userEvent.type(name, "Allotment")
    await waitFor(() => expect(backend.rows.get(TOMATOES.id)?.name).toBe("Allotment"))
  })

  it("does not save an empty name", async () => {
    open(`/gardens/${TOMATOES.id}`)
    const name = await screen.findByRole("textbox", { name: "Garden name" })
    await userEvent.clear(name)
    await userEvent.tab()
    expect(name).toHaveValue("Tomato patch")
    expect(backend.rows.get(TOMATOES.id)?.name).toBe("Tomato patch")
  })

  it("stops saving and offers a reload when the garden changed elsewhere", async () => {
    open(`/gardens/${TOMATOES.id}`)
    await screen.findByRole("textbox", { name: "Garden name" })
    // Another tab saves first.
    await backend.gardens.save(TOMATOES.id, 1, { name: "Renamed elsewhere" })
    editorStore.getState().addBed({ x: 0, y: 0, w: 100, h: 200 })

    expect(await screen.findByRole("alert")).toHaveTextContent(/changed somewhere else/)
    await userEvent.click(screen.getByRole("button", { name: "Reload" }))
    await waitFor(() =>
      expect(screen.getByRole("textbox", { name: "Garden name" })).toHaveValue("Renamed elsewhere")
    )
    expect(screen.queryByRole("alert")).toBeNull()
  })

  it("offers to try again when a save fails", async () => {
    open(`/gardens/${TOMATOES.id}`)
    await screen.findByRole("textbox", { name: "Garden name" })
    backend.failNextSave(new Error("offline"))
    editorStore.getState().addBed({ x: 0, y: 0, w: 100, h: 200 })

    await userEvent.click(await screen.findByRole("button", { name: "Try again" }))
    await waitFor(() => expect(backend.rows.get(TOMATOES.id)?.plan.beds).toHaveLength(1))
  })

  it("explains that a garden is missing and links back to the list", async () => {
    open("/gardens/99999999-9999-4999-8999-999999999999")
    expect(await screen.findByText(/does not exist/)).toBeVisible()
    expect(screen.getByRole("link", { name: "All gardens" })).toHaveAttribute("href", "/")
  })
})
