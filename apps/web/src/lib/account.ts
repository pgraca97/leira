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
  /**
   * Sends the browser to Google, and back to the app once the user agrees.
   *
   * A guest keeps their user id, and so every garden, when the Google account
   * is new here. When it already has an account, the visitor is signed in to
   * that one instead, as with an emailed link.
   */
  continueWithGoogle(): Promise<void>
  signOut(): Promise<void>
  /** Everything kept about the user, as one JSON document, for them to take away. */
  exportData(): Promise<unknown>
  /**
   * Deletes the user, their gardens and everything else kept about them.
   * The browser is left with no session.
   */
  deleteAccount(): Promise<void>
}

/** The real account also knows how to finish a trip to Google that was refused. */
export interface SupabaseAccountApi extends AccountApi {
  /** Sends the browser to Google to sign in to the account that Google identity already has. */
  signInWithGoogle(): Promise<void>
}

/**
 * The reason the auth server gave for refusing a link or a trip to Google,
 * which it leaves in the address it sends the visitor back to. Null when the
 * address carries no refusal.
 */
export function authErrorCode(url: URL): string | null {
  for (const part of [url.hash.slice(1), url.search]) {
    const params = new URLSearchParams(part)
    const code = params.get("error_code") ?? params.get("error")
    if (code) return code
  }
  return null
}

/** The refusal for a Google identity that already belongs to another account. */
export const IDENTITY_TAKEN = "identity_already_exists"

/**
 * `appUrl` is where an emailed link or Google sends the user back to.
 * `navigate` takes the browser to another site.
 */
export function accountApi(
  client: SupabaseClient,
  appUrl: string,
  navigate: (url: string) => void = (url) => window.location.assign(url)
): SupabaseAccountApi {
  // The client would navigate by itself, but only in a browser. Asking for
  // the address instead behaves the same everywhere, tests included.
  const options = { redirectTo: appUrl, skipBrowserRedirect: true }

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

    async continueWithGoogle() {
      const { data, error } = await client.auth.linkIdentity({ provider: "google", options })
      if (error) throw new Error(error.message)
      if (!data.url) throw new Error("The auth server gave no address for Google")
      navigate(data.url)
    },

    async signInWithGoogle() {
      const { data, error } = await client.auth.signInWithOAuth({ provider: "google", options })
      if (error) throw new Error(error.message)
      if (!data.url) throw new Error("The auth server gave no address for Google")
      navigate(data.url)
    },

    async signOut() {
      const { error } = await client.auth.signOut()
      if (error) throw new Error(error.message)
    },

    async exportData() {
      const { data, error } = await client.rpc("export_my_data")
      if (error) throw new Error(error.message)
      return data
    },

    async deleteAccount() {
      const { error } = await client.rpc("delete_account")
      if (error) throw new Error(error.message)
      // The user is gone, so the auth server has nothing to sign out: only
      // this browser's copy of the session is left to forget.
      const local = await client.auth.signOut({ scope: "local" })
      if (local.error) throw new Error(local.error.message)
    },
  }
}
