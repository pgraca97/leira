import { describe, expect, it } from "vitest"
import { authErrorCode } from "./account"

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
