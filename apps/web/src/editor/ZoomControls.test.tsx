// @vitest-environment jsdom
import "../test/setup"
import "../i18n"
import { emptyPlan } from "@leira/core"
import { act, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it } from "vitest"
import { editorStore } from "./store"
import { ZoomControls } from "./ZoomControls"

const state = () => editorStore.getState()

beforeEach(() => {
  state().loadPlan(emptyPlan())
  state().reportView({ canZoomIn: true, canZoomOut: true, fitted: false })
  render(<ZoomControls />)
})

describe("ZoomControls", () => {
  it.each([
    ["Zoom in", "zoom-in"],
    ["Zoom out", "zoom-out"],
    ["Fit the garden to the view", "fit"],
  ] as const)("asks the canvas to %s", async (name, action) => {
    await userEvent.click(screen.getByRole("button", { name }))
    expect(state().viewRequest).toEqual({ action })
  })

  it("gives up zooming in at the closest view, and out at the farthest", () => {
    act(() => state().reportView({ canZoomIn: false, canZoomOut: true, fitted: false }))
    expect(screen.getByRole("button", { name: "Zoom in" })).toBeDisabled()
    expect(screen.getByRole("button", { name: "Zoom out" })).toBeEnabled()

    act(() => state().reportView({ canZoomIn: true, canZoomOut: false, fitted: false }))
    expect(screen.getByRole("button", { name: "Zoom in" })).toBeEnabled()
    expect(screen.getByRole("button", { name: "Zoom out" })).toBeDisabled()
  })

  it("has nothing to fit while the whole garden is already in view", () => {
    act(() => state().reportView({ canZoomIn: true, canZoomOut: true, fitted: true }))
    expect(screen.getByRole("button", { name: "Fit the garden to the view" })).toBeDisabled()
  })
})
