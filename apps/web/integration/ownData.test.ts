import { emptyPlan } from "@leira/core"
import { describe, expect, it } from "vitest"
import { gardensApi } from "../src/lib/gardens"
import { signInVisitor, stackSettings } from "./localStack"

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
