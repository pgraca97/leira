import {
  type Bed,
  type BedKind,
  fillArea,
  fillPoints,
  fitRectToPlan,
  footprintAt,
  type GardenPlan,
  getPlant,
  handlePoints,
  hitTest,
  itemRect,
  moveItem,
  type PlanItemRef,
  type Planting,
  type Point,
  plantingFill,
  type Rect,
  type ResizeHandle,
  rectFromPoints,
  resizeItem,
} from "@garden/core"
import Phaser from "phaser"
import { type EditorState, editorStore, type Tool } from "../store"
import { cursorFor, pointerTarget } from "./pointerTarget"

/** Registry key under which the host page publishes `window.devicePixelRatio`. */
export const PIXEL_RATIO_KEY = "pixelRatio"

/** Stand-in colours until the pixel art arrives. */
export const COLOR = {
  outside: 0xd6d3d1,
  ground: 0xd9e8c2,
  groundEdge: 0x57534e,
  grid: 0x1c1917,
  bed: 0x8a5a3c,
  unknownPlant: 0x78716c,
  selection: 0x2563eb,
  handle: 0xffffff,
} as const

/** How each kind of bed is painted: soil, a pot, glass, gravel, a shed. */
const BED_STYLE: Record<BedKind, { fill: number; alpha: number; edge: number }> = {
  bed: { fill: COLOR.bed, alpha: 1, edge: 0x5b3a26 },
  container: { fill: 0xc2703d, alpha: 1, edge: 0x8f4a22 },
  greenhouse: { fill: 0xcfe8ef, alpha: 0.7, edge: 0x5b8a99 },
  path: { fill: 0xcbbf9f, alpha: 1, edge: 0x9c9070 },
  structure: { fill: 0x78716c, alpha: 1, edge: 0x44403c },
}

const DEPTH = { ground: 0, grid: 1, beds: 10, plantings: 20, outlines: 30, overlay: 40 } as const

/** Screen pixels the pointer may wander before a press counts as a drag. */
const DRAG_THRESHOLD_PX = 4
/** Zoom change per unit of wheel delta. A mouse wheel notch is about 100 units. */
const WHEEL_ZOOM_RATE = 0.0015
/** Closest zoom, in screen pixels per centimetre. */
const MAX_ZOOM_PX_PER_CM = 8
/** How far out the view may zoom, relative to the zoom that fits the whole garden. */
const MIN_ZOOM_FACTOR = 0.5
/** Space kept around the garden when fitting it to the view, in screen pixels. */
const FIT_MARGIN_PX = 32
/** Grid cells narrower than this on screen are not drawn. */
const MIN_CELL_PX = 6
/** Above this many plants a planting is drawn as a tinted area instead of dots. */
const MAX_DOTS = 600
/** Radius of a plant dot, as a share of the distance to its nearest neighbour. */
const DOT_RADIUS_RATIO = 0.38
/** Half the side of a resize handle as drawn, in screen pixels. */
const HANDLE_HALF_PX = 4
/** How far from a handle's centre a press still grabs it, in screen pixels. */
const HANDLE_REACH_PX = 8

/** Where a press started on screen, and whether it has travelled far enough to be a drag. */
interface Press {
  downX: number
  downY: number
  moved: boolean
}

type Gesture =
  | (Press & { kind: "pan"; lastX: number; lastY: number })
  | (Press & { kind: "draw"; start: Point; end: Point })
  | (Press & { kind: "move"; ref: PlanItemRef; start: Point; end: Point })
  | (Press & { kind: "resize"; ref: PlanItemRef; handle: ResizeHandle; end: Point })

type EditGesture = Extract<Gesture, { kind: "move" | "resize" }>

interface BedView {
  source: Bed
  graphics: Phaser.GameObjects.Graphics
  label: Phaser.GameObjects.Text
}

interface PlantingView {
  source: Planting
  locale: EditorState["locale"]
  graphics: Phaser.GameObjects.Graphics
  label: Phaser.GameObjects.Text
}

