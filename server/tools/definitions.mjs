import { listarEmails, criarRascunho } from "./gmail.mjs";
import {
  listarEventos,
  criarEvento,
  cancelarEvento,
  horariosLivres,
} from "./calendar.mjs";
import { metricasSociais } from "./windsor.mjs";
import { salvarMemoria } from "./memory.mjs";
import {
  listarTarefas,
  adicionarVarias,
  atualizarTarefa,
  removerTarefa,
} from "./tasks.mjs";
import { sortearTemplates } from "../templates.mjs";

export const TOOL_DEFINITIONS = [
  {
    name: "listar_emails",
    description:
      "Lista e-mails do Gmail do Renan (metadados e resumo, sem corpo completo). Use a sintaxe de busca do Gmail no parâmetro query: 'is:unread' para não lidos, 'newer_than:12h' para recentes, 'from:nome' por remetente. Combine termos com espaço.",
    input_schema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "Busca no formato do Gmail. Padrão: 'is:unread'.",
        },
        max: { type: "integer", description: "Máximo de e-mails (padrão 10, teto 25)." },
      },
    },
  },
  {
    name: "criar_rascunho_email",
    description:
      "Cria um RASCUNHO de e-mail no Gmail do Renan. NUNCA envia — o envio é sempre manual, pelo Renan. Antes de chamar, mostre o texto proposto e só crie o rascunho depois que ele aprovar (ou se ele já pediu diretamente 'cria o rascunho').",
    input_schema: {
      type: "object",
      properties: {
        para: { type: "string", description: "E-mail do destinatário." },
        assunto: { type: "string" },
        corpo: { type: "string", description: "Corpo do e-mail em texto simples." },
      },
      required: ["para", "assunto", "corpo"],
    },
  },
  {
    name: "listar_eventos",
    description:
      "Lista eventos do Google Calendar do Renan entre duas datas. Sem parâmetros, traz os próximos 7 dias. Fuso horário do Renan: Europe/Madrid (Barcelona).",
    input_schema: {
      type: "object",
      properties: {
        de: { type: "string", description: "Data/hora inicial em ISO 8601." },
        ate: { type: "string", description: "Data/hora final em ISO 8601." },
        max: { type: "integer" },
      },
    },
  },
  {
    name: "horarios_livres",
    description:
      "Encontra janelas livres na agenda do Renan em um dia (entre 8h e 20h, fuso de Barcelona). Use antes de criar evento quando ele pedir 'acha um horário livre'.",
    input_schema: {
      type: "object",
      properties: {
        dia: { type: "string", description: "Dia em ISO 8601 (padrão: hoje)." },
        duracaoMinutos: { type: "integer", description: "Duração desejada (padrão 60)." },
      },
    },
  },
  {
    name: "criar_evento",
    description:
      "Cria um evento no Google Calendar do Renan. Ação com efeito externo: confirme os detalhes (título, dia, horário, participantes) com o Renan antes de chamar, a menos que ele já tenha dado todos os dados explicitamente. Se participantes forem incluídos, eles recebem convite.",
    input_schema: {
      type: "object",
      properties: {
        titulo: { type: "string" },
        inicio: { type: "string", description: "ISO 8601, fuso Europe/Madrid." },
        fim: { type: "string", description: "ISO 8601, fuso Europe/Madrid." },
        descricao: { type: "string" },
        participantes: {
          type: "array",
          items: { type: "string" },
          description: "E-mails dos convidados (recebem convite).",
        },
        comMeet: { type: "boolean", description: "true para gerar link do Google Meet." },
      },
      required: ["titulo", "inicio", "fim"],
    },
  },
  {
    name: "cancelar_evento",
    description:
      "Cancela (apaga) um evento do Calendar. AÇÃO IRREVERSÍVEL: só chame depois de confirmação explícita do Renan na conversa atual, citando qual evento será cancelado. Use listar_eventos antes para obter o eventoId.",
    input_schema: {
      type: "object",
      properties: {
        eventoId: { type: "string" },
        avisarParticipantes: { type: "boolean", description: "Padrão true." },
      },
      required: ["eventoId"],
    },
  },
  {
    name: "metricas_sociais",
    description:
      "Busca métricas do Instagram (@renanvedovato) ou do YouTube do Renan via Windsor.ai. Use para perguntas sobre alcance, seguidores, engajamento, views, comparações de período.",
    input_schema: {
      type: "object",
      properties: {
        plataforma: { type: "string", enum: ["instagram", "youtube"] },
        periodo: {
          type: "string",
          description:
            "Preset do Windsor: last_7d, last_30d, last_90d, this_month, last_month...",
        },
        campos: {
          type: "string",
          description: "Lista de campos separados por vírgula (opcional, tem padrão).",
        },
      },
      required: ["plataforma"],
    },
  },
  {
    name: "buscar_templates_video",
    description:
      "Sorteia templates da biblioteca REAL de formatos de vídeo (205 templates com id, 3 variações de gancho, cenas com placeholders ___ e conclusão/CTA). Use quando o Renan pedir temas/ideias de vídeo por voz: busque os templates e adapte cada um ao nicho AMPLO de trade e investimentos (day trade, swing, ações, cripto, psicologia, gestão de risco, finanças pessoais, vida de trader em Barcelona), variando os subtemas entre os temas. NÃO concentre em WDO/mini dólar a menos que ele peça esse assunto. Para gerar em lote com interface, ele também pode usar a aba Temas do dashboard.",
    input_schema: {
      type: "object",
      properties: {
        quantidade: { type: "integer", description: "Quantos templates (padrão 5, máx 10)." },
        ids: {
          type: "array",
          items: { type: "integer" },
          description: "Opcional: ids específicos da biblioteca para travar.",
        },
      },
    },
  },
  {
    name: "gerenciar_tarefas",
    description:
      "Gerencia o checklist de tarefas do Renan que aparece no dashboard (por dia da semana). Use para adicionar tarefas quando ele organizar a agenda por voz (ex.: 'terça: gravar vídeo, dentista às 15h, cortar cabelo'), listar o que tem num dia, marcar como feita ou remover. As datas seguem o fuso de Barcelona; converta expressões como 'hoje', 'amanhã', 'terça' para uma data ISO (YYYY-MM-DD). Tarefas com horário são marcadas como concluídas automaticamente quando o horário passa.",
    input_schema: {
      type: "object",
      properties: {
        acao: {
          type: "string",
          enum: ["adicionar", "listar", "concluir", "remover"],
        },
        itens: {
          type: "array",
          items: {
            type: "object",
            properties: {
              texto: { type: "string" },
              hora: {
                type: "string",
                description: "Horário opcional no formato HH:MM (ex.: '15:00'). Omita se não houver.",
              },
            },
            required: ["texto"],
          },
          description: "Para 'adicionar': lista de tarefas do mesmo dia, cada uma com texto e hora opcional.",
        },
        data: {
          type: "string",
          description: "Data ISO YYYY-MM-DD do dia das tarefas (para adicionar/listar).",
        },
        id: { type: "string", description: "ID da tarefa (para concluir/remover)." },
      },
      required: ["acao"],
    },
  },
  {
    name: "salvar_memoria",
    description:
      "Salva um fato permanente na memória do assistente (preferências, decisões, contexto que deve sobreviver entre conversas). Use quando o Renan disser algo como 'lembra que...', ou quando ele expressar uma preferência clara. Para apagar, passe valor vazio.",
    input_schema: {
      type: "object",
      properties: {
        chave: { type: "string", description: "Identificador curto em snake_case." },
        valor: { type: "string", description: "O fato a lembrar. Vazio apaga." },
      },
      required: ["chave", "valor"],
    },
  },
];

const HANDLERS = {
  listar_emails: listarEmails,
  criar_rascunho_email: criarRascunho,
  listar_eventos: listarEventos,
  horarios_livres: horariosLivres,
  criar_evento: criarEvento,
  cancelar_evento: cancelarEvento,
  metricas_sociais: metricasSociais,
  buscar_templates_video: async ({ quantidade = 5, ids = null } = {}) => ({
    templates: sortearTemplates(Math.min(quantidade, 10), ids),
  }),
  gerenciar_tarefas: async ({ acao, itens, data, id } = {}) => {
    switch (acao) {
      case "adicionar":
        return { criadas: adicionarVarias({ itens, data }) };
      case "listar":
        return { tarefas: listarTarefas({ de: data, ate: data }) };
      case "concluir":
        return atualizarTarefa({ id, feita: true });
      case "remover":
        return removerTarefa({ id });
      default:
        throw new Error(`Ação inválida: ${acao}`);
    }
  },
  salvar_memoria: salvarMemoria,
};

export async function runTool(name, input) {
  const handler = HANDLERS[name];
  if (!handler) throw new Error(`Ferramenta desconhecida: ${name}`);
  return handler(input ?? {});
}
