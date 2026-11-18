import { useTranslation } from "react-i18next"
import { buttonClass } from "../components/ui"
import { editorStore } from "./store"
import { useEditor } from "./useEditor"

/**
 * Buttons that zoom the canvas, for a touch screen, a trackpad or a keyboard,
 * where there is no mouse wheel. They only ask: the canvas does the zooming
 * and reports back what is still possible. Each names the key that does the
 * same (see `useEditorShortcuts`), to a pointer as a tooltip and to a screen
 * reader through `aria-keyshortcuts`.
 */
export function ZoomControls() {
  const { t } = useTranslation()
  const view = useEditor((state) => state.view)
  const { requestView } = editorStore.getState()
  const squareClass = `${buttonClass} w-9 px-0 text-base leading-none`

  return (
    <div className="flex gap-1">
      <button
        type="button"
        className={squareClass}
        aria-label={t("editor.zoomOut")}
        aria-keyshortcuts="-"
        title={t("editor.zoomOutKey")}
        disabled={!view.canZoomOut}
        onClick={() => requestView("zoom-out")}
      >
        −
      </button>
      <button
        type="button"
        className={squareClass}
        aria-label={t("editor.zoomIn")}
        // "Plus" is how ARIA writes the "+" key, since "+" joins keys there.
        aria-keyshortcuts="Plus ="
        title={t("editor.zoomInKey")}
        disabled={!view.canZoomIn}
        onClick={() => requestView("zoom-in")}
      >
        +
      </button>
      <button
        type="button"
        className={buttonClass}
        aria-label={t("editor.zoomFit")}
        aria-keyshortcuts="0"
        title={t("editor.zoomFitKey")}
        disabled={view.fitted}
        onClick={() => requestView("fit")}
      >
        {t("editor.zoomFitShort")}
      </button>
    </div>
  )
}
