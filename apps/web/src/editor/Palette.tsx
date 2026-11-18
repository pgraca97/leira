import { PLANT_GROUPS, PLANTS, type Plant, type PlantGroup, startsOn, toIsoDate } from "@leira/core"
import { useId, useState, useSyncExternalStore } from "react"
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
 * From a tablet up every name fits on one line.
 */
// Two lines of text-sm (2 × 20 px), its padding (12 px) and border (2 px).
const toolClass = `${toggleButtonClass} max-md:min-h-[54px]`

/**
 * A kind's button in the row of kinds. Pressed, it fills in rather than going
 * bold, so the buttons beside it do not shift.
 */
const kindChipClass =
  "shrink-0 whitespace-nowrap rounded-full border border-stone-300 bg-white px-2.5 py-1 text-xs font-medium text-stone-700 hover:bg-stone-100 aria-pressed:border-emerald-700 aria-pressed:bg-emerald-700 aria-pressed:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700"

/** The crops already in the garden being edited, or one of the kinds every crop is sorted into. */
type Kind = "here" | PlantGroup

/**
 * From this width the palette is a column beside the garden, with room for
 * each kind to fold open under its name: Tailwind's `lg`, where the editor's
 * layout changes. Below it the palette is a row above the garden, which must
 * keep one height, so the kinds become a row of buttons instead.
 */
const WIDE_SCREEN = "(min-width: 64rem)"

function onScreenChange(notify: () => void): () => void {
  const query = window.matchMedia?.(WIDE_SCREEN)
  query?.addEventListener("change", notify)
  return () => query?.removeEventListener("change", notify)
}

/** Whether the screen is wide. A browser that cannot say counts as narrow. */
function useWideScreen(): boolean {
  return useSyncExternalStore(
    onScreenChange,
    () => window.matchMedia?.(WIDE_SCREEN).matches ?? false,
    () => false
  )
}

/** Where the kinds left open on a wide screen are kept, so the list looks the same next time. */
const OPEN_KINDS_KEY = "leira.palette.open"

const KINDS: readonly Kind[] = ["here", ...PLANT_GROUPS]

/** The kinds left open last time. At first only the garden's own crops are. */
function readOpenKinds(): Set<Kind> {
  try {
    const stored: unknown = JSON.parse(localStorage.getItem(OPEN_KINDS_KEY) ?? "null")
    if (Array.isArray(stored)) {
      return new Set(KINDS.filter((kind) => stored.includes(kind)))
    }
  } catch {
    // Storage blocked or garbled: start as a first visit does.
  }
  return new Set(["here"])
}

function writeOpenKinds(open: ReadonlySet<Kind>): void {
  try {
    localStorage.setItem(OPEN_KINDS_KEY, JSON.stringify([...open]))
  } catch {
    // Not kept: the list opens as it did before next time.
  }
}

/** A crop as the list offers it, with the ways it can be started now when that is asked. */
interface Offer {
  plant: Plant
  ways: ReturnType<typeof startsOn>
}

