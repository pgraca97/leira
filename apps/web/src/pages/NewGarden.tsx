import { emptyPlan, type GardenLocation, type GardenPlan, PLAN_LIMITS } from "@leira/core"
import { type FormEvent, useState } from "react"
import { useTranslation } from "react-i18next"
import { buttonClass, inputClass, primaryButtonClass } from "../components/ui"
import { GARDEN_NAME_MAX } from "../lib/gardens"
import { LocationForm } from "../weather/LocationForm"

/** Reads a side typed in metres ("8", "8.5" or "8,5") as whole centimetres, or null. */
function centimetres(typed: string): number | null {
  const text = typed.trim().replace(",", ".")
  if (!/^\d+(\.\d+)?$/.test(text)) return null
  const value = Math.round(Number(text) * 100)
  return value >= PLAN_LIMITS.minSideCm && value <= PLAN_LIMITS.maxSideCm ? value : null
}

/**
 * What a new garden starts with: a name, its size, and where it is. The size
 * is otherwise in the editor's side panel, at the bottom on a phone, and the
 * place, which the weather, frost and soil warnings need, was asked nowhere.
 * Each has a default, so "Create garden" alone still makes a 6 by 4 m garden.
 */
export function NewGarden({
  creating,
  onCreate,
  onCancel,
}: {
  creating: boolean
  onCreate(garden: { name: string; plan: GardenPlan; location: GardenLocation | null }): void
  onCancel(): void
}) {
  const { t } = useTranslation()
  const blank = emptyPlan()
  const [name, setName] = useState(t("gardens.defaultName"))
  const [width, setWidth] = useState(String(blank.widthCm / 100))
  const [length, setLength] = useState(String(blank.heightCm / 100))
  const [location, setLocation] = useState<GardenLocation | null>(null)
  const [sizeRefused, setSizeRefused] = useState(false)

  const create = (event: FormEvent) => {
    event.preventDefault()
    const widthCm = centimetres(width)
    const heightCm = centimetres(length)
    setSizeRefused(widthCm === null || heightCm === null)
    if (widthCm === null || heightCm === null) return
    onCreate({
      name: name.trim() || t("gardens.defaultName"),
      plan: { ...blank, widthCm, heightCm },
      location,
    })
  }

  const label = "flex flex-col text-xs text-stone-600"
  return (
    <section
      aria-labelledby="new-garden"
      className="flex flex-col gap-3 rounded-md border border-stone-200 bg-white p-3"
    >
      <h2 id="new-garden" className="text-lg font-semibold text-stone-900">
        {t("gardens.new")}
      </h2>
      {/* The browser's own checks are off: its messages come in the browser's language, not the app's. */}
      <form
        id="new-garden-form"
        noValidate
        className="flex flex-wrap items-end gap-2"
        onSubmit={create}
      >
        <label className={`${label} basis-full`}>
          {t("newGarden.name")}
          <input
            type="text"
            className={inputClass}
            maxLength={GARDEN_NAME_MAX}
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
        </label>
        <label className={label}>
          {t("inspector.widthM")}
          <input
            type="text"
            inputMode="decimal"
            className={`${inputClass} w-20`}
            value={width}
            onChange={(event) => setWidth(event.target.value)}
          />
        </label>
        <label className={label}>
          {t("inspector.lengthM")}
          <input
            type="text"
            inputMode="decimal"
            className={`${inputClass} w-20`}
            value={length}
            onChange={(event) => setLength(event.target.value)}
          />
        </label>
      </form>
      {sizeRefused && (
        <p role="alert" className="text-sm text-red-800">
          {t("newGarden.sizeRefused")}
        </p>
      )}
      {/* The place search is a form of its own, so it sits outside the one that creates. */}
      {location ? (
        <p className="flex flex-wrap items-center gap-2 text-sm text-stone-700">
          <span>
            {t("newGarden.where")} <strong>{location.name ?? t("newGarden.yourLocation")}</strong>
          </span>
          <button type="button" className={buttonClass} onClick={() => setLocation(null)}>
            {t("newGarden.changePlace")}
          </button>
        </p>
      ) : (
        <LocationForm onLocationChange={setLocation} intro={t("newGarden.placeIntro")} />
      )}
      <div className="flex flex-wrap justify-end gap-2">
        <button type="button" className={buttonClass} onClick={onCancel}>
          {t("newGarden.cancel")}
        </button>
        <button
          type="submit"
          form="new-garden-form"
          className={primaryButtonClass}
          disabled={creating}
        >
          {t("newGarden.create")}
        </button>
      </div>
    </section>
  )
}
