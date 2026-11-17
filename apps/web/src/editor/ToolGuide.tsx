import { getPlant, PLANTS, relationBetween } from "@leira/core"
import { useTranslation } from "react-i18next"
import { currentLanguage } from "../i18n"
import { seasonText } from "./season"
import { useEditor } from "./useEditor"

/**
 * What the tool in hand does, and for a crop, when it goes in the ground and
 * what to grow it next to. Its length changes with the tool, so on a phone it
 * sits below the garden, where growing or shrinking moves nothing the user is
 * pressing on. On a wide screen it closes the tools' column.
 */
export function ToolGuide({ className = "" }: { className?: string }) {
  const { t } = useTranslation()
  const tool = useEditor((state) => state.tool)
  const selectingMany = useEditor((state) => state.selectingMany)
  const language = currentLanguage()

  const hint = selectingMany
    ? t("editor.hintSelectMany")
    : tool.kind === "select"
      ? t("editor.hintSelect")
      : tool.kind === "bed"
        ? t("editor.hintBed")
        : t("editor.hintPlant")

  // Advice for the plant about to be placed: who to put it next to, who to keep it from.
  const chosen = tool.kind === "plant" ? getPlant(tool.plantId) : undefined
  const neighbours = (relation: "good" | "bad") =>
    chosen
      ? PLANTS.filter((plant) => relationBetween(chosen, plant) === relation)
          .map((plant) => plant.name[language])
          .sort((a, b) => a.localeCompare(b, language))
      : []

  return (
    <div className={`flex flex-col gap-1 text-xs text-stone-600 ${className}`}>
      <p>{hint}</p>
      {chosen && (
        <>
          <p>{t("season.goesIn", { season: seasonText(chosen.groundMonths, language, t) })}</p>
          {neighbours("good").length > 0 && (
            <p>{t("companions.goodWith", { names: neighbours("good").join(", ") })}</p>
          )}
          {neighbours("bad").length > 0 && (
            <p className="text-amber-800">
              {t("companions.badWith", { names: neighbours("bad").join(", ") })}
            </p>
          )}
        </>
      )}
    </div>
  )
}
