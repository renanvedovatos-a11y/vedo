import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import Anthropic from "@anthropic-ai/sdk";

const ROOT_DIR = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
import { TOOL_DEFINITIONS, runTool } from "./tools/definitions.mjs";
import { lerMemoria } from "./tools/memory.mjs";
import {
  dashboardInstagram,
  dashboardYoutube,
  detalheInstagram,
  detalheYoutube,
  dashboardAnuncios,
  detalheAnuncios,
} from "./tools/windsor.mjs";
import { listarEventos } from "./tools/calendar.mjs";
import { listarEmails } from "./tools/gmail.mjs";
import {
  listarTarefas,
  adicionarTarefa,
  atualizarTarefa,
  removerTarefa,
} from "./tools/tasks.mjs";
import { googleStatus, getAuthUrl, handleCallback, disconnect } from "./googleAuth.mjs";
import { iniciarStore } from "./store.mjs";
import {
  authAtivo,
  exigirAuth,
  rotaLogin,
  rotaLogout,
  rotaEstado,
} from "./auth.mjs";
import { systemStats } from "./system.mjs";
import { biblioteca, gerarTemas } from "./temas.mjs";
import {
  instagramStatus,
  listarRegras,
  adicionarRegra,
  atualizarRegra,
  removerRegra,
  listarLog,
  processarComentario,
  verificarWebhook,
  assinaturaValida,
  processarWebhook,
  registrarRecebimentoWebhook,
  diagnosticoWebhook,
} from "./instagram.mjs";

const PORT = process.env.PORT || 3001;
// Cérebro da voz: prioriza LATÊNCIA (resposta falada precisa ser imediata).
// Haiku 4.5 é o mais rápido e dá conta de triagem, roteamento de ferramentas e
// respostas curtas. A geração de conteúdo (aba Temas) segue no Opus, em temas.mjs.
const MODEL = "claude-haiku-4-5";
const MAX_TOOL_ITERATIONS = 8;

// Perfil permanente do usuário (seção 2 do briefing) + tom (seção 8).
// Bloco estável e cacheado — conteúdo dinâmico (memória, data) vai em bloco separado.
const SYSTEM_PROMPT = `Você é VEDO, o assistente pessoal (secretária digital) do Renan Vedovato.

PERFIL DO SEU CHEFE (conhecimento permanente):
- Day trader brasileiro com mais de 10 anos de experiência, opera WDO (mini dólar futuro) na B3, sob a Vedovato & Co.
- Negócios ativos: mesa proprietária de trading; sala de trading ao vivo no Discord (~20 alunos); TraderDash (plataforma de journal/analytics de trades); Inequity (firma de investimento em equity).
- Mora em Barcelona (Espanha) desde julho de 2026 (fuso Europe/Madrid); origem: Rio Claro/SP. O pregão da B3 segue horário de Brasília.
- Criador de conteúdo: ~12.000 seguidores no Instagram (@renanvedovato), ~2.800 inscritos no YouTube. Nicho de conteúdo AMPLO: trade e investimentos em geral (day trade, swing, ações, cripto, psicologia, gestão de risco, finanças pessoais) + lifestyle/viagem em Barcelona. Ao gerar temas ou roteiros de conteúdo, cubra o nicho amplo e varie os subtemas — NÃO concentre em WDO/mini dólar a menos que ele peça (o WDO é a especialidade DELE como operador, não o limite do conteúdo).

FERRAMENTAS: você tem acesso a Gmail (ler e criar rascunhos), Google Calendar (ler, achar horário livre, criar e cancelar eventos), métricas de Instagram/YouTube (Windsor.ai), biblioteca de templates de vídeo e memória persistente. Use-as sempre que a pergunta pedir dados reais — não invente e-mails, eventos nem métricas. Se uma ferramenta retornar erro de configuração/conexão, explique em uma frase o que falta e siga ajudando com o que der.

BRIEFING DIÁRIO: quando o Renan pedir o briefing ("bom dia, me dá o briefing"), combine: e-mails não lidos das últimas 24h separados em urgente vs pode esperar + compromissos de hoje e amanhã + um resumo rápido de métricas se disponível. Entregue tudo numa fala só, organizada e curta.

TOM E ESTILO:
- Português brasileiro natural, direto, sem formalidade excessiva e sem "corporativês".
- Objetivo e prático: respostas curtas quando a tarefa é simples.
- Vocabulário de trading (WDO, B3, pontos, alavancagem, drawdown) com naturalidade.
- Suas respostas serão lidas EM VOZ ALTA por um sintetizador de voz. Escreva EXATAMENTE como se estivesse falando: texto corrido, em frases.
- PROIBIDO na resposta: asteriscos (* ou **), cerquilha (#), crase, hífen no início de linha, listas com marcadores, títulos, negrito, tabelas, qualquer markdown. Nada disso existe na fala.
- Para enumerar, fale: "primeiro... segundo... terceiro...". Nunca use bullets.
- Seja curto: numa conversa por voz, resposta longa cansa. Vá direto ao ponto.

REGRAS DE SEGURANÇA (obrigatórias, sem exceção):
- E-mail NUNCA é enviado automaticamente — só rascunho, e de preferência mostre o texto antes de criar.
- Ações irreversíveis ou com efeito externo (cancelar evento, convidar participantes) exigem confirmação explícita do Renan na conversa antes de executar.
- Nunca revele chaves ou credenciais.`;

