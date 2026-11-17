import { describe, expect, it } from "vitest"
import { ClipboardSchema, copyItems, pasteItems } from "./clipboard"
import { emptyPlan, type GardenPlan, PLAN_LIMITS, type Planting } from "./schema"

function planting(id: string, x: number, y: number): Planting {
  return {
    id,
    plantId: "tomato",
    rect: { x, y, w: 100, h: 100 },
    layout: "block",
    inGround: { from: "2026-05-01", to: "2026-09-30" },
  }
}

/** A 6 m by 4 m garden with a bed and two tomato patches, one of them with a harvest. */
const plan: GardenPlan = {
  ...emptyPlan(),
  beds: [{ id: "bed", name: "Long bed", kind: "bed", rect: { x: 100, y: 100, w: 200, h: 100 } }],
  plantings: [
    { ...planting("picked", 110, 110), planted: true, harvests: [{ date: "2026-08-01" }] },
    planting("left", 400, 100),
  ],
}

const BED = { kind: "bed", id: "bed" } as const
const PICKED = { kind: "planting", id: "picked" } as const

const ids = () => {
  let next = 0
  return () => `pasted-${++next}`
}

describe("copyItems", () => {
  it("keeps the chosen items where they are, with nothing recorded on the crops", () => {
    expect(copyItems(plan, [PICKED, BED])).toEqual({
      format: 1,
      beds: [plan.beds[0]],
      plantings: [{ ...planting("picked", 110, 110) }],
    })
  })

  it("is null when none of the items is there", () => {
    expect(copyItems(plan, [])).toBeNull()
    expect(copyItems(plan, [{ kind: "bed", id: "nope" }])).toBeNull()
  })

  it("is what the clipboard schema accepts", () => {
    const bedId = "11111111-1111-4111-8111-111111111111"
    const cropId = "22222222-2222-4222-8222-222222222222"
    const real = {
      ...plan,
      beds: [{ ...plan.beds[0]!, id: bedId }],
      plantings: [{ ...plan.plantings[0]!, id: cropId }],
    }
    const copied = copyItems(real, [
      { kind: "bed", id: bedId },
      { kind: "planting", id: cropId },
    ])
    expect(ClipboardSchema.safeParse(copied).success).toBe(true)
  })
})

describe("pasteItems", () => {
  const copied = copyItems(plan, [BED, PICKED])!

  it("adds the items in the same place under new ids, and names them", () => {
    const pasted = pasteItems(emptyPlan(), copied, { newId: ids() })
    expect(pasted?.refs).toEqual([
      { kind: "bed", id: "pasted-1" },
      { kind: "planting", id: "pasted-2" },
    ])
    expect(pasted?.plan.beds).toEqual([{ ...plan.beds[0], id: "pasted-1" }])
    expect(pasted?.plan.plantings).toEqual([{ ...planting("pasted-2", 110, 110) }])
  })

  it("moves every date a year on when pasted into the next year", () => {
    const pasted = pasteItems(emptyPlan(), copied, { newId: ids(), yearsLater: 1 })
    expect(pasted?.plan.plantings[0]?.inGround).toEqual({ from: "2027-05-01", to: "2027-09-30" })
  })

  it("keeps the last day of February in a year that has no 29th", () => {
    const leap = {
      ...copied,
      plantings: [{ ...planting("p", 0, 0), inGround: { from: "2028-02-29", to: "2028-06-30" } }],
    }
    const pasted = pasteItems(emptyPlan(), leap, { newId: ids(), yearsLater: 1 })
    expect(pasted?.plan.plantings[0]?.inGround.from).toBe("2029-02-28")
  })

  it("pulls the block inside a smaller garden, keeping its layout", () => {
    const far = copyItems(plan, [{ kind: "planting", id: "left" }, PICKED])!
    const small = { ...emptyPlan(), widthCm: 450, heightCm: 300 }
    const pasted = pasteItems(small, far, { newId: ids() })
    // The block spans 110 to 500: pulled back 50 cm, it ends at the new garden's edge, 450.
    expect(pasted?.plan.plantings.map((item) => item.rect.x)).toEqual([60, 350])
  })

  it("lands on the garden's grid", () => {
    const coarse = { ...emptyPlan(), cellCm: 50 }
    const pasted = pasteItems(coarse, copyItems(plan, [PICKED])!, { newId: ids() })
    expect(pasted?.plan.plantings[0]?.rect).toMatchObject({ x: 100, y: 100 })
  })

  it("pastes nothing into a garden the block does not fit", () => {
    const tiny = { ...emptyPlan(), widthCm: 150, heightCm: 150 }
    expect(pasteItems(tiny, copied, { newId: ids() })).toBeNull()
  })

  it("pastes nothing when the garden cannot hold every item", () => {
    const full = {
      ...emptyPlan(),
      beds: Array.from({ length: PLAN_LIMITS.maxBeds }, (_, index) => ({
        ...plan.beds[0]!,
        id: `bed-${index}`,
      })),
    }
    expect(pasteItems(full, copied, { newId: ids() })).toBeNull()
  })

  it("pastes nothing from an empty clipboard", () => {
    expect(
      pasteItems(emptyPlan(), { format: 1, beds: [], plantings: [] }, { newId: ids() })
    ).toBeNull()
  })
})
