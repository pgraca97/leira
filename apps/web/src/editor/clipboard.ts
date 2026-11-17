import { type Clipboard, ClipboardSchema } from "@leira/core"

/**
 * Where copied items wait to be pasted. In the browser's storage rather than
 * in memory, so they can be pasted into another garden, in another tab, or
 * after a reload. Only this browser sees them.
 */
export const CLIPBOARD_KEY = "leira.clipboard"

/** What was copied last, or null when nothing was, or it cannot be read any more. */
export function readClipboard(): Clipboard | null {
  try {
    const stored = localStorage.getItem(CLIPBOARD_KEY)
    if (!stored) return null
    const parsed = ClipboardSchema.safeParse(JSON.parse(stored))
    return parsed.success ? parsed.data : null
  } catch {
    // Storage blocked (private mode, strict settings) or a broken value: nothing to paste.
    return null
  }
}

export function writeClipboard(clipboard: Clipboard): void {
  try {
    localStorage.setItem(CLIPBOARD_KEY, JSON.stringify(clipboard))
  } catch {
    // Not kept: the copy still works in this page, through the editor store.
  }
}
