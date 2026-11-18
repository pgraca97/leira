import { PlacesSchema } from "@leira/core"
import { describe, expect, it, vi } from "vitest"
import { openMeteo, openMeteoPlaces } from "./openmeteo"
import { WeatherProviderError } from "./provider"

/** The hours of one local day, "2026-05-04T00:00" to "2026-05-04T23:00". */
function hoursOf(date: string): string[] {
  return Array.from({ length: 24 }, (_, hour) => `${date}T${String(hour).padStart(2, "0")}:00`)
}

/** A trimmed copy of a real response: two days, the soil warming through each. */
const PORTO = {
  latitude: 41.174236,
  longitude: -8.588783,
  utc_offset_seconds: 3600,
  timezone: "Europe/Lisbon",
  hourly_units: { time: "iso8601", soil_temperature_6cm: "°C" },
  hourly: {
    time: [...hoursOf("2026-05-04"), ...hoursOf("2026-05-05")],
    soil_temperature_6cm: [
      ...Array.from({ length: 24 }, (_, hour) => (hour < 12 ? 10 : 14)),
      ...Array.from({ length: 24 }, () => 15.25),
    ],
  },
}

function respondWith(body: unknown, status = 200) {
  return vi.fn<typeof fetch>(async () => Response.json(body, { status }))
}

describe("openMeteo", () => {
  it("averages each local day's hourly soil readings", async () => {
    const days = await openMeteo(respondWith(PORTO)).soilTemperature(41.2, -8.6)
    expect(days).toEqual([
      { date: "2026-05-04", meanC: 12 },
      { date: "2026-05-05", meanC: 15.3 },
    ])
  })

  it("asks for the soil 6 cm down, in the garden's own time zone, with no key", async () => {
    const fetchFn = respondWith(PORTO)
    await openMeteo(fetchFn).soilTemperature(41.2, -8.6)
    const url = new URL(String(fetchFn.mock.calls[0]![0]))
    expect(url.origin + url.pathname).toBe("https://api.open-meteo.com/v1/forecast")
    expect(Object.fromEntries(url.searchParams)).toEqual({
      latitude: "41.2",
      longitude: "-8.6",
      hourly: "soil_temperature_6cm",
      forecast_days: "6",
      timezone: "auto",
    })
  })

  it("leaves out the hours with no value, and a day with none at all", async () => {
    const gappy = {
      ...PORTO,
      hourly: {
        time: [...hoursOf("2026-05-04"), ...hoursOf("2026-05-05")],
        soil_temperature_6cm: [
          ...Array.from({ length: 24 }, (_, hour) => (hour === 0 ? 20 : hour < 12 ? null : 10)),
          ...Array.from({ length: 24 }, () => null),
        ],
      },
    }
    const days = await openMeteo(respondWith(gappy)).soilTemperature(41.2, -8.6)
    expect(days).toEqual([{ date: "2026-05-04", meanC: 10.8 }])
  })

  it("fails with a provider error when the service answers with an error", async () => {
    const soil = openMeteo(respondWith({ error: true, reason: "Too many requests" }, 429))
    await expect(soil.soilTemperature(41.2, -8.6)).rejects.toThrow(
      new WeatherProviderError("Open-Meteo responded with status 429")
    )
  })

  it("fails with a provider error when the answer has an unexpected shape", async () => {
    const soil = openMeteo(respondWith({ hourly: { time: ["2026-05-04T00:00"] } }))
    await expect(soil.soilTemperature(41.2, -8.6)).rejects.toThrow(WeatherProviderError)
  })

  it("fails with a provider error when the request does not get through", async () => {
    const fetchFn = vi.fn<typeof fetch>(async () => {
      throw new TypeError("network down")
    })
    await expect(openMeteo(fetchFn).soilTemperature(41.2, -8.6)).rejects.toThrow(
      new WeatherProviderError("Open-Meteo request failed")
    )
  })
})

describe("openMeteoPlaces", () => {
  /**
   * A trimmed copy of a real search for "Arcozelo" in Portuguese, plus a
   * mountain, a part of a town and an abandoned village.
   */
  const ARCOZELO = {
    results: [
      {
        id: 2742416,
        name: "Arcozelo",
        latitude: 41.06187,
        longitude: -8.63192,
        feature_code: "PPL",
        country_code: "PT",
        admin1: "Distrito do Porto",
        admin2: "Vila Nova de Gaia",
        admin3: "Arcozelo",
        population: 14352,
        country: "Portugal",
      },
      {
        id: 2269399,
        name: "Arcozelo",
        latitude: 41.79384,
        longitude: -8.59416,
        feature_code: "PPL",
        country_code: "PT",
        admin1: "Distrito de Viana do Castelo",
        admin2: "Ponte de Lima",
        country: "Portugal",
      },
      { id: 1, name: "Pico Arcozelo", latitude: 0.1, longitude: 6.5, feature_code: "MT" },
      { id: 2, name: "Arcozelo", latitude: 11.6, longitude: -15.5, feature_code: "PPLX" },
      { id: 3, name: "Arcozelo", latitude: 40.1, longitude: -7.9, feature_code: "PPLQ" },
    ],
    generationtime_ms: 0.8,
  }

  it("keeps the places people live in, with their municipality and district", async () => {
    const places = await openMeteoPlaces(respondWith(ARCOZELO)).places("Arcozelo", "pt")
    expect(places).toEqual([
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
      { name: "Arcozelo", lat: 11.6, lon: -15.5 },
    ])
    expect(PlacesSchema.safeParse(places).success).toBe(true)
  })

  it("asks for the name's matches in the app's language, with no key", async () => {
    const fetchFn = respondWith(ARCOZELO)
    await openMeteoPlaces(fetchFn).places("Vila Nova de Gaia", "en")
    const url = new URL(String(fetchFn.mock.calls[0]![0]))
    expect(url.origin + url.pathname).toBe("https://geocoding-api.open-meteo.com/v1/search")
    expect(Object.fromEntries(url.searchParams)).toEqual({
      name: "Vila Nova de Gaia",
      count: "20",
      language: "en",
      format: "json",
    })
  })

  it("returns no places when nothing matches", async () => {
    const places = openMeteoPlaces(respondWith({ generationtime_ms: 0.05 }))
    expect(await places.places("Xyzzy", "pt")).toEqual([])
  })

  it("returns ten places at most", async () => {
    const many = { results: Array(15).fill(ARCOZELO.results[0]) }
    expect(await openMeteoPlaces(respondWith(many)).places("Arcozelo", "pt")).toHaveLength(10)
  })

  it("cuts names too long for a garden's location", async () => {
    const long = "a".repeat(200)
    const body = {
      results: [
        { name: long, admin1: long, admin2: long, latitude: 1, longitude: 2, feature_code: "PPL" },
      ],
    }
    const [place] = await openMeteoPlaces(respondWith(body)).places("aaa", "pt")
    expect([place?.name, place?.area, place?.region].map((text) => text?.length)).toEqual([
      120, 120, 120,
    ])
  })

  it("fails with a provider error when the service answers with an error", async () => {
    const places = openMeteoPlaces(respondWith({ error: true, reason: "Too many" }, 429))
    await expect(places.places("Braga", "pt")).rejects.toThrow(
      new WeatherProviderError("Open-Meteo responded with status 429")
    )
  })

  it("fails with a provider error when the answer has an unexpected shape", async () => {
    const places = openMeteoPlaces(respondWith({ results: [{ name: "Braga" }] }))
    await expect(places.places("Braga", "pt")).rejects.toThrow(WeatherProviderError)
  })
})
