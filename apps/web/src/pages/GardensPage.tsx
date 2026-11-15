import { emptyPlan } from "@leira/core"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Link, useNavigate } from "@tanstack/react-router"
import { useEffect } from "react"
import { useTranslation } from "react-i18next"
import { AppHeader } from "../components/AppHeader"
import { Notice } from "../components/Notice"
import { dangerButtonClass, primaryButtonClass } from "../components/ui"
import { currentLanguage } from "../i18n"
import { useBackend } from "../lib/backend"
import type { GardenSummary } from "../lib/gardens"

const GARDENS_KEY = ["gardens"]

/** The user's gardens: open one, create one, delete one. */
export function GardensPage() {
  const { t } = useTranslation()
  const backend = useBackend()
  const queryClient = useQueryClient()
  const navigate = useNavigate()

  const gardens = useQuery({ queryKey: GARDENS_KEY, queryFn: () => backend.gardens.list() })

  const create = useMutation({
    mutationFn: () => backend.gardens.create(t("gardens.defaultName"), emptyPlan()),
    onSuccess: (garden) => navigate({ to: "/gardens/$gardenId", params: { gardenId: garden.id } }),
  })

  const remove = useMutation({
    mutationFn: (garden: GardenSummary) => backend.gardens.remove(garden.id),
    onSettled: () => queryClient.invalidateQueries({ queryKey: GARDENS_KEY }),
  })

  useEffect(() => {
    document.title = t("app.name")
  }, [t])

  const dates = new Intl.DateTimeFormat(currentLanguage(), { dateStyle: "medium" })
  const failed = create.isError
    ? t("gardens.createFailed")
    : remove.isError
      ? t("gardens.deleteFailed")
      : null

  return (
    <div className="flex h-full flex-col">
      <AppHeader />
      <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-4 overflow-y-auto p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h1 className="text-xl font-semibold text-stone-900">{t("gardens.title")}</h1>
          <button
            type="button"
            className={primaryButtonClass}
            disabled={create.isPending}
            onClick={() => create.mutate()}
          >
            {t("gardens.new")}
          </button>
        </div>

        {failed && (
          <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-800">
            {failed}
          </p>
        )}

        {gardens.isPending && <Notice kind="status" message={t("gardens.loading")} />}
        {gardens.isError && (
          <Notice
            kind="error"
            message={t("gardens.loadFailed")}
            action={{ label: t("common.retry"), onClick: () => void gardens.refetch() }}
          />
        )}
        {gardens.data?.length === 0 && <Notice kind="info" message={t("gardens.empty")} />}

        {gardens.data && gardens.data.length > 0 && (
          <ul className="flex flex-col gap-2">
            {gardens.data.map((garden) => (
              <li
                key={garden.id}
                className="flex items-center gap-3 rounded-md border border-stone-200 bg-white px-3 py-2"
              >
                <div className="min-w-0 flex-1">
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
                <button
                  type="button"
                  className={dangerButtonClass}
                  aria-label={t("gardens.deleteNamed", { name: garden.name })}
                  disabled={remove.isPending}
                  onClick={() => {
                    if (window.confirm(t("gardens.confirmDelete", { name: garden.name }))) {
                      remove.mutate(garden)
                    }
                  }}
                >
                  {t("gardens.delete")}
                </button>
              </li>
            ))}
          </ul>
        )}
      </main>
    </div>
  )
}
