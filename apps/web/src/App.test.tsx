// @vitest-environment jsdom
import "./test/setup"
import "./i18n"
import { emptyPlan, type Forecast, gardenFile, type WeatherNow } from "@leira/core"
import { createMemoryHistory } from "@tanstack/react-router"
import { act, cleanup, render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
// The instance "./i18n" sets up, to put the language back after a test changes it.
import i18n from "i18next"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { App } from "./App"
import { editorStore } from "./editor/store"
import { downloadText } from "./export/downloadFile"
import { downloadPng } from "./export/downloadImage"
import type { Garden } from "./lib/gardens"
import { type FakeBackend, fakeBackend } from "./test/fakeBackend"

// jsdom cannot hand a file to the user.
vi.mock("./export/downloadFile", () => ({ downloadText: vi.fn(), saveBlob: vi.fn() }))

// Turning a picture into a PNG needs a real canvas too.
vi.mock("./export/downloadImage", () => ({ downloadPng: vi.fn(async () => {}) }))

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
  render(
    <App
      connect={connect}
      publicBackend={backend.publicBackend}
      history={history}
      autosaveDelayMs={10}
    />
  )
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
    open("/gardens")
    const links = await screen.findAllByRole("link", { name: /Tomato patch|Herb spiral/ })
    expect(links.map((link) => link.textContent)).toEqual(["Herb spiral", "Tomato patch"])
  })

  describe("with something planted", () => {
    const PLANTED: Garden = {
      ...TOMATOES,
      location: { lat: 41.15, lon: -8.61, name: "Porto" },
      plan: {
        ...emptyPlan(),
        plantings: [
          {
            id: "55555555-5555-4555-8555-555555555555",
            plantId: "tomato",
            rect: { x: 0, y: 0, w: 100, h: 100 },
            layout: "block",
            inGround: { from: "2026-05-01", to: "2026-09-30" },
          },
        ],
      },
    }

    beforeEach(() => {
      backend = fakeBackend([PLANTED, HERBS])
    })

    it("shows a small picture of each garden's plan, without words", async () => {
      open("/gardens")
      await screen.findByRole("link", { name: "Tomato patch" })
      const pictures = screen.getAllByRole("img", { hidden: true })
      expect(pictures).toHaveLength(2)
      // Most recently changed first: the herbs, with nothing planted, then the tomatoes.
      expect(pictures.map((picture) => picture.querySelectorAll("[data-planting]").length)).toEqual(
        [0, 1]
      )
      expect(pictures.flatMap((picture) => [...picture.querySelectorAll("text")])).toEqual([])
    })

    it("keeps the pictures out of the way of a screen reader, which has the names", async () => {
      open("/gardens")
      await screen.findByRole("link", { name: "Tomato patch" })
      expect(screen.queryAllByRole("img")).toEqual([])
      expect(screen.getAllByRole("link", { name: /Tomato patch|Herb spiral/ })).toHaveLength(2)
    })

    it("duplicates a garden with its plan and location, and lists the copy first", async () => {
      open("/gardens")
      await userEvent.click(await screen.findByRole("button", { name: "Duplicate Tomato patch" }))

      const links = await screen.findAllByRole("link", { name: /Tomato patch|Herb spiral/ })
      expect(links.map((link) => link.textContent)).toEqual([
        "Tomato patch (copy)",
        "Herb spiral",
        "Tomato patch",
      ])
      const copy = [...backend.rows.values()].find((row) => row.name === "Tomato patch (copy)")
      expect(copy).toMatchObject({ plan: PLANTED.plan, location: PLANTED.location, version: 1 })
      expect(copy?.id).not.toBe(PLANTED.id)
    })

    it("starts the copy with nothing recorded: no marks, harvests or notes", async () => {
      const [planting] = PLANTED.plan.plantings
      backend = fakeBackend([
        {
          ...PLANTED,
          plan: {
            ...PLANTED.plan,
            notes: "The well ran dry in July.",
            plantings: [
              {
                ...planting!,
                planted: true,
                harvests: [{ date: "2026-07-12", quantity: 1.2, unit: "kg" }],
                notes: "Blight in August.",
              },
            ],
          },
        },
      ])
      open("/gardens")
      await userEvent.click(await screen.findByRole("button", { name: "Duplicate Tomato patch" }))

      await screen.findByRole("link", { name: "Tomato patch (copy)" })
      const copy = [...backend.rows.values()].find((row) => row.name === "Tomato patch (copy)")
      expect(copy?.plan).toEqual(PLANTED.plan)
    })

    it("says so when a garden could not be duplicated", async () => {
      backend.gardens.create = async () => {
        throw new Error("503")
      }
      open("/gardens")
      await userEvent.click(await screen.findByRole("button", { name: "Duplicate Tomato patch" }))
      expect(await screen.findByRole("alert")).toHaveTextContent("could not be duplicated")
    })
  })

  it("invites the user to create a garden when there are none", async () => {
    backend = fakeBackend()
    open("/gardens")
    expect(await screen.findByText(/You have no gardens yet/)).toBeVisible()
  })

  it("offers an example to a user with no gardens, and opens it in the editor", async () => {
    backend = fakeBackend()
    const history = open("/gardens")
    await userEvent.click(await screen.findByRole("button", { name: "See an example" }))

    expect(await screen.findByRole("textbox", { name: "Garden name" })).toHaveValue(
      "Example garden"
    )
    const [created] = [...backend.rows.values()]
    expect(history.location.pathname).toBe(`/gardens/${created?.id}`)
    expect(created?.plan.beds).toHaveLength(2)
    // The example is there to show the advice at work.
    expect(await screen.findByRole("region", { name: "Crop rotation" })).toBeVisible()
    expect(screen.getByRole("region", { name: "Companion planting" })).toBeVisible()
  })

  it("does not offer the example to a user who already has gardens", async () => {
    open("/gardens")
    await screen.findAllByRole("link", { name: /Tomato patch|Herb spiral/ })
    expect(screen.queryByRole("button", { name: "See an example" })).toBeNull()
  })

  it("says so when the example could not be created", async () => {
    backend = fakeBackend()
    backend.gardens.create = async () => {
      throw new Error("503")
    }
    open("/gardens")
    await userEvent.click(await screen.findByRole("button", { name: "See an example" }))
    expect(await screen.findByRole("alert")).toHaveTextContent("could not be created")
  })

  it("creates a garden and opens it in the editor", async () => {
    backend = fakeBackend()
    const history = open("/gardens")
    await userEvent.click(await screen.findByRole("button", { name: "New garden" }))

    expect(await screen.findByRole("textbox", { name: "Garden name" })).toHaveValue("My garden")
    const [created] = [...backend.rows.values()]
    expect(history.location.pathname).toBe(`/gardens/${created?.id}`)
  })

  describe("deleting a garden", () => {
    const PICKED: Garden = {
      ...TOMATOES,
      location: { lat: 41.55, lon: -8.42, name: "Braga" },
      plan: {
        ...emptyPlan(),
        notes: "Dry year.",
        plantings: [
          {
            id: "p1",
            plantId: "tomato",
            rect: { x: 0, y: 0, w: 100, h: 100 },
            layout: "block",
            inGround: { from: "2026-05-01", to: "2026-09-30" },
            harvests: [{ date: "2026-08-01" }, { date: "2026-08-15" }],
          },
          {
            id: "p2",
            plantId: "lettuce",
            rect: { x: 100, y: 0, w: 100, h: 100 },
            layout: "block",
            inGround: { from: "2026-04-01", to: "2026-06-30" },
          },
        ],
      },
    }
    const row = async () =>
      (await screen.findByRole("link", { name: "Tomato patch" })).closest("li") as HTMLElement
    const askToDelete = async () => {
      await userEvent.click(
        within(await row()).getByRole("button", { name: "Delete Tomato patch" })
      )
    }

    beforeEach(() => {
      backend = fakeBackend([PICKED, HERBS])
    })

    it("asks in place, saying what goes with the garden", async () => {
      open("/gardens")
      await askToDelete()
      const item = await row()
      expect(item).toHaveTextContent("Delete “Tomato patch”?")
      expect(item).toHaveTextContent(
        "With it you lose 2 plantings, 2 recorded harvests and its notes."
      )
      expect(item).toHaveTextContent("This cannot be undone.")
      // The safe answer is the one under the finger.
      expect(within(item).getByRole("button", { name: "Cancel" })).toHaveFocus()
      expect(backend.rows.has(TOMATOES.id)).toBe(true)
    })

    it("says only that it cannot be undone when nothing is planted", async () => {
      backend = fakeBackend([TOMATOES, HERBS])
      open("/gardens")
      await askToDelete()
      expect(await row()).not.toHaveTextContent("With it you lose")
      expect(await row()).toHaveTextContent("This cannot be undone.")
    })

    it("deletes the garden once the user says so", async () => {
      open("/gardens")
      await askToDelete()
      await userEvent.click(within(await row()).getByRole("button", { name: "Delete for good" }))
      await waitFor(() => expect(screen.queryByRole("link", { name: "Tomato patch" })).toBeNull())
      expect(backend.rows.has(TOMATOES.id)).toBe(false)
      expect(screen.getByRole("link", { name: "Herb spiral" })).toBeVisible()
    })

    it("keeps the garden when the user cancels, and gives the focus back", async () => {
      open("/gardens")
      await askToDelete()
      await userEvent.click(within(await row()).getByRole("button", { name: "Cancel" }))
      const button = within(await row()).getByRole("button", { name: "Delete Tomato patch" })
      expect(button).toHaveFocus()
      expect(backend.rows.has(TOMATOES.id)).toBe(true)
    })

    it("saves the whole garden to a file before it goes", async () => {
      vi.mocked(downloadText).mockClear()
      open("/gardens")
      await askToDelete()
      await userEvent.click(within(await row()).getByRole("button", { name: "Save file" }))
      await waitFor(() => expect(downloadText).toHaveBeenCalledOnce())
      const [text, , name] = vi.mocked(downloadText).mock.calls[0] ?? []
      expect(name).toBe("tomato-patch.json")
      const file = JSON.parse(text as string)
      expect(file.gardens[0].location).toEqual(PICKED.location)
      expect(file.gardens[0].plan.plantings).toHaveLength(2)
      expect(backend.rows.has(TOMATOES.id)).toBe(true)
    })

    it("asks about one garden at a time", async () => {
      open("/gardens")
      await askToDelete()
      await userEvent.click(screen.getByRole("button", { name: "Delete Herb spiral" }))
      expect(screen.getAllByRole("button", { name: "Delete for good" })).toHaveLength(1)
      expect(within(await row()).getByRole("button", { name: "Delete Tomato patch" })).toBeVisible()
    })
  })

  it("says so when the server cannot be reached, and connects on retry", async () => {
    let attempts = 0
    open("/gardens", async () => {
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

  it("pastes into one garden what was copied in another, even after leaving it", async () => {
    const BED = {
      id: "33333333-3333-4333-8333-333333333333",
      name: "Herbs",
      kind: "bed" as const,
      rect: { x: 0, y: 0, w: 100, h: 100 },
    }
    backend = fakeBackend([{ ...TOMATOES, plan: { ...emptyPlan(), beds: [BED] } }, HERBS])
    open(`/gardens/${TOMATOES.id}`)
    // The bed, in the list of beds: the crop list has a kind called "Herbs" too.
    const beds = await screen.findByRole("region", { name: "Beds" })
    await userEvent.click(within(beds).getByRole("button", { name: /^Herbs/ }))
    await userEvent.click(screen.getByRole("button", { name: "Copy" }))

    // Another garden, as in another tab: only the browser's storage remembers the copy.
    cleanup()
    editorStore.getState().setClipboard(null)
    open(`/gardens/${HERBS.id}`)
    const copied = await screen.findByRole("region", { name: "Copied" })
    await userEvent.click(within(copied).getByRole("button", { name: "Paste" }))

    await waitFor(() =>
      expect(backend.rows.get(HERBS.id)?.plan.beds).toEqual([{ ...BED, id: expect.any(String) }])
    )
    localStorage.removeItem("leira.clipboard")
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

  it("says it will try again by itself, and saves when the network comes back", async () => {
    open(`/gardens/${TOMATOES.id}`)
    await screen.findByRole("textbox", { name: "Garden name" })
    backend.failNextSave(new Error("offline"))
    editorStore.getState().addBed({ x: 0, y: 0, w: 100, h: 200 })

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Not saved yet. Trying again as soon as there is a connection."
    )
    act(() => {
      window.dispatchEvent(new Event("online"))
    })
    await waitFor(() => expect(backend.rows.get(TOMATOES.id)?.plan.beds).toHaveLength(1))
    expect(await screen.findByText("Saved")).toBeVisible()
  })

  it("tries again at once when the page is shown again", async () => {
    open(`/gardens/${TOMATOES.id}`)
    await screen.findByRole("textbox", { name: "Garden name" })
    backend.failNextSave(new Error("offline"))
    editorStore.getState().addBed({ x: 0, y: 0, w: 100, h: 200 })
    await screen.findByRole("alert")

    // The phone back out of a pocket: the page was hidden and is visible again.
    act(() => {
      document.dispatchEvent(new Event("visibilitychange"))
    })
    await waitFor(() => expect(backend.rows.get(TOMATOES.id)?.plan.beds).toHaveLength(1))
  })

  /** Whether leaving the page now would ask first, as the browser decides from the event. */
  function leavingAsks(): boolean {
    const leaving = new Event("beforeunload", { cancelable: true })
    window.dispatchEvent(leaving)
    return leaving.defaultPrevented
  }

  it("asks before the page is left with a change not saved yet", async () => {
    open(`/gardens/${TOMATOES.id}`)
    await screen.findByRole("textbox", { name: "Garden name" })
    expect(leavingAsks()).toBe(false)

    backend.failNextSave(new Error("offline"))
    act(() => {
      editorStore.getState().addBed({ x: 0, y: 0, w: 100, h: 200 })
    })
    await screen.findByRole("button", { name: "Try again" })
    expect(leavingAsks()).toBe(true)

    await userEvent.click(screen.getByRole("button", { name: "Try again" }))
    expect(await screen.findByText("Saved")).toBeVisible()
    expect(leavingAsks()).toBe(false)
  })

  it("explains that a garden is missing and links back to the list", async () => {
    open("/gardens/99999999-9999-4999-8999-999999999999")
    expect(await screen.findByText(/does not exist/)).toBeVisible()
    expect(screen.getByRole("link", { name: "All gardens" })).toHaveAttribute("href", "/gardens")
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

  describe("found by the name of its town", () => {
    const BRAGA = [
      {
        name: "Braga",
        area: "Braga",
        region: "Distrito de Braga",
        country: "PT",
        lat: 41.5510583,
        lon: -8.4280045,
      },
      { name: "Braga", region: "Rio Grande do Sul", country: "BR", lat: -29.3, lon: -53.7 },
    ]
    const ARCOZELO = [
      {
        name: "Arcozelo",
        area: "Vila Nova de Gaia",
        region: "Distrito do Porto",
        country: "PT",
        lat: 41.06187,
        lon: -8.63192,
      },
      {
        name: "Arcozelo",
        area: "Ponte de Lima",
        region: "Distrito de Viana do Castelo",
        country: "PT",
        lat: 41.79384,
        lon: -8.59416,
      },
    ]

    async function search(name: string) {
      open(`/gardens/${TOMATOES.id}`)
      await userEvent.type(await screen.findByRole("searchbox", { name: "Town or city" }), name)
      await userEvent.click(screen.getByRole("button", { name: "Search" }))
    }

    const foundNames = async () =>
      within(await screen.findByRole("list", { name: "Places found" }))
        .getAllByRole("button")
        .map((place) => place.textContent)

    it("lists the places with that name, telling them apart", async () => {
      backend.placesResult = BRAGA
      await search("Braga")
      // The municipality only when it is not the place itself.
      expect(await foundNames()).toEqual([
        "Braga, Distrito de Braga, PT",
        "Braga, Rio Grande do Sul, BR",
      ])
      expect(backend.placeQueries).toEqual([["Braga", "en"]])
    })

    it("tells apart villages of one name by their municipality", async () => {
      backend.placesResult = ARCOZELO
      await search("Arcozelo")
      expect(await foundNames()).toEqual([
        "Arcozelo, Vila Nova de Gaia, Distrito do Porto, PT",
        "Arcozelo, Ponte de Lima, Distrito de Viana do Castelo, PT",
      ])
    })

    // In English the geocoder writes "Sintra Municipality" for the concelho of Sintra.
    it("leaves out a municipality named after the place itself, in English too", async () => {
      backend.placesResult = [
        {
          name: "Sintra",
          area: "Sintra Municipality",
          region: "Lisbon District",
          country: "PT",
          lat: 38.8,
          lon: -9.38,
        },
        {
          name: "Funchal",
          area: "Sintra Municipality",
          region: "Lisbon District",
          country: "PT",
          lat: 38.79,
          lon: -9.4,
        },
      ]
      await search("Sintra")
      expect(await foundNames()).toEqual([
        "Sintra, Lisbon District, PT",
        "Funchal, Sintra Municipality, Lisbon District, PT",
      ])
    })

    it("credits where the places come from, next to them", async () => {
      backend.placesResult = BRAGA
      await search("Braga")
      await screen.findByRole("list", { name: "Places found" })
      expect(screen.getByRole("link", { name: "GeoNames" })).toHaveAttribute(
        "href",
        "https://www.geonames.org/"
      )
    })

    it("asks for the places in the app's language", async () => {
      backend.placesResult = BRAGA
      await i18n.changeLanguage("pt")
      try {
        open(`/gardens/${TOMATOES.id}`)
        await userEvent.type(
          await screen.findByRole("searchbox", { name: "Vila ou cidade" }),
          "Braga"
        )
        await userEvent.click(screen.getByRole("button", { name: "Procurar" }))
        await screen.findByRole("list", { name: "Sítios encontrados" })
        expect(backend.placeQueries).toEqual([["Braga", "pt"]])
      } finally {
        await i18n.changeLanguage("en")
      }
    })

    it("saves the chosen place, rounded to about a kilometre, under its name", async () => {
      backend.placesResult = BRAGA
      await search("Braga")
      await userEvent.click(
        await screen.findByRole("button", { name: "Braga, Distrito de Braga, PT" })
      )

      await waitFor(() =>
        expect(backend.rows.get(TOMATOES.id)?.location).toEqual({
          lat: 41.55,
          lon: -8.43,
          name: "Braga",
        })
      )
      // The reading comes from the nearest weather station, which is named after its own place.
      const weather = screen.getByRole("region", { name: "Weather" })
      expect(await within(weather).findByText(/Braga/)).toBeVisible()
      expect(within(weather).queryByText(/Porto/)).toBeNull()
    })

    it("says so when no place has that name", async () => {
      backend.placesResult = []
      await search("Xyzzy")
      expect(await screen.findByText(/No place called “Xyzzy” was found/)).toBeVisible()
    })

    it("does not search for a single letter", async () => {
      open(`/gardens/${TOMATOES.id}`)
      await userEvent.type(await screen.findByRole("searchbox", { name: "Town or city" }), "B")
      expect(screen.getByRole("button", { name: "Search" })).toBeDisabled()
    })

    it("says so when the search fails, and still takes typed coordinates", async () => {
      backend.placesResult = new Error("502")
      await search("Braga")
      expect(await screen.findByText(/search is not available/)).toBeVisible()

      await userEvent.type(screen.getByRole("textbox", { name: "Latitude" }), "41.15")
      await userEvent.type(screen.getByRole("textbox", { name: "Longitude" }), "-8.61")
      await userEvent.click(screen.getByRole("button", { name: "Set location" }))
      await waitFor(() => expect(backend.rows.get(TOMATOES.id)?.location).toEqual(PORTO))
    })
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

describe("the account", () => {
  const openPanel = async () =>
    userEvent.click(await screen.findByRole("button", { name: "Keep your gardens" }))

  // The panel opens downwards from the button. Last in the header, and at the
  // foot of the narrow screen's menu, it has nothing under it to cover.
  it("comes last in the header, after the language", async () => {
    open(`/gardens/${TOMATOES.id}`)
    // The garden's own header, not the one shown while it loads.
    await screen.findByRole("textbox", { name: "Garden name" })
    const account = await screen.findByRole("button", { name: "Keep your gardens" })
    const language = screen.getByRole("combobox", { name: "Language" })
    expect(language.compareDocumentPosition(account)).toBe(Node.DOCUMENT_POSITION_FOLLOWING)
  })

  it("tells a guest how to keep their gardens and emails them a link", async () => {
    open("/gardens")
    await openPanel()
    expect(screen.getByText(/only exist in this browser/)).toBeVisible()

    await userEvent.type(screen.getByRole("textbox", { name: "Email" }), "ana@example.com")
    await userEvent.click(screen.getByRole("button", { name: "Send link" }))

    expect(await screen.findByText(/We sent a link to ana@example.com/)).toBeVisible()
    expect(backend.linkRequests).toEqual(["ana@example.com"])
  })

  it("asks for a real address before sending anything", async () => {
    open("/gardens")
    await openPanel()
    await userEvent.type(screen.getByRole("textbox", { name: "Email" }), "ana@")
    await userEvent.click(screen.getByRole("button", { name: "Send link" }))

    expect(await screen.findByRole("alert")).toHaveTextContent("Enter a valid email address.")
    expect(backend.linkRequests).toEqual([])
  })

  it("says so when the link could not be sent, and lets the user try again", async () => {
    backend.failNextLink()
    open("/gardens")
    await openPanel()
    await userEvent.type(screen.getByRole("textbox", { name: "Email" }), "ana@example.com")
    await userEvent.click(screen.getByRole("button", { name: "Send link" }))
    expect(await screen.findByRole("alert")).toHaveTextContent(/could not be sent/)

    await userEvent.click(screen.getByRole("button", { name: "Send link" }))
    expect(await screen.findByText(/We sent a link to ana@example.com/)).toBeVisible()
  })

  it("sends a guest to Google to keep their gardens", async () => {
    open("/gardens")
    await openPanel()
    await userEvent.click(screen.getByRole("button", { name: "Continue with Google" }))
    await waitFor(() => expect(backend.googleStarts).toBe(1))
  })

  it("says so when Google could not be reached", async () => {
    backend.failNextGoogle()
    open("/gardens")
    await openPanel()
    await userEvent.click(screen.getByRole("button", { name: "Continue with Google" }))
    expect(await screen.findByRole("alert")).toHaveTextContent(/Google/)
  })

  it("shows who is signed in and signs them out", async () => {
    backend.email = "ana@example.com"
    open("/gardens")
    await userEvent.click(await screen.findByRole("button", { name: "ana@example.com" }))
    await userEvent.click(screen.getByRole("button", { name: "Sign out" }))

    expect(await screen.findByRole("button", { name: "Keep your gardens" })).toBeVisible()
    expect(backend.email).toBeNull()
  })

  it("leaves the gardens behind when signing out", async () => {
    backend.email = "ana@example.com"
    const history = open(`/gardens/${TOMATOES.id}`)
    await screen.findByRole("textbox", { name: "Garden name" })
    await userEvent.click(screen.getByRole("button", { name: "ana@example.com" }))
    await userEvent.click(screen.getByRole("button", { name: "Sign out" }))

    // Signed out, the visitor is a new guest, who owns nothing yet.
    expect(await screen.findByText(/You have no gardens yet/)).toBeVisible()
    expect(history.location.pathname).toBe("/gardens")
  })

  it("signs out of every device when asked to", async () => {
    backend.email = "ana@example.com"
    open("/gardens")
    await userEvent.click(await screen.findByRole("button", { name: "ana@example.com" }))
    await userEvent.click(screen.getByRole("button", { name: "Sign out on every device" }))

    expect(await screen.findByRole("button", { name: "Keep your gardens" })).toBeVisible()
    expect(backend.signedOutEverywhere).toBe(1)
  })

  it("says so when another tab or device signed this browser out, and saves nothing more", async () => {
    backend.email = "ana@example.com"
    open(`/gardens/${TOMATOES.id}`)
    await screen.findByRole("textbox", { name: "Garden name" })

    act(() => backend.endSessionElsewhere("signedOut"))
    expect(
      await screen.findByText(/You were signed out, in another tab or on another device/)
    ).toBeVisible()
    expect(screen.queryByRole("textbox", { name: "Garden name" })).toBeNull()
    // A page load of its own, so whoever is signed in now starts afresh.
    expect(screen.getByRole("link", { name: "Open your gardens" })).toHaveAttribute(
      "href",
      "/gardens"
    )
  })

  it("says so when another tab signed this browser in to another account", async () => {
    open("/gardens")
    await screen.findByRole("button", { name: "Keep your gardens" })
    act(() => backend.endSessionElsewhere("switched"))
    expect(
      await screen.findByText(/This browser was signed in to another account, in another tab/)
    ).toBeVisible()
  })

  it("notices a link opened in another tab when the user comes back", async () => {
    open("/gardens")
    await screen.findByRole("button", { name: "Keep your gardens" })

    backend.email = "ana@example.com"
    window.dispatchEvent(new Event("visibilitychange"))

    expect(await screen.findByRole("button", { name: "ana@example.com" })).toBeVisible()
  })

  it("lets anyone download everything kept about them", async () => {
    vi.useFakeTimers({ now: new Date("2026-11-17T10:00:00Z"), toFake: ["Date"] })
    try {
      open("/gardens")
      await openPanel()
      await userEvent.click(screen.getByRole("button", { name: "Download my data" }))
      await waitFor(() => expect(downloadText).toHaveBeenCalledTimes(1))
      const [text, type, name] = vi.mocked(downloadText).mock.calls[0] ?? []
      expect(type).toBe("application/json")
      expect(name).toBe("leira-data-2026-11-17.json")
      expect(JSON.parse(text ?? "").gardens.map((garden: { name: string }) => garden.name)).toEqual(
        ["Tomato patch", "Herb spiral"]
      )
    } finally {
      vi.useRealTimers()
      vi.mocked(downloadText).mockClear()
    }
  })

  it("says so when the data could not be downloaded", async () => {
    backend.failNextExport()
    open("/gardens")
    await openPanel()
    await userEvent.click(screen.getByRole("button", { name: "Download my data" }))
    expect(await screen.findByRole("alert")).toHaveTextContent("Your data could not be downloaded.")
  })

  it("deletes a guest at once, only once they confirm, and starts over as a new guest", async () => {
    const history = open(`/gardens/${TOMATOES.id}`)
    await screen.findByRole("textbox", { name: "Garden name" })
    await openPanel()
    await userEvent.click(screen.getByRole("button", { name: "Delete account" }))

    expect(screen.getByText(/cannot be undone/)).toBeVisible()
    expect(backend.deletedAccounts).toBe(0)
    await userEvent.click(screen.getByRole("button", { name: "Delete for good" }))

    expect(await screen.findByText(/You have no gardens yet/)).toBeVisible()
    expect(history.location.pathname).toBe("/gardens")
    expect(backend.deletedAccounts).toBe(1)
    expect(backend.pendingDeletion).toBeNull()
    expect(screen.queryByText(/will be deleted/)).toBeNull()
    expect(screen.getByRole("button", { name: "Keep your gardens" })).toBeVisible()
  })

  it("deletes an account 30 days after it asks, and tells the new guest left behind when", async () => {
    vi.useFakeTimers({ now: new Date("2026-11-17T10:00:00Z"), toFake: ["Date"] })
    try {
      backend.email = "ana@example.com"
      const history = open(`/gardens/${TOMATOES.id}`)
      await screen.findByRole("textbox", { name: "Garden name" })
      await userEvent.click(screen.getByRole("button", { name: "ana@example.com" }))
      await userEvent.click(screen.getByRole("button", { name: "Delete account" }))

      expect(screen.getByText(/will be deleted on December 17, 2026/)).toHaveTextContent(
        /sign in again before then/
      )
      expect(backend.pendingDeletion).toBeNull()
      await userEvent.click(screen.getByRole("button", { name: "Delete my account" }))

      expect(await screen.findByText(/You have no gardens yet/)).toBeVisible()
      expect(history.location.pathname).toBe("/gardens")
      expect(
        screen.getByText(
          "Your account will be deleted on December 17, 2026. To keep it, sign in again before then."
        )
      ).toBeVisible()
      expect(screen.getByRole("button", { name: "Keep your gardens" })).toBeVisible()
      expect(backend.pendingDeletion).toEqual(new Date("2026-12-17T10:00:00Z"))
      expect(backend.deletedAccounts).toBe(0)

      await userEvent.click(screen.getByRole("button", { name: "Close" }))
      expect(screen.queryByText(/will be deleted/)).toBeNull()
    } finally {
      vi.useRealTimers()
    }
  })

  it("tells an account that signing in again kept it from being deleted", async () => {
    backend.email = "ana@example.com"
    backend.pendingDeletion = new Date("2026-12-17T10:00:00Z")
    open("/gardens", () => backend.connect())

    expect(
      await screen.findByText(
        "Your account was going to be deleted on December 17, 2026. Since you signed in again, it stays."
      )
    ).toBeVisible()
    expect(backend.pendingDeletion).toBeNull()
    expect(await screen.findAllByRole("link", { name: /Tomato patch|Herb spiral/ })).toHaveLength(2)

    await userEvent.click(screen.getByRole("button", { name: "Close" }))
    expect(screen.queryByText(/was going to be deleted/)).toBeNull()
  })

  it("tells an account what came along from the guest it was in this browser", async () => {
    backend.email = "ana@example.com"
    backend.handedOver = { gardens: 2, templates: 1 }
    open("/gardens", () => backend.connect())

    expect(
      await screen.findByText(
        "Added 2 gardens and 1 template you had in this browser as a guest to your account."
      )
    ).toBeVisible()
    await userEvent.click(screen.getByRole("button", { name: "Close" }))
    expect(screen.queryByText(/as a guest to your account/)).toBeNull()
  })

  it("says nothing of a guest who had nothing to bring along", async () => {
    backend.email = "ana@example.com"
    backend.handedOver = { gardens: 0, templates: 0 }
    open("/gardens", () => backend.connect())

    expect(await screen.findAllByRole("link", { name: /Tomato patch|Herb spiral/ })).toHaveLength(2)
    expect(screen.queryByText(/as a guest to your account/)).toBeNull()
  })

  it("says so when an account could not ask to be deleted, and keeps everything", async () => {
    backend.email = "ana@example.com"
    backend.failNextDelete()
    open("/gardens")
    await userEvent.click(await screen.findByRole("button", { name: "ana@example.com" }))
    await userEvent.click(screen.getByRole("button", { name: "Delete account" }))
    await userEvent.click(screen.getByRole("button", { name: "Delete my account" }))

    expect(await screen.findByRole("alert")).toHaveTextContent("Your account could not be deleted.")
    expect(backend.email).toBe("ana@example.com")
    expect(backend.pendingDeletion).toBeNull()
    expect(backend.rows.size).toBe(2)
  })

  it("keeps the account when the user changes their mind", async () => {
    open("/gardens")
    await openPanel()
    await userEvent.click(screen.getByRole("button", { name: "Delete account" }))
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }))

    expect(screen.getByRole("button", { name: "Delete account" })).toBeVisible()
    expect(backend.deletedAccounts).toBe(0)
    expect(backend.rows.size).toBe(2)
  })

  it("says so when the account could not be deleted, and keeps everything", async () => {
    backend.failNextDelete()
    open("/gardens")
    await openPanel()
    await userEvent.click(screen.getByRole("button", { name: "Delete account" }))
    await userEvent.click(screen.getByRole("button", { name: "Delete for good" }))

    expect(await screen.findByRole("alert")).toHaveTextContent("Your account could not be deleted.")
    expect(backend.rows.size).toBe(2)
  })

  it("closes the panel on Escape", async () => {
    open("/gardens")
    await openPanel()
    await userEvent.keyboard("{Escape}")
    expect(screen.queryByRole("textbox", { name: "Email" })).toBeNull()
  })
})

describe("taking the plan out of the app", () => {
  const plan = {
    ...emptyPlan(),
    plantings: [
      {
        id: "55555555-5555-4555-8555-555555555555",
        plantId: "tomato",
        rect: { x: 0, y: 0, w: 100, h: 100 },
        layout: "block" as const,
        inGround: { from: "2026-05-01", to: "2026-09-30" },
      },
    ],
  }

  beforeEach(() => {
    backend = fakeBackend([{ ...TOMATOES, plan }])
    vi.mocked(downloadPng).mockClear()
  })

  it("saves a picture of the plan, named after the garden", async () => {
    open(`/gardens/${TOMATOES.id}`)
    await userEvent.click(await screen.findByRole("button", { name: "Save image" }))

    expect(downloadPng).toHaveBeenCalledOnce()
    const [markup, size, fileName] = vi.mocked(downloadPng).mock.calls[0]!
    expect(markup).toMatch(/^<svg /)
    expect(markup).toContain("Tomato × 4")
    // A 6 m by 4 m garden plus its margin, at a fixed number of pixels per centimetre.
    expect(size.width / size.height).toBeCloseTo(640 / 440)
    expect(fileName).toBe("tomato-patch.png")
  })

  it("saves the garden as a file to import again, with everything recorded in it", async () => {
    const recorded = { ...plan, notes: "The well ran dry in July." }
    const location = { lat: 41.15, lon: -8.61, name: "Porto" }
    backend = fakeBackend([{ ...TOMATOES, plan: recorded, location }])
    vi.mocked(downloadText).mockClear()
    vi.useFakeTimers({ now: new Date("2026-11-17T10:00:00Z"), toFake: ["Date"] })
    try {
      open(`/gardens/${TOMATOES.id}`)
      await userEvent.click(await screen.findByRole("button", { name: "Save file" }))

      expect(downloadText).toHaveBeenCalledOnce()
      const [text, type, fileName] = vi.mocked(downloadText).mock.calls[0]!
      expect(type).toBe("application/json")
      expect(fileName).toBe("tomato-patch.json")
      expect(JSON.parse(text)).toEqual({
        format: 1,
        exportedAt: "2026-11-17T10:00:00.000Z",
        gardens: [
          {
            name: "Tomato patch",
            plan: recorded,
            location,
            updatedAt: "2026-11-17T10:00:00.000Z",
          },
        ],
      })
    } finally {
      vi.useRealTimers()
    }
  })

  it("says so when the picture could not be saved", async () => {
    vi.mocked(downloadPng).mockRejectedValueOnce(new Error("canvas is tainted"))
    open(`/gardens/${TOMATOES.id}`)
    await userEvent.click(await screen.findByRole("button", { name: "Save image" }))
    expect(await screen.findByText("The image could not be saved.")).toBeVisible()
  })

  it("prints a sheet with the plan and what is planted on it", async () => {
    const print = vi.fn()
    vi.stubGlobal("print", print)
    open(`/gardens/${TOMATOES.id}`)
    await userEvent.click(await screen.findByRole("button", { name: "Print" }))
    expect(print).toHaveBeenCalledOnce()

    const sheet = screen.getByTestId("print-sheet")
    expect(within(sheet).getByRole("heading", { name: "Tomato patch" })).toBeInTheDocument()
    expect(within(sheet).getByRole("img", { name: "Tomato patch" })).toBeInTheDocument()
    const [, row] = within(sheet).getAllByRole("row")
    expect(row).toHaveTextContent("Tomato")
    expect(row).toHaveTextContent("4")
    expect(row).toHaveTextContent("May 1, 2026")
    expect(row).toHaveTextContent("Sep 30, 2026")
    vi.unstubAllGlobals()
  })
})

describe("importing a file", () => {
  const RECORDED: Garden = {
    ...TOMATOES,
    location: { lat: 41.15, lon: -8.61, name: "Porto" },
    plan: {
      ...emptyPlan(),
      notes: "The well ran dry in July.",
      plantings: [
        {
          id: "55555555-5555-4555-8555-555555555555",
          plantId: "tomato",
          rect: { x: 0, y: 0, w: 100, h: 100 },
          layout: "block",
          inGround: { from: "2026-05-01", to: "2026-09-30" },
          sowDate: "2026-03-20",
          planted: true,
          harvests: [{ date: "2026-07-12", quantity: 1.2, unit: "kg" }],
          notes: "Blight in August.",
        },
      ],
    },
  }
  const ITEMS = {
    format: 1 as const,
    beds: [
      {
        id: "44444444-4444-4444-8444-444444444444",
        name: "Herb bed",
        kind: "bed" as const,
        rect: { x: 0, y: 0, w: 200, h: 100 },
      },
    ],
    plantings: [],
  }
  const template = (name: string) => ({ name, items: ITEMS })
  const json = (file: unknown) => JSON.stringify(file)

  async function importFile(file: File | string) {
    const chosen =
      typeof file === "string" ? new File([file], "leira.json", { type: "application/json" }) : file
    await userEvent.upload(await screen.findByLabelText("Import"), chosen)
  }

  it("brings back the account's export: gardens with all they recorded, and templates", async () => {
    backend = fakeBackend([RECORDED])
    backend.shares.set(RECORDED.id, {
      token: "aaaaaaaa-aaaa-4aaa-8aaa-000000000009",
      showLocation: true,
    })
    await backend.templates.save("Herbs", ITEMS)
    vi.mocked(downloadText).mockClear()
    open("/gardens")
    await userEvent.click(await screen.findByRole("button", { name: "Keep your gardens" }))
    await userEvent.click(screen.getByRole("button", { name: "Download my data" }))
    await waitFor(() => expect(downloadText).toHaveBeenCalledOnce())
    const [exported] = vi.mocked(downloadText).mock.calls[0]!
    cleanup()

    // A new guest, in another browser, with nothing yet.
    backend = fakeBackend()
    open("/gardens")
    await importFile(exported)

    expect(await screen.findByText("Imported 1 garden and 1 template.")).toHaveAttribute(
      "role",
      "status"
    )
    expect(await screen.findByRole("link", { name: "Tomato patch" })).toBeVisible()
    const [restored] = [...backend.rows.values()]
    expect(restored).toMatchObject({ plan: RECORDED.plan, location: RECORDED.location })
    expect(backend.savedTemplates).toMatchObject([template("Herbs")])
    // The token was the server's: a link has to be made again.
    expect(backend.shares.size).toBe(0)
  })

  it("adds one garden's file as a new garden, under the same name", async () => {
    open("/gardens")
    await importFile(json(gardenFile(RECORDED, new Date())))

    expect(await screen.findByText("Imported 1 garden.")).toHaveAttribute("role", "status")
    await waitFor(() =>
      expect(screen.getAllByRole("link", { name: "Tomato patch" })).toHaveLength(2)
    )
    expect(backend.rows.size).toBe(3)
    expect(backend.rows.get(TOMATOES.id)).toEqual(TOMATOES)
    const copy = [...backend.rows.values()].find(
      (row) => row.name === "Tomato patch" && row.id !== TOMATOES.id
    )
    expect(copy).toMatchObject({ plan: RECORDED.plan, location: RECORDED.location, version: 1 })
  })

  it("counts what could not be read, and imports the rest", async () => {
    open("/gardens")
    await importFile(json({ format: 1, gardens: [RECORDED, { name: "Broken", plan: {} }] }))
    expect(await screen.findByText("Imported 1 garden. 1 could not be read.")).toHaveAttribute(
      "role",
      "status"
    )
    expect(backend.rows.size).toBe(3)
  })

  it.each([
    ["a file that is not an export", "not json", "This is not a file exported from Leira"],
    [
      "a file from a newer version",
      json({ format: 99, gardens: [RECORDED] }),
      "newer version of the app",
    ],
    ["a file with nothing to import", json({ format: 1, gardens: [] }), "no gardens or templates"],
  ])("refuses %s, and changes nothing", async (_, text, message) => {
    open("/gardens")
    await importFile(text)
    expect(await screen.findByRole("alert")).toHaveTextContent(message)
    expect(backend.rows.size).toBe(2)
  })

  it("refuses a file over 20 MB without reading it", async () => {
    const big = new File(["{}"], "big.json", { type: "application/json" })
    Object.defineProperty(big, "size", { value: 20 * 1024 * 1024 + 1 })
    const read = vi.spyOn(big, "text")
    open("/gardens")
    await importFile(big)
    expect(await screen.findByRole("alert")).toHaveTextContent("larger than 20 MB")
    expect(read).not.toHaveBeenCalled()
  })

  it("stops the templates at fifty, and says how many were left out", async () => {
    backend.savedTemplates = Array.from({ length: 49 }, (_, index) => ({
      id: crypto.randomUUID(),
      ...template(`T${index}`),
      createdAt: "2026-11-01T10:00:00.000Z",
    }))
    open("/gardens")
    await importFile(json({ format: 1, templates: [template("A"), template("B"), template("C")] }))

    expect(
      await screen.findByText(
        "Imported 1 template. 2 templates were left out: you can keep at most 50."
      )
    ).toHaveAttribute("role", "status")
    expect(backend.savedTemplates).toHaveLength(50)
  })

  it("stops when a save fails part way, and says how many came in", async () => {
    const create = backend.gardens.create
    let calls = 0
    backend.gardens.create = async (...args) => {
      if (calls++ === 1) throw new Error("503")
      return create(...args)
    }
    open("/gardens")
    await importFile(
      json({ format: 1, gardens: [RECORDED, RECORDED, RECORDED], templates: [template("A")] })
    )

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Imported 1 garden. Something went wrong, so the rest was not imported."
    )
    expect(backend.rows.size).toBe(3)
    expect(backend.savedTemplates).toEqual([])
    // The list shows what did come in.
    await waitFor(() =>
      expect(screen.getAllByRole("link", { name: "Tomato patch" })).toHaveLength(2)
    )
  })

  it("says so when nothing could be saved", async () => {
    backend.failNextTemplateSave()
    open("/gardens")
    await importFile(json({ format: 1, templates: [template("A")] }))
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "The file could not be imported. Try again."
    )
  })
})

describe("the garden's forecast", () => {
  const PORTO = { lat: 41.15, lon: -8.61 }
  const READING: WeatherNow = {
    tempC: 9,
    feelsLikeC: 7,
    humidityPct: 80,
    windMs: 2,
    condition: "clear",
    isDay: true,
    placeName: "Porto",
    observedAt: "2026-04-09T12:00:00.000Z",
  }
  const FORECAST: Forecast = [
    { date: "2026-04-09", minC: 6, maxC: 15, condition: "clear" },
    { date: "2026-04-10", minC: 1, maxC: 12, condition: "rain" },
    { date: "2026-04-11", minC: -1, maxC: 9, condition: "snow" },
  ]
  const TOMATO_ID = "44444444-4444-4444-8444-444444444444"
  const plan = {
    ...emptyPlan(),
    plantings: [
      {
        id: TOMATO_ID,
        plantId: "tomato",
        rect: { x: 0, y: 0, w: 100, h: 100 },
        layout: "block" as const,
        inGround: { from: "2026-04-01", to: "2026-09-30" },
      },
    ],
  }

  function openGarden(forecast: Forecast | Error, garden: Partial<Garden> = {}) {
    backend = fakeBackend([{ ...TOMATOES, location: PORTO, plan, ...garden }])
    backend.weatherResult = READING
    backend.forecastResult = forecast
    open(`/gardens/${TOMATOES.id}`)
  }

  it("lists the lows and highs of the coming days", async () => {
    openGarden(FORECAST)
    const days = await screen.findByRole("list", { name: "Next days" })
    expect(
      within(days)
        .getAllByRole("listitem")
        .map((day) => day.textContent)
    ).toEqual(["Thu6° / 15°Clear", "Fri1° / 12°Rain", "Sat-1° / 9°Snow"])
  })

  it("warns of frost on a tender crop, on the first night at risk", async () => {
    openGarden(FORECAST)
    const warning = await screen.findByRole("button", { name: /Frost/ })
    expect(warning).toHaveTextContent("Frost on Apr 10 (1 °C): protect Tomato.")

    await userEvent.click(warning)
    expect(editorStore.getState().selection).toEqual([{ kind: "planting", id: TOMATO_ID }])
  })

  it("warns of a cold night for a seedling that has just been planted out", async () => {
    const mild: Forecast = [
      { date: "2026-04-03", minC: 11, maxC: 18, condition: "clear" },
      { date: "2026-04-04", minC: 6, maxC: 15, condition: "clear" },
    ]
    openGarden(mild)
    const warning = await screen.findByRole("button", { name: /Cold night/ })
    expect(warning).toHaveTextContent(
      "Cold night on Apr 4 (6 °C): wait to plant out Tomato, or cover it."
    )

    await userEvent.click(warning)
    expect(editorStore.getState().selection).toEqual([{ kind: "planting", id: TOMATO_ID }])
  })

  it("gives the soil temperature of each day, and credits where it comes from", async () => {
    const withSoil: Forecast = [
      { ...FORECAST[0]!, soilC: 11.4 },
      { ...FORECAST[1]!, soilC: 9.6 },
      FORECAST[2]!,
    ]
    openGarden(withSoil)
    const days = await screen.findByRole("list", { name: "Next days" })
    expect(
      within(days)
        .getAllByRole("listitem")
        .map((day) => day.textContent)
    ).toEqual(["Thu6° / 15°Clearsoil 11°", "Fri1° / 12°Rainsoil 10°", "Sat-1° / 9°Snow"])
    expect(screen.getByRole("link", { name: "Open-Meteo.com" })).toHaveAttribute(
      "href",
      "https://open-meteo.com/"
    )
    expect(screen.getByRole("link", { name: "CC BY 4.0" })).toHaveAttribute(
      "href",
      "https://creativecommons.org/licenses/by/4.0/"
    )
  })

  it("credits no one when the forecast has no soil temperature", async () => {
    openGarden(FORECAST)
    await screen.findByRole("list", { name: "Next days" })
    expect(screen.queryByRole("link", { name: "Open-Meteo.com" })).toBeNull()
  })

  it("warns when the soil is too cold on the day a crop is due to be sown", async () => {
    const BEANS_ID = "55555555-5555-4555-8555-555555555555"
    const beans = {
      ...emptyPlan(),
      plantings: [
        {
          id: BEANS_ID,
          plantId: "green-bean",
          rect: { x: 0, y: 0, w: 100, h: 100 },
          layout: "row" as const,
          inGround: { from: "2026-04-10", to: "2026-07-31" },
        },
      ],
    }
    const mild: Forecast = [{ date: "2026-04-10", minC: 8, maxC: 19, condition: "clear", soilC: 9 }]
    openGarden(mild, { plan: beans })
    const warning = await screen.findByRole("button", { name: /Cold soil/ })
    expect(warning).toHaveTextContent(
      "Cold soil on Apr 10 (9 °C at 6 cm): Green bean needs 15 °C to come up. Wait a few days, or warm the soil under a cover."
    )

    await userEvent.click(warning)
    expect(editorStore.getState().selection).toEqual([{ kind: "planting", id: BEANS_ID }])
  })

  it("stays quiet when the forecast threatens nothing in the ground", async () => {
    openGarden(FORECAST, { plan: emptyPlan() })
    await screen.findByRole("list", { name: "Next days" })
    expect(screen.queryByRole("button", { name: /Frost/ })).toBeNull()
  })

  it("still shows the current weather when the forecast is unavailable", async () => {
    openGarden(new Error("502"))
    expect(await screen.findByText("9 °C")).toBeVisible()
    expect(await screen.findByText(/forecast is not available/)).toBeVisible()
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
    expect(editorStore.getState().selection).toEqual([
      {
        kind: "planting",
        id: "33333333-3333-4333-8333-333333333333",
      },
    ])
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

describe("sharing a garden", () => {
  const PORTO_PATCH: Garden = { ...TOMATOES, location: { lat: 41.15, lon: -8.61, name: "Porto" } }
  const TOKEN = "aaaaaaaa-aaaa-4aaa-8aaa-000000000001"

  async function openSharePanel(garden: Garden = TOMATOES) {
    open(`/gardens/${garden.id}`)
    await userEvent.click(await screen.findByRole("button", { name: "Share" }))
    return screen.findByRole("dialog", { name: "Share this garden" })
  }

  it("makes a link that anyone can open, and shows it", async () => {
    const panel = await openSharePanel()
    expect(within(panel).getByText(/Anyone with the link can see/)).toBeVisible()

    await userEvent.click(await within(panel).findByRole("button", { name: "Create link" }))
    const link = await within(panel).findByRole("textbox", { name: "Link" })
    expect(link).toHaveValue(`${window.location.origin}/shared/${TOKEN}`)
    expect(link).toHaveAttribute("readonly")
    expect(backend.shares.get(TOMATOES.id)).toEqual({ token: TOKEN, showLocation: false })
  })

  it("does not touch the garden itself, so the editor keeps saving", async () => {
    const panel = await openSharePanel()
    await userEvent.click(await within(panel).findByRole("button", { name: "Create link" }))
    await within(panel).findByRole("textbox", { name: "Link" })
    expect(backend.rows.get(TOMATOES.id)?.version).toBe(1)
  })

  it("copies the link", async () => {
    const writeText = vi.fn(async (_text: string) => {})
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true })
    backend.shares.set(TOMATOES.id, { token: TOKEN, showLocation: false })

    const panel = await openSharePanel()
    await userEvent.click(await within(panel).findByRole("button", { name: "Copy link" }))
    expect(writeText).toHaveBeenCalledExactlyOnceWith(`${window.location.origin}/shared/${TOKEN}`)
    expect(await within(panel).findByText("Copied")).toBeVisible()
  })

  it("keeps the location out of the link unless the owner ticks the box", async () => {
    backend = fakeBackend([PORTO_PATCH])
    const panel = await openSharePanel(PORTO_PATCH)
    const box = await within(panel).findByRole("checkbox", {
      name: "Also show where the garden is",
    })
    expect(box).not.toBeChecked()

    await userEvent.click(box)
    await userEvent.click(within(panel).getByRole("button", { name: "Create link" }))
    await within(panel).findByRole("textbox", { name: "Link" })
    expect(backend.shares.get(PORTO_PATCH.id)).toEqual({ token: TOKEN, showLocation: true })

    // With the link made, the box changes it at once and the link stays the same.
    await userEvent.click(within(panel).getByRole("checkbox"))
    await waitFor(() =>
      expect(backend.shares.get(PORTO_PATCH.id)).toEqual({ token: TOKEN, showLocation: false })
    )
  })

  it("does not ask about the location of a garden that has none", async () => {
    const panel = await openSharePanel()
    await within(panel).findByRole("button", { name: "Create link" })
    expect(within(panel).queryByRole("checkbox")).not.toBeInTheDocument()
  })

  it("stops sharing, and offers to make a new link", async () => {
    backend.shares.set(TOMATOES.id, { token: TOKEN, showLocation: false })
    const panel = await openSharePanel()

    await userEvent.click(await within(panel).findByRole("button", { name: "Stop sharing" }))
    expect(await within(panel).findByRole("button", { name: "Create link" })).toBeVisible()
    expect(within(panel).queryByRole("textbox", { name: "Link" })).not.toBeInTheDocument()
    expect(backend.shares.size).toBe(0)
  })

  it("says when the link could not be made", async () => {
    backend.failNextShare()
    const panel = await openSharePanel()
    await userEvent.click(await within(panel).findByRole("button", { name: "Create link" }))
    expect(await within(panel).findByRole("alert")).toHaveTextContent(/did not work/)
    expect(backend.shares.size).toBe(0)
  })

  it("closes with Escape", async () => {
    await openSharePanel()
    await userEvent.keyboard("{Escape}")
    expect(screen.queryByRole("dialog", { name: "Share this garden" })).not.toBeInTheDocument()
  })
})

describe("a shared garden", () => {
  const TOKEN = "bbbbbbbb-bbbb-4bbb-8bbb-000000000001"
  // The calendar opens on the current year, so the planting is in it.
  const year = new Date().getFullYear()
  const PATCH: Garden = {
    ...TOMATOES,
    location: { lat: 41.15, lon: -8.61, name: "Porto" },
    plan: {
      ...emptyPlan(),
      plantings: [
        {
          id: "55555555-5555-4555-8555-555555555555",
          plantId: "tomato",
          rect: { x: 0, y: 0, w: 100, h: 100 },
          layout: "block",
          inGround: { from: `${year}-05-01`, to: `${year}-09-30` },
        },
      ],
    },
  }

  /** Fails the test if the page asks for a session: a link must open without one. */
  const noSession = vi.fn(async (): Promise<FakeBackend> => {
    throw new Error("a shared garden must not connect")
  })

  beforeEach(() => {
    noSession.mockClear()
    backend = fakeBackend([PATCH])
    backend.shares.set(PATCH.id, { token: TOKEN, showLocation: false })
  })

  it("opens from its link with no session, to look at and not to change", async () => {
    open(`/shared/${TOKEN}`, noSession)
    expect(await screen.findByRole("heading", { name: "Tomato patch" })).toBeVisible()
    const picture = screen.getByRole("img", { name: "Tomato patch" })
    expect(picture.querySelectorAll("[data-planting]")).toHaveLength(1)
    expect(screen.getByText(/read-only/)).toBeVisible()

    expect(noSession).not.toHaveBeenCalled()
    expect(screen.queryByRole("textbox", { name: "Garden name" })).not.toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Share" })).not.toBeInTheDocument()
    expect(document.title).toBe("Tomato patch")
  })

  it("shows the calendar too, with nothing to press on its rows", async () => {
    open(`/shared/${TOKEN}`, noSession)
    await userEvent.click(await screen.findByRole("link", { name: "Calendar" }))

    const rows = await screen.findByRole("list", { name: /Plantings in/ })
    expect(within(rows).getByText(/Tomato.*in the ground/)).toBeInTheDocument()
    expect(within(rows).queryByRole("button")).not.toBeInTheDocument()
    expect(noSession).not.toHaveBeenCalled()
  })

  it("is handed over without the owner's notes or harvest amounts", async () => {
    const [planting] = PATCH.plan.plantings
    const harvests = [{ date: `${year}-07-12`, quantity: 1.2, unit: "kg" as const }]
    backend = fakeBackend([
      {
        ...PATCH,
        plan: {
          ...PATCH.plan,
          notes: "The well ran dry in July.",
          plantings: [{ ...planting!, planted: true, harvests, notes: "Blight in August." }],
        },
      },
    ])
    backend.shares.set(PATCH.id, { token: TOKEN, showLocation: false })

    const shared = await backend.publicBackend.sharedGarden(TOKEN)
    expect(shared.plan).toEqual({
      ...PATCH.plan,
      plantings: [{ ...planting, planted: true, harvests: [{ date: `${year}-07-12` }] }],
    })
  })

  it("does not say where the garden is", async () => {
    open(`/shared/${TOKEN}`, noSession)
    await screen.findByRole("heading", { name: "Tomato patch" })
    expect(screen.queryByText(/Porto/)).not.toBeInTheDocument()
  })

  it("says where the garden is when its owner chose to", async () => {
    backend.shares.set(PATCH.id, { token: TOKEN, showLocation: true })
    open(`/shared/${TOKEN}`, noSession)
    expect(await screen.findByText(/Porto/)).toBeVisible()
  })

  it("explains a link that opens nothing", async () => {
    backend.shares.clear()
    open(`/shared/${TOKEN}`, noSession)
    expect(await screen.findByText(/does not open a garden/)).toBeVisible()
    expect(screen.getByRole("link", { name: "Plan your own garden" })).toHaveAttribute("href", "/")
    expect(noSession).not.toHaveBeenCalled()
  })

  // The landing page says what Leira is before anyone becomes a guest.
  it("leads on to the landing page, still with no session", async () => {
    const connect = vi.fn(async () => backend)
    open(`/shared/${TOKEN}`, connect)
    expect(await screen.findByRole("link", { name: "Plan your own garden" })).toHaveAttribute(
      "href",
      "/"
    )
    expect(connect).not.toHaveBeenCalled()
  })
})

describe("the usage stats", () => {
  /** Twelve weeks, the last one starting on Monday 16 November 2026. */
  const WEEKS = Array.from({ length: 12 }, (_, index) => ({
    weekStart: new Date(Date.UTC(2026, 7, 31 + index * 7)).toISOString().slice(0, 10),
    newPeople: index,
    active: index * 2,
    returning: index,
  }))
  WEEKS[11] = { weekStart: "2026-11-16", newPeople: 12, active: 30, returning: 18 }

  beforeEach(() => {
    localStorage.removeItem("leira.analytics")
    backend.statsResult = {
      generatedAt: "2026-11-17T11:08:49.026624+00:00",
      people: { guests: 196, accounts: 16, withGarden: 156, accountsWithGarden: 14 },
      gardens: {
        total: 202,
        editedLast7Days: 40,
        editedLast30Days: 90,
        shared: 29,
        withLocation: 12,
        withPlantings: 120,
        withRecords: 33,
        recordedLast7Days: 9,
        severalYears: 5,
      },
      weeks: WEEKS,
      limits: { databaseBytes: 12_300_000, monthlyUsers: 157 },
    }
  })

  /** The number shown under a label in one of the page's sections. */
  function figure(section: string, label: string): string | null | undefined {
    const region = screen.getByRole("region", { name: section })
    return within(region).getByText(label).closest("div")?.querySelector("dd")?.textContent
  }

  it("show the owner who uses the app, leaving the owner out", async () => {
    backend.admin = true
    open("/stats")
    expect(await screen.findByText(/Your own use is left out/)).toBeInTheDocument()
    expect(screen.getByRole("heading", { level: 1, name: "Usage" })).toBeInTheDocument()

    expect(figure("People", "With a garden")).toBe("156")
    expect(figure("People", "With an account")).toBe("16")
    expect(figure("People", "Guests")).toBe("196")
    expect(figure("Gardens", "In all")).toBe("202")
    expect(figure("Gardens", "Edited in the last 7 days")).toBe("40")
    expect(figure("Gardens", "Edited in the last 30 days")).toBe("90")
    expect(figure("Gardens", "Shared")).toBe("29")
    expect(figure("Gardens", "With a location")).toBe("12")
  })

  it("show whether people plant, record and reach a second year", async () => {
    backend.admin = true
    open("/stats")
    await screen.findByText(/Your own use is left out/)
    expect(figure("People", "With a garden and an account")).toBe("14")
    const use = screen.getByRole("region", { name: "What is done in them" })
    expect(
      within(use).getByText(/marked in the ground, out of it, sown or harvested/)
    ).toBeInTheDocument()
    expect(figure("What is done in them", "With crops")).toBe("120")
    expect(figure("What is done in them", "With something recorded")).toBe("33")
    expect(figure("What is done in them", "Recorded in the last 7 days")).toBe("9")
    expect(figure("What is done in them", "Crops in more than one year")).toBe("5")
  })

  it("show who came back each week, as a chart and as a table", async () => {
    backend.admin = true
    open("/stats")
    expect(
      await screen.findByRole("img", {
        name: "This week 30 people were active and 18 of them came back.",
      })
    ).toBeInTheDocument()

    await userEvent.click(screen.getByText("See the numbers"))
    const rows = within(screen.getByRole("table")).getAllByRole("row")
    expect(rows).toHaveLength(13)
    expect(
      within(rows[12]!)
        .getAllByRole("cell")
        .map((cell) => cell.textContent)
    ).toEqual(["30", "18", "12"])
    expect(within(rows[12]!).getByRole("rowheader")).toHaveTextContent(/16/)
  })

  it("show how close the free tiers are", async () => {
    backend.admin = true
    open("/stats")
    const limits = await screen.findByRole("region", { name: "Free tiers" })
    expect(within(limits).getByText("12.3 MB of 500 MB")).toBeInTheDocument()
    expect(within(limits).getByText("157 of 50,000")).toBeInTheDocument()
  })

  it("are not shown to anyone else", async () => {
    open("/stats")
    expect(await screen.findByText("This page is not available.")).toBeInTheDocument()
    expect(screen.queryByRole("heading", { name: "Usage" })).not.toBeInTheDocument()
    expect(localStorage.getItem("leira.analytics")).toBeNull()
  })

  it("stop counting the owner's own visits in this browser", async () => {
    backend.admin = true
    open("/stats")
    await screen.findByText(/Your own use is left out/)
    expect(localStorage.getItem("leira.analytics")).toBe("off")
  })

  it("offer to try again when they cannot be loaded", async () => {
    backend.admin = true
    backend.statsResult = new Error("database down")
    open("/stats")
    expect(await screen.findByText("The stats could not be loaded.")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument()
  })
})

describe("templates", () => {
  const BED = {
    id: "44444444-4444-4444-8444-444444444444",
    name: "Herb bed",
    kind: "bed" as const,
    rect: { x: 0, y: 0, w: 200, h: 100 },
  }
  const ITEMS = { format: 1 as const, beds: [BED], plantings: [] }

  function savedTemplate(name: string) {
    return { id: crypto.randomUUID(), name, items: ITEMS, createdAt: "2026-11-01T10:00:00.000Z" }
  }

  it("saves the selection under a name and inserts it into another garden", async () => {
    backend = fakeBackend([{ ...TOMATOES, plan: { ...emptyPlan(), beds: [BED] } }, HERBS])
    open(`/gardens/${TOMATOES.id}`)
    await userEvent.click(await screen.findByRole("button", { name: /^Herb bed/ }))
    const templates = screen.getByRole("region", { name: "My templates" })
    await userEvent.type(within(templates).getByRole("textbox", { name: "Template name" }), "Herbs")
    await userEvent.click(
      within(templates).getByRole("button", { name: "Save selection as template" })
    )
    await waitFor(() => expect(backend.savedTemplates.map((item) => item.name)).toEqual(["Herbs"]))

    cleanup()
    open(`/gardens/${HERBS.id}`)
    const list = await screen.findByRole("region", { name: "My templates" })
    await userEvent.click(await within(list).findByRole("button", { name: "Insert Herbs" }))
    await waitFor(() =>
      expect(backend.rows.get(HERBS.id)?.plan.beds).toEqual([{ ...BED, id: expect.any(String) }])
    )
  })

  it("offers to save only while something is selected", async () => {
    open(`/gardens/${TOMATOES.id}`)
    const templates = await screen.findByRole("region", { name: "My templates" })
    expect(within(templates).queryByRole("textbox", { name: "Template name" })).toBeNull()
    expect(within(templates).getByText(/save them here/)).toBeVisible()
  })

  it("deletes a template", async () => {
    backend.savedTemplates = [savedTemplate("Old layout")]
    open(`/gardens/${TOMATOES.id}`)
    const list = await screen.findByRole("region", { name: "My templates" })
    await userEvent.click(
      await within(list).findByRole("button", { name: "Delete template Old layout" })
    )
    await waitFor(() => expect(backend.savedTemplates).toEqual([]))
    await waitFor(() => expect(within(list).queryByText("Old layout")).toBeNull())
  })

  it("says so when the user has as many as one may keep", async () => {
    backend = fakeBackend([{ ...TOMATOES, plan: { ...emptyPlan(), beds: [BED] } }])
    backend.savedTemplates = Array.from({ length: 50 }, (_, index) => savedTemplate(`T${index}`))
    open(`/gardens/${TOMATOES.id}`)
    await userEvent.click(await screen.findByRole("button", { name: /^Herb bed/ }))
    const templates = screen.getByRole("region", { name: "My templates" })
    await userEvent.type(within(templates).getByRole("textbox", { name: "Template name" }), "More")
    await userEvent.click(
      within(templates).getByRole("button", { name: "Save selection as template" })
    )
    expect(await within(templates).findByRole("alert")).toHaveTextContent(
      "You have 50 templates already"
    )
  })

  it("says so when a template does not fit the garden", async () => {
    backend = fakeBackend([{ ...TOMATOES, plan: { ...emptyPlan(), widthCm: 150, heightCm: 150 } }])
    backend.savedTemplates = [savedTemplate("Wide bed")]
    open(`/gardens/${TOMATOES.id}`)
    const list = await screen.findByRole("region", { name: "My templates" })
    await userEvent.click(await within(list).findByRole("button", { name: "Insert Wide bed" }))
    expect(await within(list).findByRole("alert")).toHaveTextContent("does not fit this garden")
  })
})

describe("the privacy page", () => {
  /** Fails the test if the page asks for a session: reading it must not make a guest. */
  const noSession = vi.fn(async (): Promise<FakeBackend> => {
    throw new Error("the privacy page must not connect")
  })

  beforeEach(() => {
    noSession.mockClear()
  })

  it("opens with no session, and says who is responsible and where to complain", async () => {
    open("/privacy", noSession)
    expect(await screen.findByRole("heading", { level: 1, name: "Privacy" })).toBeVisible()
    expect(screen.getByText(/Paulo Graça/)).toBeVisible()
    for (const link of screen.getAllByRole("link", { name: "leiragarden@gmail.com" })) {
      expect(link).toHaveAttribute("href", "mailto:leiragarden@gmail.com")
    }
    expect(screen.getByRole("link", { name: "CNPD" })).toHaveAttribute(
      "href",
      expect.stringContaining("cnpd.pt")
    )
    expect(screen.getByRole("link", { name: /Turnstile privacy addendum/ })).toHaveAttribute(
      "href",
      "https://www.cloudflare.com/turnstile-privacy-policy/"
    )
    expect(noSession).not.toHaveBeenCalled()
    expect(document.title).toBe("Privacy")
  })

  it("says when guests are deleted, since nobody can warn them", async () => {
    open("/privacy", noSession)
    expect(await screen.findByText(/30 days after/)).toBeVisible()
    expect(screen.getByText(/after a year/)).toBeVisible()
  })

  it("says an account waits 30 days to be deleted, and how to keep it", async () => {
    open("/privacy", noSession)
    expect(await screen.findByText(/goes 30 days from the day you ask/)).toHaveTextContent(
      /signing in again keeps it/
    )
  })

  it("reads in Portuguese too", async () => {
    open("/privacy", noSession)
    try {
      await userEvent.selectOptions(await screen.findByRole("combobox", { name: "Language" }), "pt")
      expect(await screen.findByRole("heading", { level: 1, name: "Privacidade" })).toBeVisible()
      expect(screen.getByRole("link", { name: "CNPD" })).toBeVisible()
    } finally {
      await i18n.changeLanguage("en")
    }
  })

  it("is reached from the account panel", async () => {
    open("/gardens")
    await userEvent.click(await screen.findByRole("button", { name: "Keep your gardens" }))
    await userEvent.click(screen.getByRole("link", { name: "Privacy" }))
    expect(await screen.findByRole("heading", { level: 1, name: "Privacy" })).toBeVisible()
  })
})