// A resposta é lida em voz alta: markdown vira ruído no TTS (o sintetizador
// lê ou engasga em asteriscos/cerquilhas). Limpa independente do modelo.
function limparParaVoz(texto) {
  return texto
    .replace(/```[\s\S]*?```/g, "")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1")
    .replace(/__([^_]+)__/g, "$1")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/^\s*[-*+]\s+/gm, "")
    .replace(/^\s*\d+\.\s+/gm, "")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

const app = express();
// Guarda o corpo cru (necessário pra validar a assinatura do webhook da Meta).
app.use(express.json({ verify: (req, _res, buf) => { req.rawBody = buf; } }));

// ---------- login (público) + proteção do restante ----------
app.post("/api/login", rotaLogin);
app.post("/api/logout", rotaLogout);
app.get("/api/auth", rotaEstado);
// A partir daqui, tudo exige sessão — exceto o que auth.mjs libera (webhook da
// Meta, health, arquivos do painel). Sem VEDO_SENHA no ambiente, é no-op.
app.use(exigirAuth);

// ---------- saúde / status ----------
app.get("/api/health", (_req, res) => {
  res.json({
    ok: true,
    hasKey: Boolean(process.env.ANTHROPIC_API_KEY),
    model: MODEL,
    google: googleStatus(),
    windsor: { configured: Boolean(process.env.WINDSOR_API_KEY) },
    t: Date.now(),
  });
});

app.get("/api/system", (_req, res) => {
  res.json(systemStats());
});

// ---------- dados do dashboard (read-only, sem passar pelo Claude) ----------

app.get("/api/dashboard/social", async (_req, res) => {
  if (!process.env.WINDSOR_API_KEY) {
    res.json({ configured: false });
    return;
  }
  try {
    const [instagram, youtube, anuncios] = await Promise.all([
      dashboardInstagram(),
      dashboardYoutube(),
      dashboardAnuncios().catch((e) => ({ erro: e?.message ?? String(e) })),
    ]);
    res.json({ configured: true, instagram, youtube, anuncios });
  } catch (err) {
    res.json({ configured: true, error: err?.message ?? String(err) });
  }
});