/**
 * Draws the garden plan and turns pointer input into editor actions.
 *
 * The scene owns no document state. It renders whatever is in the editor
 * store, one view per bed and planting matched by id, and reports what the
 * user does by calling store actions. World units are centimetres, so the
 * camera zoom is "screen pixels per centimetre".
 */
export class GardenScene extends Phaser.Scene {
  private ground!: Phaser.GameObjects.Graphics
  private gridLines!: Phaser.GameObjects.Graphics
  private outlines!: Phaser.GameObjects.Graphics
  private overlay!: Phaser.GameObjects.Graphics
  private draftLabel!: Phaser.GameObjects.Text

  private readonly bedViews = new Map<string, BedView>()
  private readonly plantingViews = new Map<string, PlantingView>()

  private gesture: Gesture | null = null
  private unsubscribe: (() => void) | null = null
  private pixelRatio = 1
  private fitZoom = 1
  /** World point at the middle of the view, kept so a resize can restore it. */
  private viewCenter: Point = { x: 0, y: 0 }
  /** Set once the user pans or zooms; until then the view keeps fitting the garden. */
  private viewTouched = false

  constructor() {
    super("garden")
  }

  create(): void {
    this.pixelRatio = this.readPixelRatio()

    this.ground = this.add.graphics().setDepth(DEPTH.ground)
    this.gridLines = this.add.graphics().setDepth(DEPTH.grid)
    this.outlines = this.add.graphics().setDepth(DEPTH.outlines)
    this.overlay = this.add.graphics().setDepth(DEPTH.overlay)
    this.draftLabel = this.add.text(0, 0, "", this.labelStyle()).setDepth(DEPTH.overlay)
    this.draftLabel.setVisible(false)

    this.input.on(Phaser.Input.Events.POINTER_DOWN, this.onPointerDown, this)
    this.input.on(Phaser.Input.Events.POINTER_MOVE, this.onPointerMove, this)
    this.input.on(Phaser.Input.Events.POINTER_UP, this.onPointerUp, this)
    this.input.on(Phaser.Input.Events.POINTER_UP_OUTSIDE, this.onPointerUp, this)
    this.input.on(Phaser.Input.Events.POINTER_WHEEL, this.onWheel, this)
    this.scale.on(Phaser.Scale.Events.RESIZE, this.onResize, this)

    const state = editorStore.getState()
    this.syncPlan(state)
    this.applyTool(state.tool)
    this.fitToView()

    this.unsubscribe = editorStore.subscribe((next, previous) => this.onStateChange(next, previous))
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.teardown, this)
    this.events.once(Phaser.Scenes.Events.DESTROY, this.teardown, this)
  }

  private teardown(): void {
    this.unsubscribe?.()
    this.unsubscribe = null
    this.scale.off(Phaser.Scale.Events.RESIZE, this.onResize, this)
  }

  // --- Store -> scene ------------------------------------------------------

  private onStateChange(next: EditorState, previous: EditorState): void {
    if (next.plan !== previous.plan || next.locale !== previous.locale) {
      const resized =
        next.plan.widthCm !== previous.plan.widthCm || next.plan.heightCm !== previous.plan.heightCm
      this.syncPlan(next)
      if (resized) this.fitToView()
    } else if (next.selection !== previous.selection || next.tool !== previous.tool) {
      // The tool matters too: resize handles only show with the select tool.
      this.drawOutlines(next)
    }
    if (next.tool !== previous.tool) this.applyTool(next.tool)
  }

  /** Brings the views in line with the plan: adds, redraws and removes by id. */
  private syncPlan(state: EditorState): void {
    const { plan, locale } = state

    this.ground.clear()
    this.ground.fillStyle(COLOR.ground, 1)
    this.ground.fillRect(0, 0, plan.widthCm, plan.heightCm)

    const bedIds = new Set<string>()
    plan.beds.forEach((bed, index) => {
      bedIds.add(bed.id)
      let view = this.bedViews.get(bed.id)
      if (!view) {
        view = {
          source: bed,
          graphics: this.add.graphics(),
          label: this.add.text(0, 0, "", this.labelStyle()).setOrigin(0, 1),
        }
        this.bedViews.set(bed.id, view)
        this.drawBed(view, bed)
      } else if (view.source !== bed) {
        view.source = bed
        this.drawBed(view, bed)
      }
      const depth = DEPTH.beds + stackOffset(index)
      view.graphics.setDepth(depth)
      view.label.setDepth(depth)
    })
    for (const [id, view] of this.bedViews) {
      if (bedIds.has(id)) continue
      view.graphics.destroy()
      view.label.destroy()
      this.bedViews.delete(id)
    }

    const plantingIds = new Set<string>()
    plan.plantings.forEach((planting, index) => {
      plantingIds.add(planting.id)
      let view = this.plantingViews.get(planting.id)
      if (!view) {
        view = {
          source: planting,
          locale,
          graphics: this.add.graphics(),
          label: this.add.text(0, 0, "", this.labelStyle()),
        }
        this.plantingViews.set(planting.id, view)
        this.drawPlanting(view, planting, locale)
      } else if (view.source !== planting || view.locale !== locale) {
        view.source = planting
        view.locale = locale
        this.drawPlanting(view, planting, locale)
      }
      const depth = DEPTH.plantings + stackOffset(index)
      view.graphics.setDepth(depth)
      view.label.setDepth(depth)
    })
    for (const [id, view] of this.plantingViews) {
      if (plantingIds.has(id)) continue
      view.graphics.destroy()
      view.label.destroy()
      this.plantingViews.delete(id)
    }

    this.drawGrid()
    this.drawOutlines(state)
    this.layoutLabels()
  }

  private drawBed(view: BedView, bed: Bed): void {
    const { x, y, w, h } = bed.rect
    const style = BED_STYLE[bed.kind]
    // The edge is drawn inside the rectangle, like the frame of a raised bed.
    const edge = Math.min(3, w / 4, h / 4)
    const graphics = view.graphics.clear()
    graphics.fillStyle(style.fill, style.alpha)
    graphics.fillRect(x, y, w, h)
    graphics.lineStyle(edge, style.edge, 1)
    graphics.strokeRect(x + edge / 2, y + edge / 2, w - edge, h - edge)
    view.label.setText(bed.name)
  }

  private drawPlanting(
    view: PlantingView,
    planting: Planting,
    locale: EditorState["locale"]
  ): void {
    const { x, y, w, h } = planting.rect
    const plant = getPlant(planting.plantId)
    const color = plant ? hexColor(plant.color) : COLOR.unknownPlant
    const graphics = view.graphics.clear()

    if (!plant) {
      graphics.fillStyle(color, 0.3)
      graphics.fillRect(x, y, w, h)
      view.label.setText("?")
      return
    }

    const fill = plantingFill(planting, plant)
    if (fill.count <= MAX_DOTS) {
      graphics.fillStyle(color, 0.18)
      graphics.fillRect(x, y, w, h)
      graphics.fillStyle(color, 0.95)
      const radius = Math.min(fill.pitch.x, fill.pitch.y) * DOT_RADIUS_RATIO
      for (const point of fillPoints(fill)) graphics.fillCircle(point.x, point.y, radius)
    } else {
      graphics.fillStyle(color, 0.5)
      graphics.fillRect(x, y, w, h)
    }
    view.label.setText(`${plant.name[locale]} × ${fill.count}`)
  }

  /** Thin outlines are redrawn at every zoom so they stay the same width on screen. */
  private drawOutlines(state: EditorState): void {
    const pixel = this.worldPerPixel()
    this.outlines.clear()

    for (const planting of state.plan.plantings) {
      const plant = getPlant(planting.plantId)
      this.outlines.lineStyle(1.5 * pixel, plant ? hexColor(plant.color) : COLOR.unknownPlant, 0.9)
      strokeRect(this.outlines, planting.rect)
    }

    const rect = state.selection && itemRect(state.plan, state.selection)
    if (!rect) return
    this.outlines.lineStyle(3 * pixel, COLOR.selection, 1)
    strokeRect(this.outlines, grow(rect, 1.5 * pixel))

    // Handles are an offer to resize, which only the select tool can take up.
    if (state.tool.kind !== "select") return
    const half = HANDLE_HALF_PX * pixel
    this.outlines.fillStyle(COLOR.handle, 1)
    this.outlines.lineStyle(1.5 * pixel, COLOR.selection, 1)
    for (const { point } of handlePoints(rect, this.handleReach())) {
      this.outlines.fillRect(point.x - half, point.y - half, 2 * half, 2 * half)
      this.outlines.strokeRect(point.x - half, point.y - half, 2 * half, 2 * half)
    }
  }

  private drawGrid(): void {
    const { plan } = editorStore.getState()
    const camera = this.cameras.main
    const pixel = this.worldPerPixel()
    const width = plan.widthCm
    const height = plan.heightCm
    this.gridLines.clear()

    const drawLines = (step: number, alpha: number) => {
      this.gridLines.lineStyle(pixel, COLOR.grid, alpha)
      for (let x = step; x < width; x += step) this.gridLines.lineBetween(x, 0, x, height)
      for (let y = step; y < height; y += step) this.gridLines.lineBetween(0, y, width, y)
    }
    if (plan.cellCm * camera.zoom >= MIN_CELL_PX * this.pixelRatio) drawLines(plan.cellCm, 0.07)
    drawLines(100, 0.18)

    this.gridLines.lineStyle(2 * pixel, COLOR.groundEdge, 1)
    this.gridLines.strokeRect(0, 0, width, height)
  }

  /** Labels keep a constant size on screen, and hide when their planting is too small for them. */
  private layoutLabels(): void {
    const camera = this.cameras.main
    const pixel = this.worldPerPixel()
    for (const view of this.plantingViews.values()) {
      const { rect } = view.source
      view.label.setScale(1 / camera.zoom)
      view.label.setPosition(rect.x + 4 * pixel, rect.y + 3 * pixel)
      view.label.setVisible(view.label.displayWidth + 8 * pixel <= rect.w)
    }
    // A bed's name sits in its bottom-left corner, clear of the crop labels at the top.
    for (const view of this.bedViews.values()) {
      const { rect } = view.source
      view.label.setScale(1 / camera.zoom)
      view.label.setPosition(rect.x + 4 * pixel, rect.y + rect.h - 3 * pixel)
      view.label.setVisible(
        view.source.name !== "" &&
          view.label.displayWidth + 8 * pixel <= rect.w &&
          view.label.displayHeight + 6 * pixel <= rect.h
      )
    }
  }

  private applyTool(tool: Tool): void {
    // Whatever was half-drawn or half-dragged with the old tool is dropped.
    if (this.gesture && this.gesture.kind !== "pan") this.cancelGesture()
    this.input.setDefaultCursor(tool.kind === "select" ? "grab" : "crosshair")
  }

  // --- Pointer -> store ----------------------------------------------------

  private onPointerDown(pointer: Phaser.Input.Pointer): void {
    // A second finger or button while a gesture is running is ignored.
    if (this.gesture) return
    const { tool } = editorStore.getState()
    const press = { downX: pointer.x, downY: pointer.y, moved: false }

    const point = this.worldPoint(pointer)
    const pan = (): Gesture => ({ kind: "pan", ...press, lastX: pointer.x, lastY: pointer.y })

    if (pointer.button !== 0) {
      // Middle and right button pan with any tool.
      this.gesture = pan()
    } else if (tool.kind !== "select") {
      this.gesture = { kind: "draw", ...press, start: point, end: point }
    } else {
      const target = pointerTarget(editorStore.getState(), point, this.handleReach())
      if (target.kind === "resize") {
        this.gesture = {
          kind: "resize",
          ...press,
          ref: target.ref,
          handle: target.handle,
          end: point,
        }
      } else if (target.kind === "move") {
        this.gesture = { kind: "move", ...press, ref: target.ref, start: point, end: point }
      } else {
        this.gesture = pan()
      }
    }
  }

  private onPointerMove(pointer: Phaser.Input.Pointer): void {
    const gesture = this.gesture
    if (!gesture) {
      this.showHoverCursor(pointer)
      return
    }
    if (!gesture.moved) {
      const travelled = Math.hypot(pointer.x - gesture.downX, pointer.y - gesture.downY)
      if (travelled < DRAG_THRESHOLD_PX * this.pixelRatio) return
      gesture.moved = true
      if (gesture.kind === "pan") this.input.setDefaultCursor("grabbing")
    }

    if (gesture.kind === "pan") {
      const camera = this.cameras.main
      camera.scrollX -= (pointer.x - gesture.lastX) / camera.zoom
      camera.scrollY -= (pointer.y - gesture.lastY) / camera.zoom
      gesture.lastX = pointer.x
      gesture.lastY = pointer.y
      this.viewTouched = true
      this.onViewChanged()
    } else if (gesture.kind === "draw") {
      gesture.end = this.worldPoint(pointer)
      this.drawDraft(gesture)
    } else {
      gesture.end = this.worldPoint(pointer)
      this.drawEditPreview(gesture)
    }
  }

  /** With the select tool, the cursor says what a press here would do. */
  private showHoverCursor(pointer: Phaser.Input.Pointer): void {
    const state = editorStore.getState()
    if (state.tool.kind !== "select") return
    const target = pointerTarget(state, this.worldPoint(pointer), this.handleReach())
    this.input.setDefaultCursor(cursorFor(target))
  }

  private onPointerUp(pointer: Phaser.Input.Pointer): void {
    const gesture = this.gesture
    if (!gesture) return
    this.gesture = null
    const state = editorStore.getState()

    if (gesture.kind === "pan") {
      this.applyTool(state.tool)
      // A press that never became a drag is a click: select what is under it.
      if (!gesture.moved && pointer.button === 0 && state.tool.kind === "select") {
        state.select(hitTest(state.plan, this.worldPoint(pointer)))
      }
      this.showHoverCursor(pointer)
      return
    }

    this.clearDraft()
    if (gesture.kind === "move" || gesture.kind === "resize") {
      // The drag is stored once, on release, so it is a single undo step and a single save.
      if (!gesture.moved) state.select(hitTest(state.plan, this.worldPoint(pointer)))
      else if (gesture.kind === "move") state.moveItem(gesture.ref, ...dragDistance(gesture))
      else state.resizeItem(gesture.ref, gesture.handle, gesture.end)
      this.showHoverCursor(pointer)
      return
    }

    if (state.tool.kind === "bed") {
      if (gesture.moved) state.addBed(draggedRect(gesture))
    } else if (state.tool.kind === "plant") {
      const plant = getPlant(state.tool.plantId)
      if (!plant) return
      if (gesture.moved) state.addPlanting(plant.id, draggedRect(gesture), "row")
      else state.addPlanting(plant.id, footprintAt(state.plan, plant, gesture.start), "single")
    }
  }

  private onWheel(
    pointer: Phaser.Input.Pointer,
    _over: unknown,
    _deltaX: number,
    deltaY: number
  ): void {
    const camera = this.cameras.main
    const anchor = this.worldPoint(pointer)
    const zoom = Phaser.Math.Clamp(
      camera.zoom * Math.exp(-deltaY * WHEEL_ZOOM_RATE),
      this.fitZoom * MIN_ZOOM_FACTOR,
      Math.max(this.fitZoom, MAX_ZOOM_PX_PER_CM * this.pixelRatio)
    )
    camera.setZoom(zoom)
    // Scroll so the point under the cursor stays under the cursor.
    camera.scrollX = anchor.x - camera.width / 2 - (pointer.x - camera.width / 2) / zoom
    camera.scrollY = anchor.y - camera.height / 2 - (pointer.y - camera.height / 2) / zoom
    this.viewTouched = true
    this.onViewChanged()
  }

  /** Shows what releasing the pointer now would create. */
  private drawDraft(gesture: Extract<Gesture, { kind: "draw" }>): void {
    const { plan, tool, locale } = editorStore.getState()
    const rect = fitRectToPlan(plan, draggedRect(gesture))
    this.overlay.clear()
    if (!rect || tool.kind === "select") {
      this.draftLabel.setVisible(false)
      return
    }

    const pixel = this.worldPerPixel()
    const plant = tool.kind === "plant" ? getPlant(tool.plantId) : undefined
    const color = plant ? hexColor(plant.color) : COLOR.bed
    this.overlay.fillStyle(color, 0.3)
    this.overlay.fillRect(rect.x, rect.y, rect.w, rect.h)
    this.overlay.lineStyle(2 * pixel, color, 1)
    strokeRect(this.overlay, rect)

    const text = plant ? `× ${fillArea(rect, plant.spacing, "row").count}` : sizeLabel(rect, locale)
    this.draftLabel
      .setText(text)
      .setScale(1 / this.cameras.main.zoom)
      .setPosition(rect.x + rect.w + 6 * pixel, rect.y + rect.h + 6 * pixel)
      .setVisible(true)
  }

  /** Shows where releasing the pointer now would leave the item being moved or resized. */
  private drawEditPreview(gesture: EditGesture): void {
    const { plan, locale } = editorStore.getState()
    const preview = editedPlan(plan, gesture)
    const pixel = this.worldPerPixel()
    this.overlay.clear()

    // A moved bed takes its crops along, so more than one item can be on the move.
    const ghost = (before: Bed | Planting, after: Bed | Planting | undefined, color: number) => {
      if (!after || after.rect === before.rect) return
      this.overlay.fillStyle(color, 0.35)
      this.overlay.fillRect(after.rect.x, after.rect.y, after.rect.w, after.rect.h)
      this.overlay.lineStyle(2 * pixel, COLOR.selection, 1)
      strokeRect(this.overlay, after.rect)
    }
    plan.beds.forEach((bed, index) => {
      ghost(bed, preview.beds[index], BED_STYLE[bed.kind].fill)
    })
    plan.plantings.forEach((planting, index) => {
      const plant = getPlant(planting.plantId)
      ghost(planting, preview.plantings[index], plant ? hexColor(plant.color) : COLOR.unknownPlant)
    })

    const rect = itemRect(preview, gesture.ref)
    if (!rect || gesture.kind !== "resize") {
      this.draftLabel.setVisible(false)
      return
    }
    this.draftLabel
      .setText(sizeLabel(rect, locale))
      .setScale(1 / this.cameras.main.zoom)
      .setPosition(rect.x + rect.w + 6 * pixel, rect.y + rect.h + 6 * pixel)
      .setVisible(true)
  }

  private clearDraft(): void {
    this.overlay.clear()
    this.draftLabel.setVisible(false)
  }

  private cancelGesture(): void {
    this.gesture = null
    this.clearDraft()
  }

  // --- View ----------------------------------------------------------------

  private onResize(): void {
    const ratio = this.readPixelRatio()
    if (ratio !== this.pixelRatio) {
      // Text is rasterised for one pixel ratio: rebuild it for the new screen.
      this.pixelRatio = ratio
      this.draftLabel.setStyle(this.labelStyle())
      for (const view of this.plantingViews.values()) view.label.setStyle(this.labelStyle())
      for (const view of this.bedViews.values()) view.label.setStyle(this.labelStyle())
    }

    if (this.viewTouched) {
      const { x, y } = this.viewCenter
      this.updateFitZoom()
      this.cameras.main.centerOn(x, y)
      this.onViewChanged()
    } else {
      this.fitToView()
    }
  }

  /** Zooms and centres so the whole garden is visible. */
  private fitToView(): void {
    const { plan } = editorStore.getState()
    this.updateFitZoom()
    this.cameras.main.setZoom(this.fitZoom)
    this.cameras.main.centerOn(plan.widthCm / 2, plan.heightCm / 2)
    this.viewTouched = false
    this.onViewChanged()
  }

  private updateFitZoom(): void {
    const { plan } = editorStore.getState()
    const camera = this.cameras.main
    const margin = FIT_MARGIN_PX * this.pixelRatio
    const zoom = Math.min(
      (camera.width - 2 * margin) / plan.widthCm,
      (camera.height - 2 * margin) / plan.heightCm
    )
    // A canvas that has no size yet would give zero or a negative zoom.
    this.fitZoom = Math.max(zoom, 0.01)
  }

  /** Redraws everything whose size on screen depends on the zoom. */
  private onViewChanged(): void {
    const camera = this.cameras.main
    this.viewCenter = {
      x: camera.scrollX + camera.width / 2,
      y: camera.scrollY + camera.height / 2,
    }
    this.drawGrid()
    this.drawOutlines(editorStore.getState())
    this.layoutLabels()
    const gesture = this.gesture
    if (!gesture?.moved) return
    if (gesture.kind === "draw") this.drawDraft(gesture)
    else if (gesture.kind !== "pan") this.drawEditPreview(gesture)
  }

  /**
   * Converts a pointer position to garden coordinates. Worked out from the
   * camera's scroll and zoom rather than read from `pointer.worldX`, which is
   * only refreshed once per frame and lags behind a zoom made in the same event.
   */
  private worldPoint(pointer: Phaser.Input.Pointer): Point {
    const camera = this.cameras.main
    return {
      x: camera.scrollX + camera.width / 2 + (pointer.x - camera.width / 2) / camera.zoom,
      y: camera.scrollY + camera.height / 2 + (pointer.y - camera.height / 2) / camera.zoom,
    }
  }

  /** Centimetres covered by one CSS pixel at the current zoom. */
  private worldPerPixel(): number {
    return this.pixelRatio / this.cameras.main.zoom
  }

  /** How far from a resize handle's centre a press still grabs it, in centimetres. */
  private handleReach(): number {
    return HANDLE_REACH_PX * this.worldPerPixel()
  }

  private readPixelRatio(): number {
    const ratio: unknown = this.registry.get(PIXEL_RATIO_KEY)
    return typeof ratio === "number" && ratio > 0 ? ratio : 1
  }

  private labelStyle(): Phaser.Types.GameObjects.Text.TextStyle {
    return {
      fontFamily: "system-ui, sans-serif",
      fontSize: `${12 * this.pixelRatio}px`,
      fontStyle: "600",
      color: "#1c1917",
      stroke: "#ffffff",
      strokeThickness: 3 * this.pixelRatio,
    }
  }
}

