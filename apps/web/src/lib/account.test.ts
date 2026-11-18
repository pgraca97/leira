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
  /** What attaching an address to the guest answers: an address already used refuses. */
  attachError = null as { code: string; message: string } | null,
  handover = memoryHandover(),
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
      updateUser: vi.fn(async () => {
        calls.push("updateUser")
        return { error: attachError }
      }),
      signInWithOtp: vi.fn(async () => {
        calls.push("signInWithOtp")
        return { error: null }
      }),
      signInWithOAuth: vi.fn(async () => {
        calls.push("signInWithOAuth")
        return { data: { url: "https://accounts.google.com/o/oauth2" }, error: null }
      }),
    },
  }
  return {
    account: accountApi(client as never, "https://app.example/gardens", {
      askDeletion,
      handover,
      navigate: () => {},
    }),
    calls,
    handover,
  }
}

/** Keeps a handover code in memory, as the browser's storage would. */
function memoryHandover(code: string | null = null) {
  let kept = code
  return {
    read: () => kept,
    write: (next: string) => {
      kept = next
    },
    clear: () => {
      kept = null
    },
  }
}

const GUEST = { access_token: "token-guest", user: { is_anonymous: true } }

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

describe("a guest who signs in to an account that already exists", () => {
  it("leaves a code for the account before the emailed link is sent", async () => {
    const { account, calls, handover } = fakeClient({
      session: GUEST,
      attachError: { code: "email_exists", message: "already registered" },
      answer: { data: "code-1", error: null },
    })
    await account.requestEmailLink("ana@example.com")
    expect(calls).toEqual(["updateUser", "offer_guest_handover", "signInWithOtp"])
    expect(handover.read()).toBe("code-1")
  })

  it("leaves none for an address nobody uses, which the guest itself becomes", async () => {
    const { account, calls, handover } = fakeClient({ session: GUEST })
    await account.requestEmailLink("new@example.com")
    expect(calls).toEqual(["updateUser"])
    expect(handover.read()).toBeNull()
  })

  it("sends no link when the code cannot be had: the gardens would stay behind", async () => {
    const { account, calls } = fakeClient({
      session: GUEST,
      attachError: { code: "email_exists", message: "already registered" },
      answer: { data: null, error: { message: "down" } },
    })
    await expect(account.requestEmailLink("ana@example.com")).rejects.toThrow("down")
    expect(calls).not.toContain("signInWithOtp")
  })

  it("leaves a code before going to Google for the account its identity has", async () => {
    const { account, calls, handover } = fakeClient({
      session: GUEST,
      answer: { data: "code-2", error: null },
    })
    await account.signInWithGoogle()
    expect(calls).toEqual(["offer_guest_handover", "signInWithOAuth"])
    expect(handover.read()).toBe("code-2")
  })

  it("has the account take the gardens once signed in, and forgets the code", async () => {
    const { account, calls, handover } = fakeClient({
      answer: { data: { gardens: 2, templates: 1 }, error: null },
      handover: memoryHandover("code-1"),
    })
    expect(await account.takeOver()).toEqual({ gardens: 2, templates: 1 })
    expect(calls).toEqual(["claim_guest_handover"])
    expect(handover.read()).toBeNull()
  })

  it("waits while this browser is still the guest: the link is not opened yet", async () => {
    const { account, calls, handover } = fakeClient({
      session: GUEST,
      handover: memoryHandover("code-1"),
    })
    expect(await account.takeOver()).toBeNull()
    expect(calls).toEqual([])
    expect(handover.read()).toBe("code-1")
  })

  it("keeps the code when the database fails, so the next visit tries again", async () => {
    const { account, handover } = fakeClient({
      answer: { data: null, error: { message: "down" } },
      handover: memoryHandover("code-1"),
    })
    await expect(account.takeOver()).rejects.toThrow("down")
    expect(handover.read()).toBe("code-1")
  })

  it("asks nothing when no code was left", async () => {
    const { account, calls } = fakeClient()
    expect(await account.takeOver()).toBeNull()
    expect(calls).toEqual([])
  })
})
