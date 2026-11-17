import { copyItems } from "@leira/core"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { type FormEvent, useId, useState } from "react"
import { useTranslation } from "react-i18next"
import { buttonClass, dangerButtonClass, inputClass } from "../components/ui"
import { editorStore } from "../editor/store"
import { useEditor } from "../editor/useEditor"
import { useBackend } from "../lib/backend"
import { TemplateLimitError } from "../lib/templates"

export const TEMPLATES_KEY = ["templates"]
const headingClass = "mb-1 text-xs font-semibold tracking-wide text-stone-500 uppercase"

/**
 * The user's saved groups of beds and crops: save what is selected under a
 * name, and insert a saved one into the garden open. They belong to the
 * account, so every garden lists the same ones.
 */
export function TemplatesPanel() {
  const { t } = useTranslation()
  const backend = useBackend()
  const queryClient = useQueryClient()
  const titleId = useId()
  const nameId = useId()
  const plan = useEditor((state) => state.plan)
  const selection = useEditor((state) => state.selection)
  const [name, setName] = useState("")
  // The template that last did not fit, by id, so the message stays with it.
  const [refusedId, setRefusedId] = useState<string | null>(null)

  const templates = useQuery({ queryKey: TEMPLATES_KEY, queryFn: () => backend.templates.list() })
  const save = useMutation({
    mutationFn: () => {
      const items = copyItems(plan, selection)
      if (!items) throw new Error("Nothing is selected")
      return backend.templates.save(name.trim(), items)
    },
    onSuccess: () => setName(""),
    onSettled: () => queryClient.invalidateQueries({ queryKey: TEMPLATES_KEY }),
  })
  const remove = useMutation({
    mutationFn: (id: string) => backend.templates.remove(id),
    onSettled: () => queryClient.invalidateQueries({ queryKey: TEMPLATES_KEY }),
  })

  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (name.trim()) save.mutate()
  }

  const kinds = (beds: number, plantings: number) =>
    [
      beds ? t("inspector.selectedBeds", { count: beds }) : "",
      plantings ? t("inspector.selectedPlantings", { count: plantings }) : "",
    ]
      .filter(Boolean)
      .join(", ")

  return (
    <section aria-labelledby={titleId} className="flex flex-col gap-2 text-sm">
      <h3 id={titleId} className={headingClass}>
        {t("templates.title")}
      </h3>

      {selection.length > 0 ? (
        <form onSubmit={submit} className="flex flex-wrap items-end gap-2">
          <label htmlFor={nameId} className="flex flex-1 flex-col gap-1 text-xs text-stone-600">
            {t("templates.name")}
            <input
              id={nameId}
              className={inputClass}
              maxLength={60}
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
          </label>
          <button type="submit" className={buttonClass} disabled={!name.trim() || save.isPending}>
            {t("templates.save")}
          </button>
        </form>
      ) : (
        <p className="text-stone-600">{t("templates.empty")}</p>
      )}
      {save.isError && (
        <p role="alert" className="text-red-800">
          {save.error instanceof TemplateLimitError
            ? t("templates.limit")
            : t("templates.saveFailed")}
        </p>
      )}

      {templates.isError && (
        <p role="alert" className="text-red-800">
          {t("templates.loadFailed")}
        </p>
      )}
      {templates.data && templates.data.length > 0 && (
        <ul className="flex flex-col gap-1">
          {templates.data.map((template) => (
            <li key={template.id} className="flex flex-col gap-1 rounded-md bg-stone-100 p-2">
              <div className="flex flex-wrap items-center gap-2">
                <span className="flex-1 font-medium text-stone-900">
                  {template.name}{" "}
                  <span className="font-normal text-stone-600">
                    {kinds(template.items.beds.length, template.items.plantings.length)}
                  </span>
                </span>
                <button
                  type="button"
                  className={buttonClass}
                  aria-label={t("templates.insertNamed", { name: template.name })}
                  onClick={() => {
                    const fits = editorStore.getState().insertTemplate(template.items)
                    setRefusedId(fits ? null : template.id)
                  }}
                >
                  {t("templates.insert")}
                </button>
                <button
                  type="button"
                  className={dangerButtonClass}
                  aria-label={t("templates.deleteNamed", { name: template.name })}
                  disabled={remove.isPending}
                  onClick={() => remove.mutate(template.id)}
                >
                  {t("templates.delete")}
                </button>
              </div>
              {refusedId === template.id && (
                <p role="alert" className="text-red-800">
                  {t("templates.doesNotFit")}
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
