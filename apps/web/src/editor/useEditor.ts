import { useStore } from "zustand"
import { type EditorState, editorStore } from "./store"

/** Subscribes a component to a slice of the editor state. */
export function useEditor<T>(selector: (state: EditorState) => T): T {
  return useStore(editorStore, selector)
}

/** Whether there is a step to undo and to redo. */
export function useHistory(): { canUndo: boolean; canRedo: boolean } {
  const canUndo = useStore(editorStore.temporal, (history) => history.pastStates.length > 0)
  const canRedo = useStore(editorStore.temporal, (history) => history.futureStates.length > 0)
  return { canUndo, canRedo }
}
