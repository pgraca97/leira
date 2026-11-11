import type { SupabaseClient } from "@supabase/supabase-js"

/** Who is using the app. A guest has no email: their gardens live in this browser's session only. */
export interface Account {
  email: string | null
}

export interface AccountApi {
  get(): Promise<Account>
  /**
   * Emails a link that, once opened, ties this browser to `email`.
   *
   * For an address nobody uses yet, the link attaches it to the current guest,
   * who keeps the same user id and so every garden. For an address that
   * already has an account, the link signs in to that account instead. The
   * caller cannot tell the two apart, and should not: saying which happened
   * would tell a stranger whether an address is registered.
   */
  requestEmailLink(email: string): Promise<void>
  signOut(): Promise<void>
}

/** `appUrl` is where an emailed link sends the user back to. */
export function accountApi(client: SupabaseClient, appUrl: string): AccountApi {
  return {
    async get() {
      const { data, error } = await client.auth.getUser()
      if (error) throw new Error(error.message)
      // An address waiting for confirmation is not the user's yet.
      return { email: data.user.is_anonymous ? null : data.user.email || null }
    },

    async requestEmailLink(email) {
      const attached = await client.auth.updateUser({ email }, { emailRedirectTo: appUrl })
      if (!attached.error) return
      if (attached.error.code !== "email_exists") throw new Error(attached.error.message)

      const signIn = await client.auth.signInWithOtp({
        email,
        // Never create an account here: the address is known to have one.
        options: { shouldCreateUser: false, emailRedirectTo: appUrl },
      })
      if (signIn.error) throw new Error(signIn.error.message)
    },

    async signOut() {
      const { error } = await client.auth.signOut()
      if (error) throw new Error(error.message)
    },
  }
}
