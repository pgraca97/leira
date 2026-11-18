import { emptyPlan, samplePlan, toIsoDate, withoutRecords } from "@leira/core"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Link, useNavigate } from "@tanstack/react-router"
import { useEffect, useRef, useState } from "react"
import { useTranslation } from "react-i18next"
import { AccountNoticeBanner } from "../account/AccountNotice"
import { AppHeader } from "../components/AppHeader"
import { Notice } from "../components/Notice"
import { buttonClass, dangerButtonClass, primaryButtonClass } from "../components/ui"
import { PlanSvg } from "../export/PlanSvg"
import { currentLanguage } from "../i18n"
import { importFile, importMessage } from "../import/importFile"
import { useBackend } from "../lib/backend"
import { type GardenSummary, gardenCopyName } from "../lib/gardens"
import { TEMPLATES_KEY } from "../templates/TemplatesPanel"
import { DeleteGarden } from "./DeleteGarden"

const GARDENS_KEY = ["gardens"]

/** The user's gardens: open one, create one, delete one. */
export function GardensPage() {
  const { t } = useTranslation()
  const backend = useBackend()
  const queryClient = useQueryClient()
  const navigate = useNavigate()

  const gardens = useQuery({ queryKey: GARDENS_KEY, queryFn: () => backend.gardens.list() })

  const create = useMutation({
    mutationFn: (start: "empty" | "example") =>
      start === "example"
        ? backend.gardens.create(
            t("gardens.exampleName"),
            samplePlan(toIsoDate(new Date()), () => crypto.randomUUID())
          )
        : backend.gardens.create(t("gardens.defaultName"), emptyPlan()),
    onSuccess: (garden) => navigate({ to: "/gardens/$gardenId", params: { gardenId: garden.id } }),
  })

  const duplicate = useMutation({
    // Read again at the moment of the press: the list may be older than the garden.
    mutationFn: async (garden: GardenSummary) => {
      const { name, plan, location } = await backend.gardens.get(garden.id)
      // A copy is the same plan to start again from: what happened stays with the original.
      return backend.gardens.create(
        gardenCopyName(name, t("gardens.copySuffix")),
        withoutRecords(plan),
        location
      )
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: GARDENS_KEY }),
  })

  const remove = useMutation({
    mutationFn: (garden: GardenSummary) => backend.gardens.remove(garden.id),
    onSuccess: () => setConfirming(null),
    onSettled: () => queryClient.invalidateQueries({ queryKey: GARDENS_KEY }),
  })

  // The garden whose deletion is being asked about: one at a time.
  const [confirming, setConfirming] = useState<string | null>(null)
  const deleteButtons = useRef(new Map<string, HTMLButtonElement>())
  const refocus = useRef<string | null>(null)
  const cancelDelete = (id: string) => {
    refocus.current = id
    setConfirming(null)
  }
  // The button that opened the question takes the focus back once the row has its buttons again.
  useEffect(() => {
    if (confirming !== null || !refocus.current) return
    deleteButtons.current.get(refocus.current)?.focus()
    refocus.current = null
  }, [confirming])

  const fileInput = useRef<HTMLInputElement>(null)
  const restore = useMutation({
    mutationFn: (file: File) =>
      importFile(backend, file, {
        garden: t("gardens.defaultName"),
        template: t("gardens.importTemplateName"),
      }),
    // Also after a failure part way: what came in before it is there.
    onSettled: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: GARDENS_KEY }),
        queryClient.invalidateQueries({ queryKey: TEMPLATES_KEY }),
      ]),
  })
  const imported = restore.data
    ? importMessage(restore.data, t)
    : restore.isError
      ? { text: t("gardens.importFailed"), failed: true }
      : null

  useEffect(() => {
    document.title = t("app.name")
  }, [t])

  const dates = new Intl.DateTimeFormat(currentLanguage(), { dateStyle: "medium" })
  const failed = create.isError
    ? t("gardens.createFailed")
    : duplicate.isError
      ? t("gardens.duplicateFailed")
      : remove.isError
        ? t("gardens.deleteFailed")
        : null

  return (
    <div className="flex h-full flex-col">
      <AppHeader />
      <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-4 overflow-y-auto p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h1 className="text-xl font-semibold text-stone-900">{t("gardens.title")}</h1>
          <div className="flex gap-2">
            {/* The button opens the file picker: a file input cannot be styled. */}
            <input
              ref={fileInput}
              type="file"
              accept=".json,application/json"
              aria-label={t("gardens.import")}
              className="hidden"
              onChange={(event) => {
                const file = event.target.files?.[0]
                // Emptied, so choosing the same file again still imports it.
                event.target.value = ""
                if (file) restore.mutate(file)
              }}
            />
            <button
              type="button"
              className={buttonClass}
              disabled={restore.isPending}
              onClick={() => fileInput.current?.click()}
            >
              {restore.isPending ? t("gardens.importing") : t("gardens.import")}
            </button>
            <button
              type="button"
              className={primaryButtonClass}
              disabled={create.isPending}
              onClick={() => create.mutate("empty")}
            >
              {t("gardens.new")}
            </button>
          </div>
        </div>

        <AccountNoticeBanner />

        {failed && (
          <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-800">
            {failed}
          </p>
        )}
        {imported &&
          (imported.failed ? (
            <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-800">
              {imported.text}
            </p>
          ) : (
            <p
              role="status"
              className="rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-900"
            >
              {imported.text}
            </p>
          ))}

        {gardens.isPending && <Notice kind="status" message={t("gardens.loading")} />}
        {gardens.isError && (
          <Notice
            kind="error"
            message={t("gardens.loadFailed")}
            action={{ label: t("common.retry"), onClick: () => void gardens.refetch() }}
          />
        )}
        {gardens.data?.length === 0 && (
          <Notice
            kind="info"
            message={t("gardens.empty")}
            action={{
              label: t("gardens.example"),
              // A second press while the first is on its way would make two examples.
              onClick: () => {
                if (!create.isPending) create.mutate("example")
              },
            }}
          />
        )}

        {gardens.data && gardens.data.length > 0 && (
          <ul className="flex flex-col gap-2">
            {gardens.data.map((garden) => (
              <li
                key={garden.id}
                className="flex flex-wrap items-center gap-3 rounded-md border border-stone-200 bg-white px-3 py-2"
              >
                {/*
                  A way in for the mouse and the finger. The name beside it is
                  the link everyone else uses, so this one stays out of their way.
                */}
                <Link
                  to="/gardens/$gardenId"
                  params={{ gardenId: garden.id }}
                  tabIndex={-1}
                  aria-hidden="true"
                  className="block h-14 w-20 shrink-0 overflow-hidden rounded-sm bg-stone-100"
                >
                  {garden.plan && (
                    <PlanSvg
                      plan={garden.plan}
                      locale={currentLanguage()}
                      title={garden.name}
                      labels={false}
                      className="size-full"
                    />
                  )}
                </Link>
                {/* Wide enough to read: on a narrow screen that sends the buttons to a line of their own. */}
                <div className="min-w-40 flex-1">
                  <Link
                    to="/gardens/$gardenId"
                    params={{ gardenId: garden.id }}
                    className="block truncate font-medium text-emerald-900 underline-offset-2 hover:underline"
                  >
                    {garden.name}
                  </Link>
                  <p className="text-xs text-stone-500">
                    {t("gardens.updated", { date: dates.format(new Date(garden.updatedAt)) })}
                  </p>
                </div>
                {confirming === garden.id ? (
                  <DeleteGarden
                    garden={garden}
                    deleting={remove.isPending}
                    onCancel={() => cancelDelete(garden.id)}
                    onDelete={() => remove.mutate(garden)}
                  />
                ) : (
                  <div className="ml-auto flex gap-2">
                    <button
                      type="button"
                      className={buttonClass}
                      aria-label={t("gardens.duplicateNamed", { name: garden.name })}
                      disabled={duplicate.isPending}
                      onClick={() => duplicate.mutate(garden)}
                    >
                      {t("gardens.duplicate")}
                    </button>
                    <button
                      ref={(button) => {
                        if (button) deleteButtons.current.set(garden.id, button)
                        else deleteButtons.current.delete(garden.id)
                      }}
                      type="button"
                      className={dangerButtonClass}
                      aria-label={t("gardens.deleteNamed", { name: garden.name })}
                      disabled={remove.isPending}
                      onClick={() => setConfirming(garden.id)}
                    >
                      {t("gardens.delete")}
                    </button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </main>
    </div>
  )
}
