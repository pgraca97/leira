import { emptyPlan } from "@leira/core"
import { describe, expect, it } from "vitest"
import { accountApi } from "../src/lib/account"
import { gardensApi } from "../src/lib/gardens"
import {
  emailedLink,
  followEmailedLink,
  newClient,
  signInVisitor,
  stackSettings,
  testCaptcha,
} from "./localStack"

/**
 * Keeping a guest's gardens by attaching an email, and getting back to them
 * from another device, against the real auth server and its mail catcher.
 */
const settings = stackSettings()
// A path under the site URL, as the app sends: the auth server must not fall back to the site URL.
const APP_URL = "http://localhost:5173/gardens"

/** An address nobody has used, so runs do not trip over each other. */
function freshAddress(): string {
  return `gardener-${crypto.randomUUID()}@example.com`
}

describe("a guest's account", () => {
  it("starts without an email", async () => {
    const guest = await signInVisitor(settings)
    expect(await accountApi(guest.client, APP_URL).get()).toEqual({ email: null })
  })

  it("is still a guest until the emailed link is opened", async () => {
    const guest = await signInVisitor(settings)
    const account = accountApi(guest.client, APP_URL)
    await account.requestEmailLink(freshAddress())
    expect(await account.get()).toEqual({ email: null })
  })

  it("keeps its gardens under the same user once the link is opened", async () => {
    const guest = await signInVisitor(settings)
    const account = accountApi(guest.client, APP_URL)
    const garden = await gardensApi(guest.client).create("Kept", emptyPlan())
    const address = freshAddress()

    await account.requestEmailLink(address)
    const opened = await followEmailedLink(await emailedLink(address))

    expect(opened.redirectedTo).toBe(APP_URL)
    expect(await account.get()).toEqual({ email: address })
    expect((await gardensApi(guest.client).get(garden.id)).name).toBe("Kept")
    const { data } = await guest.client.auth.getUser()
    expect(data.user).toMatchObject({ id: guest.userId, is_anonymous: false })
  })

  it("refuses something that is not an email address", async () => {
    const guest = await signInVisitor(settings)
    await expect(
      accountApi(guest.client, APP_URL).requestEmailLink("not-an-email")
    ).rejects.toThrow()
  })
})

describe("keeping the gardens with Google", () => {
  /** Where the account sent the browser, without going there. */
  async function sentTo(start: (navigate: (url: string) => void) => Promise<void>): Promise<URL> {
    let address = ""
    await start((url) => {
      address = url
    })
    return new URL(address)
  }

  it("sends a guest to Google through the auth server, to come back to the app", async () => {
    const guest = await signInVisitor(settings)
    const url = await sentTo((navigate) =>
      accountApi(guest.client, APP_URL, { navigate }).continueWithGoogle()
    )

    expect(url.hostname).toBe("accounts.google.com")
    // Google answers to the auth server, which attaches the identity to the
    // guest it remembers in `state`, then sends the browser back to the app.
    expect(url.searchParams.get("redirect_uri")).toBe(`${settings.url}/auth/v1/callback`)
    expect(url.searchParams.get("state")).toBeTruthy()
    // Still the same guest, with the same gardens, until Google answers.
    expect(await accountApi(guest.client, APP_URL).get()).toEqual({ email: null })
  })

  it("can also sign in to the account a Google identity already has", async () => {
    const guest = await signInVisitor(settings)
    const url = await sentTo((navigate) =>
      accountApi(guest.client, APP_URL, { navigate }).signInWithGoogle()
    )

    expect(`${url.origin}${url.pathname}`).toBe(`${settings.url}/auth/v1/authorize`)
    expect(url.searchParams.get("provider")).toBe("google")
    expect(url.searchParams.get("redirect_to")).toBe(APP_URL)
  })
})

describe("coming back on another device", () => {
  it("signs a new guest in to the account that already has the email", async () => {
    // First device: a guest keeps their garden under an address.
    const first = await signInVisitor(settings)
    const address = freshAddress()
    const garden = await gardensApi(first.client).create("At home", emptyPlan())
    await accountApi(first.client, APP_URL).requestEmailLink(address)
    await followEmailedLink(await emailedLink(address))

    // Second device: another guest asks for a link with the same address.
    const second = await signInVisitor(settings)
    await accountApi(second.client, APP_URL, { captcha: testCaptcha }).requestEmailLink(address)
    const opened = await followEmailedLink(await emailedLink(address))

    // The link carries a session of the first account, not of the second guest.
    expect(opened.accessToken).not.toBeNull()
    const { data } = await second.client.auth.getUser(opened.accessToken ?? "")
    expect(data.user?.id).toBe(first.userId)
    expect(data.user?.id).not.toBe(second.userId)
    // The first device still sees its garden.
    expect((await gardensApi(first.client).get(garden.id)).name).toBe("At home")
  })
})

describe("signing out", () => {
  it("ends the session", async () => {
    const guest = await signInVisitor(settings)
    await accountApi(guest.client, APP_URL).signOut()
    const { data } = await guest.client.auth.getSession()
    expect(data.session).toBeNull()
  })
})

// The auth server asks for a captcha before it makes a guest or emails a
// sign-in link, so a bot cannot do either by the thousand. Locally the test
// secret lets any token through, so only production turns a bad one away.
describe("the captcha", () => {
  it("is needed to sign in as a guest", async () => {
    const { error } = await newClient(settings).auth.signInAnonymously()
    expect(error?.code).toBe("captcha_failed")
  })

  it("is needed to email a link to an address that has an account", async () => {
    const first = await signInVisitor(settings)
    const address = freshAddress()
    await accountApi(first.client, APP_URL).requestEmailLink(address)
    await followEmailedLink(await emailedLink(address))

    const second = await signInVisitor(settings)
    await expect(accountApi(second.client, APP_URL).requestEmailLink(address)).rejects.toThrow(
      /captcha/i
    )
  })
})
