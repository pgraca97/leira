import { cloudflare } from "@cloudflare/vite-plugin"
import tailwindcss from "@tailwindcss/vite"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"

export default defineConfig({
  plugins: [react(), tailwindcss(), cloudflare()],
  server: {
    // Fixed: Supabase redirect URLs and the e2e tests point at this port.
    port: 5173,
    strictPort: true,
  },
})
