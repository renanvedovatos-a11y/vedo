// Agente de temas de vídeo — usa a biblioteca real (src/data/templates_video.json)
// e a API da Anthropic com structured outputs (JSON garantido pelo schema).
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Anthropic from "@anthropic-ai/sdk";

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const LIB_PATH = path.join(ROOT, "src", "data", "templates_video.json");

// Roteiros são o trabalho criativo do app: aqui vale o modelo mais forte,
// com pensamento ligado e esforço alto. A voz é que corre no Haiku rápido.
const MODEL_TEMAS = "claude-opus-4-8";

let cache = null;
export function biblioteca() {
  if (!cache) {
    cache = JSON.parse(fs.readFileSync(LIB_PATH, "utf8"));
  }
  return cache;
}

// Sorteia N templates distintos (ou usa os ids travados pelo usuário).
export function selecionarTemplates({ quantidade = 5, ids = null } = {}) {
  const lib = biblioteca();
  if (Array.isArray(ids) && ids.length > 0) {
    const escolhidos = ids
      .map((id) => lib.find((t) => t.id === Number(id)))
      .filter(Boolean);
    if (escolhidos.length === 0) throw new Error("Nenhum template válido nos ids informados.");
    // Se travou menos templates que a quantidade pedida, repete (variações do mesmo).
    const out = [];
    for (let i = 0; i < quantidade; i++) out.push(escolhidos[i % escolhidos.length]);
    return out;
  }
  const sorteio = [...lib].sort(() => Math.random() - 0.5);
  return sorteio.slice(0, Math.min(quantidade, lib.length));
}

const TIPOS_YOUTUBE = {
  vlog: "Vlog com trade no meio: narrativa de lifestyle/rotina (Barcelona, viagem, dia na vida) com um bloco de day trade real inserido no meio do vídeo.",
  tecnico: "Técnico/educativo: ensinar um conceito a fundo (setup, indicador, gestão de risco), com exemplos práticos no gráfico.",
  analise: "Análise de mercado: cenário do dólar/bolsa/cripto, recap semanal, expectativas e níveis importantes.",
  storytelling: "Storytelling/bastidores: jornada pessoal, erros caros, evolução, bastidores da mesa proprietária.",
  reacao: "Reação/opinião: reagir a notícias, mitos do mercado ou conselhos ruins que circulam na internet.",
  qa: "Q&A estruturado: responder dúvidas reais da audiência em blocos organizados.",
};

const SYSTEM_TEMAS = `Você é o gerador de temas de vídeo do Renan Vedovato, criador de conteúdo do nicho AMPLO de trade e investimentos.

CONTEXTO DO CRIADOR:
- Trader profissional com +10 anos de mercado. O conteúdo dele fala com TODO trader e investidor: day trade, swing trade, ações, criptomoedas, futuros, psicologia, gestão de risco, finanças pessoais e vida de trader.
- Marca de educação em trading, sala ao vivo no Discord, ~12k seguidores no Instagram (@renanvedovato), ~2,8k inscritos no YouTube.
- Baseado em Barcelona/Espanha (permite conteúdo lifestyle + trading).
- Subtemas do nicho: day trade, swing trade, ações, criptomoedas, price action, gestão de risco, stop loss, alavancagem, psicologia/emocional, disciplina, rotina de trader, mesa proprietária, finanças pessoais, erros de iniciante, vida de trader no exterior, mini índice, mini dólar/WDO.

REGRA DE ABRANGÊNCIA (importante):
- Fale de "trade", "operar", "o mercado", "trader" como vocabulário padrão. NÃO cite WDO, mini dólar ou B3 a menos que o assunto/subtema pedido pelo usuário mencione isso explicitamente.
- Sem assunto definido, distribua os temas entre subtemas DIFERENTES (ex.: um de psicologia, um de gestão de risco, um de ações ou cripto, um de vida de trader) — nunca concentre tudo no mesmo instrumento ou subtema.
- Exemplos e cenas devem funcionar para qualquer trader (gráfico, stop, alvo, conta, corretora), sem amarrar a um ativo específico, exceto quando o usuário pedir.

SUA TAREFA:
Você recebe templates REAIS de uma biblioteca (cada um com id, ganchos genéricos, cenas com placeholders ___ e [tema do nicho], e conclusão). Adapte cada template ao nicho, gerando um tema de vídeo pronto para gravar:
- Reescreva as 3 variações de gancho com vocabulário do mercado financeiro, mantendo o mecanismo de atenção original de cada gancho.
- Transforme as instruções de cena em roteiro CONCRETO (sem placeholders, sem ___): o que falar e o que mostrar.
- Adapte a conclusão/CTA.
- Nunca invente estrutura do zero: siga a espinha dorsal do template recebido.

MODO REELS (vídeo curto 15-60s): roteiro enxuto, 2-4 cenas diretas, linguagem falada. Deixe thumbnail_titulo como string vazia.

MODO YOUTUBE (vídeo longo): o template vira a espinha dorsal — o gancho vira a intro/promessa dos primeiros 30 segundos, cada cena vira um bloco do vídeo (expanda com o que abordar em 2-4 minutos por bloco), a conclusão vira o encerramento. Preencha thumbnail_titulo com uma ideia de thumbnail (descrição visual curta) + título otimizado para busca, separados por " | ".

TOM E COPY:
- Português brasileiro natural e direto, sem formalidade corporativa.
- Sem em dashes (—). Sem excesso de perguntas retóricas.
- Ganchos com no máximo ~15 palavras, falados em até 3 segundos.`;

