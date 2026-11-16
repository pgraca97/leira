import { describe, expect, it } from "vitest"
import { migratePlan, StoredPlanSchema } from "./migrate"
import { PLAN_SCHEMA_VERSION } from "./schema"

const v1 = { schemaVersion: 1, widthCm: 600, heightCm: 400, cellCm: 10, beds: [], plantings: [] }
const current = { ...v1, schemaVersion: PLAN_SCHEMA_VERSION }

describe("migratePlan", () => {
  it.each([1, 2])("reads a version %i plan as the current version", (schemaVersion) => {
    expect(StoredPlanSchema.parse({ ...v1, schemaVersion })).toEqual(current)
  })

  it("leaves a plan of the current version as it is", () => {
    expect(migratePlan(current)).toEqual(current)
  })

  it("refuses a plan from a newer version", () => {
    const newer = { ...v1, schemaVersion: PLAN_SCHEMA_VERSION + 1 }
    expect(StoredPlanSchema.safeParse(newer).success).toBe(false)
  })

  it.each([null, "plan", 7, []])("hands back %j untouched", (value) => {
    expect(migratePlan(value)).toBe(value)
  })
})
