import type { Translation } from "./en"

/** Português europeu. */
export const pt: Translation = {
  app: {
    name: "Garden Planner",
  },
  language: {
    label: "Idioma",
    pt: "Português",
    en: "English",
  },
  editor: {
    tools: "Ferramentas",
    select: "Selecionar",
    bed: "Canteiro",
    plants: "Plantas",
    hintSelect:
      "Arrasta para te moveres e usa a roda para o zoom. Clica num elemento para o selecionar.",
    hintBed: "Arrasta sobre a horta para desenhar um canteiro.",
    hintPlant: "Clica para pôr uma planta, ou arrasta para encher uma área.",
    undo: "Anular",
    redo: "Refazer",
    canvasLabel: "Plano da horta",
    canvasLoading: "A carregar o plano…",
    canvasFailed: "Não foi possível carregar o plano. Recarrega a página para tentar de novo.",
  },
  inspector: {
    title: "A tua horta",
    size: "{{width}} × {{height}} m",
    empty: "Ainda não há nada aqui. Escolhe a ferramenta Canteiro e arrasta sobre a horta.",
    beds: "Canteiros",
    plantings: "Plantações",
    bedName: "Canteiro {{number}}",
    plantingSummary: "{{name}} × {{count}}",
    totalPlants_one: "{{count}} planta no total",
    totalPlants_other: "{{count}} plantas no total",
    selected: "Selecionado",
    dimensions: "{{width}} × {{height}} cm",
    spacing: "{{inRow}} cm entre plantas na linha, {{row}} cm entre linhas",
    layout: {
      single: "Planta única",
      row: "Linhas",
      block: "Bloco",
      sfg: "Pé quadrado",
    },
    delete: "Apagar",
  },
}
