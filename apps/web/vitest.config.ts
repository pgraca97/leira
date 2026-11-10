import { defineConfig } from "vitest/config"

// Kept apart from vite.config.ts: unit tests run in plain Node, without the
// Cloudflare plugin and its Workers runtime.
export default defineConfig({
  test: {
    environment: "node",
    include: ["worker/**/*.test.ts"],
  },
})
