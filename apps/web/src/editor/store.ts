import {
  type Bed,
  BedSchema,
  defaultInGround,
  duplicateItem,
  emptyPlan,
  fitRectToPlan,
  type GardenPlan,
  getPlant,
  type IsoDate,
  moveItem,
  type PlanItemRef,
  type Planting,
  type PlantingLayout,
  PlantingSchema,
  type Point,
  plantingsInGround,
  type Rect,
  type ResizeHandle,
  resizeItem,
  resizePlan,
  toIsoDate,
} from "@leira/core"
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
  /**
   * The day the garden is shown on: only crops in the ground that day are
   * drawn, and new plantings start on it. Null shows the whole plan at once.
   */
  viewDate: IsoDate | null

  /** Replaces the document, e.g. after loading it. Clears the undo history. */
  loadPlan(plan: GardenPlan): void
  /** Adds a bed on the given ground. Returns false when the ground lies outside the garden. */
  addBed(rect: Rect): boolean
  /** Adds a planting. Returns false for an unknown plant or ground outside the garden. */
  addPlanting(plantId: string, rect: Rect, layout: PlantingLayout): boolean
  /**
   * Moves an item by a distance in centimetres, snapped to the grid and kept
   * inside the garden. Returns false when it ends up where it was.
   */
  moveItem(ref: PlanItemRef, dx: number, dy: number): boolean
  /** Drags one of an item's resize handles to a point. Returns false when the size is unchanged. */
  resizeItem(ref: PlanItemRef, handle: ResizeHandle, point: Point): boolean
  /** Moves the selected item by whole grid cells. */
  nudgeSelection(cellsX: number, cellsY: number): boolean
  /** Adds a copy of the selected item beside it and selects the copy. */
  duplicateSelection(): boolean
  /** Renames a bed or changes its kind. Returns false when nothing changes or the name is too long. */
  updateBed(id: string, changes: Partial<Pick<Bed, "name" | "kind">>): boolean
  setPlantingLayout(id: string, layout: PlantingLayout): boolean
  /** Resizes the garden. Returns false for a size that is not allowed or leaves an item outside. */
  setPlanSize(widthCm: number, heightCm: number): boolean
  /** Changes when a planting is in the ground. Returns false for dates the plan cannot hold. */
  setPlantingDates(id: string, inGround: Planting["inGround"]): boolean
  removeSelection(): void
  select(selection: PlanItemRef | null): void
  setTool(tool: Tool): void
  setLocale(locale: "pt" | "en"): void
  /** Sets the day to show. Null, or anything that is not a date, shows the whole plan. */
  setViewDate(date: IsoDate | null): void
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
    (set, get) => {
      /**
       * Stores an edited plan. The core's edit functions hand back the plan
       * they were given when nothing changed; that is not stored, so it adds
       * no undo step and triggers no save.
       */
      const replacePlan = (plan: GardenPlan): boolean => {
        if (plan === get().plan) return false
        set({ plan })
        return true
      }

      return {
        plan: emptyPlan(),
        selection: null,
        tool: { kind: "select" },
        locale: "en",
        viewDate: null,

        loadPlan: (plan) => {
          const history = editorStore.temporal.getState()
          history.pause()
          set({ plan, selection: null, tool: { kind: "select" }, viewDate: null })
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
            // Planted on the day being looked at, so it shows up where the user put it.
            inGround: defaultInGround(plant, get().viewDate ?? toIsoDate(new Date())),
          }
          set({
            plan: { ...plan, plantings: [...plan.plantings, planting] },
            selection: { kind: "planting", id: planting.id },
          })
          return true
        },

        moveItem: (ref, dx, dy) => replacePlan(moveItem(get().plan, ref, dx, dy)),

        resizeItem: (ref, handle, point) => replacePlan(resizeItem(get().plan, ref, handle, point)),

        nudgeSelection: (cellsX, cellsY) => {
          const { plan, selection } = get()
          if (!selection) return false
          return replacePlan(moveItem(plan, selection, cellsX * plan.cellCm, cellsY * plan.cellCm))
        },

        duplicateSelection: () => {
          const { plan, selection } = get()
          const copy = selection && duplicateItem(plan, selection, crypto.randomUUID())
          if (!copy) return false
          set({ plan: copy.plan, selection: copy.ref })
          return true
        },

        updateBed: (id, changes) => {
          const { plan } = get()
          const bed = plan.beds.find((item) => item.id === id)
          if (!bed) return false
          const updated = BedSchema.pick({ name: true, kind: true }).safeParse({
            name: (changes.name ?? bed.name).trim(),
            kind: changes.kind ?? bed.kind,
          })
          if (!updated.success) return false
          if (updated.data.name === bed.name && updated.data.kind === bed.kind) return false
          return replacePlan({
            ...plan,
            beds: plan.beds.map((item) => (item.id === id ? { ...item, ...updated.data } : item)),
          })
        },

        setPlantingLayout: (id, layout) => {
          const { plan } = get()
          const planting = plan.plantings.find((item) => item.id === id)
          if (!planting || planting.layout === layout) return false
          return replacePlan({
            ...plan,
            plantings: plan.plantings.map((item) => (item.id === id ? { ...item, layout } : item)),
          })
        },

        setPlanSize: (widthCm, heightCm) => {
          const resized = resizePlan(get().plan, widthCm, heightCm)
          return resized ? replacePlan(resized) : false
        },

        setPlantingDates: (id, inGround) => {
          const { plan } = get()
          const dates = PlantingSchema.shape.inGround.safeParse(inGround)
          if (!dates.success || !plan.plantings.some((planting) => planting.id === id)) return false
          set({
            plan: {
              ...plan,
              plantings: plan.plantings.map((planting) =>
                planting.id === id ? { ...planting, inGround: dates.data } : planting
              ),
            },
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
        setViewDate: (date) =>
          set({
            viewDate:
              date && PlantingSchema.shape.inGround.shape.from.safeParse(date).success
                ? date
                : null,
          }),
      }
    },
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

/** The plan as the canvas shows it: all of it, or only the crops in the ground on the view date. */
export function shownPlan(state: Pick<EditorState, "plan" | "viewDate">): GardenPlan {
  return state.viewDate ? plantingsInGround(state.plan, state.viewDate) : state.plan
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
