import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useCallback, useId, useRef, useState } from "react"
import { useTranslation } from "react-i18next"
import { buttonClass, dangerButtonClass, inputClass, primaryButtonClass } from "../components/ui"
import { useDismiss } from "../components/useDismiss"
import { useBackend } from "../lib/backend"
import type { GardenShare } from "../lib/gardens"

interface ShareControlsProps {
  gardenId: string
  /** Whether the garden says where it is: only then is there a location to show or hide. */
  hasLocation: boolean
}

/**
 * The header button that opens the garden's sharing panel: make a read-only
 * link, copy it, choose whether it says where the garden is, or turn it off.
 */
export function ShareControls({ gardenId, hasLocation }: ShareControlsProps) {
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
        {t("share.button")}
      </button>
      {open && (
        <div
          role="dialog"
          aria-label={t("share.panel")}
          className="absolute top-full right-0 z-20 mt-2 flex w-80 max-w-[calc(100vw-2rem)] flex-col gap-3 rounded-md border border-stone-200 bg-white p-4 text-sm text-stone-700 shadow-lg"
        >
          <SharePanel gardenId={gardenId} hasLocation={hasLocation} />
        </div>
      )}
    </div>
  )
}

function SharePanel({ gardenId, hasLocation }: ShareControlsProps) {
  const { t } = useTranslation()
  const backend = useBackend()
  const queryClient = useQueryClient()
  const linkId = useId()
  const shareKey = ["garden-share", gardenId]
  // The choice made before there is a link to apply it to.
  const [wantsLocation, setWantsLocation] = useState(false)
  const [copied, setCopied] = useState(false)

  const share = useQuery({ queryKey: shareKey, queryFn: () => backend.gardens.getShare(gardenId) })
  const keep = (next: GardenShare | null) => queryClient.setQueryData(shareKey, next)

  const change = useMutation({
    mutationFn: (showLocation: boolean) => backend.gardens.share(gardenId, showLocation),
    onSuccess: keep,
  })
  const stop = useMutation({
    mutationFn: () => backend.gardens.unshare(gardenId),
    onSuccess: () => {
      keep(null)
      setWantsLocation(false)
      setCopied(false)
    },
  })
  const busy = change.isPending || stop.isPending

  if (share.isPending) return <p role="status">{t("share.loading")}</p>
  if (share.isError) {
    return (
      <>
        <p role="alert" className="text-red-800">
          {t("share.loadFailed")}
        </p>
        <button type="button" className={buttonClass} onClick={() => void share.refetch()}>
          {t("common.retry")}
        </button>
      </>
    )
  }

  const current = share.data
  const url = current && `${window.location.origin}/shared/${current.token}`

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
      <p>{t("share.explain")}</p>
      {url && (
        <div className="flex flex-col gap-1">
          <label htmlFor={linkId} className="font-medium text-stone-900">
            {t("share.link")}
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
              {t("share.copy")}
            </button>
            {copied && <span role="status">{t("share.copied")}</span>}
          </div>
        </div>
      )}
      {hasLocation && (
        <label className="flex items-start gap-2">
          <input
            type="checkbox"
            className="mt-0.5 accent-emerald-700"
            checked={current ? current.showLocation : wantsLocation}
            disabled={busy}
            onChange={(event) =>
              current ? change.mutate(event.target.checked) : setWantsLocation(event.target.checked)
            }
          />
          {t("share.showLocation")}
        </label>
      )}
      {(change.isError || stop.isError) && (
        <p role="alert" className="text-red-800">
          {t("share.failed")}
        </p>
      )}
      {current ? (
        <>
          <button
            type="button"
            className={dangerButtonClass}
            disabled={busy}
            onClick={() => stop.mutate()}
          >
            {t("share.stop")}
          </button>
          <p className="text-xs text-stone-500">{t("share.stopHint")}</p>
        </>
      ) : (
        <button
          type="button"
          className={primaryButtonClass}
          disabled={busy}
          onClick={() => change.mutate(wantsLocation)}
        >
          {t("share.create")}
        </button>
      )}
    </>
  )
}
