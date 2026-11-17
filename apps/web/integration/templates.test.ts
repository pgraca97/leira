import type { Clipboard } from "@leira/core"
import { describe, expect, it } from "vitest"
import { TemplateLimitError, templatesApi } from "../src/lib/templates"
import { signInVisitor, stackSettings } from "./localStack"

/** Saved templates on the real stack: row level security, the limit and the schema together. */
const settings = stackSettings()

const ITEMS: Clipboard = {
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

describe("templates", () => {
  it("are saved, listed and deleted by their owner, and by nobody else", async () => {
    const alice = templatesApi((await signInVisitor(settings)).client)
    const bob = templatesApi((await signInVisitor(settings)).client)

    const saved = await alice.save("Herb bed", ITEMS)
    expect(saved).toMatchObject({ name: "Herb bed", items: ITEMS })
    expect(await alice.list()).toEqual([saved])
    expect(await bob.list()).toEqual([])

    await bob.remove(saved.id)
    expect(await alice.list()).toEqual([saved])
    await alice.remove(saved.id)
    expect(await alice.list()).toEqual([])
  })

  it("stop at fifty, saying why", async () => {
    const visitor = templatesApi((await signInVisitor(settings)).client)
    for (let index = 0; index < 50; index++) await visitor.save(`Template ${index}`, ITEMS)
    await expect(visitor.save("One too many", ITEMS)).rejects.toBeInstanceOf(TemplateLimitError)
  })
})