app.get("/api/dashboard/social/:plataforma/detalhe", async (req, res) => {
  if (!process.env.WINDSOR_API_KEY) {
    res.json({ configured: false });
    return;
  }
  try {
    const p = req.params.plataforma;
    if (p === "instagram") {
      res.json({ configured: true, detalhe: await detalheInstagram() });
    } else if (p === "youtube") {
      res.json({ configured: true, detalhe: await detalheYoutube() });
    } else if (p === "anuncios") {
      res.json({ configured: true, detalhe: await detalheAnuncios() });
    } else {
      res.status(400).json({ error: "Plataforma inválida." });
    }
  } catch (err) {
    res.json({ configured: true, error: err?.message ?? String(err) });
  }
});

app.get("/api/dashboard/emails", async (req, res) => {
  const g = googleStatus();
  if (!g.connected) {
    res.json({ connected: false });
    return;
  }
  try {
    const query = String(req.query.query ?? "is:unread");
    const max = Math.min(Math.max(parseInt(req.query.max ?? "8", 10) || 8, 1), 25);
    const data = await listarEmails({ query, max });
    res.json({ connected: true, ...data });
  } catch (err) {
    res.json({ connected: true, error: err?.message ?? String(err) });
  }
});

app.get("/api/dashboard/agenda", async (req, res) => {
  const g = googleStatus();
  if (!g.connected) {
    res.json({ connected: false });
    return;
  }
  try {
    // Modo calendário: intervalo explícito (de/ate) para pintar um mês inteiro,
    // inclusive dias já passados. Modo lista: janela de N dias a partir de agora.
    let de;
    let ate;
    let max = 10;
    if (req.query.de || req.query.ate) {
      de = req.query.de;
      ate = req.query.ate;
      max = 250;
    } else {
      const dias = Math.min(Math.max(parseInt(req.query.dias ?? "7", 10) || 7, 1), 60);
      ate = new Date(Date.now() + dias * 24 * 60 * 60 * 1000).toISOString();
      max = dias > 7 ? 50 : 10;
    }
    const data = await listarEventos({ de, ate, max });
    res.json({ connected: true, ...data });
  } catch (err) {
    res.json({ connected: true, error: err?.message ?? String(err) });
  }
});

// ---------- agente de temas de vídeo ----------
app.get("/api/temas/biblioteca", (_req, res) => {
  try {
    res.json({ templates: biblioteca() });
  } catch (err) {
    res.status(500).json({ error: err?.message ?? String(err) });
  }
});

app.post("/api/temas/gerar", async (req, res) => {
  if (!process.env.ANTHROPIC_API_KEY) {
    res.status(500).json({ error: "ANTHROPIC_API_KEY não configurada." });
    return;
  }
  try {
    const out = await gerarTemas(req.body ?? {});
    res.json(out);
  } catch (err) {
    res.status(500).json({ error: err?.message ?? String(err) });
  }
});

