import { describe, expect, it } from "vitest"
import { OPEN_APP_SCRIPT, openAppTarget } from "./openApp"

const ORIGIN = "https://leira.test"
const SESSION = "sb-auqrvaqgomlblbcuyjlr-auth-token"

function visit(overrides: Partial<Parameters<typeof openAppTarget>[0]> = {}) {
  return openAppTarget({
    storageKeys: [SESSION],
    referrer: "",
    origin: ORIGIN,
    search: "",
    hash: "",
    ...overrides,
  })
}

describe("who the landing page sends straight to the app", () => {
  it("someone who has used the app in this browser", () => {
    expect(visit()).toBe("/gardens")
  })

  it("nobody who never has: they came to read the page", () => {
    expect(visit({ storageKeys: [] })).toBeNull()
    expect(visit({ storageKeys: ["garden.language", "leira.clipboard"] })).toBeNull()
  })

  it("someone arriving from a search or another site", () => {
    expect(visit({ referrer: "https://www.google.com/" })).toBe("/gardens")
  })

  // The app links here on purpose (its name in the header, a shared garden's
  // "plan your own"), and so does the other language's page.
  it("nobody who came from a page of this site", () => {
    expect(visit({ referrer: `${ORIGIN}/gardens/b1c2` })).toBeNull()
    expect(visit({ referrer: `${ORIGIN}/en/` })).toBeNull()
  })

  it("someone whose referrer cannot be read", () => {
    expect(visit({ referrer: "not a url" })).toBe("/gardens")
  })

  // A sign-in that falls back to the site's address still finishes in the app.
  it("with whatever the address carries", () => {
    expect(visit({ search: "?code=abc", hash: "#access_token=xyz" })).toBe(
      "/gardens?code=abc#access_token=xyz"
    )
  })

  it("only for the session's own key, not one that merely looks alike", () => {
    expect(visit({ storageKeys: ["sb-ref-auth-token-code-verifier"] })).toBeNull()
  })
})

describe("the script in the landing page", () => {
  /** Runs the script's text on its own, as the browser does, with a stand-in browser. */
  function run(storage: object, referrer = "") {
    const replaced: string[] = []
    const location = {
      origin: ORIGIN,
      search: "?a=1",
      hash: "",
      replace: (to: string) => replaced.push(to),
    }
    new Function("localStorage", "document", "location", OPEN_APP_SCRIPT)(
      storage,
      { referrer },
      location
    )
    return replaced
  }

  it("needs nothing from outside its own text", () => {
    expect(run({ [SESSION]: "{}" })).toEqual(["/gardens?a=1"])
    expect(run({})).toEqual([])
    expect(run({ [SESSION]: "{}" }, `${ORIGIN}/gardens`)).toEqual([])
  })

  it("lets the page show when storage is blocked", () => {
    const blocked = new Proxy(
      {},
      {
        ownKeys() {
          throw new Error("SecurityError")
        },
      }
    )
    expect(run(blocked)).toEqual([])
  })
})
