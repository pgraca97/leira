// @vitest-environment jsdom
import "../test/setup"
import { emptyPlan, type GardenPlan } from "@garden/core"
import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import { PlanSvg } from "./PlanSvg"

const plan: GardenPlan = {
  ...emptyPlan(),
  beds: [
    { id: "b1", name: "Salad bed", kind: "bed", rect: { x: 100, y: 100, w: 200, h: 100 } },
    { id: "b2", name: "", kind: "greenhouse", rect: { x: 400, y: 100, w: 100, h: 200 } },
  ],
  plantings: [
    {
      id: "p1",
      plantId: "tomato",
      rect: { x: 100, y: 100, w: 100, h: 100 },
      layout: "block",
      inGround: { from: "2026-05-01", to: "2026-09-30" },
    },
    {
      id: "p2",
      plantId: "dragonfruit",
      rect: { x: 300, y: 300, w: 50, h: 50 },
      layout: "single",
      inGround: { from: "2026-05-01", to: "2026-09-30" },
    },
  ],
}

function draw(shown: GardenPlan = plan) {
  const { container } = render(<PlanSvg plan={shown} locale="en" title="Allotment 12" />)
  const svg = container.querySelector("svg")
  if (!svg) throw new Error("No svg was rendered")
  return svg
}

describe("PlanSvg", () => {
  it("is a picture named after the garden", () => {
    draw()
    expect(screen.getByRole("img", { name: "Allotment 12" })).toBeInTheDocument()
  })

  it("covers the whole garden, in centimetres, with a margin around it", () => {
    expect(draw().getAttribute("viewBox")).toBe("-20 -20 640 440")
  })

  it("draws every bed where it is, and names the ones that have a name", () => {
    const svg = draw()
    const beds = [...svg.querySelectorAll("[data-kind]")]
    expect(beds.map((bed) => bed.getAttribute("data-kind"))).toEqual(["bed", "greenhouse"])
    expect(beds[0]).toHaveAttribute("x", "100")
    expect(beds[0]).toHaveAttribute("width", "200")
    expect(screen.getByText("Salad bed")).toBeInTheDocument()
  })

  it("draws one dot per plant and labels the planting with its count", () => {
    const svg = draw()
    // 100 cm by 100 cm of tomatoes 50 cm apart is a 2 by 2 block.
    expect(svg.querySelectorAll('[data-planting="p1"] circle')).toHaveLength(4)
    expect(screen.getByText("Tomato × 4")).toBeInTheDocument()
  })

  it("names plants in the language asked for", () => {
    render(<PlanSvg plan={plan} locale="pt" title="Horta" />)
    expect(screen.getByText("Tomate × 4")).toBeInTheDocument()
  })

  it("still marks the ground of a crop it does not know", () => {
    const svg = draw()
    expect(svg.querySelector('[data-planting="p2"] rect')).toHaveAttribute("x", "300")
    expect(screen.getByText("?")).toBeInTheDocument()
  })

  it("says how big the garden is", () => {
    draw()
    expect(screen.getByText("6 × 4 m")).toBeInTheDocument()
  })

  it("draws an empty garden without failing", () => {
    const svg = draw(emptyPlan())
    expect(svg.querySelectorAll("[data-kind], [data-planting]")).toHaveLength(0)
  })
})
