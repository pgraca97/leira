// @vitest-environment jsdom
import "../test/setup"
import "../i18n"
import { emptyPlan, type GardenPlan } from "@leira/core"
import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { editorStore } from "../editor/store"
import { downloadText } from "./downloadFile"
import { downloadPng } from "./downloadImage"
import { ExportControls } from "./ExportControls"

vi.mock("./downloadImage", () => ({ downloadPng: vi.fn(async () => {}) }))
vi.mock("./downloadFile", () => ({ downloadText: vi.fn() }))

/** Tomatoes one summer, potatoes in the same spot the next spring. */
const twoYears: GardenPlan = {
  ...emptyPlan(),
  plantings: [
    {
      id: "p1",
      plantId: "tomato",
      rect: { x: 100, y: 100, w: 100, h: 100 },
      layout: "block",
      inGround: { from: "2026-05-01", to: "2026-09-30" },
    },
    {
      id: "p2",
      plantId: "potato",
      rect: { x: 100, y: 100, w: 100, h: 100 },
      layout: "block",
      inGround: { from: "2027-03-01", to: "2027-07-15" },
    },
  ],
}

beforeEach(() => {
  vi.mocked(downloadPng).mockClear()
  vi.mocked(downloadText).mockClear()
  editorStore.getState().loadPlan(twoYears)
  editorStore.getState().setViewDate("2027-04-10")
  render(<ExportControls gardenName="Allotment 12" location={null} />)
})

describe("ExportControls", () => {
  it("saves a picture of what is in the ground on the day shown", async () => {
    await userEvent.click(screen.getByRole("button", { name: "Save image" }))
    await waitFor(() => expect(downloadPng).toHaveBeenCalledOnce())
    const [markup] = vi.mocked(downloadPng).mock.calls[0] ?? []
    expect(markup).toContain("Potato")
    expect(markup).not.toContain("Tomato")
  })

  it("saves the whole plan to a file, whatever the day shown", async () => {
    await userEvent.click(screen.getByRole("button", { name: "Save file" }))
    const [text] = vi.mocked(downloadText).mock.calls[0] ?? []
    expect(text).toContain('"plantId": "tomato"')
    expect(text).toContain('"plantId": "potato"')
  })
})
