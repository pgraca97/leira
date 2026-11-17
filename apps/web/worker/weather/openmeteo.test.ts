import { describe, expect, it, vi } from "vitest"
import { openMeteo } from "./openmeteo"
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
