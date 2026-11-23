import type { ReactNode } from "react"

interface HeaderBarProps {
  /** Where the name leads: the landing page in the reader's language. */
  home: string
  /** What sits on the right: the page's actions, then the language. */
  children?: ReactNode
}

/**
 * The bar across the top of every page, the app's and the static ones alike.
 * It needs nothing from the app, so the static pages can draw it at build time.
 */
export function HeaderBar({ home, children }: HeaderBarProps) {
  return (
    <header className="flex flex-wrap print:hidden items-center gap-x-4 gap-y-2 border-b border-stone-200 bg-white px-4 py-2">
      <a href={home} className="flex items-center gap-2 font-semibold text-emerald-900">
        <img src="/favicon.svg" alt="" className="size-5" />
        Leira
      </a>
      <div className="flex flex-1 flex-wrap items-center justify-end gap-x-4 gap-y-2">
        {children}
      </div>
    </header>
  )
}