/** Items later in the plan are drawn above earlier ones of the same kind. */
function stackOffset(index: number): number {
  return index / 100_000
}

function hexColor(hex: string): number {
  return Number.parseInt(hex.slice(1), 16)
}

function strokeRect(graphics: Phaser.GameObjects.Graphics, rect: Rect): void {
  graphics.strokeRect(rect.x, rect.y, rect.w, rect.h)
}

function grow(rect: Rect, by: number): Rect {
  return { x: rect.x - by, y: rect.y - by, w: rect.w + 2 * by, h: rect.h + 2 * by }
}

/** How far a move gesture has dragged its item, in centimetres. */
function dragDistance(gesture: { start: Point; end: Point }): [dx: number, dy: number] {
  return [gesture.end.x - gesture.start.x, gesture.end.y - gesture.start.y]
}

/** The plan as it would be if the gesture ended now. */
function editedPlan(plan: GardenPlan, gesture: EditGesture): GardenPlan {
  return gesture.kind === "move"
    ? moveItem(plan, gesture.ref, ...dragDistance(gesture))
    : resizeItem(plan, gesture.ref, gesture.handle, gesture.end)
}

/** A rectangle's size in metres, e.g. "1.2 × 0.8 m". */
function sizeLabel(rect: Rect, locale: string): string {
  const metres = new Intl.NumberFormat(locale, {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  })
  return `${metres.format(rect.w / 100)} × ${metres.format(rect.h / 100)} m`
}

/** The dragged area. Never empty, so a perfectly straight drag still makes a row. */
function draggedRect(gesture: { start: Point; end: Point }): Rect {
  const rect = rectFromPoints(gesture.start, gesture.end)
  return { ...rect, w: Math.max(rect.w, 1), h: Math.max(rect.h, 1) }
}
