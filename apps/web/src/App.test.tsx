// @vitest-environment jsdom
import "./test/setup"
import "./i18n"
import { emptyPlan, type WeatherNow } from "@garden/core"
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

describe("the garden's weather", () => {
  const PORTO = { lat: 41.15, lon: -8.61 }
  const READING: WeatherNow = {
    tempC: 18.3,
    feelsLikeC: 17.2,
    humidityPct: 65,
    windMs: 5,
    condition: "rain",
    isDay: true,
    placeName: "Porto",
    observedAt: "2026-11-11T12:00:00.000Z",
  }

  function stubGeolocation(outcome: { latitude: number; longitude: number } | "denied") {
    const getCurrentPosition = (
      success: (position: { coords: { latitude: number; longitude: number } }) => void,
      failure: (error: { code: number }) => void
    ) => {
      if (outcome === "denied") failure({ code: 1 })
      else success({ coords: outcome })
    }
    Object.defineProperty(navigator, "geolocation", {
      configurable: true,
      value: { getCurrentPosition },
    })
  }

  beforeEach(() => {
    backend.weatherResult = READING
  })

  it("shows the current weather where the garden is", async () => {
    backend = fakeBackend([{ ...TOMATOES, location: PORTO }])
    backend.weatherResult = READING
    open(`/gardens/${TOMATOES.id}`)

    const weather = await screen.findByRole("region", { name: "Weather" })
    expect(await within(weather).findByText("18 °C")).toBeVisible()
    expect(within(weather).getByText(/Rain/)).toBeVisible()
    expect(within(weather).getByText(/Porto/)).toBeVisible()
    expect(within(weather).getByText(/18 km\/h/)).toBeVisible()
    expect(backend.weatherCalls).toEqual([PORTO])
  })

  it("asks for a location before showing any weather", async () => {
    open(`/gardens/${TOMATOES.id}`)
    const weather = await screen.findByRole("region", { name: "Weather" })
    expect(within(weather).getByText(/Set where the garden is/)).toBeVisible()
    expect(backend.weatherCalls).toEqual([])
  })

  it("saves the device's position, rounded to about a kilometre", async () => {
    stubGeolocation({ latitude: 41.14961, longitude: -8.61099 })
    open(`/gardens/${TOMATOES.id}`)
    await userEvent.click(await screen.findByRole("button", { name: "Use my location" }))

    await waitFor(() => expect(backend.rows.get(TOMATOES.id)?.location).toEqual(PORTO))
    expect(await screen.findByText("18 °C")).toBeVisible()
  })

  it("falls back to typed coordinates when the position is refused", async () => {
    stubGeolocation("denied")
    open(`/gardens/${TOMATOES.id}`)
    await userEvent.click(await screen.findByRole("button", { name: "Use my location" }))
    expect(await screen.findByText(/could not be read/)).toBeVisible()

    await userEvent.type(screen.getByRole("textbox", { name: "Latitude" }), "41.15")
    await userEvent.type(screen.getByRole("textbox", { name: "Longitude" }), "-8,61")
    await userEvent.click(screen.getByRole("button", { name: "Set location" }))
    await waitFor(() => expect(backend.rows.get(TOMATOES.id)?.location).toEqual(PORTO))
  })

  it("refuses coordinates that are not on the globe", async () => {
    open(`/gardens/${TOMATOES.id}`)
    await userEvent.type(await screen.findByRole("textbox", { name: "Latitude" }), "141")
    await userEvent.type(screen.getByRole("textbox", { name: "Longitude" }), "8")
    await userEvent.click(screen.getByRole("button", { name: "Set location" }))

    expect(await screen.findByText(/between -90 and 90/)).toBeVisible()
    expect(backend.weatherCalls).toEqual([])
  })

  it("removes the location", async () => {
    backend = fakeBackend([{ ...TOMATOES, location: PORTO }])
    backend.weatherResult = READING
    open(`/gardens/${TOMATOES.id}`)
    await userEvent.click(await screen.findByRole("button", { name: "Remove location" }))

    await waitFor(() => expect(backend.rows.get(TOMATOES.id)?.location).toBeNull())
    expect(screen.getByRole("button", { name: "Use my location" })).toBeVisible()
  })

  it("says so when the weather is unavailable", async () => {
    backend = fakeBackend([{ ...TOMATOES, location: PORTO }])
    backend.weatherResult = new Error("502")
    open(`/gardens/${TOMATOES.id}`)
    const weather = await screen.findByRole("region", { name: "Weather" })
    expect(await within(weather).findByText(/not available right now/)).toBeVisible()
  })
})

describe("the garden's calendar", () => {
  const plan = {
    ...emptyPlan(),
    plantings: [
      {
        id: "33333333-3333-4333-8333-333333333333",
        plantId: "tomato",
        rect: { x: 0, y: 0, w: 100, h: 100 },
        layout: "block" as const,
        inGround: {
          from: `${new Date().getFullYear()}-05-01`,
          to: `${new Date().getFullYear()}-09-30`,
        },
      },
    ],
  }

  beforeEach(() => {
    backend = fakeBackend([{ ...TOMATOES, plan }])
  })

  it("switches between the plan and the calendar", async () => {
    const history = open(`/gardens/${TOMATOES.id}`)
    await userEvent.click(await screen.findByRole("link", { name: "Calendar" }))

    expect(await screen.findByRole("button", { name: /^Tomato × 4: / })).toBeVisible()
    expect(history.location.search).toBe("?view=calendar")
    expect(screen.queryByTestId("garden-canvas")).toBeNull()

    await userEvent.click(screen.getByRole("link", { name: "Plan" }))
    expect(await screen.findByTestId("garden-canvas")).toBeVisible()
    expect(history.location.search).toBe("")
  })

  it("opens straight on the calendar from its address", async () => {
    open(`/gardens/${TOMATOES.id}?view=calendar`)
    expect(await screen.findByRole("button", { name: /^Tomato × 4: / })).toBeVisible()
    expect(screen.getByRole("link", { name: "Calendar" })).toHaveAttribute("aria-current", "page")
    expect(screen.getByRole("link", { name: "Plan" })).not.toHaveAttribute("aria-current")
  })

  it("goes to the plan with the planting selected when its line is clicked", async () => {
    open(`/gardens/${TOMATOES.id}?view=calendar`)
    await userEvent.click(await screen.findByRole("button", { name: /^Tomato × 4: / }))

    expect(await screen.findByTestId("garden-canvas")).toBeVisible()
    expect(editorStore.getState().selection).toEqual({
      kind: "planting",
      id: "33333333-3333-4333-8333-333333333333",
    })
  })

  it("keeps unsaved edits when switching views", async () => {
    open(`/gardens/${TOMATOES.id}`)
    await screen.findByRole("textbox", { name: "Garden name" })
    editorStore.getState().addBed({ x: 0, y: 0, w: 100, h: 200 })
    await userEvent.click(screen.getByRole("link", { name: "Calendar" }))
    await userEvent.click(await screen.findByRole("link", { name: "Plan" }))

    expect(editorStore.getState().plan.beds).toHaveLength(1)
    await waitFor(() => expect(backend.rows.get(TOMATOES.id)?.plan.beds).toHaveLength(1))
  })
})
