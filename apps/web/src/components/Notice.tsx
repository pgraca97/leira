import type { ReactNode } from "react"
import { buttonClass } from "./ui"

interface NoticeProps {
  /** `error` interrupts screen readers; `status` waits its turn; `info` is plain text. */
  kind: "status" | "error" | "info"
  message: string
  action?: { label: string; onClick(): void }
  children?: ReactNode
}

/** A message that takes the place of a page's content: loading, empty, or failed. */
export function Notice({ kind, message, action, children }: NoticeProps) {
  return (
    <div className="grid flex-1 place-items-center p-6">
      <div className="flex max-w-md flex-col items-center gap-3 text-center">
        <p
          role={kind === "error" ? "alert" : kind === "status" ? "status" : undefined}
          className={kind === "error" ? "text-red-800" : "text-stone-600"}
        >
          {message}
        </p>
        {action && (
          <button type="button" className={buttonClass} onClick={action.onClick}>
            {action.label}
          </button>
        )}
        {children}
      </div>
    </div>
  )
}
