import { describe, expect, it } from "vitest"
import { migratePlan, StoredPlanSchema } from "./migrate"

const v1 = { schemaVersion: 1, widthCm: 600, heightCm: 400, cellCm: 10, beds: [], plantings: [] }

describe("migratePlan", () => {
  it("reads a version 1 plan as version 2", () => {
    expect(StoredPlanSchema.parse(v1)).toEqual({ ...v1, schemaVersion: 2 })
  })

  it("leaves a version 2 plan as it is", () => {
    expect(migratePlan({ ...v1, schemaVersion: 2 })).toEqual({ ...v1, schemaVersion: 2 })
  })

  it("refuses a plan from a newer version", () => {
    expect(StoredPlanSchema.safeParse({ ...v1, schemaVersion: 3 }).success).toBe(false)
  })

  it.each([null, "plan", 7, []])("hands back %j untouched", (value) => {
    expect(migratePlan(value)).toBe(value)
  })
})
