import {
  type Bed,
  defaultInGround,
  emptyPlan,
  fitRectToPlan,
  type GardenPlan,
  getPlant,
  type PlanItemRef,
  type Planting,
  type PlantingLayout,
  type Rect,
  toIsoDate,
} from "@garden/core"
import { temporal } from "zundo"
import { createStore } from "zustand/vanilla"

/** What a press on the canvas does. */
export type Tool = { kind: "select" } | { kind: "bed" } | { kind: "plant"; plantId: string }

export interface EditorState {
  /** The document being edited. Replaced, never mutated, so `===` detects any change. */
  plan: GardenPlan
  selection: PlanItemRef | null
  tool: Tool
  /** Language for names drawn on the canvas. */
  locale: "pt" | "en"

  /** Replaces the document, e.g. after loading it. Clears the undo history. */
  loadPlan(plan: GardenPlan): void
  /** Adds a bed on the given ground. Returns false when the ground lies outside the garden. */
  addBed(rect: Rect): boolean
  /** Adds a planting. Returns false for an unknown plant or ground outside the garden. */
  addPlanting(plantId: string, rect: Rect, layout: PlantingLayout): boolean
  removeSelection(): void
  select(selection: PlanItemRef | null): void
  setTool(tool: Tool): void
  setLocale(locale: "pt" | "en"): void
}

const UNDO_LIMIT = 100

/**
 * The editor's state, as a framework-free store. React reads it through
 * `useEditor`; the Phaser scene subscribes to it directly. Neither side knows
 * about the other.
 *
 * Only `plan` is tracked for undo: selecting something or switching tool is
 * not a step the user expects to undo.
 */
export const editorStore = createStore<EditorState>()(
  temporal(
    (set, get) => ({
      plan: emptyPlan(),
      selection: null,
      tool: { kind: "select" },
      locale: "en",

      loadPlan: (plan) => {
        const history = editorStore.temporal.getState()
        history.pause()
        set({ plan, selection: null, tool: { kind: "select" } })
        history.resume()
        history.clear()
      },

      addBed: (rect) => {
        const { plan } = get()
        const fitted = fitRectToPlan(plan, rect)
        if (!fitted) return false
        const bed: Bed = { id: crypto.randomUUID(), name: "", kind: "bed", rect: fitted }
        set({
          plan: { ...plan, beds: [...plan.beds, bed] },
          selection: { kind: "bed", id: bed.id },
          // One bed per use of the tool: drawing beds back to back is rare.
          tool: { kind: "select" },
        })
        return true
      },

      addPlanting: (plantId, rect, layout) => {
        const { plan } = get()
        const plant = getPlant(plantId)
        const fitted = fitRectToPlan(plan, rect)
        if (!plant || !fitted) return false
        const planting: Planting = {
          id: crypto.randomUUID(),
          plantId,
          rect: fitted,
          layout,
          inGround: defaultInGround(plant, toIsoDate(new Date())),
        }
        set({
          plan: { ...plan, plantings: [...plan.plantings, planting] },
          selection: { kind: "planting", id: planting.id },
        })
        return true
      },

      removeSelection: () => {
        const { plan, selection } = get()
        if (!selection) return
        set({
          plan:
            selection.kind === "bed"
              ? { ...plan, beds: plan.beds.filter((bed) => bed.id !== selection.id) }
              : {
                  ...plan,
                  plantings: plan.plantings.filter((planting) => planting.id !== selection.id),
                },
          selection: null,
        })
      },

      select: (selection) => set({ selection }),
      setTool: (tool) => set({ tool }),
      setLocale: (locale) => set({ locale }),
    }),
    {
      partialize: (state) => ({ plan: state.plan }),
      equality: (past, current) => past.plan === current.plan,
      limit: UNDO_LIMIT,
    }
  )
)

export function undo(): void {
  editorStore.temporal.getState().undo()
}

export function redo(): void {
  editorStore.temporal.getState().redo()
}

/** The bed the selection points at, or undefined when it is gone (e.g. after an undo). */
export function selectedBed(state: Pick<EditorState, "plan" | "selection">): Bed | undefined {
  const { selection } = state
  if (selection?.kind !== "bed") return undefined
  return state.plan.beds.find((bed) => bed.id === selection.id)
}

/** The planting the selection points at, or undefined when it is gone. */
export function selectedPlanting(
  state: Pick<EditorState, "plan" | "selection">
): Planting | undefined {
  const { selection } = state
  if (selection?.kind !== "planting") return undefined
  return state.plan.plantings.find((planting) => planting.id === selection.id)
}