// ---------- política de privacidade (exigida pela Meta pra publicar o app) ----------
app.get("/privacidade", (_req, res) => {
  res.type("html").send(`<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Política de Privacidade — Vedovato & Co.</title>
<style>
  body{max-width:760px;margin:0 auto;padding:48px 24px;font-family:-apple-system,Segoe UI,system-ui,sans-serif;line-height:1.6;color:#1a1a1a;background:#fff}
  h1{font-size:28px;margin-bottom:4px}
  .sub{color:#666;margin-bottom:32px}
  h2{font-size:18px;margin:28px 0 8px}
  p,li{color:#333}
  a{color:#2563eb}
  .foot{margin-top:40px;padding-top:20px;border-top:1px solid #eee;color:#888;font-size:13px}
</style></head><body>
<h1>Política de Privacidade</h1>
<div class="sub">Automação de atendimento no Instagram — Vedovato &amp; Co. · Última atualização: julho de 2026</div>

<p>Esta política descreve como o aplicativo de automação de atendimento operado por Renan Vedovato (Vedovato &amp; Co.) coleta, usa e protege informações ao interagir com a conta do Instagram <strong>@renanvedovato</strong>.</p>

<h2>Quais dados são tratados</h2>
<p>Quando alguém comenta em uma publicação da conta, o aplicativo recebe, por meio da API oficial da Meta/Instagram, apenas:</p>
<ul>
<li>o nome de usuário (@) de quem comentou;</li>
<li>o texto do comentário;</li>
<li>o identificador do comentário e da publicação.</li>
</ul>
<p>Não coletamos senhas, e-mails, telefone, dados de pagamento nem navegamos no perfil de quem comenta.</p>

<h2>Como esses dados são usados</h2>
<p>Os dados são usados exclusivamente para <strong>enviar uma resposta automática por mensagem direta (DM)</strong> a quem comentou uma palavra-chave específica, com informações sobre a comunidade e os conteúdos do criador. É uma resposta a um interesse manifestado publicamente pelo próprio usuário; não enviamos mensagens não solicitadas em massa.</p>

<h2>Compartilhamento</h2>
<p>Não vendemos nem compartilhamos esses dados com terceiros. O tratamento acontece apenas entre a API da Meta e o sistema do próprio criador.</p>

<h2>Armazenamento e retenção</h2>
<p>Guardamos um registro mínimo (nome de usuário, comentário e status do envio) apenas para controle operacional e para evitar respostas duplicadas. Esse registro pode ser apagado a qualquer momento a pedido.</p>

<h2>Seus direitos</h2>
<p>Você pode solicitar a exclusão dos seus dados ou deixar de receber mensagens automáticas a qualquer momento, respondendo à própria DM ou entrando em contato pelo canal abaixo.</p>

<h2>Contato</h2>
<p>Dúvidas sobre privacidade: envie uma mensagem direta para <a href="https://instagram.com/renanvedovato">@renanvedovato</a> no Instagram.</p>

<div class="foot">Este aplicativo utiliza a Plataforma da Meta em conformidade com as Políticas da Plataforma e os Termos da Meta.</div>
</body></html>`);
});

// ---------- automação Instagram: comentário -> DM ----------

// Handshake do webhook (a Meta chama isto ao você cadastrar a URL).
app.get("/api/instagram/webhook", (req, res) => {
  const r = verificarWebhook(req.query);
  if (r.ok) res.status(200).send(r.challenge);
  else res.sendStatus(403);
});

// Recebe eventos de comentário da Meta.
app.post("/api/instagram/webhook", async (req, res) => {
  const assinaturaOk = assinaturaValida(req.rawBody, req.get("x-hub-signature-256"));
  registrarRecebimentoWebhook({ assinaturaOk, payload: req.body });
  console.log(
    `[vedo] webhook IG recebido (assinatura ${assinaturaOk ? "ok" : "INVÁLIDA"}):`,
    JSON.stringify(req.body).slice(0, 300),
  );
  if (!assinaturaOk) {
    res.sendStatus(403);
    return;
  }
  res.sendStatus(200); // responde rápido; processa em seguida
  try {
    await processarWebhook(req.body);
  } catch (err) {
    console.error("[vedo] erro no webhook do Instagram:", err?.message ?? err);
  }
});

app.get("/api/instagram/diag", (_req, res) => {
  res.json(diagnosticoWebhook());
});

app.get("/api/instagram/status", (_req, res) => {
  let tunel = null;
  try {
    tunel = JSON.parse(
      fs.readFileSync(path.join(ROOT_DIR, "data", "tunnel.json"), "utf8"),
    );
  } catch {}
  res.json({ ...instagramStatus(), tunel });
});

