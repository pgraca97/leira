import { afterEach, describe, expect, it, vi } from "vitest"
import { requestAccountDeletion } from "./account"

const ENV = {
  SUPABASE_URL: "https://project.supabase.co",
  SUPABASE_PUBLISHABLE_KEY: "sb_publishable_abc",
} as Env

/** Stands in for the Data API, answering every call with `body`. */
function dataApi(body: unknown, status = 200) {
  const fetch = vi.fn(
    async (_input: RequestInfo | URL, _init?: RequestInit) =>
      new Response(JSON.stringify(body), {
        status,
        headers: { "Content-Type": "application/json" },
      })
  )
  vi.stubGlobal("fetch", fetch)
  return fetch
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe("requestAccountDeletion", () => {
  it("asks the database as the caller and gives back the day the account goes", async () => {
    const fetch = dataApi("2026-12-17T10:00:00.123456+00:00")

    const deleteOn = await requestAccountDeletion(ENV, "alice-token")
    expect(deleteOn.toISOString()).toBe("2026-12-17T10:00:00.123Z")

    expect(fetch).toHaveBeenCalledTimes(1)
    const [input, init] = fetch.mock.calls[0]!
    expect(String(input)).toBe("https://project.supabase.co/rest/v1/rpc/request_account_deletion")
    expect(init?.method).toBe("POST")
    // The user's own token, so the function acts on them and no one else.
    const headers = new Headers(init?.headers)
    expect(headers.get("Authorization")).toBe("Bearer alice-token")
    expect(headers.get("apikey")).toBe("sb_publishable_abc")
  })

  it("throws when the database refuses", async () => {
    dataApi({ code: "P0001", message: "guests cannot ask for a delay" }, 400)
    await expect(requestAccountDeletion(ENV, "guest-token")).rejects.toThrow(
      "guests cannot ask for a delay"
    )
  })

  it("throws when the answer is not a date", async () => {
    dataApi("soon")
    await expect(requestAccountDeletion(ENV, "alice-token")).rejects.toThrow()
  })

  it("throws when Supabase is not configured", async () => {
    await expect(requestAccountDeletion({} as Env, "alice-token")).rejects.toThrow()
  })
})
