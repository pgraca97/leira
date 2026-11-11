/**
 * `saved`: nothing to send. `pending`: a change waits for the delay.
 * `saving`: a save is in flight. `error`: the last save failed and the change
 * is still held here. `conflict`: the document was saved elsewhere, so saving
 * has stopped until it is loaded again.
 */
export type SaveStatus = "saved" | "pending" | "saving" | "error" | "conflict"

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
}

export interface Autosave<T> {
  /** Tells the autosave the document now holds `value`. */
  changed(value: T): void
  /** Saves what is waiting now. Resolves when nothing is left to send or a save failed. */
  flush(): Promise<void>
  /** Sends the held change again after an error. */
  retry(): void
  /** Drops any scheduled save. A save already in flight still finishes. */
  stop(): void
  status(): SaveStatus
}

const DEFAULT_DELAY_MS = 1500

/**
 * Saves a document shortly after it stops changing. One save runs at a time,
 * and each builds on the version the previous one returned, so the server can
 * refuse a save from a tab that fell behind.
 */
export function createAutosave<T>(options: AutosaveOptions<T>): Autosave<T> {
  const delayMs = options.delayMs ?? DEFAULT_DELAY_MS
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
    setStatus("saving")
    inFlight = options
      .save(value, version)
      .then(
        (nextVersion) => {
          version = nextVersion
          return true
        },
        (error: unknown) => {
          // Hold on to the change, unless a newer one arrived meanwhile.
          waiting ??= { value }
          setStatus(options.isConflict(error) ? "conflict" : "error")
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
      if (inFlight) return
      setStatus("pending")
      clearTimer()
      timer = setTimeout(() => void run(), delayMs)
    },
    flush: run,
    retry() {
      if (status === "error") void run()
    },
    stop() {
      stopped = true
      clearTimer()
    },
    status: () => status,
  }
}
