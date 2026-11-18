import { type ReactNode, useEffect } from "react"
import { useTranslation } from "react-i18next"
import { buttonClass } from "../components/ui"
import { currentLanguage } from "../i18n"
import { GardenCanvas } from "./canvas/GardenCanvas"
import { EditorDateFilter } from "./DateFilter"
import { Inspector } from "./Inspector"
import { Palette } from "./Palette"
import { editorStore, redo, undo } from "./store"
import { ToolGuide } from "./ToolGuide"
import { useHistory } from "./useEditor"
import { useEditorShortcuts } from "./useEditorShortcuts"
import { useSharedClipboard } from "./useSharedClipboard"
import { ZoomControls } from "./ZoomControls"

/**
 * The garden editor: palette, canvas and inspector around the shared editor store.
 * `aside` is shown in the inspector column, for what belongs to the garden rather than the plan.
 */
export function Editor({ aside }: { aside?: ReactNode }) {
  const { t, i18n } = useTranslation()
  const { canUndo, canRedo } = useHistory()
  useEditorShortcuts()
  useSharedClipboard()

  // The canvas draws plant names itself, so it needs to know the language.
  // biome-ignore lint/correctness/useExhaustiveDependencies: re-run when the language changes
  useEffect(() => {
    editorStore.getState().setLocale(currentLanguage())
  }, [i18n.language])

  return (
    // Three columns on a wide screen, the tools' guide closing the first one.
    // On a tablet two: the tools above the garden and the guide below it, and
    // the inspector beside them, so its advice stays in sight while drawing.
    // On a phone the parts stack and the editor scrolls as a whole, so the
    // canvas keeps a height worth drawing on. On both the guide comes after
    // the canvas: its length changes with the tool, and above the garden it
    // would move the garden every time. A screen too short for the garden
    // (a phone turned sideways) scrolls rather than squash it.
    <div className="grid h-full min-h-0 grid-cols-[minmax(0,1fr)] grid-rows-[auto_minmax(26rem,1fr)_auto_auto] overflow-y-auto md:grid-cols-[minmax(0,1fr)_17rem] md:grid-rows-[auto_minmax(24rem,1fr)_auto] lg:grid-cols-[14rem_minmax(0,1fr)_18rem] lg:grid-rows-[minmax(0,1fr)_auto] lg:overflow-hidden">
      <Palette />
      <main className="relative flex min-h-0 flex-col md:col-start-1 md:row-start-2 lg:col-start-2 lg:row-span-2 lg:row-start-1">
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
          <EditorDateFilter />
        </div>
        <div className="relative min-h-0 flex-1">
          <GardenCanvas />
          {/* In the bottom corner, where a thumb reaches and no label of the plan starts. */}
          <div className="absolute right-2 bottom-2">
            <ZoomControls />
          </div>
        </div>
      </main>
      <ToolGuide className="border-b border-stone-200 bg-stone-100 p-3 md:col-start-1 md:row-start-3 lg:col-start-1 lg:row-start-2 lg:border-r lg:border-b-0" />
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
