import { google } from "googleapis";
import * as store from "./store.mjs";

// Em produção (Render) o PUBLIC_URL aponta pro domínio público; localmente cai
// no localhost de sempre. Ambas as URIs precisam estar cadastradas no Google
// Cloud Console (Authorized redirect URIs).
const REDIRECT_URI = `${process.env.PUBLIC_URL || "http://localhost:3001"}/api/google/callback`;
const SCOPES = [
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/gmail.compose",
  "https://www.googleapis.com/auth/calendar",
];

function hasCredentials() {
  return Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
}

function newOAuthClient() {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    REDIRECT_URI,
  );
}

function loadTokens() {
  return store.ler("google-tokens", null);
}

function saveTokens(tokens) {
  store.gravar("google-tokens", tokens);
}

// Um token pode existir no disco e mesmo assim estar morto: quando o app está
// em modo de teste no Google, o refresh token expira em 7 dias e as chamadas
// falham com "invalid_grant". Sem registrar isso, o painel se dizia conectado
// e nunca oferecia o botão de reconectar — que é justamente a saída.
let tokenExpirado = false;

export function registrarErroGoogle(err) {
  const msg = String(err?.message ?? err);
  if (/invalid_grant|Token has been expired or revoked/i.test(msg)) {
    tokenExpirado = true;
  }
}

export function googleStatus() {
  const temToken = hasCredentials() && loadTokens() !== null;
  return {
    configured: hasCredentials(),
    connected: temToken && !tokenExpirado,
    expirado: temToken && tokenExpirado,
  };
}

export function getAuthUrl() {
  if (!hasCredentials()) return null;
  return newOAuthClient().generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: SCOPES,
  });
}

export async function handleCallback(code) {
  const client = newOAuthClient();
  const { tokens } = await client.getToken(code);
  const existing = loadTokens();
  // Preserva o refresh_token se o Google não reenviar num re-consent.
  saveTokens({ ...existing, ...tokens });
  tokenExpirado = false; // reconectou: volta ao normal
}

// Retorna um cliente autenticado ou lança erro com instrução amigável
// (o erro vira tool_result e o Claude explica ao usuário o que falta).
export function getAuthedClient() {
  if (!hasCredentials()) {
    throw new Error(
      "Google não configurado: faltam GOOGLE_CLIENT_ID e GOOGLE_CLIENT_SECRET no .env. Peça ao Renan para configurar as credenciais no painel de Integrações.",
    );
  }
  const tokens = loadTokens();
  if (!tokens) {
    throw new Error(
      "Conta Google não conectada. Peça ao Renan para clicar em 'Conectar Google' no painel de Integrações do dashboard.",
    );
  }
  const client = newOAuthClient();
  client.setCredentials(tokens);
  client.on("tokens", (fresh) => saveTokens({ ...loadTokens(), ...fresh }));
  return client;
}

export function disconnect() {
  store.remover("google-tokens");
}
