import { cloudflare } from "@cloudflare/vite-plugin"
import tailwindcss from "@tailwindcss/vite"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"

export default defineConfig({
  plugins: [react(), tailwindcss(), cloudflare()],
  environments: {
    client: {
      // The app shell is app.html, not index.html: `/` is the landing page.
      // Only the browser build has HTML, so the Worker's build is left alone.
      build: { rolldownOptions: { input: { app: "app.html" } } },
    },
  },
  server: {
    // Fixed: Supabase redirect URLs and the e2e tests point at this port.
    port: 5173,
    strictPort: true,
  },
})
