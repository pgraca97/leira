import { emptyPlan } from "@leira/core"
import { createClient } from "@supabase/supabase-js"
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
 * Taking one's data and deleting one's account on the real stack: the
 * functions run as the database owner, who must be allowed into `auth.users`.
 */
const settings = stackSettings()

describe("a visitor's own data", () => {
  it("can be exported, gardens included", async () => {
    const visitor = await signInVisitor(settings)
    await gardensApi(visitor.client).create("Exported plot", emptyPlan())
    const { data, error } = await visitor.client.rpc("export_my_data")
    expect(error).toBeNull()
    expect(data.gardens.map((garden: { name: string }) => garden.name)).toEqual(["Exported plot"])
  })

  it("tells where the visitor is signed in, and that a guest has no sign-in method", async () => {
    const visitor = await signInVisitor(settings)
    const { data, error } = await visitor.client.rpc("export_my_data")
    expect(error).toBeNull()
    expect(data.account.signInMethods).toEqual([])
    expect(data.account.sessions.length).toBeGreaterThanOrEqual(1)
    expect(data.account.sessions[0].userAgent).toEqual(expect.stringMatching(/\S/))
  })

  it("is gone, user and all, once the account is deleted", async () => {
    const visitor = await signInVisitor(settings)
    await gardensApi(visitor.client).create("Doomed plot", emptyPlan())
    expect((await visitor.client.rpc("delete_account")).error).toBeNull()
    // The session's token is still well formed, but the auth server no longer knows its user.
    expect((await visitor.client.auth.getUser()).error).not.toBeNull()
  })
})

describe("an account that asks to be deleted", () => {
  const APP_URL = "http://localhost:5173/gardens"

  /** A client that calls the database with one access token, as a tab holding it would. */
  function holding(accessToken: string) {
    return createClient(settings.url, settings.publishableKey, {
      global: { headers: { Authorization: `Bearer ${accessToken}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    })
  }

  it("is signed out everywhere, and only a new sign-in keeps it", async () => {
    const visitor = await signInVisitor(settings)
    const address = `leaving-${crypto.randomUUID()}@example.com`
    await accountApi(visitor.client, APP_URL).requestEmailLink(address)
    await followEmailedLink(await emailedLink(address))
    await gardensApi(visitor.client).create("Kept after all", emptyPlan())
    const { data: before } = await visitor.client.auth.getSession()
    const oldSession = before.session
    if (!oldSession) throw new Error("The account has no session")

    const deleteOn = await accountApi(visitor.client, APP_URL).requestDeletion()
    const days = (deleteOn.getTime() - Date.now()) / (24 * 60 * 60 * 1000)
    expect(days).toBeGreaterThan(29.9)
    expect(days).toBeLessThanOrEqual(30)

    // Another device holding the old session cannot refresh it any more.
    const refreshed = await newClient(settings).auth.refreshSession({
      refresh_token: oldSession.refresh_token,
    })
    expect(refreshed.error).not.toBeNull()
    // Its access token still works until it expires, but does not undo the request.
    const stale = holding(oldSession.access_token)
    expect(await stale.rpc("resume_account")).toMatchObject({ data: null, error: null })

    // Signing in again by emailed link, from a new guest, keeps the account.
    const guest = await signInVisitor(settings)
    await accountApi(guest.client, APP_URL, { captcha: testCaptcha }).requestEmailLink(address)
    const opened = await followEmailedLink(await emailedLink(address))
    if (!opened.accessToken) throw new Error("The link carried no session")
    const back = holding(opened.accessToken)
    const resumed = await back.rpc("resume_account")
    expect(resumed.error).toBeNull()
    expect(new Date(resumed.data).getTime()).toBe(deleteOn.getTime())

    const { data } = await back.rpc("export_my_data")
    expect(data.account.deletionRequestedAt).toBeNull()
    expect(data.gardens.map((garden: { name: string }) => garden.name)).toEqual(["Kept after all"])
  })

  it("cannot be asked for by a guest, who is deleted at once instead", async () => {
    const guest = await signInVisitor(settings)
    const { error } = await guest.client.rpc("request_account_deletion")
    expect(error?.code).toBe("42501")
  })
})
