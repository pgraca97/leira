import type { GardenLocation } from "@leira/core"
import { createContext, useCallback, useContext, useLayoutEffect, useRef, useState } from "react"
import { useBackend } from "../lib/backend"
import { GARDEN_NAME_MAX, type Garden, GardenConflictError } from "../lib/gardens"
import { type Autosave, createAutosave, type SaveStatus } from "./autosave"
import { editorStore } from "./store"

/** Overrides how long the editor waits before saving. Tests shorten it. */
export const AutosaveDelayContext = createContext<number | undefined>(undefined)

/** Everything about a garden that a save writes. */
type GardenDocument = Pick<Garden, "name" | "location" | "plan">

export interface GardenDocumentHandle {
  name: string
  /** Renames the garden. Returns false, and changes nothing, for a name the server would refuse. */
  setName(name: string): boolean
  location: GardenLocation | null
  setLocation(location: GardenLocation | null): void
  saveStatus: SaveStatus
  retrySave(): void
}

/**
 * Puts a loaded garden into the editor and saves it back as it changes: the
 * plan from the editor store, the name and location from this hook.
 *
 * The garden is read once. To start again from a newer copy (after a
 * conflict, say), remount the component with a new `key`.
 */
export function useGardenDocument(garden: Garden): GardenDocumentHandle {
  const backend = useBackend()
  const delayMs = useContext(AutosaveDelayContext)
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("saved")
  const [name, setNameState] = useState(garden.name)
  const [location, setLocationState] = useState(garden.location)
  const details = useRef({ name: garden.name, location: garden.location })
  const autosaveRef = useRef<Autosave<GardenDocument> | null>(null)

  // A layout effect, so the editor never paints the previous garden's plan.
  useLayoutEffect(() => {
    editorStore.getState().loadPlan(garden.plan)

    const autosave = createAutosave<GardenDocument>({
      version: garden.version,
      delayMs,
      save: async (document, version) =>
        (await backend.gardens.save(garden.id, version, document)).version,
      isConflict: (error) => error instanceof GardenConflictError,
      onStatus: setSaveStatus,
    })
    autosaveRef.current = autosave

    const unsubscribe = editorStore.subscribe((state, previous) => {
      if (state.plan !== previous.plan) autosave.changed({ ...details.current, plan: state.plan })
    })
    // A hidden page may never come back (closed tab, killed app): save while we can.
    const saveWhenHidden = () => {
      if (document.visibilityState === "hidden") void autosave.flush()
    }
    document.addEventListener("visibilitychange", saveWhenHidden)

    return () => {
      unsubscribe()
      document.removeEventListener("visibilitychange", saveWhenHidden)
      void autosave.flush()
      autosaveRef.current = null
    }
  }, [garden, backend, delayMs])

  const detailsChanged = useCallback(() => {
    autosaveRef.current?.changed({ ...details.current, plan: editorStore.getState().plan })
  }, [])

  const setName = useCallback(
    (next: string) => {
      const trimmed = next.trim()
      if (trimmed.length === 0 || trimmed.length > GARDEN_NAME_MAX) return false
      details.current = { ...details.current, name: trimmed }
      setNameState(trimmed)
      detailsChanged()
      return true
    },
    [detailsChanged]
  )

  const setLocation = useCallback(
    (next: GardenLocation | null) => {
      details.current = { ...details.current, location: next }
      setLocationState(next)
      detailsChanged()
    },
    [detailsChanged]
  )

  const retrySave = useCallback(() => autosaveRef.current?.retry(), [])

  return { name, setName, location, setLocation, saveStatus, retrySave }
}
