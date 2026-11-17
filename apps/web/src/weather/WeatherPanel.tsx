import {
  type Forecast,
  findWeatherRisks,
  type GardenLocation,
  getPlant,
  type IsoDate,
  type Place,
  roundCoordinate,
  type WeatherNow,
} from "@leira/core"
import { useMutation, useQuery } from "@tanstack/react-query"
import { type FormEvent, useState } from "react"
import { useTranslation } from "react-i18next"
import { buttonClass, inputClass, toggleButtonClass } from "../components/ui"
import { editorStore, isSelected } from "../editor/store"
import { useEditor } from "../editor/useEditor"
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
        <Reading weather={weather.data} placeName={location.name ?? weather.data.placeName} />
      ) : weather.isError ? (
        <p className="text-sm text-stone-600">{t("weather.failed")}</p>
      ) : (
        <p role="status" className="text-sm text-stone-600">
          {t("weather.loading")}
        </p>
      )}
      <ComingDays location={location} />
      <button type="button" className={buttonClass} onClick={onRemove}>
        {t("weather.remove")}
      </button>
    </div>
  )
}

/** The forecast for the coming days, and what it means for the crops in the ground. */
function ComingDays({ location }: { location: GardenLocation }) {
  const { t } = useTranslation()
  const backend = useBackend()
  const forecast = useQuery({
    queryKey: ["forecast", location.lat, location.lon],
    queryFn: () => backend.forecast(location.lat, location.lon),
    // The server refreshes a zone's forecast every three hours at most.
    staleTime: 30 * 60 * 1000,
  })

  if (forecast.isError)
    return <p className="text-sm text-stone-600">{t("weather.forecastFailed")}</p>
  if (!forecast.data) return null
  return (
    <>
      <WeatherWarnings forecast={forecast.data} />
      <ForecastDays forecast={forecast.data} />
    </>
  )
}

/** Dates carry no zone, so they are formatted in UTC to stay on the same day everywhere. */
function dateFormatter(options: Intl.DateTimeFormatOptions): (date: IsoDate) => string {
  const format = new Intl.DateTimeFormat(currentLanguage(), { ...options, timeZone: "UTC" })
  return (date) => format.format(new Date(`${date}T00:00:00Z`))
}

function WeatherWarnings({ forecast }: { forecast: Forecast }) {
  const { t } = useTranslation()
  const plan = useEditor((state) => state.plan)
  const selection = useEditor((state) => state.selection)
  const day = dateFormatter({ day: "numeric", month: "short" })
  const whole = new Intl.NumberFormat(currentLanguage(), { maximumFractionDigits: 0 })
  const risks = findWeatherRisks(plan, getPlant, forecast)
  if (risks.length === 0) return null

  return (
    <ul aria-label={t("weather.warnings")} className="flex w-full flex-col gap-1">
      {risks.map((risk) => {
        const plant = getPlant(risk.plantId)
        const degrees = (value: number) => t("weather.degrees", { value: whole.format(value) })
        return (
          <li key={`${risk.plantingId}:${risk.kind}`}>
            <button
              type="button"
              className={`${toggleButtonClass} bg-amber-50 text-amber-900`}
              aria-pressed={isSelected(selection, { kind: "planting", id: risk.plantingId })}
              onClick={() =>
                editorStore.getState().select({ kind: "planting", id: risk.plantingId })
              }
            >
              {t(`weather.risk.${risk.kind}`, {
                date: day(risk.date),
                temp: degrees(risk.tempC),
                name: plant?.name[currentLanguage()] ?? risk.plantId,
                // Only the cold soil warning says what the seed needs.
                need: degrees(plant?.temps.germMinSoilC ?? 0),
              })}
            </button>
          </li>
        )
      })}
    </ul>
  )
}

function ForecastDays({ forecast }: { forecast: Forecast }) {
  const { t } = useTranslation()
  const weekday = dateFormatter({ weekday: "short" })
  const fullDate = dateFormatter({ dateStyle: "full" })
  const whole = new Intl.NumberFormat(currentLanguage(), { maximumFractionDigits: 0 })

  return (
    <>
      <ul aria-label={t("weather.nextDays")} className="w-full text-sm text-stone-600">
        {forecast.map((day) => (
          <li key={day.date} className="flex items-baseline gap-2 py-0.5">
            <span className="w-9 font-medium text-stone-800" title={fullDate(day.date)}>
              {weekday(day.date)}
            </span>
            <span className="w-20 tabular-nums">
              {t("weather.lowHigh", { low: whole.format(day.minC), high: whole.format(day.maxC) })}
            </span>
            <span>{t(`weather.condition.${day.condition}`)}</span>
            {day.soilC !== undefined && (
              <span className="ml-auto text-xs tabular-nums text-amber-800">
                {t("weather.soil", { value: whole.format(day.soilC) })}
              </span>
            )}
          </li>
        ))}
      </ul>
      {forecast.some((day) => day.soilC !== undefined) && <SoilCredit />}
    </>
  )
}

