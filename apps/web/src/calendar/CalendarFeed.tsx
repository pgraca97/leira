import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useCallback, useId, useRef, useState } from "react"
import { useTranslation } from "react-i18next"
import { buttonClass, dangerButtonClass, inputClass, primaryButtonClass } from "../components/ui"
import { useDismiss } from "../components/useDismiss"
import { currentLanguage } from "../i18n"
import { useBackend } from "../lib/backend"

/**
 * The button that opens a garden's calendar link panel: turn on a link that
 * phone and desktop calendars subscribe to, add it to one, or turn it off.
 */
export function CalendarFeed({ gardenId }: { gardenId: string }) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const container = useRef<HTMLDivElement>(null)
  const toggle = useRef<HTMLButtonElement>(null)
  const close = useCallback(() => setOpen(false), [])
  useDismiss(open, close, container, toggle)

  return (
    <div ref={container} className="relative">
      <button
        ref={toggle}
        type="button"
        className={buttonClass}
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        {t("calendar.feed.button")}
      </button>
      {open && (
        <div
          role="dialog"
          aria-label={t("calendar.feed.panel")}
          className="absolute top-full right-0 z-20 mt-2 flex w-80 max-w-[calc(100vw-2rem)] flex-col gap-3 rounded-md border border-stone-200 bg-white p-4 text-sm text-stone-700 shadow-lg"
        >
          <FeedPanel gardenId={gardenId} />
        </div>
      )}
    </div>
  )
}

/**
 * The address a calendar app reads the jobs from. It carries the language,
 * since the app asks for none, so the jobs read as they do in the app now.
 */
function feedUrl(token: string): string {
  return `${window.location.origin}/api/calendar/${token}.ics?lang=${currentLanguage()}`
}

function FeedPanel({ gardenId }: { gardenId: string }) {
  const { t } = useTranslation()
  const backend = useBackend()
  const queryClient = useQueryClient()
  const linkId = useId()
  const feedKey = ["garden-calendar", gardenId]
  const [copied, setCopied] = useState(false)

  const feed = useQuery({ queryKey: feedKey, queryFn: () => backend.gardens.getCalendar(gardenId) })
  const keep = (token: string | null) => queryClient.setQueryData(feedKey, token)

  const start = useMutation({
    mutationFn: () => backend.gardens.startCalendar(gardenId),
    onSuccess: keep,
  })
  const stop = useMutation({
    mutationFn: () => backend.gardens.stopCalendar(gardenId),
    onSuccess: () => {
      keep(null)
      setCopied(false)
    },
  })
  const busy = start.isPending || stop.isPending

  if (feed.isPending) return <p role="status">{t("calendar.feed.loading")}</p>
  if (feed.isError) {
    return (
      <>
        <p role="alert" className="text-red-800">
          {t("calendar.feed.loadFailed")}
        </p>
        <button type="button" className={buttonClass} onClick={() => void feed.refetch()}>
          {t("common.retry")}
        </button>
      </>
    )
  }

  const url = feed.data && feedUrl(feed.data)
  // `webcal:` opens the calendar app the system has (Apple, Outlook) to subscribe.
  const webcal = url?.replace(/^https?:/, "webcal:")

  const copy = async () => {
    if (!url) return
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
    } catch {
      // No clipboard here (an old browser, a refused permission): the link is
      // on screen to copy by hand.
      setCopied(false)
    }
  }

  return (
    <>
      <p>{t("calendar.feed.explain")}</p>
      <p className="text-xs text-stone-500">{t("calendar.feed.delay")}</p>
      {url && webcal && (
        <div className="flex flex-col gap-2">
          <div className="flex flex-col gap-1">
            <label htmlFor={linkId} className="font-medium text-stone-900">
              {t("calendar.feed.link")}
            </label>
            <input
              id={linkId}
              type="text"
              readOnly
              className={inputClass}
              value={url}
              onFocus={(event) => event.target.select()}
            />
            <div className="flex items-center gap-2">
              <button type="button" className={buttonClass} onClick={() => void copy()}>
                {t("calendar.feed.copy")}
              </button>
              {copied && <span role="status">{t("calendar.feed.copied")}</span>}
            </div>
          </div>
          <a className={buttonClass} href={webcal}>
            {t("calendar.feed.openApp")}
          </a>
          <a
            className={buttonClass}
            href={`https://calendar.google.com/calendar/r?cid=${encodeURIComponent(webcal)}`}
            target="_blank"
            rel="noreferrer"
          >
            {t("calendar.feed.google")}
          </a>
          <p className="text-xs text-stone-500">{t("calendar.feed.secret")}</p>
        </div>
      )}
      {(start.isError || stop.isError) && (
        <p role="alert" className="text-red-800">
          {t("calendar.feed.failed")}
        </p>
      )}
      {url ? (
        <>
          <button
            type="button"
            className={dangerButtonClass}
            disabled={busy}
            onClick={() => stop.mutate()}
          >
            {t("calendar.feed.stop")}
          </button>
          <p className="text-xs text-stone-500">{t("calendar.feed.stopHint")}</p>
        </>
      ) : (
        <button
          type="button"
          className={primaryButtonClass}
          disabled={busy}
          onClick={() => start.mutate()}
        >
          {t("calendar.feed.create")}
        </button>
      )}
    </>
  )
}
