// Automação comentário -> DM (resposta privada) do Instagram.
// Recebe webhooks de comentário da Meta, casa palavra-chave e envia uma
// resposta privada no direct de quem comentou.
//
// Requer (no .env), preenchidos pelo Renan após criar o app na Meta:
//   META_WEBHOOK_VERIFY_TOKEN  - string qualquer que você inventa (handshake do webhook)
//   META_APP_SECRET            - do app na Meta (verifica assinatura dos webhooks)
//   IG_ACCESS_TOKEN            - token com permissão de mensagens/comentários
//   IG_USER_ID                 - id da conta Instagram business (caminho do /messages)
//   META_GRAPH_VERSION         - opcional, padrão v21.0
//
// Sem IG_ACCESS_TOKEN o motor roda em MODO SIMULAÇÃO: casa a palavra e registra
// o que ENVIARIA, sem chamar a Meta — útil pra testar antes de conectar.

import crypto from "node:crypto";
import * as store from "./store.mjs";

// Nomes lógicos das "gavetas" no store (arquivo local em dev, Supabase em prod).
const RULES_PATH = "ig-rules";
const LOG_PATH = "ig-log";

const lerJson = (nome, fallback) => store.ler(nome, fallback);
const salvarJson = (nome, dados) => store.gravar(nome, dados);

// ---------- regras (palavra -> mensagem) ----------
export function listarRegras() {
  return lerJson(RULES_PATH, []);
}
export function adicionarRegra({ palavra, mensagem }) {
  if (!palavra?.trim() || !mensagem?.trim()) {
    throw new Error("Informe a palavra-chave e a mensagem.");
  }
  const regras = listarRegras();
  const nova = {
    id: crypto.randomUUID().slice(0, 8),
    palavra: palavra.trim(),
    mensagem: mensagem.trim(),
    ativa: true,
    criadaEm: Date.now(),
  };
  regras.push(nova);
  salvarJson(RULES_PATH, regras);
  return nova;
}
export function atualizarRegra({ id, palavra, mensagem, ativa }) {
  const regras = listarRegras();
  const r = regras.find((x) => x.id === id);
  if (!r) throw new Error("Regra não encontrada.");
  if (palavra !== undefined) r.palavra = palavra.trim();
  if (mensagem !== undefined) r.mensagem = mensagem.trim();
  if (typeof ativa === "boolean") r.ativa = ativa;
  salvarJson(RULES_PATH, regras);
  return r;
}
export function removerRegra({ id }) {
  const regras = listarRegras().filter((x) => x.id !== id);
  salvarJson(RULES_PATH, regras);
  return { ok: true };
}

// ---------- log ----------
export function listarLog(limite = 50) {
  return lerJson(LOG_PATH, []).slice(-limite).reverse();
}
function registrar(entrada) {
  const log = lerJson(LOG_PATH, []);
  log.push({ id: crypto.randomUUID().slice(0, 8), quando: Date.now(), ...entrada });
  if (log.length > 500) log.splice(0, log.length - 500);
  salvarJson(LOG_PATH, log);
}
function jaProcessado(commentId) {
  if (!commentId) return false;
  return lerJson(LOG_PATH, []).some((e) => e.commentId === commentId);
}

// ---------- casamento de palavra-chave ----------
const normaliza = (s) =>
  (s ?? "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
const escapa = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// Casa a palavra/frase inteira (não pega "comunidades" por "comunidade").
function bate(comentario, palavra) {
  const c = normaliza(comentario);
  const p = normaliza(palavra).trim();
  if (!p) return false;
  try {
    return new RegExp(`(^|[^\\p{L}])${escapa(p)}([^\\p{L}]|$)`, "u").test(c);
  } catch {
    return c.includes(p);
  }
}

function montarMensagem(template, { usuario }) {
  return template
    .replace(/\{usuario\}/gi, usuario ? `@${usuario}` : "")
    .replace(/\{nome\}/gi, usuario ?? "")
    .trim();
}

// ---------- envio da resposta privada ----------
export function instagramStatus() {
  return {
    webhookConfigurado: Boolean(process.env.META_WEBHOOK_VERIFY_TOKEN),
    envioConfigurado: Boolean(process.env.IG_ACCESS_TOKEN && process.env.IG_USER_ID),
    assinaturaConfigurada: Boolean(process.env.META_APP_SECRET),
  };
}

async function enviarRespostaPrivada({ commentId, texto }) {
  const token = process.env.IG_ACCESS_TOKEN;
  const igId = process.env.IG_USER_ID;
  if (!token || !igId) {
    return { simulado: true }; // modo simulação
  }
  const versao = process.env.META_GRAPH_VERSION || "v21.0";
  // Tokens do fluxo "Instagram API com login do Instagram" (começam com IGAA)
  // usam graph.instagram.com; o fluxo antigo (login Facebook) usa graph.facebook.com.
  const host =
    process.env.META_GRAPH_HOST ||
    (token.startsWith("IGAA") ? "graph.instagram.com" : "graph.facebook.com");
  const url = `https://${host}/${versao}/${igId}/messages`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      recipient: { comment_id: commentId },
      message: { text: texto },
      access_token: token,
    }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(body?.error?.message || `Meta respondeu ${res.status}`);
  }
  return { simulado: false, messageId: body?.message_id };
}

