import { useEffect } from "react"
import { useTranslation } from "react-i18next"
import { buttonClass } from "../components/ui"
import { currentLanguage } from "../i18n"
import { GardenCanvas } from "./canvas/GardenCanvas"
import { Inspector } from "./Inspector"
import { Palette } from "./Palette"
import { editorStore, redo, undo } from "./store"
import { useHistory } from "./useEditor"
import { useEditorShortcuts } from "./useEditorShortcuts"

/** The garden editor: palette, canvas and inspector around the shared editor store. */
export function Editor() {
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
        <div className="absolute top-2 left-2 flex gap-1">
          <button type="button" className={buttonClass} disabled={!canUndo} onClick={undo}>
            {t("editor.undo")}
          </button>
          <button type="button" className={buttonClass} disabled={!canRedo} onClick={redo}>
            {t("editor.redo")}
          </button>
        </div>
      </main>
      <Inspector />
    </div>
  )
}
