import { emptyPlan } from "@garden/core"
import { describe, expect, it } from "vitest"
import { accountApi } from "../src/lib/account"
import { gardensApi } from "../src/lib/gardens"
import { emailedLink, followEmailedLink, signInVisitor, stackSettings } from "./localStack"

/**
 * Keeping a guest's gardens by attaching an email, and getting back to them
 * from another device, against the real auth server and its mail catcher.
 */
const settings = stackSettings()
const APP_URL = "http://localhost:5173"

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
    await accountApi(second.client, APP_URL).requestEmailLink(address)
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