const SCHEMA_TEMAS = {
  type: "object",
  properties: {
    temas: {
      type: "array",
      items: {
        type: "object",
        properties: {
          template_id: { type: "integer" },
          titulo: { type: "string" },
          ganchos: { type: "array", items: { type: "string" } },
          roteiro: { type: "array", items: { type: "string" } },
          conclusao: { type: "string" },
          thumbnail_titulo: { type: "string" },
        },
        required: ["template_id", "titulo", "ganchos", "roteiro", "conclusao", "thumbnail_titulo"],
        additionalProperties: false,
      },
    },
  },
  required: ["temas"],
  additionalProperties: false,
};

export async function gerarTemas({
  modo = "reels",
  tipo = null,
  assunto = "",
  subtema = "",
  quantidade = 5,
  templateIds = null,
}) {
  const qtd = Math.min(Math.max(Number(quantidade) || 5, 1), 10);
  const escolhidos = selecionarTemplates({ quantidade: qtd, ids: templateIds });

  const partes = [
    `MODO: ${modo === "youtube" ? "YOUTUBE (vídeo longo)" : "REELS (vídeo curto)"}`,
  ];
  if (modo === "youtube" && tipo && TIPOS_YOUTUBE[tipo]) {
    partes.push(`TIPO DE VÍDEO: ${TIPOS_YOUTUBE[tipo]}`);
  }
  if (assunto?.trim()) partes.push(`ASSUNTO BASE: ${assunto.trim()}`);
  if (subtema?.trim()) partes.push(`SUBTEMA DO NICHO: ${subtema.trim()}`);
  partes.push(
    `Gere exatamente ${qtd} tema(s), um para cada template abaixo, na mesma ordem. Em cada tema, template_id deve ser o id do template usado.`,
    `TEMPLATES DA BIBLIOTECA:\n${JSON.stringify(escolhidos, null, 1)}`,
  );

  const client = new Anthropic();
  // Streaming aqui é proteção de timeout: com pensamento ligado e esforço alto,
  // gerar 10 roteiros pode passar do limite de uma requisição comum.
  const stream = client.messages.stream({
    model: MODEL_TEMAS,
    max_tokens: 32000,
    thinking: { type: "adaptive" }, // no Opus 4.8 precisa ser explícito
    output_config: {
      effort: "high",
      format: { type: "json_schema", schema: SCHEMA_TEMAS },
    },
    system: [
      { type: "text", text: SYSTEM_TEMAS, cache_control: { type: "ephemeral" } },
    ],
    messages: [{ role: "user", content: partes.join("\n\n") }],
  });
  const response = await stream.finalMessage();

  if (response.stop_reason === "refusal") {
    throw new Error("A geração foi recusada. Tente reformular o assunto.");
  }
  if (response.stop_reason === "max_tokens") {
    throw new Error("Resposta muito longa. Tente gerar menos temas por vez.");
  }

  const text = response.content
    .filter((b) => b.type === "text")
    .map((b) => b.text)
    .join("");
  const parsed = JSON.parse(text);
  return { temas: parsed.temas, usage: response.usage };
}
