import { useEffect, useRef, useState } from "react"
import { useTranslation } from "react-i18next"

/**
 * The garden canvas. Phaser is most of the app's code, so it is loaded on
 * demand: the page renders first and the canvas appears when it arrives.
 */
export function GardenCanvas() {
  const { t } = useTranslation()
  const containerRef = useRef<HTMLDivElement>(null)
  const [status, setStatus] = useState<"loading" | "ready" | "failed">("loading")

  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    let handle: { destroy(): void } | undefined
    // Set by the cleanup, so a canvas that finishes loading after an unmount
    // (as happens twice over in React's StrictMode) is never started.
    let disposed = false

    import("./createGardenCanvas")
      .then(({ createGardenCanvas }) => {
        if (disposed) return
        handle = createGardenCanvas(container)
        setStatus("ready")
      })
      .catch(() => {
        if (!disposed) setStatus("failed")
      })

    return () => {
      disposed = true
      handle?.destroy()
    }
  }, [])

  return (
    <div className="relative h-full min-h-0 w-full overflow-hidden bg-stone-300">
      <div
        ref={containerRef}
        role="img"
        aria-label={t("editor.canvasLabel")}
        data-testid="garden-canvas"
        data-status={status}
        className="h-full w-full touch-none [&>canvas]:block"
      />
      {status !== "ready" && (
        <p
          role={status === "failed" ? "alert" : "status"}
          className="absolute inset-0 grid place-items-center p-4 text-center text-sm text-stone-600"
        >
          {status === "failed" ? t("editor.canvasFailed") : t("editor.canvasLoading")}
        </p>
      )}
    </div>
  )
}