/** The tools and the plants that can be placed on the garden. What they do is said by `ToolGuide`. */
export function Palette() {
  const { t } = useTranslation()
  const tool = useEditor((state) => state.tool)
  const selectingMany = useEditor((state) => state.selectingMany)
  const viewDate = useEditor((state) => state.viewDate)
  const plantings = useEditor((state) => state.plan.plantings)
  const { setTool, setSelectingMany } = editorStore.getState()
  const language = currentLanguage()
  const wide = useWideScreen()

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
  const shown: Offer[] = sorted
    .filter((plant) =>
      [plant.name[language], plant.latin, t(`rotation.family.${plant.family}`)].some((text) =>
        foldText(text).includes(wanted)
      )
    )
    .map((plant) => ({ plant, ways: startNow ? startsOn(plant, now) : [] }))
    .filter(({ ways }) => !startNow || ways.length > 0)

  // While a search or "now" narrows the list, every match shows under its kind
  // and the garden's own crops are left out: they would only show some twice.
  const filtering = wanted !== "" || startNow
  const inGarden = new Set(plantings.map((planting) => planting.plantId))
  const kinds = KINDS.flatMap((kind) => {
    if (kind === "here" && filtering) return []
    const offers = shown.filter(({ plant }) =>
      kind === "here" ? inGarden.has(plant.id) : plant.group === kind
    )
    return offers.length > 0 ? [{ kind, offers }] : []
  })

  const pick = (plant: Plant) => setTool({ kind: "plant", plantId: plant.id })
  const isChosen = (plant: Plant) => tool.kind === "plant" && tool.plantId === plant.id

  return (
    <aside className="flex flex-col gap-2 border-b border-stone-200 bg-stone-100 p-3 md:col-start-1 md:row-start-1 lg:col-start-1 lg:row-start-1 lg:gap-4 lg:overflow-y-auto lg:border-r lg:border-b-0">
      <section aria-labelledby="palette-tools">
        <h2
          id="palette-tools"
          className="mb-1 text-xs font-semibold tracking-wide text-stone-500 uppercase max-lg:sr-only"
        >
          {t("editor.tools")}
        </h2>
        {/*
          One row on a phone, so the garden below keeps its height. On a
          tablet each button keeps to its name's width, and on a wide screen
          they stack in the side column.
        */}
        <div className="grid grid-cols-3 gap-1 md:grid-cols-[repeat(3,max-content)] lg:grid-cols-1">
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
        <label className="flex items-center gap-1.5 text-sm text-stone-800">
          <input
            type="checkbox"
            className="size-4 accent-emerald-700"
            aria-describedby="palette-season-where"
            checked={startNow}
            onChange={(event) => setStartNow(event.target.checked)}
          />
          {t("season.startNow")}
        </label>
        {/* The months come from northern and central calendars; further south they mislead. */}
        <p id="palette-season-where" className="mb-1 text-xs text-stone-500">
          {t("season.where")}
        </p>
        {shown.length === 0 && (
          <p className="text-sm text-stone-600">
            {wanted
              ? t("editor.noPlantMatches", { search: search.trim() })
              : t("season.nothingNow", { month: monthName(Number(now.slice(5, 7)), language) })}
          </p>
        )}
        {wide ? (
          <FoldedKinds
            kinds={kinds}
            filter={filtering ? `${wanted}\n${startNow}` : null}
            isChosen={isChosen}
            onPick={pick}
          />
        ) : (
          <KindRow kinds={kinds} all={shown} searching={wanted} isChosen={isChosen} onPick={pick} />
        )}
      </section>
    </aside>
  )
}

interface KindsProps {
  /** The kinds that hold something to offer, in the order they are shown. */
  kinds: { kind: Kind; offers: Offer[] }[]
  isChosen(plant: Plant): boolean
  onPick(plant: Plant): void
}

/**
 * The narrow screen's kinds: a row of buttons, one kind at a time, over the
 * one row of crops to swipe through. Both rows keep one height whatever is
 * picked, so the garden below never moves.
 */
