import { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query"
import { type RouterHistory, RouterProvider } from "@tanstack/react-router"
import { useState } from "react"
import { useTranslation } from "react-i18next"
import { AppHeader } from "./components/AppHeader"
import { Notice } from "./components/Notice"
import { AutosaveDelayContext } from "./editor/useGardenDocument"
import { type Backend, BackendContext } from "./lib/backend"
import { connectBackend } from "./lib/supabase"
import { createAppRouter } from "./router"

export interface AppProps {
  /** Opens the connection to the server. Tests pass an in-memory backend. */
  connect?: () => Promise<Backend>
  /** Where the router keeps the location. Defaults to the browser's address bar. */
  history?: RouterHistory
  /** How long the editor waits after a change before saving. */
  autosaveDelayMs?: number
}

export function App({ connect = connectBackend, history, autosaveDelayMs }: AppProps) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } },
      })
  )
  const [router] = useState(() => createAppRouter(history))

  return (
    <QueryClientProvider client={queryClient}>
      <AutosaveDelayContext value={autosaveDelayMs}>
        <Connected connect={connect}>
          <RouterProvider router={router} />
        </Connected>
      </AutosaveDelayContext>
    </QueryClientProvider>
  )
}

/** Renders the app once the server connection and the session are ready. */
function Connected({
  connect,
  children,
}: {
  connect: () => Promise<Backend>
  children: React.ReactNode
}) {
  const { t } = useTranslation()
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
