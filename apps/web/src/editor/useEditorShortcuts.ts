import { itemsWithin, planBounds } from "@leira/core"
import { useEffect } from "react"
import { editorStore, redo, shownPlan, undo, type ViewAction } from "./store"

/** Whether the event comes from a field where keys mean typing, not shortcuts. */
function isTyping(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName))
  )
}

/** Where each arrow key nudges the selection, in grid cells. */
const ARROWS: Record<string, readonly [x: number, y: number]> = {
  arrowleft: [-1, 0],
  arrowright: [1, 0],
  arrowup: [0, -1],
  arrowdown: [0, 1],
}
/** Cells an arrow key moves the selection with Shift held: a metre on the default grid. */
const BIG_NUDGE_CELLS = 10

/**
 * What each key asks of the view, by the character it types: "+" needs Shift
 * on some keyboards, so "=" zooms in as well, and the number pad works too.
 */
const ZOOM_KEYS: Record<string, ViewAction> = {
  "+": "zoom-in",
  "=": "zoom-in",
  "-": "zoom-out",
  "0": "fit",
}

/**
 * Keyboard shortcuts for the editor: Delete removes the selection, the arrow
 * keys nudge it (further with Shift), Ctrl/Cmd+D duplicates it, Ctrl/Cmd+A
 * selects everything shown, Ctrl/Cmd+C copies the selection, Ctrl/Cmd+V pastes
 * it in place and Ctrl/Cmd+Shift+V pastes it a year on, Escape steps back (out of selecting several, then
 * out of the selection or the drawing tool), Ctrl/Cmd+Z undoes, Ctrl/Cmd+Shift+Z
 * or Ctrl+Y redoes. "+" and "-" zoom about the middle of the view and "0" fits
 * the garden, with no Ctrl: Ctrl with them stays the browser's own zoom, which
 * someone who needs larger text relies on.
 */
export function useEditorShortcuts(): void {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (isTyping(event.target)) return
      const state = editorStore.getState()
      const key = event.key.toLowerCase()
      const command = event.ctrlKey || event.metaKey
      const zoom = command || event.altKey ? undefined : ZOOM_KEYS[event.key]

      if (command && key === "z") {
        event.preventDefault()
        if (event.shiftKey) redo()
        else undo()
      } else if (command && key === "y") {
        event.preventDefault()
        redo()
      } else if (command && key === "d") {
        // Always claimed, so the browser's bookmark dialog never opens over the editor.
        event.preventDefault()
        state.duplicateSelection()
      } else if (command && key === "c") {
        // Nothing selected: the browser may have text to copy.
        if (state.selection.length === 0) return
        event.preventDefault()
        state.copySelection()
      } else if (command && key === "v") {
        if (!state.clipboard) return
        event.preventDefault()
        state.paste({ nextYear: event.shiftKey })
      } else if (command && key === "a") {
        // Claimed too, so the browser does not select the page's text instead.
        event.preventDefault()
        // What is drawn: a crop away on the day shown cannot be seen, so it is not picked.
        const shown = shownPlan(state)
        state.selectItems(itemsWithin(shown, planBounds(shown)))
      } else if (zoom) {
        event.preventDefault()
        state.requestView(zoom)
      } else if (ARROWS[key] && !command && !event.altKey) {
        if (state.selection.length === 0) return
        event.preventDefault()
        const [x, y] = ARROWS[key]
        const cells = event.shiftKey ? BIG_NUDGE_CELLS : 1
        state.nudgeSelection(x * cells, y * cells)
      } else if (key === "delete" || key === "backspace") {
        if (state.selection.length === 0) return
        event.preventDefault()
        state.removeSelection()
      } else if (key === "escape") {
        if (state.selectingMany) state.setSelectingMany(false)
        else if (state.tool.kind === "select") state.select(null)
        else state.setTool({ kind: "select" })
      }
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [])
}
