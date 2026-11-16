import { useQuery } from "@tanstack/react-query"
import { Link } from "@tanstack/react-router"
import { useEffect } from "react"
import { useTranslation } from "react-i18next"
import { PlanCalendar } from "../calendar/Calendar"
import { AppHeader } from "../components/AppHeader"
import { Notice } from "../components/Notice"
import { viewLinkClass } from "../components/ui"
import { PlanSvg } from "../export/PlanSvg"
import { currentLanguage } from "../i18n"
import { usePublicBackend } from "../lib/backend"
import { GardenFormatError, GardenNotFoundError, type SharedGarden } from "../lib/gardens"
import type { GardenView } from "../router"

/**
 * A garden opened from its share link: its plan and calendar, to look at and
 * not to change. It asks for no session, so opening a link someone sent does
 * not make the visitor a guest account.
 */
export function SharedGardenPage({ token, view }: { token: string; view: GardenView }) {
  const { t } = useTranslation()
  const backend = usePublicBackend()
  const garden = useQuery({
    queryKey: ["shared-garden", token],
    queryFn: () => backend.sharedGarden(token),
  })

  if (garden.data) return <LoadedSharedGarden garden={garden.data} token={token} view={view} />

  const missing = garden.error instanceof GardenNotFoundError
  const unreadable = garden.error instanceof GardenFormatError
  return (
    <div className="flex h-full flex-col">
      <AppHeader />
      {garden.isError ? (
        <Notice
          kind={missing ? "info" : "error"}
          message={t(
            missing ? "shared.notFound" : unreadable ? "garden.unreadable" : "garden.loadFailed"
          )}
          action={
            missing || unreadable
              ? undefined
              : { label: t("common.retry"), onClick: () => void garden.refetch() }
          }
        >
          <OwnGardenLink />
        </Notice>
      ) : (
        <Notice kind="status" message={t("garden.loading")} />
      )}
    </div>
  )
}

/** The way from someone else's garden to the visitor's own. */
function OwnGardenLink() {
  const { t } = useTranslation()
  return (
    <Link to="/" className="text-sm font-medium text-emerald-800 underline">
      {t("shared.own")}
    </Link>
  )
}

interface LoadedSharedGardenProps {
  garden: SharedGarden
  token: string
  view: GardenView
}

function LoadedSharedGarden({ garden, token, view }: LoadedSharedGardenProps) {
  const { t } = useTranslation()
  const { name, plan, location } = garden

  useEffect(() => {
    document.title = name
  }, [name])

  // A garden located from a device has no place name: its rounded position stands in.
  const place =
    location && (location.name ?? `${location.lat.toFixed(2)}, ${location.lon.toFixed(2)}`)

  return (
    <div className="flex h-full flex-col">
      <AppHeader>
        <nav aria-label={t("calendar.viewLabel")} className="flex gap-1">
          <Link
            to="/shared/$token"
            params={{ token }}
            activeOptions={{ exact: true }}
            className={viewLinkClass}
          >
            {t("calendar.plan")}
          </Link>
          <Link
            to="/shared/$token"
            params={{ token }}
            search={{ view: "calendar" }}
            activeOptions={{ exact: true }}
            className={viewLinkClass}
          >
            {t("calendar.calendar")}
          </Link>
        </nav>
      </AppHeader>
      <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1 border-b border-stone-200 bg-stone-50 px-4 py-2">
        <h1 className="text-lg font-semibold text-stone-900">{name}</h1>
        {place && <p className="text-sm text-stone-600">{place}</p>}
        <p className="text-sm text-stone-600">{t("shared.readOnly")}</p>
        <span className="sm:ml-auto">
          <OwnGardenLink />
        </span>
      </div>
      <div className="min-h-0 flex-1">
        {view === "calendar" ? (
          <PlanCalendar plan={plan} gardenName={name} />
        ) : (
          <main className="h-full overflow-auto p-4">
            <PlanSvg
              plan={plan}
              locale={currentLanguage()}
              title={name}
              className="mx-auto max-h-full w-full max-w-5xl"
            />
          </main>
        )}
      </div>
    </div>
  )
}
