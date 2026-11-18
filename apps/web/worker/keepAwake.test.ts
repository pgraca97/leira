import { describe, expect, it } from "vitest"
import { keepAwake } from "./keepAwake"

/** A client whose `rpc` answers the way PostgREST does: data or an error, never a throw. */
function clientAnswering(error: { message: string } | null) {
  const calls: string[] = []
  const client = {
    rpc: async (name: string) => {
      calls.push(name)
      return { data: error ? null : true, error }
    },
  }
  return { client: client as never, calls }
}

describe("keeping the database awake", () => {
  it("asks the database for its smallest answer", async () => {
    const { client, calls } = clientAnswering(null)
    await keepAwake(client)
    expect(calls).toEqual(["keep_awake"])
  })

  it("fails when the database does not answer, so the cron run shows as failed", async () => {
    const { client } = clientAnswering({ message: "project is paused" })
    await expect(keepAwake(client)).rejects.toThrow("project is paused")
  })

  it("does nothing where Supabase is not configured", async () => {
    await expect(keepAwake(null)).resolves.toBeUndefined()
  })
})
