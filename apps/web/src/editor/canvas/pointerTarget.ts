import {
  containsPoint,
  handleAt,
  itemRect,
  type PlanItemRef,
  type Point,
  type ResizeHandle,
} from "@garden/core"
import type { EditorState } from "../store"

/** What a press with the select tool starts. */
export type PointerTarget =
  | { kind: "resize"; ref: PlanItemRef; handle: ResizeHandle }
  | { kind: "move"; ref: PlanItemRef }
  | { kind: "pan" }

/**
 * Decides what pressing at `point` with the select tool does. Only the
 * selected item can be moved or resized: everywhere else a drag pans the view,
 * so scrolling around a full garden never shifts a bed by accident.
 *
 * `reach` is how far from a handle's centre a press still grabs it, in centimetres.
 */
export function pointerTarget(
  state: Pick<EditorState, "plan" | "selection">,
  point: Point,
  reach: number
): PointerTarget {
  const { plan, selection } = state
  const rect = selection && itemRect(plan, selection)
  if (!selection || !rect) return { kind: "pan" }

  const handle = handleAt(rect, point, reach)
  if (handle) return { kind: "resize", ref: selection, handle }
  if (containsPoint(rect, point)) return { kind: "move", ref: selection }
  return { kind: "pan" }
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
  return target.kind === "move" ? "move" : "grab"
}
