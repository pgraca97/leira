import type { SupabaseClient } from "@supabase/supabase-js"
import { z } from "zod"
import type { CaptchaSolver } from "./captcha"

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
   * Deletes the user, their gardens and everything else kept about them, at
   * once. For guests: an account asks with `requestDeletion` instead.
   * The browser is left with no session.
   */
  deleteAccount(): Promise<void>
  /**
   * Asks for the account to be deleted 30 days from now, and signs it out on
   * every device. Signing in again before then keeps it.
   * Resolves to when it will be deleted. A guest cannot ask: with no way to
   * sign in again, they delete at once. The browser is left with no session.
   */
  requestDeletion(): Promise<Date>
  /**
   * Keeps the account if its deletion was waiting, now that its user has
   * signed in again. Resolves to when it would have been deleted, or null
   * when nothing was waiting.
   */
  resume(): Promise<Date | null>
}

/** How long an account waits between asking to be deleted and being deleted. */
const DELETION_GRACE_DAYS = 30

/**
 * When an account that asks to be deleted at `askedAt` will go. The database
 * keeps the real date: this one is for saying it before the account asks.
 */
export function deletionDue(askedAt: Date): Date {
  return new Date(askedAt.getTime() + DELETION_GRACE_DAYS * 24 * 60 * 60 * 1000)
}

/** A date the database sent as text, or nothing. */
const DueDateSchema = z.iso.datetime({ offset: true }).nullable()

function dueDate(value: unknown): Date | null {
  const due = DueDateSchema.parse(value)
  return due === null ? null : new Date(due)
}

/** What a guest's code brought into the account. */
export interface HandedOver {
  gardens: number
  templates: number
}

const HandedOverSchema = z.object({ gardens: z.int().min(0), templates: z.int().min(0) })

/** The real account also knows how to finish a trip to Google that was refused. */
export interface SupabaseAccountApi extends AccountApi {
  /**
   * Sends the browser to Google to sign in to the account that Google
   * identity already has. A guest leaves a code first, so that account can
   * take the guest's gardens along (see `takeOver`).
   */
  signInWithGoogle(): Promise<void>
  /**
   * Once this browser is signed in to an account, takes over the gardens and
   * templates of the guest who left a code here before signing in to it.
   * Null when no code waits, or while this browser is still that guest.
   */
  takeOver(): Promise<HandedOver | null>
}

/**
 * Where a guest's code waits while the browser signs in to another user: an
 * emailed link may come back in another tab, Google in a new page load.
 */
export interface HandoverStore {
  read(): string | null
  write(code: string): void
  clear(): void
}

const HANDOVER_KEY = "leira.handover"

/**
 * This browser's storage. Storage can be blocked: the code is then not kept,
 * and the guest's gardens stay behind as they would with no code at all.
 */
const browserHandover: HandoverStore = {
  read() {
    try {
      return localStorage.getItem(HANDOVER_KEY)
    } catch {
      return null
    }
  },
  write(code) {
    try {
      localStorage.setItem(HANDOVER_KEY, code)
    } catch {
      // Not kept: see above.
    }
  },
  clear() {
    try {
      localStorage.removeItem(HANDOVER_KEY)
    } catch {
      // Nothing was kept to clear.
    }
  },
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

interface AccountOptions {
  /** Takes the browser to another site. */
  navigate?: (url: string) => void
  /**
   * Proves the visitor is a person, where the auth server asks for it before
   * emailing a sign-in link. Going to Google needs no captcha.
   */
  captcha?: CaptchaSolver
  /**
   * Asks, with the session's access token, for the account to be deleted
   * after the grace period, and resolves to when it will be. The app asks
   * the Worker, which also emails the date. Without it the database is asked
   * directly and nothing is emailed, as in the integration tests, which run
   * with no Worker.
   */
  askDeletion?: (accessToken: string) => Promise<Date>
  /** Where a guest's code waits for the account it signs in to. */
  handover?: HandoverStore
}

/** `appUrl` is where an emailed link or Google sends the user back to. */
export function accountApi(
  client: SupabaseClient,
  appUrl: string,
  {
    navigate = (url) => window.location.assign(url),
    captcha,
    askDeletion,
    handover = browserHandover,
  }: AccountOptions = {}
): SupabaseAccountApi {
  /** Asks the database itself, as the user, when there is no Worker to ask. */
  async function askDatabase(): Promise<Date> {
    const { data, error } = await client.rpc("request_account_deletion")
    if (error) throw new Error(error.message)
    const due = dueDate(data)
    if (!due) throw new Error("The database gave no date for the deletion")
    return due
  }

  /**
   * Before a guest signs in to an account that already exists, and so stops
   * being the user its gardens belong to, it leaves a code in this browser
   * for that account to take them with. Refused, it throws: signing in then
   * would leave the gardens behind.
   */
  async function offerHandover(): Promise<void> {
    const { data: signedIn, error: sessionError } = await client.auth.getSession()
    if (sessionError) throw new Error(sessionError.message)
    if (!signedIn.session?.user.is_anonymous) return
    const { data, error } = await client.rpc("offer_guest_handover")
    if (error) throw new Error(error.message)
    if (typeof data !== "string") throw new Error("The database gave no handover code")
    handover.write(data)
  }

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

      await offerHandover()
      const signIn = await client.auth.signInWithOtp({
        email,
        options: {
          // Never create an account here: the address is known to have one.
          shouldCreateUser: false,
          emailRedirectTo: appUrl,
          ...(captcha ? { captchaToken: await captcha() } : {}),
        },
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
      await offerHandover()
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

    async requestDeletion() {
      let due: Date
      if (askDeletion) {
        const { data: signedIn, error } = await client.auth.getSession()
        if (error) throw new Error(error.message)
        const accessToken = signedIn.session?.access_token
        if (!accessToken) throw new Error("There is no session to ask with")
        due = await askDeletion(accessToken)
      } else {
        due = await askDatabase()
      }
      // The database ended every session of the account, this one too: only
      // this browser's copy is left to forget.
      const local = await client.auth.signOut({ scope: "local" })
      if (local.error) throw new Error(local.error.message)
      return due
    },

    async takeOver() {
      const code = handover.read()
      if (!code) return null
      const { data: signedIn, error: sessionError } = await client.auth.getSession()
      if (sessionError) throw new Error(sessionError.message)
      // Still the guest who left it: the link is not opened yet, or Google has not answered.
      if (!signedIn.session || signedIn.session.user.is_anonymous) return null
      const { data, error } = await client.rpc("claim_guest_handover", { handover_code: code })
      if (error) throw new Error(error.message)
      // Spent, or too old to take anything: either way it is done with.
      handover.clear()
      return HandedOverSchema.parse(data)
    },

    async resume() {
      const { data: signedIn, error: sessionError } = await client.auth.getSession()
      if (sessionError) throw new Error(sessionError.message)
      // A guest cannot have asked for a deletion, and most visitors are
      // guests: this saves them a request on every page load.
      if (!signedIn.session || signedIn.session.user.is_anonymous) return null
      const { data, error } = await client.rpc("resume_account")
      if (error) throw new Error(error.message)
      return dueDate(data)
    },
  }
}
