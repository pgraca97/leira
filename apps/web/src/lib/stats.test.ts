import { describe, expect, it } from "vitest"
import { StatsForbiddenError, statsApi, type UsageStats } from "./stats"

const STATS: UsageStats = {
  generatedAt: "2026-11-17T11:08:49.026624+00:00",
  people: { guests: 196, accounts: 16, withGarden: 156 },
  gardens: { total: 202, editedLast7Days: 40, editedLast30Days: 90, shared: 29, withLocation: 12 },
  weeks: [{ weekStart: "2026-11-16", newPeople: 12, active: 30, returning: 18 }],
  limits: { databaseBytes: 12252851, monthlyUsers: 157 },
}

/** A client whose `rpc` answers the way PostgREST does: data or an error, never a throw. */
function clientAnswering(answer: {
  data: unknown
  error: { code: string; message: string } | null
}) {
  const calls: string[] = []
  const client = {
    rpc: async (name: string) => {
      calls.push(name)
      return answer
    },
  }
  return { api: statsApi(client as never), calls }
}

describe("the usage stats", () => {
  it("are read from the database in one call", async () => {
    const { api, calls } = clientAnswering({ data: STATS, error: null })
    expect(await api.usage()).toEqual(STATS)
    expect(calls).toEqual(["usage_stats"])
  })

  it("say so when the visitor is not an admin", async () => {
    const { api } = clientAnswering({
      data: null,
      error: { code: "42501", message: "usage stats are for admins only" },
    })
    await expect(api.usage()).rejects.toBeInstanceOf(StatsForbiddenError)
  })

  it("fail plainly on any other error", async () => {
    const { api } = clientAnswering({ data: null, error: { code: "08006", message: "offline" } })
    const failure = api.usage()
    await expect(failure).rejects.toThrow("offline")
    await expect(failure).rejects.not.toBeInstanceOf(StatsForbiddenError)
  })

  it("refuse an answer of the wrong shape", async () => {
    const { api } = clientAnswering({ data: { people: "many" }, error: null })
    await expect(api.usage()).rejects.toThrow()
  })
})
