// @vitest-environment jsdom
import type { Clipboard } from "@leira/core"
import { beforeEach, describe, expect, it } from "vitest"
import { CLIPBOARD_KEY, readClipboard, writeClipboard } from "./clipboard"

const COPIED: Clipboard = {
  format: 1,
  beds: [
    {
      id: "11111111-1111-4111-8111-111111111111",
      name: "Herbs",
      kind: "bed",
      rect: { x: 0, y: 0, w: 100, h: 100 },
    },
  ],
  plantings: [],
}

beforeEach(() => localStorage.clear())

describe("the clipboard kept in the browser", () => {
  it("gives back what was copied, in any tab", () => {
    writeClipboard(COPIED)
    expect(readClipboard()).toEqual(COPIED)
  })

  it("is empty at first", () => {
    expect(readClipboard()).toBeNull()
  })

  it("treats what it cannot read as empty", () => {
    localStorage.setItem(CLIPBOARD_KEY, "{not json")
    expect(readClipboard()).toBeNull()
    localStorage.setItem(CLIPBOARD_KEY, JSON.stringify({ format: 99, beds: [] }))
    expect(readClipboard()).toBeNull()
  })
})
