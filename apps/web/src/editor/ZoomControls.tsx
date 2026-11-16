import { useTranslation } from "react-i18next"
import { buttonClass } from "../components/ui"
import { editorStore } from "./store"
import { useEditor } from "./useEditor"

/**
 * Buttons that zoom the canvas, for a touch screen, a trackpad or a keyboard,
 * where there is no mouse wheel. They only ask: the canvas does the zooming
 * and reports back what is still possible.
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
        disabled={!view.canZoomOut}
        onClick={() => requestView("zoom-out")}
      >
        −
      </button>
      <button
        type="button"
        className={squareClass}
        aria-label={t("editor.zoomIn")}
        disabled={!view.canZoomIn}
        onClick={() => requestView("zoom-in")}
      >
        +
      </button>
      <button
        type="button"
        className={buttonClass}
        aria-label={t("editor.zoomFit")}
        disabled={view.fitted}
        onClick={() => requestView("fit")}
      >
        {t("editor.zoomFitShort")}
      </button>
    </div>
  )
}
