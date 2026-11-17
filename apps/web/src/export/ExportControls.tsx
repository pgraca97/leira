import { type GardenLocation, type GardenPlan, gardenFile } from "@leira/core"
import { useState } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { useTranslation } from "react-i18next"
import { buttonClass } from "../components/ui"
import { editorStore } from "../editor/store"
import { currentLanguage } from "../i18n"
import { downloadText } from "./downloadFile"
import { downloadPng } from "./downloadImage"
import { fileNameFor } from "./fileName"
import { PlanSvg } from "./PlanSvg"

/** Pixels per centimetre of garden in a saved image: a 6 m garden comes out 2560 px wide. */
const PIXELS_PER_CM = 4
/** Longest side of a saved image. Browsers refuse canvases much larger than this. */
const MAX_SIDE_PX = 8000
/** Matches the margin `PlanSvg` draws around the garden. */
const MARGIN_CM = 20

/** The picture's size in pixels: true to scale, capped so a huge garden still exports. */
function imageSize(plan: GardenPlan): { width: number; height: number } {
  const width = plan.widthCm + 2 * MARGIN_CM
  const height = plan.heightCm + 2 * MARGIN_CM
  const scale = Math.min(PIXELS_PER_CM, MAX_SIDE_PX / Math.max(width, height))
  return { width: Math.round(width * scale), height: Math.round(height * scale) }
}

/**
 * Buttons that take the plan out of the app: as an image, as a file to import
 * again, or on paper.
 */
export function ExportControls({
  gardenName,
  location,
}: {
  gardenName: string
  location: GardenLocation | null
}) {
  const { t } = useTranslation()
  const [failed, setFailed] = useState(false)

  const saveImage = async () => {
    // Read at the moment of the click, so the picture shows the plan as it is now.
    const { plan } = editorStore.getState()
    const markup = renderToStaticMarkup(
      <PlanSvg plan={plan} locale={currentLanguage()} title={gardenName} />
    )
    try {
      await downloadPng(markup, imageSize(plan), fileNameFor(gardenName, "png"))
      setFailed(false)
    } catch {
      setFailed(true)
    }
  }

  const saveFile = () => {
    // Read at the moment of the click too, edits not saved yet included.
    const { plan } = editorStore.getState()
    const file = gardenFile({ name: gardenName, plan, location }, new Date())
    downloadText(JSON.stringify(file, null, 2), "application/json", fileNameFor(gardenName, "json"))
  }

  return (
    <div className="flex flex-wrap items-center gap-1">
      <button type="button" className={buttonClass} onClick={() => void saveImage()}>
        {t("export.saveImage")}
      </button>
      <button type="button" className={buttonClass} onClick={saveFile}>
        {t("export.file")}
      </button>
      <button type="button" className={buttonClass} onClick={() => window.print()}>
        {t("export.print")}
      </button>
      {failed && (
        <p role="alert" className="text-sm text-red-800">
          {t("export.imageFailed")}
        </p>
      )}
    </div>
  )
}
