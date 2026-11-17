// @vitest-environment jsdom
import "../test/setup"
import { afterEach, describe, expect, it, vi } from "vitest"
import { captchaSolver, type Turnstile, type TurnstileOptions } from "./captcha"

/**
 * A stand-in for Cloudflare's script. `execute` answers with whatever the test
 * put in `answers`, in order: a token, or an error code.
 */
function fakeTurnstile(answers: ({ token: string } | { error: string } | "silent")[]) {
  let options: TurnstileOptions | null = null
  const turnstile = {
    render: vi.fn((_container: HTMLElement, given: TurnstileOptions) => {
      options = given
      return "widget-1"
    }),
    reset: vi.fn(),
    execute: vi.fn(() => {
      const answer = answers.shift()
      queueMicrotask(() => {
        if (!answer || answer === "silent") return
        if ("token" in answer) options?.callback(answer.token)
        else options?.["error-callback"](answer.error)
      })
    }),
  } satisfies Turnstile
  return { turnstile, options: () => options }
}

afterEach(() => {
  vi.useRealTimers()
  document.body.innerHTML = ""
})

describe("the captcha", () => {
  it("loads Turnstile once and hands out a fresh token every time", async () => {
    const { turnstile, options } = fakeTurnstile([{ token: "first" }, { token: "second" }])
    const load = vi.fn(async () => turnstile)
    const solve = captchaSolver("site-key", { load })

    expect(await solve()).toBe("first")
    expect(await solve()).toBe("second")
    expect(load).toHaveBeenCalledTimes(1)
    expect(turnstile.render).toHaveBeenCalledTimes(1)
    expect(options()).toMatchObject({ sitekey: "site-key", execution: "execute" })
  })

  // A token is good for one sign-in only, so the widget starts over before the next.
  it("resets the widget before asking again", async () => {
    const { turnstile } = fakeTurnstile([{ token: "first" }, { token: "second" }])
    const solve = captchaSolver("site-key", { load: async () => turnstile })
    await solve()
    expect(turnstile.reset).not.toHaveBeenCalled()
    await solve()
    expect(turnstile.reset).toHaveBeenCalledWith("widget-1")
  })

  it("asks one question at a time when two callers want a token together", async () => {
    const { turnstile } = fakeTurnstile([{ token: "first" }, { token: "second" }])
    const solve = captchaSolver("site-key", { load: async () => turnstile })
    expect(await Promise.all([solve(), solve()])).toEqual(["first", "second"])
  })

  it("fails when Turnstile turns the visitor away, and can be tried again", async () => {
    const { turnstile } = fakeTurnstile([{ error: "300030" }, { token: "later" }])
    const solve = captchaSolver("site-key", { load: async () => turnstile })
    await expect(solve()).rejects.toThrow("300030")
    expect(await solve()).toBe("later")
  })

  it("fails when Turnstile never answers", async () => {
    vi.useFakeTimers()
    const { turnstile } = fakeTurnstile(["silent"])
    const solve = captchaSolver("site-key", { load: async () => turnstile, timeoutMs: 1000 })
    const solving = solve()
    const failed = expect(solving).rejects.toThrow(/no answer/)
    await vi.advanceTimersByTimeAsync(1000)
    await failed
  })

  it("loads the script again after it failed to load", async () => {
    const { turnstile } = fakeTurnstile([{ token: "second try" }])
    const load = vi
      .fn<() => Promise<Turnstile>>()
      .mockRejectedValueOnce(new Error("blocked"))
      .mockResolvedValueOnce(turnstile)
    const solve = captchaSolver("site-key", { load })
    await expect(solve()).rejects.toThrow("blocked")
    expect(await solve()).toBe("second try")
  })

  it("keeps its widget on the page, where a challenge can show if one is needed", async () => {
    const { turnstile } = fakeTurnstile([{ token: "first" }])
    await captchaSolver("site-key", { load: async () => turnstile })()
    const container = turnstile.render.mock.calls[0]?.[0]
    expect(container?.isConnected).toBe(true)
  })
})
