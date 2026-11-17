import { useEffect } from "react"
import { CLIPBOARD_KEY, readClipboard, writeClipboard } from "./clipboard"
import { editorStore } from "./store"

/**
 * Keeps the editor's clipboard in the browser's storage: what was copied in
 * another garden or tab can be pasted here, and what is copied here survives
 * leaving the garden.
 */
export function useSharedClipboard(): void {
  useEffect(() => {
    const { setClipboard } = editorStore.getState()
    const stored = readClipboard()
    if (stored) setClipboard(stored)

    const unsubscribe = editorStore.subscribe((next, previous) => {
      if (next.clipboard && next.clipboard !== previous.clipboard) writeClipboard(next.clipboard)
    })
    // Fired when another tab of the app copies something.
    const onStorage = (event: StorageEvent) => {
      if (event.key === CLIPBOARD_KEY) setClipboard(readClipboard())
    }
    window.addEventListener("storage", onStorage)
    return () => {
      unsubscribe()
      window.removeEventListener("storage", onStorage)
    }
  }, [])
}
