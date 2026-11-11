import { type ReactNode, useEffect } from "react"
import { useTranslation } from "react-i18next"
import { buttonClass } from "../components/ui"
import { currentLanguage } from "../i18n"
import { GardenCanvas } from "./canvas/GardenCanvas"
import { DateFilter } from "./DateFilter"
import { Inspector } from "./Inspector"
import { Palette } from "./Palette"
import { editorStore, redo, undo } from "./store"
import { useHistory } from "./useEditor"
import { useEditorShortcuts } from "./useEditorShortcuts"

/**
 * The garden editor: palette, canvas and inspector around the shared editor store.
 * `aside` is shown in the inspector column, for what belongs to the garden rather than the plan.
 */
export function Editor({ aside }: { aside?: ReactNode }) {
  const { t, i18n } = useTranslation()
  const { canUndo, canRedo } = useHistory()
  useEditorShortcuts()

  // The canvas draws plant names itself, so it needs to know the language.
  // biome-ignore lint/correctness/useExhaustiveDependencies: re-run when the language changes
  useEffect(() => {
    editorStore.getState().setLocale(currentLanguage())
  }, [i18n.language])

  return (
    <div className="grid h-full min-h-0 grid-cols-1 grid-rows-[auto_minmax(16rem,1fr)_auto] lg:grid-cols-[14rem_minmax(0,1fr)_18rem] lg:grid-rows-1">
      <Palette />
      <main className="relative min-h-0">
        <GardenCanvas />
        {/* The bar itself lets presses through to the canvas; only its controls take them. */}
        <div className="pointer-events-none absolute inset-x-2 top-2 flex flex-wrap items-start justify-between gap-2 *:pointer-events-auto">
          <div className="flex gap-1">
            <button type="button" className={buttonClass} disabled={!canUndo} onClick={undo}>
              {t("editor.undo")}
            </button>
            <button type="button" className={buttonClass} disabled={!canRedo} onClick={redo}>
              {t("editor.redo")}
            </button>
          </div>
          <DateFilter />
        </div>
      </main>
      <Inspector>{aside}</Inspector>
    </div>
  )
}
