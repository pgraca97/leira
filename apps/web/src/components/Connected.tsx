import { useQuery } from "@tanstack/react-query"
import { createContext, type ReactNode, useContext } from "react"
import { useTranslation } from "react-i18next"
import { type Backend, BackendContext } from "../lib/backend"
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

  if (connection.data) return <BackendContext value={connection.data}>{children}</BackendContext>

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
