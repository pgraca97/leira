/**
 * Settings the Worker runs fine without. They stay out of `secrets.required`
 * in wrangler.jsonc, so `wrangler types` does not list them and they are typed
 * here instead. Every file is a module in this project, hence `declare global`.
 */
declare global {
  interface Env {
    /**
     * The Cloudflare Web Analytics site token. It is public (the page carries
     * it), but it is set in production only, so local and test visits are
     * never counted.
     */
    WEB_ANALYTICS_TOKEN?: string
  }
}

export {}
