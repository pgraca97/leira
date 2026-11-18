import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { createAutosave, type SaveStatus } from "./autosave"

class Conflict extends Error {}

/** A save whose outcome each test decides, call by call. */
function setup(version = 1) {
  const calls: { value: string; version: number }[] = []
  const pending: { resolve(version: number): void; reject(error: unknown): void }[] = []
  const statuses: SaveStatus[] = []
  const autosave = createAutosave<string>({
    version,
    delayMs: 1000,
    save: (value, sentVersion) => {
      calls.push({ value, version: sentVersion })
      return new Promise<number>((resolve, reject) => pending.push({ resolve, reject }))
    },
    isConflict: (error) => error instanceof Conflict,
    onStatus: (status) => statuses.push(status),
  })
  /** Settles the oldest unfinished save and lets its handlers run. */
  const settle = async (outcome: number | Error) => {
    const next = pending.shift()
    if (!next) throw new Error("No save in flight")
    if (typeof outcome === "number") next.resolve(outcome)
    else next.reject(outcome)
    await vi.advanceTimersByTimeAsync(0)
  }
  return { autosave, calls, statuses, settle }
}

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

describe("createAutosave", () => {
  it("starts out saved", () => {
    expect(setup().autosave.status()).toBe("saved")
  })

  it("saves the latest value once changes stop for the delay", async () => {
    const { autosave, calls, settle } = setup(4)
    autosave.changed("a")
    await vi.advanceTimersByTimeAsync(900)
    autosave.changed("b")
    await vi.advanceTimersByTimeAsync(900)
    expect(calls).toEqual([])
    expect(autosave.status()).toBe("pending")

    await vi.advanceTimersByTimeAsync(100)
    expect(calls).toEqual([{ value: "b", version: 4 }])
    expect(autosave.status()).toBe("saving")

    await settle(5)
    expect(autosave.status()).toBe("saved")
  })

  it("never runs two saves at once, and builds the next on the version just saved", async () => {
    const { autosave, calls, settle } = setup(1)
    autosave.changed("a")
    await vi.advanceTimersByTimeAsync(1000)
    autosave.changed("b")
    await vi.advanceTimersByTimeAsync(5000)
    expect(calls).toHaveLength(1)

    await settle(2)
    expect(calls).toEqual([
      { value: "a", version: 1 },
      { value: "b", version: 2 },
    ])
    expect(autosave.status()).toBe("saving")
    await settle(3)
    expect(autosave.status()).toBe("saved")
  })

  it("keeps the value after a failed save and sends it again on retry", async () => {
    const { autosave, calls, settle } = setup(1)
    autosave.changed("a")
    await vi.advanceTimersByTimeAsync(1000)
    await settle(new Error("offline"))
    expect(autosave.status()).toBe("retrying")

    autosave.retry()
    expect(calls).toEqual([
      { value: "a", version: 1 },
      { value: "a", version: 1 },
    ])
    await settle(2)
    expect(autosave.status()).toBe("saved")
  })

  it("sends the latest change when it tries again after a failed save", async () => {
    const { autosave, calls, settle } = setup(1)
    autosave.changed("a")
    await vi.advanceTimersByTimeAsync(1000)
    await settle(new Error("offline"))

    autosave.changed("b")
    // A change does not restart the wait, or steady editing would never try again.
    await vi.advanceTimersByTimeAsync(1999)
    expect(calls).toHaveLength(1)
    await vi.advanceTimersByTimeAsync(1)
    expect(calls.at(-1)).toEqual({ value: "b", version: 1 })
  })

  it("stops saving for good after a conflict", async () => {
    const { autosave, calls, settle } = setup(1)
    autosave.changed("a")
    await vi.advanceTimersByTimeAsync(1000)
    await settle(new Conflict())
    expect(autosave.status()).toBe("conflict")

    autosave.changed("b")
    autosave.retry()
    await vi.advanceTimersByTimeAsync(5000)
    expect(calls).toHaveLength(1)
    expect(autosave.status()).toBe("conflict")
  })

  it("saves at once on flush, without waiting for the delay", async () => {
    const { autosave, calls, settle } = setup(1)
    autosave.changed("a")
    const flushed = autosave.flush()
    expect(calls).toEqual([{ value: "a", version: 1 }])
    await settle(2)
    await flushed
    expect(autosave.status()).toBe("saved")
  })

  it("has nothing to do on flush when nothing changed", async () => {
    const { autosave, calls } = setup(1)
    await autosave.flush()
    expect(calls).toEqual([])
  })

  it("drops a scheduled save when stopped", async () => {
    const { autosave, calls } = setup(1)
    autosave.changed("a")
    autosave.stop()
    await vi.advanceTimersByTimeAsync(5000)
    expect(calls).toEqual([])
  })

  it("reports each status change once", async () => {
    const { autosave, statuses, settle } = setup(1)
    autosave.changed("a")
    autosave.changed("b")
    await vi.advanceTimersByTimeAsync(1000)
    await settle(2)
    expect(statuses).toEqual(["pending", "saving", "saved"])
  })

  describe("after a failed save", () => {
    /** Starts a save of "a" and lets it fail. */
    async function failOnce() {
      const harness = setup(1)
      harness.autosave.changed("a")
      await vi.advanceTimersByTimeAsync(1000)
      await harness.settle(new Error("offline"))
      return harness
    }

    it("tries again by itself, waiting longer each time, up to a minute", async () => {
      const { calls, settle } = await failOnce()
      const waits = [2000, 4000, 8000, 16000, 32000, 60000, 60000]
      for (const wait of waits) {
        const before = calls.length
        await vi.advanceTimersByTimeAsync(wait - 1)
        expect(calls).toHaveLength(before)
        await vi.advanceTimersByTimeAsync(1)
        expect(calls).toHaveLength(before + 1)
        await settle(new Error("offline"))
      }
    })

    it("keeps saying it is trying again while a try is on its way", async () => {
      const { autosave, statuses, settle } = await failOnce()
      await vi.advanceTimersByTimeAsync(2000)
      // Flipping to "saving" and back on every try would make the header jump.
      expect(autosave.status()).toBe("retrying")
      await settle(2)
      expect(statuses).toEqual(["pending", "saving", "retrying", "saved"])
    })

    it("is saved once a try goes through, and waits from the start after the next failure", async () => {
      const { autosave, calls, settle } = await failOnce()
      await vi.advanceTimersByTimeAsync(2000)
      await settle(new Error("offline"))
      await vi.advanceTimersByTimeAsync(4000)
      await settle(2)
      expect(autosave.status()).toBe("saved")

      autosave.changed("b")
      await vi.advanceTimersByTimeAsync(1000)
      await settle(new Error("offline"))
      await vi.advanceTimersByTimeAsync(2000)
      expect(calls.at(-1)).toEqual({ value: "b", version: 2 })
    })

    it("gives up after ten tries in a row, until asked again", async () => {
      const { autosave, calls, settle } = await failOnce()
      for (let tries = 0; tries < 10; tries++) {
        await vi.advanceTimersByTimeAsync(60000)
        await settle(new Error("too large"))
      }
      expect(calls).toHaveLength(11)
      expect(autosave.status()).toBe("error")
      await vi.advanceTimersByTimeAsync(10 * 60000)
      expect(calls).toHaveLength(11)

      // Asked again (the button, the network back, the page shown), it saves at once.
      autosave.retry()
      expect(calls).toHaveLength(12)
      await settle(new Error("offline"))
      expect(autosave.status()).toBe("retrying")
      await vi.advanceTimersByTimeAsync(2000)
      expect(calls).toHaveLength(13)
    })

    it("saves at once when asked, without waiting for the next try", async () => {
      const { autosave, calls, settle } = await failOnce()
      autosave.retry()
      expect(calls).toHaveLength(2)
      await settle(2)
      expect(autosave.status()).toBe("saved")
      await vi.advanceTimersByTimeAsync(60000)
      expect(calls).toHaveLength(2)
    })

    it("does not try again when stopped", async () => {
      const { autosave, calls } = await failOnce()
      autosave.stop()
      await vi.advanceTimersByTimeAsync(60000)
      expect(calls).toHaveLength(1)
    })

    it("does nothing on retry while everything is saved", async () => {
      const { autosave, calls } = setup(1)
      autosave.retry()
      expect(calls).toEqual([])
      expect(autosave.status()).toBe("saved")
    })
  })

  it("never tries again by itself after a conflict", async () => {
    const { autosave, calls, settle } = setup(1)
    autosave.changed("a")
    await vi.advanceTimersByTimeAsync(1000)
    await settle(new Conflict())
    await vi.advanceTimersByTimeAsync(10 * 60000)
    expect(calls).toHaveLength(1)
    expect(autosave.status()).toBe("conflict")
  })
})
