/** English strings. This object also defines the keys every other language must provide. */
export const en = {
  app: {
    name: "Garden Planner",
  },
  language: {
    label: "Language",
    pt: "Português",
    en: "English",
  },
  editor: {
    tools: "Tools",
    select: "Select",
    bed: "Bed",
    plants: "Plants",
    hintSelect: "Drag to move around and scroll to zoom. Click an item to select it.",
    hintBed: "Drag on the garden to draw a bed.",
    hintPlant: "Click to place one plant, or drag to fill an area.",
    undo: "Undo",
    redo: "Redo",
    canvasLabel: "Garden plan",
    canvasLoading: "Loading the canvas…",
    canvasFailed: "The canvas could not be loaded. Reload the page to try again.",
  },
  inspector: {
    title: "Your garden",
    size: "{{width}} × {{height}} m",
    empty: "Nothing here yet. Pick the bed tool and drag on the garden.",
    beds: "Beds",
    plantings: "Plantings",
    bedName: "Bed {{number}}",
    plantingSummary: "{{name}} × {{count}}",
    totalPlants_one: "{{count}} plant in total",
    totalPlants_other: "{{count}} plants in total",
    selected: "Selected",
    dimensions: "{{width}} × {{height}} cm",
    spacing: "{{inRow}} cm apart in the row, {{row}} cm between rows",
    layout: {
      single: "Single plant",
      row: "Rows",
      block: "Block",
      sfg: "Square foot",
    },
    delete: "Delete",
  },
}

export type Translation = typeof en