app.get("/api/instagram/rules", (_req, res) => {
  res.json({ regras: listarRegras() });
});
app.post("/api/instagram/rules", (req, res) => {
  try {
    res.json(adicionarRegra(req.body ?? {}));
  } catch (err) {
    res.status(400).json({ error: err?.message ?? String(err) });
  }
});
app.patch("/api/instagram/rules/:id", (req, res) => {
  try {
    res.json(atualizarRegra({ id: req.params.id, ...(req.body ?? {}) }));
  } catch (err) {
    res.status(404).json({ error: err?.message ?? String(err) });
  }
});
app.delete("/api/instagram/rules/:id", (req, res) => {
  try {
    res.json(removerRegra({ id: req.params.id }));
  } catch (err) {
    res.status(404).json({ error: err?.message ?? String(err) });
  }
});

app.get("/api/instagram/log", (_req, res) => {
  res.json({ log: listarLog() });
});

// Simula um comentário chegando (para testar palavra-chave + mensagem sem a Meta).
app.post("/api/instagram/test", async (req, res) => {
  const { username = "fulano_teste", texto = "", commentId } = req.body ?? {};
  const r = await processarComentario({
    username,
    texto,
    commentId: commentId || `teste_${Date.now()}`,
  });
  res.json(r);
});

// ---------- tarefas (checklist semanal) ----------
app.get("/api/tasks", (req, res) => {
  const { de, ate } = req.query;
  res.json({ tarefas: listarTarefas({ de, ate }) });
});

app.post("/api/tasks", (req, res) => {
  try {
    res.json(adicionarTarefa(req.body ?? {}));
  } catch (err) {
    res.status(400).json({ error: err?.message ?? String(err) });
  }
});

app.patch("/api/tasks/:id", (req, res) => {
  try {
    res.json(atualizarTarefa({ id: req.params.id, ...(req.body ?? {}) }));
  } catch (err) {
    res.status(404).json({ error: err?.message ?? String(err) });
  }
});

app.delete("/api/tasks/:id", (req, res) => {
  try {
    res.json(removerTarefa({ id: req.params.id }));
  } catch (err) {
    res.status(404).json({ error: err?.message ?? String(err) });
  }
});

// ---------- OAuth Google ----------
app.get("/api/google/connect", (_req, res) => {
  const url = getAuthUrl();
  if (!url) {
    res
      .status(400)
      .send(
        "Google não configurado: adicione GOOGLE_CLIENT_ID e GOOGLE_CLIENT_SECRET no arquivo .env e reinicie o servidor.",
      );
    return;
  }
  res.redirect(url);
});

app.get("/api/google/callback", async (req, res) => {
  try {
    await handleCallback(String(req.query.code));
    res.send(
      `<html><body style="background:#04070d;color:#22d3ee;font-family:monospace;display:flex;align-items:center;justify-content:center;height:100vh">
        <div style="text-align:center"><h2>✓ Google conectado ao VEDO</h2><p style="color:#5b7897">Pode fechar esta aba e voltar ao dashboard.</p></div>
      </body></html>`,
    );
  } catch (err) {
    res.status(500).send(`Erro ao conectar: ${err?.message ?? err}`);
  }
});

app.post("/api/google/disconnect", (_req, res) => {
  disconnect();
  res.json({ ok: true });
});

