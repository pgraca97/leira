import { mkdir, writeFile } from "node:fs/promises"
import path from "node:path"
import { type Plugin, runnerImport } from "vite"

/** The module that writes the static pages, and the script those pages load. */
const RENDERER = "src/site/render.tsx"
export const SITE_SCRIPT = "src/site/client.ts"

/**
 * The renderer's shape, written out here rather than imported: its JSX
 * belongs to the app's TypeScript settings, not to this config's.
 */
interface SiteRenderer {
  renderSite(assets: { css: string[]; script: string }): { path: string; content: string }[]
}

/** The static pages that `pnpm dev` answers, by address. The rest only exist once built. */
const DEV_PAGES: Record<string, string> = { "/": "index.html", "/en/": "en/index.html" }

/**
 * Writes the landing page and the 404 pages as plain HTML.
 *
 * When building, they are rendered once the browser's files are written, so
 * they can name the hashed CSS and script, and they go next to those files.
 * In development they are rendered on each request instead, so an edit shows
 * on the next reload.
 */
export function site(): Plugin {
  let root = process.cwd()

  return {
    name: "leira-site",
    configResolved(config) {
      root = config.root
    },

    configureServer(server) {
      // Added straight away, so it answers before the Cloudflare plugin, which
      // would hand `/` to the Worker's static files.
      server.middlewares.use(async (request, response, next) => {
        const page = request.url && DEV_PAGES[request.url.split("?")[0] ?? ""]
        if (!page || (request.method !== "GET" && request.method !== "HEAD")) return next()
        try {
          const { module } = await runnerImport<SiteRenderer>(path.join(root, RENDERER), {
            root,
            configFile: false,
            logLevel: "error",
          })
          const file = module
            .renderSite({ css: ["/src/index.css"], script: `/${SITE_SCRIPT}` })
            .find((candidate) => candidate.path === page)
          if (!file) return next()
          response.setHeader("Content-Type", "text/html; charset=utf-8")
          response.end(await server.transformIndexHtml(request.url ?? "/", file.content))
        } catch (error) {
          next(error)
        }
      })
    },

    async writeBundle(options, bundle) {
      // The Worker is built too, and has no pages.
      if (this.environment.name !== "client" || !options.dir) return
      const files = Object.values(bundle)
      const css = files
        .filter((file) => file.type === "asset" && file.fileName.endsWith(".css"))
        .map((file) => `/${file.fileName}`)
      const script = files.find(
        (file) =>
          file.type === "chunk" && file.isEntry && file.facadeModuleId?.endsWith(SITE_SCRIPT)
      )
      if (!script) this.error(`The build has no chunk for ${SITE_SCRIPT}`)

      const { module } = await runnerImport<SiteRenderer>(path.join(root, RENDERER), {
        root,
        configFile: false,
        logLevel: "error",
      })
      for (const file of module.renderSite({ css, script: `/${script.fileName}` })) {
        const target = path.join(options.dir, file.path)
        await mkdir(path.dirname(target), { recursive: true })
        await writeFile(target, file.content)
      }
    },
  }
}
