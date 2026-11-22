import { OG_LOCALE, PREVIEW_IMAGE } from "../src/site/preview"
import { fill, STRINGS } from "./strings"

/** What a share link's preview names. Never the location: a preview travels further than the link. */
export interface SharePreview {
  /** The garden's name, as its owner typed it. */
  name: string
  /** The address the link was opened at. */
  url: string
}

/**
 * The app shell with a head that names the shared garden, for the link
 * previews of chat apps: they read the page's HTML and run none of its
 * script. Always in Portuguese, since the previews do not say which language
 * the person who shares speaks, and nearly everyone sharing is in Portugal.
 * The shell is a built file, so plain text replacement is enough.
 */
export function sharePreviewHead(html: string, preview: SharePreview): string {
  if (!html.includes("</head>")) return html

  const strings = STRINGS.pt.shared
  const title = fill(strings.previewTitle, { name: preview.name })
  const description = strings.previewDescription
  const link = new URL(preview.url)
  // The view a visitor had open is theirs, not part of what was shared.
  const url = `${link.origin}${link.pathname}`
  const image = new URL(PREVIEW_IMAGE.path, link.origin).href

  const tags = [
    `<title>${escapeHtml(title)}</title>`,
    meta("name", "description", description),
    meta("property", "og:type", "website"),
    meta("property", "og:site_name", "Leira"),
    meta("property", "og:title", title),
    meta("property", "og:description", description),
    meta("property", "og:url", url),
    meta("property", "og:image", image),
    meta("property", "og:image:width", String(PREVIEW_IMAGE.width)),
    meta("property", "og:image:height", String(PREVIEW_IMAGE.height)),
    meta("property", "og:locale", OG_LOCALE.pt),
    meta("name", "twitter:card", "summary_large_image"),
  ]

  return (
    html
      .replace(/<title>[\s\S]*?<\/title>\s*/, "")
      .replace(/<meta\s+name="description"[^>]*>\s*/, "")
      // A function, so a `$&` in the name is not read as a replacement pattern.
      .replace("</head>", () => `${tags.map((tag) => `  ${tag}\n`).join("")}  </head>`)
  )
}

function meta(attribute: "name" | "property", key: string, content: string): string {
  return `<meta ${attribute}="${key}" content="${escapeHtml(content)}" />`
}

/** Text that reads as itself in HTML, in an element or in a quoted attribute. */
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
}
