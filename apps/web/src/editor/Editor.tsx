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
import { ZoomControls } from "./ZoomControls"

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
    // Three columns on a wide screen. On a narrow one the parts stack and the
    // editor scrolls as a whole, so the canvas keeps a height worth drawing on.
    <div className="grid h-full min-h-0 grid-cols-[minmax(0,1fr)] grid-rows-[auto_minmax(26rem,1fr)_auto] overflow-y-auto lg:grid-cols-[14rem_minmax(0,1fr)_18rem] lg:grid-rows-1 lg:overflow-hidden">
      <Palette />
      <main className="relative flex min-h-0 flex-col">
        {/*
          A row of its own on a narrow screen, where it would cover the garden.
          On a wide one it floats over the canvas and lets presses through to
          it: only its controls take them.
        */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-stone-200 bg-stone-100 p-2 lg:pointer-events-none lg:absolute lg:inset-x-2 lg:top-2 lg:z-10 lg:items-start lg:border-b-0 lg:bg-transparent lg:p-0 lg:*:pointer-events-auto">
          <div className="flex gap-1">
            <button
              type="button"
              className={buttonClass}
              aria-label={t("editor.undo")}
              disabled={!canUndo}
              onClick={undo}
            >
              <StepIcon />
              <span className="hidden sm:inline">{t("editor.undo")}</span>
            </button>
            <button
              type="button"
              className={buttonClass}
              aria-label={t("editor.redo")}
              disabled={!canRedo}
              onClick={redo}
            >
              <StepIcon forward />
              <span className="hidden sm:inline">{t("editor.redo")}</span>
            </button>
          </div>
          <DateFilter />
        </div>
        <div className="relative min-h-0 flex-1">
          <GardenCanvas />
          {/* In the bottom corner, where a thumb reaches and no label of the plan starts. */}
          <div className="absolute right-2 bottom-2">
            <ZoomControls />
          </div>
        </div>
      </main>
      <Inspector>{aside}</Inspector>
    </div>
  )
}

/**
 * An arrow that turns back, or forward: what undo and redo look like on a
 * narrow screen, where their names would push the date off the row.
 */
function StepIcon({ forward = false }: { forward?: boolean }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`size-4 sm:hidden ${forward ? "-scale-x-100" : ""}`}
    >
      <path d="M7 4 3 8l4 4" />
      <path d="M3 8h9a5 5 0 0 1 0 10H8" />
    </svg>
  )
}
