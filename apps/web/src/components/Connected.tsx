import { useQuery } from "@tanstack/react-query"
import { createContext, type ReactNode, useContext, useEffect, useState } from "react"
import { useTranslation } from "react-i18next"
import { AccountNoticeProvider } from "../account/AccountNotice"
import { type Backend, BackendContext, type SessionChange } from "../lib/backend"
import { AppHeader } from "./AppHeader"
import { Notice } from "./Notice"

/** How to open the connection to the server. The app provides it; tests pass an in-memory one. */
export const ConnectContext = createContext<(() => Promise<Backend>) | null>(null)

/**
 * Renders its pages once the server connection and the session are ready.
 * Connecting signs a new visitor in as a guest, so only the pages that need
 * a session sit under this.
 */
export function Connected({ children }: { children: ReactNode }) {
  const { t } = useTranslation()
  const connect = useContext(ConnectContext)
  if (!connect) throw new Error("Connected needs a ConnectContext provider")
  const connection = useQuery({
    queryKey: ["backend"],
    queryFn: connect,
    staleTime: Number.POSITIVE_INFINITY,
    gcTime: Number.POSITIVE_INFINITY,
  })
  const backend = connection.data
  const [ended, setEnded] = useState<SessionChange | null>(null)
  // The first change is the one to tell: signing out elsewhere also signs in a new guest after.
  useEffect(
    () => backend?.onSessionChange((change) => setEnded((first) => first ?? change)),
    [backend]
  )

  // Outside the backend, so the pages stop and save nothing as someone else.
  if (ended) return <SessionEnded change={ended} />

  if (connection.data) {
    return (
      <BackendContext value={connection.data}>
        <AccountNoticeProvider>{children}</AccountNoticeProvider>
      </BackendContext>
    )
  }

  return (
    <div className="flex h-full flex-col">
      <AppHeader />
      {connection.isError ? (
        <Notice
          kind="error"
          message={t("backend.failed")}
          action={{ label: t("common.retry"), onClick: () => void connection.refetch() }}
        />
      ) : (
        <Notice kind="status" message={t("backend.connecting")} />
      )}
    </div>
  )
}

/** What a page shows once its session ended or changed user behind its back. */
function SessionEnded({ change }: { change: SessionChange }) {
  const { t } = useTranslation()
  return (
    <div className="flex h-full flex-col">
      <AppHeader />
      <Notice
        kind="info"
        message={t(change === "signedOut" ? "session.signedOut" : "session.switched")}
      >
        {/* A page load of its own: the app connects again as whoever is signed in now. */}
        <a href="/gardens" className="text-sm font-medium text-emerald-800 underline">
          {t("session.continue")}
        </a>
      </Notice>
    </div>
  )
}
