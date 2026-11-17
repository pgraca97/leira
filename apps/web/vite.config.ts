import { cloudflare } from "@cloudflare/vite-plugin"
import tailwindcss from "@tailwindcss/vite"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"
import { SITE_SCRIPT, site } from "./vite-plugin-site"

export default defineConfig({
  // The static pages come first, so in development they answer before the Worker.
  plugins: [site(), react(), tailwindcss(), cloudflare()],
  environments: {
    client: {
      // The app shell is app.html, not index.html: `/` is the landing page.
      // The static pages' own script is built beside it. Only the browser
      // build has these, so the Worker's build is left alone.
      build: { rolldownOptions: { input: { app: "app.html", site: SITE_SCRIPT } } },
    },
  },
  server: {
    // Fixed: Supabase redirect URLs and the e2e tests point at this port.
    port: 5173,
    strictPort: true,
  },
})
