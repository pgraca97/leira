// @vitest-environment jsdom
import { describe, expect, it } from "vitest"
import wrangler from "../wrangler.jsonc?raw"
import { createAppRouter } from "./router"

/** The paths the Worker answers before the static files, read from wrangler.jsonc. */
function workerFirstPatterns(): string[] {
  // JSON with comments: drop them before parsing.
  const json = wrangler.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "")
  return JSON.parse(json).assets.run_worker_first
}

/** Whether a `run_worker_first` pattern takes a path: the same path, or anything under `/*`. */
function covers(pattern: string, path: string): boolean {
  return pattern.endsWith("/*") ? path.startsWith(pattern.slice(0, -1)) : pattern === path
}

describe("the app's pages", () => {
  // Every other path is a static file or the 404 page, so a page missing from
  // the list would load nothing on a reload or from a link.
  it("all reach the Worker, which serves the app shell for them", () => {
    const pages = Object.keys(createAppRouter().routesByPath)
      // A parameter stands for any one segment.
      .map((path) => path.replace(/\$[^/]+/g, "x"))
    expect(pages.length).toBeGreaterThan(0)
    const patterns = workerFirstPatterns()
    const missing = pages.filter((path) => !patterns.some((pattern) => covers(pattern, path)))
    expect(missing).toEqual([])
  })

  it("leave the landing page to the static files", () => {
    expect(workerFirstPatterns().some((pattern) => covers(pattern, "/"))).toBe(false)
  })
})
