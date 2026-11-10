import Phaser from "phaser"
import { COLOR, GardenScene, PIXEL_RATIO_KEY } from "./GardenScene"

export interface GardenCanvasHandle {
  destroy(): void
}

/**
 * Starts Phaser inside `parent` and keeps the canvas the same size as it.
 *
 * The canvas is sized in device pixels and shown at `1 / devicePixelRatio`,
 * so lines and text stay sharp on high-density screens. Phaser's own RESIZE
 * mode works in CSS pixels and would blur them.
 */
export function createGardenCanvas(parent: HTMLElement): GardenCanvasHandle {
  const measure = () => {
    const ratio = window.devicePixelRatio || 1
    return {
      ratio,
      width: Math.max(1, Math.round(parent.clientWidth * ratio)),
      height: Math.max(1, Math.round(parent.clientHeight * ratio)),
    }
  }

  const initial = measure()
  const game = new Phaser.Game({
    type: Phaser.AUTO,
    parent,
    width: initial.width,
    height: initial.height,
    backgroundColor: COLOR.outside,
    scale: { mode: Phaser.Scale.NONE, zoom: 1 / initial.ratio },
    scene: GardenScene,
    // Shortcuts are handled by the page, so the canvas takes no keyboard focus.
    input: { keyboard: false, gamepad: false },
    audio: { noAudio: true },
    disableContextMenu: true,
    banner: false,
  })
  game.registry.set(PIXEL_RATIO_KEY, initial.ratio)

  const fitToParent = () => {
    const next = measure()
    game.registry.set(PIXEL_RATIO_KEY, next.ratio)
    game.scale.setZoom(1 / next.ratio)
    game.scale.resize(next.width, next.height)
  }

  const observer = new ResizeObserver(() => {
    // The scale manager has no canvas to resize until the game has booted.
    if (game.isBooted) fitToParent()
  })
  observer.observe(parent)
  // Catch a resize that happened while Phaser was still booting.
  game.events.once(Phaser.Core.Events.READY, fitToParent)

  return {
    destroy() {
      observer.disconnect()
      game.destroy(true)
    },
  }
}
