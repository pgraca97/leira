import {
  createRootRoute,
  createRoute,
  createRouter,
  Link,
  Outlet,
  type RouterHistory,
} from "@tanstack/react-router"
import { useTranslation } from "react-i18next"
import { AppHeader } from "./components/AppHeader"
import { Connected } from "./components/Connected"
import { Notice } from "./components/Notice"
import { GardenPage } from "./pages/GardenPage"
import { GardensPage } from "./pages/GardensPage"
import { PrivacyPage } from "./pages/PrivacyPage"
import { SharedGardenPage } from "./pages/SharedGardenPage"
import { StatsPage } from "./pages/StatsPage"

const rootRoute = createRootRoute({ notFoundComponent: PageNotFound })

/**
 * The pages that need a session. Connecting signs a new visitor in as a
 * guest, so a page that works without one stays outside this route.
 */
const sessionRoute = createRoute({
  getParentRoute: () => rootRoute,
  id: "session",
  component: () => (
    <Connected>
      <Outlet />
    </Connected>
  ),
})

const gardensRoute = createRoute({
  getParentRoute: () => sessionRoute,
  path: "/",
  component: GardensPage,
})

/** The ways to look at a garden. The plan is the default and has no search parameter. */
export type GardenView = "plan" | "calendar"

const validateView = (search: Record<string, unknown>): { view?: "calendar" } =>
  search.view === "calendar" ? { view: "calendar" } : {}

export const gardenRoute = createRoute({
  getParentRoute: () => sessionRoute,
  path: "/gardens/$gardenId",
  // A search parameter rather than a child route: both views share the loaded
  // garden and its autosave, which must not restart when the view changes.
  validateSearch: validateView,
  component: function GardenRoute() {
    const { gardenId } = gardenRoute.useParams()
    const { view = "plan" } = gardenRoute.useSearch()
    // Keyed, so moving to another garden starts from a clean page.
    return <GardenPage key={gardenId} gardenId={gardenId} view={view} />
  },
})

/** How the app is used. The page itself turns away anyone who is not an admin. */
const statsRoute = createRoute({
  getParentRoute: () => sessionRoute,
  path: "/stats",
  component: StatsPage,
})

/** A garden opened from its share link: read-only, and with no session. */
export const sharedGardenRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/shared/$token",
  validateSearch: validateView,
  component: function SharedGardenRoute() {
    const { token } = sharedGardenRoute.useParams()
    const { view = "plan" } = sharedGardenRoute.useSearch()
    return <SharedGardenPage key={token} token={token} view={view} />
  },
})

/** What is kept and who sees it. Outside the session, so reading it makes nobody a guest. */
const privacyRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/privacy",
  component: PrivacyPage,
})

const routeTree = rootRoute.addChildren([
  sessionRoute.addChildren([gardensRoute, gardenRoute, statsRoute]),
  sharedGardenRoute,
  privacyRoute,
])

export function createAppRouter(history?: RouterHistory) {
  return createRouter({ routeTree, history })
}

declare module "@tanstack/react-router" {
  interface Register {
    router: ReturnType<typeof createAppRouter>
  }
}

function PageNotFound() {
  const { t } = useTranslation()
  return (
    <div className="flex h-full flex-col">
      <AppHeader />
      <Notice kind="info" message={t("common.pageNotFound")}>
        <Link to="/" className="text-emerald-800 underline">
          {t("garden.back")}
        </Link>
      </Notice>
    </div>
  )
}
