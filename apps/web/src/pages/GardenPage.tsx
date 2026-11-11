import { useQuery } from "@tanstack/react-query"
import { Link } from "@tanstack/react-router"
import { useEffect, useState } from "react"
import { useTranslation } from "react-i18next"
import { AppHeader } from "../components/AppHeader"
import { Notice } from "../components/Notice"
import { inputClass } from "../components/ui"
import { Editor } from "../editor/Editor"
import { SaveIndicator } from "../editor/SaveIndicator"
import { useGardenDocument } from "../editor/useGardenDocument"
import { useBackend } from "../lib/backend"
import {
  GARDEN_NAME_MAX,
  type Garden,
  GardenFormatError,
  GardenNotFoundError,
} from "../lib/gardens"

/** One garden: loads it, then hands it to the editor. */
export function GardenPage({ gardenId }: { gardenId: string }) {
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

function LoadedGarden({ garden, onReload }: { garden: Garden; onReload(): void }) {
  const gardenDocument = useGardenDocument(garden)
  const { name, setName, saveStatus, retrySave } = gardenDocument

  useEffect(() => {
    document.title = name
  }, [name])

  return (
    <div className="flex h-full flex-col">
      <AppHeader>
        <BackLink />
        <NameField name={name} onRename={setName} />
        <SaveIndicator status={saveStatus} onRetry={retrySave} onReload={onReload} />
      </AppHeader>
      <div className="min-h-0 flex-1">
        <Editor />
      </div>
    </div>
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
