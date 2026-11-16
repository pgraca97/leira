import { z } from "zod"
import { GardenPlanSchema } from "./schema"

/**
 * Brings a stored plan document up to the current version, one version at a
 * time. Anything it does not recognise comes back untouched, for the schema
 * to refuse: a plan written by a newer version of the app is not guessed at.
 */
export function migratePlan(document: unknown): unknown {
  if (typeof document !== "object" || document === null || Array.isArray(document)) return document
  // Version 2 only added optional fields, so a version 1 plan already fits it.
  if ("schemaVersion" in document && document.schemaVersion === 1) {
    return { ...document, schemaVersion: 2 }
  }
  return document
}

/**
 * A plan as it comes out of storage, whatever version wrote it. Plans are
 * brought up to date when they are read, and stored that way at the next save.
 */
export const StoredPlanSchema = z.preprocess(migratePlan, GardenPlanSchema)
