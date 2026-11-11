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
  common: {
    retry: "Tentar de novo",
    pageNotFound: "Esta página não existe.",
  },
  backend: {
    connecting: "A ligar…",
    failed: "Não foi possível ligar ao servidor. Verifica a ligação e tenta de novo.",
  },
  gardens: {
    title: "As tuas hortas",
    new: "Nova horta",
    defaultName: "A minha horta",
    loading: "A carregar as tuas hortas…",
    loadFailed: "Não foi possível carregar as tuas hortas.",
    empty: "Ainda não tens hortas. Cria uma para começar a planear.",
    updated: "Alterada a {{date}}",
    delete: "Apagar",
    deleteNamed: "Apagar {{name}}",
    confirmDelete: "Apagar “{{name}}”? Não é possível desfazer.",
    createFailed: "Não foi possível criar a horta. Tenta de novo.",
    deleteFailed: "Não foi possível apagar a horta. Tenta de novo.",
  },
  garden: {
    back: "Todas as hortas",
    nameLabel: "Nome da horta",
    loading: "A carregar a horta…",
    loadFailed: "Não foi possível carregar a horta.",
    notFound: "Esta horta não existe, ou pertence a outra pessoa.",
    unreadable:
      "Esta horta foi guardada por uma versão mais recente da aplicação. Recarrega a página para atualizar.",
  },
  save: {
    saved: "Guardado",
    pending: "Alterações por guardar",
    saving: "A guardar…",
    error: "Não foi possível guardar as alterações.",
    conflict:
      "Esta horta foi alterada noutro sítio, por isso as tuas últimas alterações aqui não foram guardadas.",
    reload: "Recarregar",
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
