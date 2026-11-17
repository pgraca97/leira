import {
  containsPoint,
  handleAt,
  itemRect,
  type PlanItemRef,
  type Point,
  type ResizeHandle,
} from "@leira/core"
import { type EditorState, selectedItems } from "../store"

/** What a press with the select tool starts. */
export type PointerTarget =
  | { kind: "resize"; ref: PlanItemRef; handle: ResizeHandle }
  /** Moves every selected item together. */
  | { kind: "move" }
  /** Draws an area whose items join the selection. */
  | { kind: "area" }
  | { kind: "pan" }

/**
 * Decides what pressing at `point` with the select tool does. Only selected
 * items can be moved, and resized only when one is selected on its own:
 * everywhere else a drag pans the view, so scrolling around a full garden
 * never shifts a bed by accident.
 *
 * While `adding` to the selection (Shift held, or selecting several by touch),
 * a drag that would pan draws an area to select instead.
 *
 * `reach` is how far from a handle's centre a press still grabs it, in centimetres.
 */
export function pointerTarget(
  state: Pick<EditorState, "plan" | "selection">,
  point: Point,
  reach: number,
  { adding = false }: { adding?: boolean } = {}
): PointerTarget {
  const rects = selectedItems(state).flatMap((ref) => {
    const rect = itemRect(state.plan, ref)
    return rect ? [{ ref, rect }] : []
  })
  const [only] = rects
  if (only && rects.length === 1) {
    const handle = handleAt(only.rect, point, reach)
    if (handle) return { kind: "resize", ref: only.ref, handle }
  }
  if (rects.some(({ rect }) => containsPoint(rect, point))) return { kind: "move" }
  return adding ? { kind: "area" } : { kind: "pan" }
}

const RESIZE_CURSOR: Record<ResizeHandle, string> = {
  n: "ns-resize",
  s: "ns-resize",
  e: "ew-resize",
  w: "ew-resize",
  nw: "nwse-resize",
  se: "nwse-resize",
  ne: "nesw-resize",
  sw: "nesw-resize",
}

/** The mouse cursor that tells the user what a press would do. */
export function cursorFor(target: PointerTarget): string {
  if (target.kind === "resize") return RESIZE_CURSOR[target.handle]
  if (target.kind === "area") return "crosshair"
  return target.kind === "move" ? "move" : "grab"
}
