import { type GardenLocation, gardenFile } from "@leira/core"
import { useState } from "react"
import { useTranslation } from "react-i18next"
import { buttonClass } from "../components/ui"
import { editorStore, shownPlan } from "../editor/store"
import { currentLanguage } from "../i18n"
import { downloadText } from "./downloadFile"
import { downloadPng } from "./downloadImage"
import { fileNameFor } from "./fileName"
import { imageSize } from "./imageSize"
import { PlanSvg } from "./PlanSvg"

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
    // Read at the moment of the click, so the picture shows the plan as it is now,
    // and only what is in the ground on the day shown, as on the screen.
    const plan = shownPlan(editorStore.getState())
    try {
      // The server renderer is only needed here, so it loads on the first save
      // instead of making every visit download it.
      const { renderToStaticMarkup } = await import("react-dom/server")
      const markup = renderToStaticMarkup(
        <PlanSvg plan={plan} locale={currentLanguage()} title={gardenName} />
      )
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
