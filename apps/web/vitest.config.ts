import { defineConfig } from "vitest/config"

// Kept apart from vite.config.ts: unit tests run in plain Node, without the
// Cloudflare plugin and its Workers runtime. Tests that need a DOM ask for it
// with a `@vitest-environment jsdom` comment at the top of the file.
export default defineConfig({
  test: {
    environment: "node",
    include: ["worker/**/*.test.ts", "src/**/*.test.{ts,tsx}"],
  },
})