// ---------- núcleo: processa um comentário ----------
export async function processarComentario({ username, texto, commentId }) {
  if (jaProcessado(commentId)) return { status: "duplicado" };

  const regra = listarRegras().find((r) => r.ativa && bate(texto, r.palavra));
  if (!regra) return { status: "sem_regra" };

  const mensagem = montarMensagem(regra.mensagem, { usuario: username });
  try {
    const envio = await enviarRespostaPrivada({ commentId, texto: mensagem });
    registrar({
      commentId,
      de: username,
      comentario: texto,
      palavra: regra.palavra,
      mensagemEnviada: mensagem,
      status: envio.simulado ? "simulado" : "enviado",
    });
    return { status: envio.simulado ? "simulado" : "enviado", mensagem };
  } catch (err) {
    registrar({
      commentId,
      de: username,
      comentario: texto,
      palavra: regra.palavra,
      mensagemEnviada: mensagem,
      status: "erro",
      erro: err?.message ?? String(err),
    });
    return { status: "erro", erro: err?.message ?? String(err) };
  }
}

// ---------- webhook ----------
// Verificação do handshake (GET): a Meta manda hub.challenge; devolvemos se o token bate.
export function verificarWebhook(query) {
  const modo = query["hub.mode"];
  const token = query["hub.verify_token"];
  const challenge = query["hub.challenge"];
  if (modo === "subscribe" && token && token === process.env.META_WEBHOOK_VERIFY_TOKEN) {
    return { ok: true, challenge };
  }
  return { ok: false };
}

// Confere a assinatura X-Hub-Signature-256 (se o app secret estiver configurado).
export function assinaturaValida(rawBody, assinatura) {
  const secret = process.env.META_APP_SECRET;
  if (!secret) return true; // sem secret configurado, não bloqueia (modo dev)
  if (!assinatura) return false;
  const esperado =
    "sha256=" + crypto.createHmac("sha256", secret).update(rawBody).digest("hex");
  try {
    return crypto.timingSafeEqual(Buffer.from(assinatura), Buffer.from(esperado));
  } catch {
    return false;
  }
}

// Diagnóstico: conta todo webhook que chega (mesmo os que não casam palavra),
// pra confirmar que o encanamento Meta -> túnel -> servidor está funcionando.
const diag = {
  recebidos: 0,
  ultimoEm: null,
  ultimaAssinaturaOk: null,
  ultimoResumo: null,
};
export function registrarRecebimentoWebhook({ assinaturaOk, payload }) {
  diag.recebidos += 1;
  diag.ultimoEm = Date.now();
  diag.ultimaAssinaturaOk = assinaturaOk;
  try {
    diag.ultimoResumo = JSON.stringify(payload).slice(0, 400);
  } catch {
    diag.ultimoResumo = null;
  }
}
export function diagnosticoWebhook() {
  return diag;
}

// Extrai os comentários de um payload de webhook e processa cada um.
export async function processarWebhook(payload) {
  const resultados = [];
  for (const entry of payload?.entry ?? []) {
    for (const change of entry?.changes ?? []) {
      if (change.field !== "comments") continue;
      const v = change.value ?? {};
      // Ignora comentários do próprio dono (evita auto-resposta em respostas suas).
      if (v.from?.id && process.env.IG_USER_ID && v.from.id === process.env.IG_USER_ID) {
        continue;
      }
      const r = await processarComentario({
        username: v.from?.username || v.username || "",
        texto: v.text || "",
        commentId: v.id || v.comment_id || "",
      });
      resultados.push(r);
    }
  }
  return resultados;
}
