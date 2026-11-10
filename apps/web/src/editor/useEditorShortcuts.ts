import { useEffect } from "react"
import { editorStore, redo, undo } from "./store"

/** Whether the event comes from a field where keys mean typing, not shortcuts. */
function isTyping(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName))
  )
}

/**
 * Keyboard shortcuts for the editor: Delete removes the selection, Escape
 * returns to the select tool, Ctrl/Cmd+Z undoes, Ctrl/Cmd+Shift+Z or Ctrl+Y redoes.
 */
export function useEditorShortcuts(): void {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (isTyping(event.target)) return
      const state = editorStore.getState()
      const key = event.key.toLowerCase()
      const command = event.ctrlKey || event.metaKey

      if (command && key === "z") {
        event.preventDefault()
        if (event.shiftKey) redo()
        else undo()
      } else if (command && key === "y") {
        event.preventDefault()
        redo()
      } else if (key === "delete" || key === "backspace") {
        if (!state.selection) return
        event.preventDefault()
        state.removeSelection()
      } else if (key === "escape") {
        if (state.tool.kind === "select") state.select(null)
        else state.setTool({ kind: "select" })
      }
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [])
}
