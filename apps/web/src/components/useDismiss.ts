import { type RefObject, useEffect } from "react"

/**
 * Closes an open panel the two ways people expect: Escape, which also hands
 * the focus back to the button that opened it, and a press anywhere outside.
 */
export function useDismiss(
  open: boolean,
  close: () => void,
  /** The element holding both the button and the panel: a press inside it is not "outside". */
  container: RefObject<HTMLElement | null>,
  toggle: RefObject<HTMLElement | null>
): void {
  useEffect(() => {
    if (!open) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return
      close()
      toggle.current?.focus()
    }
    const onPointerDown = (event: PointerEvent) => {
      if (!container.current?.contains(event.target as Node)) close()
    }
    document.addEventListener("keydown", onKeyDown)
    document.addEventListener("pointerdown", onPointerDown)
    return () => {
      document.removeEventListener("keydown", onKeyDown)
      document.removeEventListener("pointerdown", onPointerDown)
    }
  }, [open, close, container, toggle])
}
