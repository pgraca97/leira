import {
  createRootRoute,
  createRoute,
  createRouter,
  Link,
  type RouterHistory,
} from "@tanstack/react-router"
import { useTranslation } from "react-i18next"
import { AppHeader } from "./components/AppHeader"
import { Notice } from "./components/Notice"
import { GardenPage } from "./pages/GardenPage"
import { GardensPage } from "./pages/GardensPage"

const rootRoute = createRootRoute({ notFoundComponent: PageNotFound })

const gardensRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  component: GardensPage,
})

/** The ways to look at a garden. The plan is the default and has no search parameter. */
export type GardenView = "plan" | "calendar"

export const gardenRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/gardens/$gardenId",
  // A search parameter rather than a child route: both views share the loaded
  // garden and its autosave, which must not restart when the view changes.
  validateSearch: (search: Record<string, unknown>): { view?: "calendar" } =>
    search.view === "calendar" ? { view: "calendar" } : {},
  component: function GardenRoute() {
    const { gardenId } = gardenRoute.useParams()
    const { view = "plan" } = gardenRoute.useSearch()
    // Keyed, so moving to another garden starts from a clean page.
    return <GardenPage key={gardenId} gardenId={gardenId} view={view} />
  },
})

const routeTree = rootRoute.addChildren([gardensRoute, gardenRoute])

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