function KindRow({
  kinds,
  all,
  searching,
  isChosen,
  onPick,
}: KindsProps & { all: Offer[]; searching: string }) {
  const { t } = useTranslation()
  const [picked, setPicked] = useState<Kind | "all">("all")
  // A search looks through every kind: one typed while a kind is picked
  // would otherwise find nothing outside it.
  const [searched, setSearched] = useState(searching)
  if (searched !== searching) {
    setSearched(searching)
    if (searching) setPicked("all")
  }
  // A kind that has nothing left to offer, under a filter, is no longer there to pick.
  const current = kinds.find(({ kind }) => kind === picked)
  const offers = current?.offers ?? all
  const showing = current?.kind ?? "all"

  return (
    <>
      {/* biome-ignore lint/a11y/useSemanticElements: a fieldset is for form controls, and these are toggle buttons */}
      <div
        role="group"
        aria-label={t("editor.kinds")}
        className="mb-1 flex gap-1 overflow-x-auto pb-1"
      >
        <button
          type="button"
          className={kindChipClass}
          aria-pressed={showing === "all"}
          onClick={() => setPicked("all")}
        >
          {t("editor.allPlants")}
        </button>
        {kinds.map(({ kind }) => (
          <button
            key={kind}
            type="button"
            className={kindChipClass}
            aria-pressed={showing === kind}
            onClick={() => setPicked(kind)}
          >
            {t(`editor.kind.${kind}`)}
          </button>
        ))}
      </div>
      {/* One row to swipe through, where the palette sits above the canvas. */}
      <ul className="flex gap-1 overflow-x-auto pb-1">
        {offers.map((offer) => (
          <li key={offer.plant.id} className="shrink-0 whitespace-nowrap">
            <CropButton offer={offer} chosen={isChosen(offer.plant)} onPick={onPick} />
          </li>
        ))}
      </ul>
    </>
  )
}

/**
 * The wide screen's kinds: each under its name, folded open or shut. Which
 * ones are open is remembered. A search or "now" opens every kind with a
 * match until it changes; folding one shut then lasts for that filter only.
 */
function FoldedKinds({ kinds, filter, isChosen, onPick }: KindsProps & { filter: string | null }) {
  const { t } = useTranslation()
  const listId = useId()
  const [open, setOpen] = useState(readOpenKinds)
  const [shutWhileFiltering, setShut] = useState<{ filter: string; kinds: Set<Kind> } | null>(null)
  const shut =
    filter !== null && shutWhileFiltering?.filter === filter ? shutWhileFiltering.kinds : null

  const isOpen = (kind: Kind) => (filter === null ? open.has(kind) : !shut?.has(kind))
  const toggle = (kind: Kind) => {
    if (filter !== null) {
      const next = new Set(shut)
      if (next.has(kind)) next.delete(kind)
      else next.add(kind)
      setShut({ filter, kinds: next })
      return
    }
    const next = new Set(open)
    if (next.has(kind)) next.delete(kind)
    else next.add(kind)
    setOpen(next)
    writeOpenKinds(next)
  }

  return (
    <div className="flex flex-col gap-1">
      {kinds.map(({ kind, offers }) => {
        const expanded = isOpen(kind)
        const id = `${listId}-${kind}`
        return (
          <div key={kind}>
            <button
              type="button"
              className="flex w-full items-center gap-1.5 rounded-md px-1 py-1 text-left text-xs font-semibold tracking-wide text-stone-600 uppercase hover:bg-stone-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700"
              aria-expanded={expanded}
              aria-controls={id}
              onClick={() => toggle(kind)}
            >
              <svg
                aria-hidden="true"
                viewBox="0 0 12 12"
                className={`size-3 shrink-0 transition-transform motion-reduce:transition-none ${expanded ? "rotate-90" : ""}`}
              >
                <path d="M4 2l4 4-4 4" fill="none" stroke="currentColor" strokeWidth="1.5" />
              </svg>
              {t("editor.kindCount", { name: t(`editor.kind.${kind}`), count: offers.length })}
            </button>
            {expanded && (
              <ul id={id} className="mt-0.5 mb-1 flex flex-col">
                {offers.map((offer) => (
                  <li key={offer.plant.id}>
                    <CropButton offer={offer} chosen={isChosen(offer.plant)} onPick={onPick} />
                  </li>
                ))}
              </ul>
            )}
          </div>
        )
      })}
    </div>
  )
}

function CropButton({
  offer: { plant, ways },
  chosen,
  onPick,
}: {
  offer: Offer
  chosen: boolean
  onPick(plant: Plant): void
}) {
  const { t } = useTranslation()
  const language = currentLanguage()
  return (
    <button
      type="button"
      className={toggleButtonClass}
      aria-pressed={chosen}
      onClick={() => onPick(plant)}
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
  )
}

/** Lowercase and without accents, so "feijao" finds "Feijão". */
function foldText(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
}
