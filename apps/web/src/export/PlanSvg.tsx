import { fillPoints, type GardenPlan, getPlant, plantingFill } from "@leira/core"
import { BED_STYLE, GROUND_STYLE } from "../editor/bedStyles"

interface PlanSvgProps {
  plan: GardenPlan
  /** Language for plant names. */
  locale: "pt" | "en"
  /** The garden's name: what the picture is called for someone who cannot see it. */
  title: string
  /** Whether to write names, counts and the size. Off for a picture too small to read them. */
  labels?: boolean
  className?: string
}

/** Blank space around the garden, in centimetres. */
const MARGIN_CM = 20
/** Above this many plants a planting is drawn as a tinted area instead of dots. */
const MAX_DOTS = 600

/**
 * A still picture of a plan, drawn without the canvas: for printing, for
 * saving as an image, and for anywhere the editor would be too heavy. Its
 * coordinates are centimetres, like the plan's, so it scales to any size.
 */
export function PlanSvg({ plan, locale, title, labels = true, className }: PlanSvgProps) {
  const { widthCm, heightCm } = plan
  // Text and strokes are sized against the garden, so a large one stays readable.
  const unit = Math.max(widthCm, heightCm) / 600
  const fontSize = 13 * unit
  const metres = new Intl.NumberFormat(locale, { maximumFractionDigits: 2 })
  const metreLines = (length: number) =>
    Array.from({ length: Math.ceil(length / 100) - 1 }, (_, index) => (index + 1) * 100)

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label={title}
      className={className}
      viewBox={`${-MARGIN_CM} ${-MARGIN_CM} ${widthCm + 2 * MARGIN_CM} ${heightCm + 2 * MARGIN_CM}`}
      fontFamily="system-ui, sans-serif"
      fontSize={fontSize}
    >
      <rect width={widthCm} height={heightCm} fill={GROUND_STYLE.fill} />
      <g stroke={GROUND_STYLE.grid} strokeOpacity={0.18} strokeWidth={unit}>
        {metreLines(widthCm).map((x) => (
          <line key={`x${x}`} x1={x} y1={0} x2={x} y2={heightCm} />
        ))}
        {metreLines(heightCm).map((y) => (
          <line key={`y${y}`} x1={0} y1={y} x2={widthCm} y2={y} />
        ))}
      </g>

      {plan.beds.map((bed) => {
        const style = BED_STYLE[bed.kind]
        const { x, y, w, h } = bed.rect
        return (
          <g key={bed.id}>
            <rect
              data-kind={bed.kind}
              x={x}
              y={y}
              width={w}
              height={h}
              fill={style.fill}
              fillOpacity={style.alpha}
              stroke={style.edge}
              strokeWidth={2 * unit}
            />
            {labels && bed.name && (
              <text x={x + 4 * unit} y={y + h - 5 * unit} fill="#1c1917" {...halo(unit)}>
                {bed.name}
              </text>
            )}
          </g>
        )
      })}

      {plan.plantings.map((planting) => {
        const plant = getPlant(planting.plantId)
        const color = plant?.color ?? GROUND_STYLE.unknownPlant
        const { x, y, w, h } = planting.rect
        const fill = plant ? plantingFill(planting, plant) : null
        const dotted = fill !== null && fill.count <= MAX_DOTS
        return (
          <g key={planting.id} data-planting={planting.id}>
            <rect
              x={x}
              y={y}
              width={w}
              height={h}
              fill={color}
              fillOpacity={dotted ? 0.18 : 0.5}
              stroke={color}
              strokeWidth={1.5 * unit}
            />
            {fill &&
              dotted &&
              fillPoints(fill).map((point) => (
                <circle
                  key={`${point.x}:${point.y}`}
                  cx={point.x}
                  cy={point.y}
                  r={Math.min(fill.pitch.x, fill.pitch.y) * 0.38}
                  fill={color}
                />
              ))}
            {labels && (
              <text x={x + 4 * unit} y={y + fontSize} fill="#1c1917" {...halo(unit)}>
                {plant && fill ? `${plant.name[locale]} × ${fill.count}` : "?"}
              </text>
            )}
          </g>
        )
      })}

      <rect
        width={widthCm}
        height={heightCm}
        fill="none"
        stroke={GROUND_STYLE.edge}
        strokeWidth={2 * unit}
      />
      {labels && (
        <text
          x={widthCm}
          y={heightCm + MARGIN_CM - 5}
          textAnchor="end"
          fontSize={Math.min(fontSize, MARGIN_CM * 0.7)}
          fill="#57534e"
        >
          {`${metres.format(widthCm / 100)} × ${metres.format(heightCm / 100)} m`}
        </text>
      )}
    </svg>
  )
}

/** A white outline behind the letters, so labels stay readable over soil and leaves. */
function halo(unit: number) {
  return {
    fontWeight: 600,
    stroke: "#ffffff",
    strokeWidth: 3 * unit,
    paintOrder: "stroke",
    strokeLinejoin: "round" as const,
  }
}
