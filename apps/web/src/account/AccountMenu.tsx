import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useNavigate } from "@tanstack/react-router"
import { type FormEvent, useCallback, useId, useRef, useState } from "react"
import { useTranslation } from "react-i18next"
import { z } from "zod"
import { buttonClass, inputClass, primaryButtonClass } from "../components/ui"
import { useDismiss } from "../components/useDismiss"
import { useBackend } from "../lib/backend"

const ACCOUNT_KEY = ["account"]

/**
 * The header button that says who is using the app, and the panel under it:
 * a guest is offered a way to keep their gardens, a signed-in user a way out.
 */
export function AccountMenu() {
  const { t } = useTranslation()
  const backend = useBackend()
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const container = useRef<HTMLDivElement>(null)
  const toggle = useRef<HTMLButtonElement>(null)

  const account = useQuery({
    queryKey: ACCOUNT_KEY,
    queryFn: () => backend.account.get(),
    // An emailed link opens in another tab. Coming back to this one, the
    // header should already show the account.
    refetchOnWindowFocus: true,
  })

  const signOut = useMutation({
    mutationFn: async () => {
      // Leave the editor first, so its last save still goes out as this user.
      await navigate({ to: "/" })
      await backend.account.signOut()
      // Everything on screen belonged to the account. The connection itself stays.
      await queryClient.resetQueries({ predicate: (query) => query.queryKey[0] !== "backend" })
    },
    onSuccess: () => setOpen(false),
  })

  const close = useCallback(() => setOpen(false), [])
  useDismiss(open, close, container, toggle)

  if (!account.data) return null
  const { email } = account.data

  return (
    <div ref={container} className="relative">
      <button
        ref={toggle}
        type="button"
        className={`${buttonClass} max-w-56`}
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        <span className="truncate">{email ?? t("account.keep")}</span>
      </button>
      {open && (
        <div
          role="dialog"
          aria-label={t("account.panel")}
          className="absolute top-full right-0 z-20 mt-2 flex w-80 max-w-[calc(100vw-2rem)] flex-col gap-3 rounded-md border border-stone-200 bg-white p-4 text-sm text-stone-700 shadow-lg"
        >
          {email ? (
            <>
              <p className="break-words">{t("account.signedInAs", { email })}</p>
              {signOut.isError && (
                <p role="alert" className="text-red-800">
                  {t("account.signOutFailed")}
                </p>
              )}
              <button
                type="button"
                className={buttonClass}
                disabled={signOut.isPending}
                onClick={() => signOut.mutate()}
              >
                {t("account.signOut")}
              </button>
            </>
          ) : (
            <GuestSignIn />
          )}
        </div>
      )}
    </div>
  )
}

/** The two ways a guest can keep their gardens: Google, or a link sent by email. */
function GuestSignIn() {
  const { t } = useTranslation()
  const backend = useBackend()
  const emailId = useId()
  const [email, setEmail] = useState("")
  const [invalid, setInvalid] = useState(false)

  const google = useMutation({ mutationFn: () => backend.account.continueWithGoogle() })
  const link = useMutation({
    mutationFn: (address: string) => backend.account.requestEmailLink(address),
  })

  const submit = (event: FormEvent) => {
    event.preventDefault()
    google.reset()
    const address = z.email().safeParse(email.trim())
    setInvalid(!address.success)
    if (address.success) link.mutate(address.data)
    else link.reset()
  }

  if (link.isSuccess) {
    return <p role="status">{t("account.sent", { email: link.variables })}</p>
  }

  // One problem at a time: the newest attempt is the one that matters.
  const problem = invalid
    ? t("account.invalidEmail")
    : link.isError
      ? t("account.sendFailed")
      : google.isError
        ? t("account.googleFailed")
        : null

  return (
    <>
      <p>{t("account.guest")}</p>
      <button
        type="button"
        className={buttonClass}
        disabled={google.isPending}
        onClick={() => {
          setInvalid(false)
          link.reset()
          google.mutate()
        }}
      >
        <GoogleMark />
        {t("account.google")}
      </button>
      <form noValidate onSubmit={submit} className="flex flex-col gap-2">
        <p className="text-center text-stone-500">{t("account.orEmail")}</p>
        <label htmlFor={emailId} className="sr-only">
          {t("account.email")}
        </label>
        <input
          id={emailId}
          type="email"
          autoComplete="email"
          placeholder={t("account.email")}
          className={inputClass}
          value={email}
          onChange={(event) => setEmail(event.target.value)}
        />
        <button type="submit" className={primaryButtonClass} disabled={link.isPending}>
          {t("account.send")}
        </button>
      </form>
      {problem && (
        <p role="alert" className="text-red-800">
          {problem}
        </p>
      )}
    </>
  )
}

/** Google's "G", which its sign-in guidelines ask for next to the button's text. */
function GoogleMark() {
  return (
    <svg viewBox="0 0 18 18" className="size-4" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.7-1.57 2.68-3.88 2.68-6.62Z"
      />
      <path
        fill="#34A853"
        d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.8.54-1.84.86-3.04.86-2.34 0-4.33-1.58-5.04-3.71H.96v2.33A9 9 0 0 0 9 18Z"
      />
      <path
        fill="#FBBC05"
        d="M3.96 10.71a5.41 5.41 0 0 1 0-3.42V4.96H.96a9 9 0 0 0 0 8.08l3-2.33Z"
      />
      <path
        fill="#EA4335"
        d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.59C13.46.89 11.43 0 9 0A9 9 0 0 0 .96 4.96l3 2.33C4.67 5.16 6.66 3.58 9 3.58Z"
      />
    </svg>
  )
}