/**
 * Open-Meteo's data are under CC BY 4.0, which asks for a link next to
 * wherever they are shown, and for a word on what was changed: here, hourly
 * readings folded into a daily mean.
 */
function SoilCredit() {
  const { t } = useTranslation()
  const linkClass = "underline hover:text-stone-700"
  return (
    <p className="text-xs text-stone-500">
      {t("weather.soilCredit")}{" "}
      <a className={linkClass} href="https://open-meteo.com/" target="_blank" rel="noreferrer">
        Open-Meteo.com
      </a>{" "}
      (
      <a
        className={linkClass}
        href="https://creativecommons.org/licenses/by/4.0/"
        target="_blank"
        rel="noreferrer"
      >
        CC BY 4.0
      </a>
      ).
    </p>
  )
}

/**
 * `placeName` is the name the garden's location was found under, or else the
 * weather station's, which is often a neighbouring place.
 */
function Reading({ weather, placeName }: { weather: WeatherNow; placeName: string | null }) {
  const { t } = useTranslation()
  const whole = new Intl.NumberFormat(currentLanguage(), { maximumFractionDigits: 0 })
  const degrees = (celsius: number) => t("weather.degrees", { value: whole.format(celsius) })
  const condition = t(`weather.condition.${weather.condition}`)

  return (
    <div className="text-sm text-stone-600">
      <p className="text-2xl font-semibold text-stone-900">{degrees(weather.tempC)}</p>
      <p>{placeName ? `${condition} · ${placeName}` : condition}</p>
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

/** The shortest name the server searches for. */
const PLACE_QUERY_MIN = 2

/** A place as a search result: the region only when it adds something to the name. */
function placeLabel(place: Place): string {
  const region = place.region === place.name ? undefined : place.region
  return [place.name, region, place.country].filter(Boolean).join(", ")
}

function LocationForm({ onLocationChange }: Pick<WeatherPanelProps, "onLocationChange">) {
  const { t } = useTranslation()
  const backend = useBackend()
  const [placeName, setPlaceName] = useState("")
  const search = useMutation({ mutationFn: (name: string) => backend.places(name) })
  const [latitude, setLatitude] = useState("")
  const [longitude, setLongitude] = useState("")
  const [locating, setLocating] = useState(false)
  const [problem, setProblem] = useState<"denied" | "invalid" | null>(null)

  // Rounded before it leaves this component: the garden only ever stores an
  // approximate position, never the exact spot of someone's home.
  const choose = (lat: number, lon: number, name?: string) =>
    onLocationChange({
      lat: roundCoordinate(lat),
      lon: roundCoordinate(lon),
      ...(name ? { name } : {}),
    })

  const wanted = placeName.trim()
  const searchPlaces = (event: FormEvent) => {
    event.preventDefault()
    if (wanted.length >= PLACE_QUERY_MIN) search.mutate(wanted)
  }

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
      <form className="flex flex-wrap items-end gap-2" onSubmit={searchPlaces}>
        <label className="flex flex-col text-xs">
          {t("weather.place")}
          <input
            type="search"
            className={`${inputClass} w-40`}
            maxLength={80}
            value={placeName}
            onChange={(event) => setPlaceName(event.target.value)}
          />
        </label>
        <button
          type="submit"
          className={buttonClass}
          disabled={wanted.length < PLACE_QUERY_MIN || search.isPending}
        >
          {t(search.isPending ? "weather.searching" : "weather.search")}
        </button>
      </form>
      {search.isError && (
        <p role="alert" className="text-red-800">
          {t("weather.searchFailed")}
        </p>
      )}
      {search.data?.length === 0 && (
        <p role="status">{t("weather.noPlaces", { name: search.variables })}</p>
      )}
      {search.data && search.data.length > 0 && (
        <ul aria-label={t("weather.placeResults")} className="flex w-full flex-col gap-1">
          {search.data.map((place) => (
            <li key={`${place.lat}:${place.lon}`}>
              <button
                type="button"
                className={toggleButtonClass}
                onClick={() => choose(place.lat, place.lon, place.name)}
              >
                {placeLabel(place)}
              </button>
            </li>
          ))}
        </ul>
      )}
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
