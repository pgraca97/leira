import { PLANTS, startsOn, toIsoDate } from "@leira/core"
import { useState } from "react"
import { useTranslation } from "react-i18next"
import { inputClass, toggleButtonClass } from "../components/ui"
import { currentLanguage } from "../i18n"
import { monthName } from "./season"
import { editorStore } from "./store"
import { useEditor } from "./useEditor"

/**
 * A tool's button. On a phone the three share a row and a long name takes two
 * lines, pressed (in bold) or not: every button is two lines tall there, so
 * picking a tool never changes the row's height and moves the garden below.
 */
// Two lines of text-sm (2 × 20 px), its padding (12 px) and border (2 px).
const toolClass = `${toggleButtonClass} max-lg:min-h-[54px]`

/** The tools and the plants that can be placed on the garden. What they do is said by `ToolGuide`. */
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

  return (
    <aside className="flex flex-col gap-2 border-b border-stone-200 bg-stone-100 p-3 lg:col-start-1 lg:row-start-1 lg:gap-4 lg:overflow-y-auto lg:border-r lg:border-b-0">
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
            className={toolClass}
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
            className={toolClass}
            aria-pressed={selectingMany}
            onClick={() => setSelectingMany(!selectingMany)}
          >
            {t("editor.selectMany")}
          </button>
          <button
            type="button"
            className={toolClass}
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
