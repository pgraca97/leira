import { beforeEach, describe, expect, it, vi } from "vitest"
import { verifySupabaseToken } from "./auth"

// The real check needs the Auth server or its signing keys: that runs in
// integration/gardens.test.ts. Here it is only what is read from the claims.
const getClaims = vi.hoisted(() => vi.fn())
vi.mock("./supabase", () => ({ supabaseClient: () => ({ auth: { getClaims } }) }))

const env = {} as Env

beforeEach(() => {
  getClaims.mockReset()
})

describe("verifySupabaseToken", () => {
  it("reads the user id, email and whether it is a guest", async () => {
    getClaims.mockResolvedValue({
      data: { claims: { sub: "user-1", email: "alice@example.com", is_anonymous: false } },
      error: null,
    })
    expect(await verifySupabaseToken(env, "token")).toEqual({
      id: "user-1",
      email: "alice@example.com",
      isAnonymous: false,
    })
    expect(getClaims).toHaveBeenCalledExactlyOnceWith("token")
  })

  // A guest's token carries an empty email.
  it("gives a guest no email", async () => {
    getClaims.mockResolvedValue({
      data: { claims: { sub: "guest-1", email: "", is_anonymous: true } },
      error: null,
    })
    expect(await verifySupabaseToken(env, "token")).toEqual({
      id: "guest-1",
      email: null,
      isAnonymous: true,
    })
  })

  it("rejects a token that does not verify", async () => {
    getClaims.mockResolvedValue({ data: null, error: new Error("invalid JWT") })
    expect(await verifySupabaseToken(env, "token")).toBeNull()
  })

  it("rejects a token with no user in it", async () => {
    getClaims.mockResolvedValue({ data: { claims: { sub: "" } }, error: null })
    expect(await verifySupabaseToken(env, "token")).toBeNull()
  })
})
