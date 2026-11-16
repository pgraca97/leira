import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { type RouterHistory, RouterProvider } from "@tanstack/react-router"
import { useState } from "react"
import { ConnectContext } from "./components/Connected"
import { AutosaveDelayContext } from "./editor/useGardenDocument"
import { type Backend, type PublicBackend, PublicBackendContext } from "./lib/backend"
import { workerPublicBackend } from "./lib/publicBackend"
import { connectBackend } from "./lib/supabase"
import { createAppRouter } from "./router"

export interface AppProps {
  /** Opens the connection to the server. Tests pass an in-memory backend. */
  connect?: () => Promise<Backend>
  /** What can be asked of the server with no session. Tests pass an in-memory one. */
  publicBackend?: PublicBackend
  /** Where the router keeps the location. Defaults to the browser's address bar. */
  history?: RouterHistory
  /** How long the editor waits after a change before saving. */
  autosaveDelayMs?: number
}

export function App({
  connect = connectBackend,
  publicBackend = workerPublicBackend,
  history,
  autosaveDelayMs,
}: AppProps) {
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
        {/* The router decides which pages connect: see the session route. */}
        <ConnectContext value={connect}>
          <PublicBackendContext value={publicBackend}>
            <RouterProvider router={router} />
          </PublicBackendContext>
        </ConnectContext>
      </AutosaveDelayContext>
    </QueryClientProvider>
  )
}
