/**
 * `saved`: nothing to send. `pending`: a change waits for the delay.
 * `saving`: a save is in flight. `retrying`: the last save failed, the change
 * is still held here and another try is scheduled. `error`: the tries gave up,
 * so the change waits to be asked for again. `conflict`: the document was
 * saved elsewhere, so saving has stopped until it is loaded again.
 */
export type SaveStatus = "saved" | "pending" | "saving" | "retrying" | "error" | "conflict"

export interface AutosaveOptions<T> {
  /** The version of the document as loaded. */
  version: number
  /** Saves `value` on top of `version` and resolves with the new version. */
  save(value: T, version: number): Promise<number>
  /** Whether a failed save means the document changed elsewhere. */
  isConflict(error: unknown): boolean
  onStatus(status: SaveStatus): void
  /** How long changes must stop before a save starts. */
  delayMs?: number
  /** How long to wait before each try after a failed save. The last wait repeats. */
  retryDelaysMs?: readonly number[]
  /** How many tries in a row may fail before trying stops until `retry`. */
  maxRetries?: number
}

export interface Autosave<T> {
  /** Tells the autosave the document now holds `value`. */
  changed(value: T): void
  /** Saves what is waiting now. Resolves when nothing is left to send or a save failed. */
  flush(): Promise<void>
  /**
   * Sends the held change at once after a failed save, and starts the waits
   * between tries from the beginning. For the button, and for any sign that
   * the network may be back.
   */
  retry(): void
  /** Drops any scheduled save. A save already in flight still finishes. */
  stop(): void
  status(): SaveStatus
}

const DEFAULT_DELAY_MS = 1500
/**
 * Short at first, for a blip, then once a minute for a phone out of signal.
 * The network coming back is caught at once anyway, by `retry`.
 */
const DEFAULT_RETRY_DELAYS_MS = [2000, 4000, 8000, 16000, 32000, 60000] as const
/** Ten tries cover the first five minutes or so. A save still failing then will not pass by waiting. */
const DEFAULT_MAX_RETRIES = 10

/**
 * Saves a document shortly after it stops changing. One save runs at a time,
 * and each builds on the version the previous one returned, so the server can
 * refuse a save from a tab that fell behind.
 */
export function createAutosave<T>(options: AutosaveOptions<T>): Autosave<T> {
  const delayMs = options.delayMs ?? DEFAULT_DELAY_MS
  const retryDelays = options.retryDelaysMs ?? DEFAULT_RETRY_DELAYS_MS
  const maxRetries = options.maxRetries ?? DEFAULT_MAX_RETRIES
  /** Saves failed in a row, not counting a conflict. */
  let failures = 0
  let version = options.version
  let status: SaveStatus = "saved"
  let waiting: { value: T } | null = null
  let timer: ReturnType<typeof setTimeout> | undefined
  let inFlight: Promise<void> | null = null
  let stopped = false

  function setStatus(next: SaveStatus): void {
    if (next === status) return
    status = next
    options.onStatus(next)
  }

  function clearTimer(): void {
    clearTimeout(timer)
    timer = undefined
  }

  function run(): Promise<void> {
    clearTimer()
    if (inFlight) return inFlight
    if (!waiting || status === "conflict") return Promise.resolve()
    const { value } = waiting
    waiting = null
    // A try after a failure keeps saying so until it is saved or gives up, so
    // the indicator does not swap back and forth on every try.
    if (status !== "retrying") setStatus("saving")
    inFlight = options
      .save(value, version)
      .then(
        (nextVersion) => {
          version = nextVersion
          failures = 0
          return true
        },
        (error: unknown) => {
          // Hold on to the change, unless a newer one arrived meanwhile.
          waiting ??= { value }
          if (options.isConflict(error)) {
            setStatus("conflict")
            return false
          }
          failures += 1
          if (failures > maxRetries || stopped) {
            setStatus("error")
            return false
          }
          setStatus("retrying")
          const wait = retryDelays[Math.min(failures, retryDelays.length) - 1] ?? delayMs
          timer = setTimeout(() => void run(), wait)
          return false
        }
      )
      .then((saved) => {
        inFlight = null
        if (!saved) return
        if (waiting && !stopped) return run()
        setStatus("saved")
      })
    return inFlight
  }

  return {
    changed(value) {
      if (status === "conflict" || stopped) return
      waiting = { value }
      // A try is already scheduled, and it sends the newest value.
      if (inFlight || status === "retrying") return
      setStatus("pending")
      clearTimer()
      timer = setTimeout(() => void run(), delayMs)
    },
    flush: run,
    retry() {
      if (status !== "error" && status !== "retrying") return
      failures = 0
      void run()
    },
    stop() {
      stopped = true
      clearTimer()
    },
    status: () => status,
  }
}
