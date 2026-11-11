import { useState } from "react"
import { inputClass } from "./ui"

interface CommitFieldProps {
  label: string
  /** The stored value. The field shows it again whenever it changes. */
  value: string
  /** Stores what was typed. Returning false puts the stored value back in the field. */
  onCommit(value: string): boolean
  className?: string
  maxLength?: number
  inputMode?: "text" | "decimal"
}

/**
 * A text field that stores its value when the user is done with it (Enter, or
 * leaving the field) rather than on every key, so one edit is one undo step.
 * Escape drops what was typed.
 */
export function CommitField({
  label,
  value,
  onCommit,
  className = "",
  maxLength,
  inputMode = "text",
}: CommitFieldProps) {
  const [draft, setDraft] = useState(value)
  // Follow the stored value when it changes from outside: an undo, another selection.
  const [shown, setShown] = useState(value)
  if (shown !== value) {
    setShown(value)
    setDraft(value)
  }

  const commit = () => {
    if (draft !== value && !onCommit(draft)) setDraft(value)
  }

  return (
    <label className="flex flex-col text-xs text-stone-600">
      {label}
      <input
        type="text"
        inputMode={inputMode}
        className={`${inputClass} ${className}`}
        maxLength={maxLength}
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === "Enter") commit()
          else if (event.key === "Escape") setDraft(value)
        }}
      />
    </label>
  )
}