// ---------- chat com loop agêntico ----------
app.post("/api/chat", async (req, res) => {
  if (!process.env.ANTHROPIC_API_KEY) {
    res.status(500).json({
      error: "ANTHROPIC_API_KEY não configurada. Preencha o arquivo .env.",
    });
    return;
  }
  const incoming = req.body?.messages;
  if (!Array.isArray(incoming) || incoming.length === 0) {
    res.status(400).json({ error: "Corpo inválido: esperado { messages: [...] }" });
    return;
  }

  const memoria = lerMemoria();
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const agora = new Date().toLocaleString("pt-BR", {
    weekday: "long",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
  const hojeIso = (() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  })();
  const contextoDinamico = [
    `Data e hora atual (fuso do sistema, ${tz}): ${agora}. Hoje em formato ISO: ${hojeIso}. Use este relógio como referência para "hoje", "amanhã", horários e datas de tarefas/eventos.`,
    Object.keys(memoria).length
      ? `MEMÓRIA PERSISTENTE (fatos salvos em conversas anteriores):\n${Object.entries(
          memoria,
        )
          .map(([k, v]) => `- ${k}: ${v.valor}`)
          .join("\n")}`
      : "Memória persistente vazia por enquanto.",
  ].join("\n\n");

  const client = new Anthropic();
  const convo = incoming.map(({ role, content }) => ({ role, content }));
  const toolsUsed = [];

  try {
    let response;
    for (let i = 0; i < MAX_TOOL_ITERATIONS; i++) {
      response = await client.messages.create({
        model: MODEL,
        max_tokens: 2048,
        system: [
          { type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } },
          { type: "text", text: contextoDinamico },
        ],
        tools: TOOL_DEFINITIONS,
        messages: convo,
      });

      if (response.stop_reason === "pause_turn") {
        convo.push({ role: "assistant", content: response.content });
        continue;
      }
      if (response.stop_reason !== "tool_use") break;

      convo.push({ role: "assistant", content: response.content });

      // Executa TODAS as ferramentas do turno em paralelo. Um briefing chama
      // Gmail + Calendar + Windsor; em série isso somava vários segundos.
      const chamadas = response.content.filter((b) => b.type === "tool_use");
      const results = await Promise.all(
        chamadas.map(async (block) => {
          toolsUsed.push(block.name);
          try {
            const result = await runTool(block.name, block.input);
            return {
              type: "tool_result",
              tool_use_id: block.id,
              content: JSON.stringify(result),
            };
          } catch (err) {
            return {
              type: "tool_result",
              tool_use_id: block.id,
              content: String(err?.message ?? err),
              is_error: true,
            };
          }
        }),
      );
      convo.push({ role: "user", content: results });
    }

    if (response.stop_reason === "refusal") {
      res.json({ text: "Não consegui responder a isso. Pode reformular?", tools_used: toolsUsed });
      return;
    }

    const bruto = response.content
      .filter((block) => block.type === "text")
      .map((block) => block.text)
      .join("\n")
      .trim();
    const text = limparParaVoz(bruto);

    res.json({
      text: text || "Feito.",
      tools_used: toolsUsed,
      usage: response.usage,
    });
  } catch (err) {
    const message = err?.message ?? String(err);
    const status = err?.status ?? 500;
    res.status(status >= 400 && status < 600 ? status : 500).json({ error: message });
  }
});

// ---------- painel (produção): serve o build do Vite ----------
// Em produção o mesmo processo entrega o frontend (dist/) e a API. Localmente o
// Vite cuida do frontend na 5173, então este bloco fica inativo (não há dist/).
const DIST_DIR = path.join(ROOT_DIR, "dist");
if (fs.existsSync(DIST_DIR)) {
  app.use(express.static(DIST_DIR));
  // SPA: qualquer rota que não seja /api cai no index.html.
  app.get("*", (req, res, next) => {
    if (req.path.startsWith("/api/")) return next();
    res.sendFile(path.join(DIST_DIR, "index.html"));
  });
}

// Hidrata o store (Supabase em produção) ANTES de aceitar requisições.
await iniciarStore();

app.listen(PORT, () => {
  const g = googleStatus();
  console.log(`[vedo] cérebro em http://localhost:${PORT} (modelo: ${MODEL})`);
  console.log(
    `[vedo] integrações: google=${g.connected ? "conectado" : g.configured ? "configurado (aguardando login)" : "não configurado"} windsor=${process.env.WINDSOR_API_KEY ? "ok" : "não configurado"}`,
  );
  console.log(`[vedo] login do painel: ${authAtivo ? "ATIVO (VEDO_SENHA definida)" : "aberto (sem VEDO_SENHA — ok em dev)"}`);
  if (!process.env.ANTHROPIC_API_KEY) {
    console.warn("[vedo] AVISO: ANTHROPIC_API_KEY não definida.");
  }
});
