/** Shared Tailwind class lists, so buttons look and focus the same everywhere. */

const focusRing =
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700"

export const buttonClass = `inline-flex items-center justify-center gap-2 rounded-md border border-stone-300 bg-white px-3 py-1.5 text-sm font-medium text-stone-800 hover:bg-stone-100 disabled:cursor-not-allowed disabled:opacity-40 ${focusRing}`

export const primaryButtonClass = `inline-flex items-center justify-center gap-2 rounded-md bg-emerald-700 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-60 ${focusRing}`

export const dangerButtonClass = `inline-flex items-center justify-center gap-2 rounded-md border border-red-300 bg-white px-3 py-1.5 text-sm font-medium text-red-700 hover:bg-red-50 ${focusRing}`

/** A button that stays pressed while its tool or item is active. */
export const toggleButtonClass = `flex w-full items-center gap-2 rounded-md border border-transparent px-3 py-1.5 text-left text-sm text-stone-800 hover:bg-stone-200 aria-pressed:border-emerald-700 aria-pressed:bg-emerald-50 aria-pressed:font-semibold aria-pressed:text-emerald-900 ${focusRing}`
