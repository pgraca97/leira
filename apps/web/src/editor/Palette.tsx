import { getPlant, PLANTS, relationBetween } from "@garden/core"
import { useTranslation } from "react-i18next"
import { toggleButtonClass } from "../components/ui"
import { currentLanguage } from "../i18n"
import { editorStore } from "./store"
import { useEditor } from "./useEditor"

/** The tools and the plants that can be placed on the garden. */
export function Palette() {
  const { t } = useTranslation()
  const tool = useEditor((state) => state.tool)
  const { setTool } = editorStore.getState()
  const language = currentLanguage()

  // Advice for the plant about to be placed: who to put it next to, who to keep it from.
  const chosen = tool.kind === "plant" ? getPlant(tool.plantId) : undefined
  const neighbours = (relation: "good" | "bad") =>
    chosen
      ? PLANTS.filter((plant) => relationBetween(chosen, plant) === relation).map(
          (plant) => plant.name[language]
        )
      : []

  const hint =
    tool.kind === "select"
      ? t("editor.hintSelect")
      : tool.kind === "bed"
        ? t("editor.hintBed")
        : t("editor.hintPlant")

  return (
    <aside className="flex flex-col gap-4 border-b border-stone-200 bg-stone-100 p-3 lg:overflow-y-auto lg:border-r lg:border-b-0">
      <section aria-labelledby="palette-tools">
        <h2
          id="palette-tools"
          className="mb-1 text-xs font-semibold tracking-wide text-stone-500 uppercase"
        >
          {t("editor.tools")}
        </h2>
        <div className="grid grid-cols-2 gap-1 lg:grid-cols-1">
          <button
            type="button"
            className={toggleButtonClass}
            aria-pressed={tool.kind === "select"}
            onClick={() => setTool({ kind: "select" })}
          >
            {t("editor.select")}
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
          className="mb-1 text-xs font-semibold tracking-wide text-stone-500 uppercase"
        >
          {t("editor.plants")}
        </h2>
        <ul className="grid grid-cols-2 gap-1 sm:grid-cols-3 lg:grid-cols-1">
          {PLANTS.map((plant) => (
            <li key={plant.id}>
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
              </button>
            </li>
          ))}
        </ul>
      </section>

      <p className="text-xs text-stone-600">{hint}</p>
      {chosen && (
        <div className="flex flex-col gap-1 text-xs text-stone-600">
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
