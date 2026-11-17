/**
 * Asks Cloudflare Turnstile whether the visitor is a person, and gives back
 * the token it hands out. The auth server checks that token before it signs
 * anyone in, so a bot running the app cannot make guests by the thousand.
 */
export type CaptchaSolver = () => Promise<string>

/** The part of Cloudflare's script this module uses. */
export interface Turnstile {
  render(container: HTMLElement, options: TurnstileOptions): string | null | undefined
  reset(widgetId: string): void
  execute(widgetId: string): void
}

export interface TurnstileOptions {
  sitekey: string
  /** Wait for `execute` instead of starting as soon as the widget is drawn. */
  execution: "execute"
  /** Show nothing unless Cloudflare wants the visitor to tick a box. */
  appearance: "interaction-only"
  /** Report a failure instead of trying again unseen: the page offers its own retry. */
  retry: "never"
  callback(token: string): void
  "error-callback"(code: string): boolean
  "timeout-callback"(): void
}

declare global {
  interface Window {
    turnstile?: Turnstile
  }
}

const SCRIPT_URL = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit"

/** Adds Cloudflare's script to the page and waits until it is ready. */
function loadScript(): Promise<Turnstile> {
  return new Promise((resolve, reject) => {
    const script = document.createElement("script")
    script.src = SCRIPT_URL
    script.async = true
    script.onload = () => {
      if (window.turnstile) resolve(window.turnstile)
      else reject(new Error("Turnstile loaded but is not there"))
    }
    script.onerror = () => {
      script.remove()
      reject(new Error("Turnstile could not be loaded"))
    }
    document.head.appendChild(script)
  })
}

interface Options {
  /** How to get Turnstile. Tests pass a stand-in. */
  load?: () => Promise<Turnstile>
  /** How long to wait for an answer, which may include a person ticking a box. */
  timeoutMs?: number
}

export function captchaSolver(siteKey: string, options: Options = {}): CaptchaSolver {
  const load = options.load ?? loadScript
  const timeoutMs = options.timeoutMs ?? 120_000

  /** Where the widget's answers go: the question being asked now, if any. */
  let answer: ((outcome: string | Error) => void) | null = null
  let widget: Promise<{ turnstile: Turnstile; id: string }> | null = null
  let used = false

  function mount() {
    widget ??= load()
      .then((turnstile) => {
        // At the foot of the page, so a challenge that needs a click is seen.
        const container = document.createElement("div")
        container.className = "fixed bottom-4 left-1/2 z-50 -translate-x-1/2"
        document.body.appendChild(container)
        const id = turnstile.render(container, {
          sitekey: siteKey,
          execution: "execute",
          appearance: "interaction-only",
          retry: "never",
          callback: (token) => answer?.(token),
          "error-callback": (code) => {
            answer?.(new Error(`Turnstile refused: ${code}`))
            // Handled here, so Turnstile does not report it as well.
            return true
          },
          "timeout-callback": () => answer?.(new Error("Turnstile timed out")),
        })
        if (!id) throw new Error("Turnstile drew no widget")
        return { turnstile, id }
      })
      .catch((error: unknown) => {
        // Not kept, so trying again loads the script again.
        widget = null
        throw error
      })
    return widget
  }

  async function ask(): Promise<string> {
    const { turnstile, id } = await mount()
    return new Promise<string>((resolve, reject) => {
      const timer = setTimeout(
        () => answer?.(new Error("Turnstile gave no answer in time")),
        timeoutMs
      )
      answer = (outcome) => {
        clearTimeout(timer)
        answer = null
        if (outcome instanceof Error) reject(outcome)
        else resolve(outcome)
      }
      // A token is good for one sign-in, so every question after the first
      // starts the widget over.
      if (used) turnstile.reset(id)
      used = true
      turnstile.execute(id)
    })
  }

  // One widget answers one question at a time, so callers wait their turn.
  let queue: Promise<unknown> = Promise.resolve()
  return () => {
    const next = queue.then(ask, ask)
    queue = next.catch(() => undefined)
    return next
  }
}
