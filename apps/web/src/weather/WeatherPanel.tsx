import { type GardenLocation, roundCoordinate, type WeatherNow } from "@garden/core"
import { useQuery } from "@tanstack/react-query"
import { type FormEvent, useState } from "react"
import { useTranslation } from "react-i18next"
import { buttonClass, inputClass } from "../components/ui"
import { currentLanguage } from "../i18n"
import { useBackend } from "../lib/backend"

interface WeatherPanelProps {
  location: GardenLocation | null
  onLocationChange(location: GardenLocation | null): void
}

const headingClass = "mb-1 text-xs font-semibold tracking-wide text-stone-500 uppercase"

/** The weather where the garden is, or the controls to say where that is. */
export function WeatherPanel({ location, onLocationChange }: WeatherPanelProps) {
  const { t } = useTranslation()
  return (
    <section aria-labelledby="weather-title">
      <h3 id="weather-title" className={headingClass}>
        {t("weather.title")}
      </h3>
      {location ? (
        <CurrentWeather location={location} onRemove={() => onLocationChange(null)} />
      ) : (
        <LocationForm onLocationChange={onLocationChange} />
      )}
    </section>
  )
}

function CurrentWeather({ location, onRemove }: { location: GardenLocation; onRemove(): void }) {
  const { t } = useTranslation()
  const backend = useBackend()
  const weather = useQuery({
    queryKey: ["weather", location.lat, location.lon],
    queryFn: () => backend.weather(location.lat, location.lon),
    // The server refreshes a zone's reading once an hour at most.
    staleTime: 10 * 60 * 1000,
  })

  return (
    <div className="flex flex-col items-start gap-2">
      {weather.data ? (
        <Reading weather={weather.data} />
      ) : weather.isError ? (
        <p className="text-sm text-stone-600">{t("weather.failed")}</p>
      ) : (
        <p role="status" className="text-sm text-stone-600">
          {t("weather.loading")}
        </p>
      )}
      <button type="button" className={buttonClass} onClick={onRemove}>
        {t("weather.remove")}
      </button>
    </div>
  )
}

function Reading({ weather }: { weather: WeatherNow }) {
  const { t } = useTranslation()
  const whole = new Intl.NumberFormat(currentLanguage(), { maximumFractionDigits: 0 })
  const degrees = (celsius: number) => t("weather.degrees", { value: whole.format(celsius) })
  const condition = t(`weather.condition.${weather.condition}`)

  return (
    <div className="text-sm text-stone-600">
      <p className="text-2xl font-semibold text-stone-900">{degrees(weather.tempC)}</p>
      <p>{weather.placeName ? `${condition} · ${weather.placeName}` : condition}</p>
      <p>
        {t("weather.details", {
          feelsLike: degrees(weather.feelsLikeC),
          humidity: whole.format(weather.humidityPct),
          wind: whole.format(weather.windMs * 3.6),
        })}
      </p>
    </div>
  )
}

/** Reads "41.15" or "41,15". Returns null for anything that is not a number in range. */
function parseCoordinate(text: string, limit: number): number | null {
  const normalized = text.trim().replace(",", ".")
  if (!/^-?\d+(\.\d+)?$/.test(normalized)) return null
  const value = Number(normalized)
  return Math.abs(value) <= limit ? value : null
}

function LocationForm({ onLocationChange }: Pick<WeatherPanelProps, "onLocationChange">) {
  const { t } = useTranslation()
  const [latitude, setLatitude] = useState("")
  const [longitude, setLongitude] = useState("")
  const [locating, setLocating] = useState(false)
  const [problem, setProblem] = useState<"denied" | "invalid" | null>(null)

  // Rounded before it leaves this component: the garden only ever stores an
  // approximate position, never the exact spot of someone's home.
  const choose = (lat: number, lon: number) =>
    onLocationChange({ lat: roundCoordinate(lat), lon: roundCoordinate(lon) })

  const locate = () => {
    if (!("geolocation" in navigator)) {
      setProblem("denied")
      return
    }
    setLocating(true)
    setProblem(null)
    navigator.geolocation.getCurrentPosition(
      (position) => choose(position.coords.latitude, position.coords.longitude),
      () => {
        setLocating(false)
        setProblem("denied")
      },
      { maximumAge: 60 * 60 * 1000, timeout: 15_000 }
    )
  }

  const submit = (event: FormEvent) => {
    event.preventDefault()
    const lat = parseCoordinate(latitude, 90)
    const lon = parseCoordinate(longitude, 180)
    if (lat === null || lon === null) setProblem("invalid")
    else choose(lat, lon)
  }

  return (
    <div className="flex flex-col items-start gap-2 text-sm text-stone-600">
      <p>{t("weather.noLocation")}</p>
      <button type="button" className={buttonClass} disabled={locating} onClick={locate}>
        {t(locating ? "weather.locating" : "weather.useMyLocation")}
      </button>
      <form className="flex flex-wrap items-end gap-2" onSubmit={submit} noValidate>
        <label className="flex flex-col text-xs">
          {t("weather.latitude")}
          <input
            type="text"
            inputMode="decimal"
            className={`${inputClass} w-24`}
            placeholder="41.15"
            value={latitude}
            onChange={(event) => setLatitude(event.target.value)}
          />
        </label>
        <label className="flex flex-col text-xs">
          {t("weather.longitude")}
          <input
            type="text"
            inputMode="decimal"
            className={`${inputClass} w-24`}
            placeholder="-8.61"
            value={longitude}
            onChange={(event) => setLongitude(event.target.value)}
          />
        </label>
        <button type="submit" className={buttonClass}>
          {t("weather.setLocation")}
        </button>
      </form>
      {problem && (
        <p role="alert" className="text-red-800">
          {t(problem === "denied" ? "weather.locationDenied" : "weather.invalidCoordinates")}
        </p>
      )}
    </div>
  )
}
