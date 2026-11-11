import { defineConfig } from "vitest/config"

// Tests that talk to the local Supabase stack. Start it with `pnpm db:start`.
export default defineConfig({
  test: {
    environment: "node",
    include: ["integration/**/*.test.ts"],
    testTimeout: 20_000,
    hookTimeout: 20_000,
  },
})
