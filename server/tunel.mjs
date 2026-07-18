// Gerenciador do túnel público (cloudflared) — roda como processo irmão do
// servidor (npm run dev). Responsável por:
//  1. abrir o túnel para localhost:3001 (protocolo http2, o QUIC falha nesta rede);
//  2. reiniciar o cloudflared se ele cair;
//  3. quando a URL mudar, re-registrar o webhook do Instagram na Meta
//     automaticamente (se META_PARENT_APP_ID/SECRET estiverem no .env);
//  4. gravar o estado em data/tunnel.json para o painel exibir.
//
// IMPORTANTE: este processo nunca deve sair (o `concurrently -k` derrubaria o
// resto). Em erro fatal, loga e fica vivo aguardando.

import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const STATE_PATH = path.join(ROOT, "data", "tunnel.json");
const LOCAL = "http://localhost:3001";
const log = (...a) => console.log("[tunel]", ...a);

function salvarEstado(patch) {
  let atual = {};
  try {
    atual = JSON.parse(fs.readFileSync(STATE_PATH, "utf8"));
  } catch {}
  const novo = { ...atual, ...patch, atualizadoEm: Date.now() };
  fs.mkdirSync(path.dirname(STATE_PATH), { recursive: true });
  fs.writeFileSync(STATE_PATH, JSON.stringify(novo, null, 2));
  return novo;
}

function acharCloudflared() {
  // Caminhos concretos primeiro: o PATH do processo pode não incluir o
  // cloudflared (instalado via MSI depois do shell pai abrir).
  const candidatos = [
    "C:\\Program Files (x86)\\cloudflared\\cloudflared.exe",
    "C:\\Program Files\\cloudflared\\cloudflared.exe",
  ];
  for (const c of candidatos) {
    if (fs.existsSync(c)) return c;
  }
  return "cloudflared"; // última cartada: deixa o PATH resolver
}

async function esperarServidorLocal(tentativas = 40) {
  for (let i = 0; i < tentativas; i++) {
    try {
      const r = await fetch(`${LOCAL}/api/health`);
      if (r.ok) return true;
    } catch {}
    await new Promise((r) => setTimeout(r, 1500));
  }
  return false;
}

// ---------- registro automático do webhook na Meta ----------
async function registrarNaMeta(urlPublica) {
  const appId = process.env.META_PARENT_APP_ID;
  const secret = process.env.META_PARENT_APP_SECRET;
  const verify = process.env.META_WEBHOOK_VERIFY_TOKEN;
  const callback = `${urlPublica}/api/instagram/webhook`;

  if (!appId || !secret || !verify) {
    log("registro automático DESATIVADO (falta META_PARENT_APP_ID/SECRET no .env).");
    log(`>>> atualize manualmente na Meta se a URL mudou: ${callback}`);
    return { estado: "manual", detalhe: "Sem credenciais do app principal; atualizar na Meta manualmente.", callback };
  }

  const token = `${appId}|${secret}`;
  try {
    const body = new URLSearchParams({
      object: "instagram",
      callback_url: callback,
      fields: "comments",
      verify_token: verify,
      access_token: token,
    });
    const res = await fetch(`https://graph.facebook.com/v23.0/${appId}/subscriptions`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    });
    const json = await res.json().catch(() => ({}));
    if (res.ok && json.success) {
      log(`webhook RE-REGISTRADO na Meta: ${callback}`);
      // Melhor esforço: manter a URL da política de privacidade atualizada também.
      try {
        const pol = new URLSearchParams({
          privacy_policy_url: `${urlPublica}/privacidade`,
          access_token: token,
        });
        await fetch(`https://graph.facebook.com/v23.0/${appId}`, { method: "POST", body: pol });
      } catch {}
      return { estado: "ok", detalhe: "Webhook atualizado automaticamente.", callback };
    }
    const msg = json?.error?.message || `HTTP ${res.status}`;
    log(`FALHA ao registrar webhook na Meta: ${msg}`);
    log(`>>> atualize manualmente na Meta: ${callback}`);
    return { estado: "falhou", detalhe: msg, callback };
  } catch (err) {
    const msg = err?.message ?? String(err);
    log(`ERRO de rede ao registrar na Meta: ${msg}`);
    return { estado: "falhou", detalhe: msg, callback };
  }
}

// ---------- laço principal ----------
let urlAtual = null;

async function aoDescobrirUrl(url) {
  if (url === urlAtual) return;
  urlAtual = url;
  log(`túnel no ar: ${url}`);
  salvarEstado({ url, desde: Date.now(), registro: { estado: "aguardando" } });

  const ok = await esperarServidorLocal();
  if (!ok) {
    log("servidor local (3001) não respondeu — registro adiado.");
    salvarEstado({ registro: { estado: "falhou", detalhe: "Servidor local não respondeu.", quando: Date.now() } });
    return;
  }
  const registro = await registrarNaMeta(url);
  salvarEstado({ registro: { ...registro, quando: Date.now() } });
}

function iniciarTunel() {
  const bin = acharCloudflared();
  log(`iniciando cloudflared (${bin})...`);
  let proc;
  try {
    proc = spawn(bin, ["tunnel", "--url", "http://localhost:3001", "--protocol", "http2"], {
      stdio: ["ignore", "pipe", "pipe"],
    });
  } catch (err) {
    log(`não consegui iniciar o cloudflared: ${err?.message}. Nova tentativa em 30s.`);
    salvarEstado({ registro: { estado: "falhou", detalhe: "cloudflared não encontrado", quando: Date.now() } });
    setTimeout(iniciarTunel, 30000);
    return;
  }

  const aoTexto = (buf) => {
    const texto = buf.toString();
    const m = texto.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/);
    if (m) void aoDescobrirUrl(m[0]);
  };
  proc.stdout.on("data", aoTexto);
  proc.stderr.on("data", aoTexto);

  proc.on("error", (err) => log(`erro no cloudflared: ${err?.message}`));
  proc.on("exit", (code) => {
    log(`cloudflared saiu (código ${code}). Reiniciando em 5s...`);
    urlAtual = null;
    salvarEstado({ url: null, registro: { estado: "caiu", detalhe: "Túnel caiu; reiniciando.", quando: Date.now() } });
    setTimeout(iniciarTunel, 5000);
  });
}

iniciarTunel();
// Mantém o processo vivo mesmo se algo falhar acima.
setInterval(() => {}, 1 << 30);
