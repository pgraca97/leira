import { type GardenLocation, type Place, roundCoordinate } from "@leira/core"
import { useMutation } from "@tanstack/react-query"
import { type FormEvent, type ReactNode, useState } from "react"
import { Trans, useTranslation } from "react-i18next"
import { buttonClass, inputClass, toggleButtonClass } from "../components/ui"
import { currentLanguage } from "../i18n"
import { useBackend } from "../lib/backend"

/**
 * The places found come from GeoNames, through Open-Meteo's geocoder, under
 * CC BY 4.0, which asks for a link next to them.
 */
function PlaceCredit() {
  return (
    <p className="text-xs text-stone-500">
      <Trans
        i18nKey="weather.placeCredit"
        components={{
          geonames: <CreditLink href="https://www.geonames.org/" />,
          openmeteo: <CreditLink href="https://open-meteo.com/" />,
          licence: <CreditLink href="https://creativecommons.org/licenses/by/4.0/" />,
        }}
      />
    </p>
  )
}

function CreditLink({ href, children }: { href: string; children?: ReactNode }) {
  return (
    <a className="underline hover:text-stone-700" href={href} target="_blank" rel="noreferrer">
      {children}
    </a>
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

/**
 * A place as a search result: its municipality and its region, each only
 * when it adds something to the name. The municipality is what tells apart
 * the villages that share a name. In English the geocoder names a
 * municipality "Sintra Municipality", which adds nothing to "Sintra" either.
 */
function placeLabel(place: Place): string {
  const sameAsName = (part?: string) => part === place.name || part === `${place.name} Municipality`
  const area = sameAsName(place.area) ? undefined : place.area
  const region = place.region === place.name ? undefined : place.region
  return [place.name, area, region, place.country].filter(Boolean).join(", ")
}

/**
 * Says where a garden is: a place found by name, the device's position, or
 * coordinates typed in. Used by the weather panel and when a garden is made.
 * `intro` says why it is asked.
 */
export function LocationForm({
  onLocationChange,
  intro,
}: {
  onLocationChange(location: GardenLocation): void
  intro: string
}) {
  const { t } = useTranslation()
  const backend = useBackend()
  const [placeName, setPlaceName] = useState("")
  const search = useMutation({
    mutationFn: (name: string) => backend.places(name, currentLanguage()),
  })
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
      <p>{intro}</p>
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
      {search.data && search.data.length > 0 && <PlaceCredit />}
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
