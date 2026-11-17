import { getPlant, PLANTS, relationBetween, startsOn, toIsoDate } from "@leira/core"
import { useState } from "react"
import { useTranslation } from "react-i18next"
import { inputClass, toggleButtonClass } from "../components/ui"
import { currentLanguage } from "../i18n"
import { monthName, seasonText } from "./season"
import { editorStore } from "./store"
import { useEditor } from "./useEditor"

/** The tools and the plants that can be placed on the garden. */
export function Palette() {
  const { t } = useTranslation()
  const tool = useEditor((state) => state.tool)
  const selectingMany = useEditor((state) => state.selectingMany)
  const viewDate = useEditor((state) => state.viewDate)
  const { setTool, setSelectingMany } = editorStore.getState()
  const language = currentLanguage()

  const [search, setSearch] = useState("")
  const [startNow, setStartNow] = useState(false)
  // "Now" is the day the garden is shown on, so next spring can be planned in winter.
  const now = viewDate ?? toIsoDate(new Date())

  // Alphabetical in the language in use: with dozens of plants, that is how one is found.
  const sorted = [...PLANTS].sort((a, b) =>
    a.name[language].localeCompare(b.name[language], language)
  )
  // A plant matches on its name, its botanical name, or its family, the unit
  // crop rotation works in ("nightshades" finds tomatoes and potatoes alike).
  const wanted = foldText(search.trim())
  const shown = sorted
    .filter((plant) =>
      [plant.name[language], plant.latin, t(`rotation.family.${plant.family}`)].some((text) =>
        foldText(text).includes(wanted)
      )
    )
    .map((plant) => ({ plant, ways: startNow ? startsOn(plant, now) : [] }))
    .filter(({ ways }) => !startNow || ways.length > 0)

  // Advice for the plant about to be placed: who to put it next to, who to keep it from.
  const chosen = tool.kind === "plant" ? getPlant(tool.plantId) : undefined
  const neighbours = (relation: "good" | "bad") =>
    chosen
      ? sorted
          .filter((plant) => relationBetween(chosen, plant) === relation)
          .map((plant) => plant.name[language])
      : []

  const hint = selectingMany
    ? t("editor.hintSelectMany")
    : tool.kind === "select"
      ? t("editor.hintSelect")
      : tool.kind === "bed"
        ? t("editor.hintBed")
        : t("editor.hintPlant")

  return (
    <aside className="flex flex-col gap-2 border-b border-stone-200 bg-stone-100 p-3 lg:gap-4 lg:overflow-y-auto lg:border-r lg:border-b-0">
      <section aria-labelledby="palette-tools">
        <h2
          id="palette-tools"
          className="mb-1 text-xs font-semibold tracking-wide text-stone-500 uppercase max-lg:sr-only"
        >
          {t("editor.tools")}
        </h2>
        {/* One row on a phone, so the garden below keeps its height. */}
        <div className="grid grid-cols-3 gap-1 lg:grid-cols-1">
          <button
            type="button"
            className={toggleButtonClass}
            aria-pressed={tool.kind === "select" && !selectingMany}
            onClick={() => {
              setSelectingMany(false)
              setTool({ kind: "select" })
            }}
          >
            {t("editor.select")}
          </button>
          {/* What Shift does with a mouse, for a screen with no keyboard. */}
          <button
            type="button"
            className={toggleButtonClass}
            aria-pressed={selectingMany}
            onClick={() => setSelectingMany(!selectingMany)}
          >
            {t("editor.selectMany")}
          </button>
          <button
            type="button"
            className={toggleButtonClass}
            aria-pressed={tool.kind === "bed"}
            onClick={() => setTool({ kind: "bed" })}
          >
            {t("editor.bed")}
          </button>
        </div>
      </section>

      <section aria-labelledby="palette-plants">
        <h2
          id="palette-plants"
          className="mb-1 text-xs font-semibold tracking-wide text-stone-500 uppercase max-lg:sr-only"
        >
          {t("editor.plants")}
        </h2>
        <input
          type="search"
          aria-label={t("editor.searchPlants")}
          placeholder={t("editor.searchPlants")}
          className={`${inputClass} mb-1 w-full`}
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
        <label className="mb-1 flex items-center gap-1.5 text-sm text-stone-800">
          <input
            type="checkbox"
            className="size-4 accent-emerald-700"
            checked={startNow}
            onChange={(event) => setStartNow(event.target.checked)}
          />
          {t("season.startNow")}
        </label>
        {shown.length === 0 && (
          <p className="text-sm text-stone-600">
            {wanted
              ? t("editor.noPlantMatches", { search: search.trim() })
              : t("season.nothingNow", { month: monthName(Number(now.slice(5, 7)), language) })}
          </p>
        )}
        {/* One row to swipe through on small screens, where the palette sits above the canvas. */}
        <ul className="flex gap-1 overflow-x-auto pb-1 lg:grid lg:grid-cols-1 lg:overflow-visible lg:pb-0">
          {shown.map(({ plant, ways }) => (
            <li key={plant.id} className="shrink-0 whitespace-nowrap lg:shrink">
              <button
                type="button"
                className={toggleButtonClass}
                aria-pressed={tool.kind === "plant" && tool.plantId === plant.id}
                onClick={() => setTool({ kind: "plant", plantId: plant.id })}
              >
                <span
                  aria-hidden="true"
                  className="size-3 shrink-0 rounded-full"
                  style={{ backgroundColor: plant.color }}
                />
                {plant.name[language]}
                {ways.length > 0 && (
                  <span className="ml-auto pl-2 text-xs font-normal text-stone-500">
                    {ways.map((way) => t(`season.way.${way}`)).join(", ")}
                  </span>
                )}
              </button>
            </li>
          ))}
        </ul>
      </section>

      <p className="text-xs text-stone-600">{hint}</p>
      {chosen && (
        <div className="flex flex-col gap-1 text-xs text-stone-600">
          <p>{t("season.goesIn", { season: seasonText(chosen.groundMonths, language, t) })}</p>
          {neighbours("good").length > 0 && (
            <p>{t("companions.goodWith", { names: neighbours("good").join(", ") })}</p>
          )}
          {neighbours("bad").length > 0 && (
            <p className="text-amber-800">
              {t("companions.badWith", { names: neighbours("bad").join(", ") })}
            </p>
          )}
        </div>
      )}
    </aside>
  )
}

/** Lowercase and without accents, so "feijao" finds "Feijão". */
function foldText(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
}
