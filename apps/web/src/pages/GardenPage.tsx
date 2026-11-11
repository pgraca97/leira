import { useQuery } from "@tanstack/react-query"
import { Link, useNavigate } from "@tanstack/react-router"
import { useEffect, useState } from "react"
import { useTranslation } from "react-i18next"
import { Calendar } from "../calendar/Calendar"
import { AppHeader } from "../components/AppHeader"
import { Notice } from "../components/Notice"
import { inputClass } from "../components/ui"
import { Editor } from "../editor/Editor"
import { SaveIndicator } from "../editor/SaveIndicator"
import { editorStore } from "../editor/store"
import { useGardenDocument } from "../editor/useGardenDocument"
import { useBackend } from "../lib/backend"
import {
  GARDEN_NAME_MAX,
  type Garden,
  GardenFormatError,
  GardenNotFoundError,
} from "../lib/gardens"
import type { GardenView } from "../router"
import { WeatherPanel } from "../weather/WeatherPanel"

/** One garden: loads it, then hands it to the editor or the calendar. */
export function GardenPage({ gardenId, view }: { gardenId: string; view: GardenView }) {
  const { t } = useTranslation()
  const backend = useBackend()
  const garden = useQuery({
    queryKey: ["garden", gardenId],
    queryFn: () => backend.gardens.get(gardenId),
    // The editor owns the garden once it is loaded: no refetch behind its
    // back, and no stale copy kept for the next visit.
    staleTime: Number.POSITIVE_INFINITY,
    gcTime: 0,
  })

  if (garden.data) {
    return (
      // Keyed by load, so a reload replaces the editor's copy with the server's.
      <LoadedGarden
        key={garden.dataUpdatedAt}
        garden={garden.data}
        view={view}
        onReload={() => void garden.refetch()}
      />
    )
  }

  const missing = garden.error instanceof GardenNotFoundError
  const unreadable = garden.error instanceof GardenFormatError
  return (
    <div className="flex h-full flex-col">
      <AppHeader />
      {garden.isError ? (
        <Notice
          kind={missing ? "info" : "error"}
          message={t(
            missing ? "garden.notFound" : unreadable ? "garden.unreadable" : "garden.loadFailed"
          )}
          action={
            missing || unreadable
              ? undefined
              : { label: t("common.retry"), onClick: () => void garden.refetch() }
          }
        >
          <BackLink />
        </Notice>
      ) : (
        <Notice kind="status" message={t("garden.loading")} />
      )}
    </div>
  )
}

function BackLink() {
  const { t } = useTranslation()
  return (
    <Link to="/" className="text-sm font-medium text-emerald-800 underline">
      {t("garden.back")}
    </Link>
  )
}

interface LoadedGardenProps {
  garden: Garden
  view: GardenView
  onReload(): void
}

function LoadedGarden({ garden, view, onReload }: LoadedGardenProps) {
  const navigate = useNavigate()
  const gardenDocument = useGardenDocument(garden)
  const { name, setName, location, setLocation, saveStatus, retrySave } = gardenDocument

  useEffect(() => {
    document.title = name
  }, [name])

  return (
    <div className="flex h-full flex-col">
      <AppHeader>
        <BackLink />
        <ViewSwitch gardenId={garden.id} />
        <NameField name={name} onRename={setName} />
        <SaveIndicator status={saveStatus} onRetry={retrySave} onReload={onReload} />
      </AppHeader>
      <div className="min-h-0 flex-1">
        {view === "calendar" ? (
          <Calendar
            onOpenPlanting={(id) => {
              editorStore.getState().select({ kind: "planting", id })
              void navigate({ to: "/gardens/$gardenId", params: { gardenId: garden.id } })
            }}
          />
        ) : (
          <Editor aside={<WeatherPanel location={location} onLocationChange={setLocation} />} />
        )}
      </div>
    </div>
  )
}

const viewLinkClass =
  "rounded-md px-2 py-1 text-sm font-medium text-stone-700 hover:bg-stone-100 aria-[current=page]:bg-emerald-50 aria-[current=page]:text-emerald-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700"

/**
 * Switches between the plan and the calendar of the same garden. The router
 * marks the current one with `aria-current`. Its match must be exact: the plan
 * has no search parameter, so a loose match would call it current on both views.
 */
function ViewSwitch({ gardenId }: { gardenId: string }) {
  const { t } = useTranslation()
  return (
    <nav aria-label={t("calendar.viewLabel")} className="flex gap-1">
      <Link
        to="/gardens/$gardenId"
        params={{ gardenId }}
        activeOptions={{ exact: true }}
        className={viewLinkClass}
      >
        {t("calendar.plan")}
      </Link>
      <Link
        to="/gardens/$gardenId"
        params={{ gardenId }}
        search={{ view: "calendar" }}
        activeOptions={{ exact: true }}
        className={viewLinkClass}
      >
        {t("calendar.calendar")}
      </Link>
    </nav>
  )
}

/** The garden's name, edited in place. An empty name snaps back to the saved one. */
function NameField({ name, onRename }: { name: string; onRename(name: string): boolean }) {
  const { t } = useTranslation()
  const [draft, setDraft] = useState(name)

  return (
    <input
      type="text"
      aria-label={t("garden.nameLabel")}
      className={`${inputClass} w-48 font-medium`}
      maxLength={GARDEN_NAME_MAX}
      value={draft}
      onChange={(event) => {
        setDraft(event.target.value)
        onRename(event.target.value)
      }}
      onBlur={() => setDraft(name)}
    />
  )
}
