import { describe, expect, it, vi } from "vitest"
import { accountApi, authErrorCode } from "./account"

describe("what the auth server left in the address", () => {
  it("is nothing on a normal visit", () => {
    expect(authErrorCode(new URL("https://app.example/gardens/1?view=calendar"))).toBeNull()
  })

  it("is nothing when the visitor comes back signed in", () => {
    expect(
      authErrorCode(new URL("https://app.example/#access_token=abc&type=magiclink"))
    ).toBeNull()
  })

  it("reads a refusal from the fragment", () => {
    const url = new URL(
      "https://app.example/#error=server_error&error_code=identity_already_exists&error_description=Identity+is+already+linked"
    )
    expect(authErrorCode(url)).toBe("identity_already_exists")
  })

  it("reads a refusal from the query", () => {
    const url = new URL("https://app.example/?error=access_denied&error_code=otp_expired")
    expect(authErrorCode(url)).toBe("otp_expired")
  })

  it("falls back to the plain error when there is no code", () => {
    expect(authErrorCode(new URL("https://app.example/?error=access_denied"))).toBe("access_denied")
  })
})

interface Answer {
  data: unknown
  error: { message: string } | null
}

/** Stands in for the parts of the Supabase client that a deletion uses, and records the calls. */
function fakeClient({
  answer = { data: null, error: null } as Answer,
  session = { access_token: "token-1", user: { is_anonymous: false } } as {
    access_token: string
    user: { is_anonymous: boolean }
  } | null,
  askDeletion = undefined as ((accessToken: string) => Promise<Date>) | undefined,
} = {}) {
  const calls: string[] = []
  const client = {
    rpc: vi.fn(async (name: string) => {
      calls.push(name)
      return answer
    }),
    auth: {
      getSession: vi.fn(async () => ({ data: { session }, error: null })),
      signOut: vi.fn(async (options?: { scope?: string }) => {
        calls.push(`signOut:${options?.scope}`)
        return { error: null }
      }),
    },
  }
  return {
    account: accountApi(client as never, "https://app.example/gardens", { askDeletion }),
    calls,
  }
}

describe("asking to delete an account", () => {
  it("asks the database, then forgets the ended session in this browser", async () => {
    const { account, calls } = fakeClient({
      answer: { data: "2026-12-17T10:00:00.123456+00:00", error: null },
    })
    expect(await account.requestDeletion()).toEqual(new Date("2026-12-17T10:00:00.123Z"))
    expect(calls).toEqual(["request_account_deletion", "signOut:local"])
  })

  it("stays signed in when the database refuses", async () => {
    const { account, calls } = fakeClient({ answer: { data: null, error: { message: "down" } } })
    await expect(account.requestDeletion()).rejects.toThrow("down")
    expect(calls).toEqual(["request_account_deletion"])
  })

  // The app asks the Worker, which also emails the date. It needs the
  // session's token, since the request ends the session.
  it("asks the Worker with the session's token when it is given one", async () => {
    const askDeletion = vi.fn(async () => new Date("2026-12-17T10:00:00Z"))
    const { account, calls } = fakeClient({ askDeletion })
    expect(await account.requestDeletion()).toEqual(new Date("2026-12-17T10:00:00Z"))
    expect(askDeletion).toHaveBeenCalledExactlyOnceWith("token-1")
    expect(calls).toEqual(["signOut:local"])
  })

  it("stays signed in when the Worker refuses", async () => {
    const askDeletion = vi.fn(async () => {
      throw new Error("/api/account/deletion failed: 502")
    })
    const { account, calls } = fakeClient({ askDeletion })
    await expect(account.requestDeletion()).rejects.toThrow("502")
    expect(calls).toEqual([])
  })

  it("asks nothing when there is no session", async () => {
    const askDeletion = vi.fn(async () => new Date())
    const { account } = fakeClient({ askDeletion, session: null })
    await expect(account.requestDeletion()).rejects.toThrow()
    expect(askDeletion).not.toHaveBeenCalled()
  })
})

describe("keeping an account by signing in again", () => {
  it("says when the account would have been deleted", async () => {
    const { account, calls } = fakeClient({
      answer: { data: "2026-12-17T10:00:00+00:00", error: null },
    })
    expect(await account.resume()).toEqual(new Date("2026-12-17T10:00:00Z"))
    expect(calls).toEqual(["resume_account"])
  })

  it("is nothing when no deletion was waiting", async () => {
    const { account } = fakeClient()
    expect(await account.resume()).toBeNull()
  })

  it("does not ask for a guest, who cannot have asked for a deletion", async () => {
    const { account, calls } = fakeClient({
      session: { access_token: "token-2", user: { is_anonymous: true } },
    })
    expect(await account.resume()).toBeNull()
    expect(calls).toEqual([])
  })

  it("fails when the database does, so the next visit tries again", async () => {
    const { account } = fakeClient({ answer: { data: null, error: { message: "down" } } })
    await expect(account.resume()).rejects.toThrow("down")
  })
})
