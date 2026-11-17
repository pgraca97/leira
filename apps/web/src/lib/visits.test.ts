import { describe, expect, it, vi } from "vitest"
import { recordVisit } from "./visits"

/**
 * Stands in for the Supabase client's `rpc`. Like the real query builder, it
 * sends nothing until someone calls `then` on what it returns.
 */
function fakeClient(answer: () => Promise<unknown>) {
  const sent: string[] = []
  const rpc = vi.fn((name: string) => ({
    // biome-ignore lint/suspicious/noThenProperty: the real builder is a thenable too.
    then(onFulfilled?: (value: unknown) => unknown, onRejected?: (reason: unknown) => unknown) {
      sent.push(name)
      return answer().then(onFulfilled, onRejected)
    },
  }))
  return { client: { rpc } as never, sent }
}

describe("recording a visit", () => {
  it("sends the visit to the database", async () => {
    const { client, sent } = fakeClient(async () => ({ data: null, error: null }))
    recordVisit(client)
    await vi.waitFor(() => expect(sent).toEqual(["record_visit"]))
  })

  it("does not keep the app waiting for the answer", () => {
    const { client } = fakeClient(() => new Promise(() => {}))
    expect(recordVisit(client)).toBeUndefined()
  })

  // Vitest fails the run on an unhandled rejection, so this test only has to
  // let the failure happen and settle.
  it("drops a failure instead of letting it break the app", async () => {
    const { client, sent } = fakeClient(() => Promise.reject(new Error("offline")))
    recordVisit(client)
    await vi.waitFor(() => expect(sent).toEqual(["record_visit"]))
    await new Promise((resolve) => setTimeout(resolve, 10))
  })

  it("drops a client that throws straight away", () => {
    const client = {
      rpc: () => {
        throw new Error("not ready")
      },
    } as never
    expect(() => recordVisit(client)).not.toThrow()
  })
})
