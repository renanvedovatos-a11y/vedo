// Login simples do painel (uma senha única) por cookie de sessão assinado.
//
// Ativa-se sozinho SÓ quando VEDO_SENHA está definida no ambiente — ou seja,
// em produção (Render) o login é exigido; localmente, sem a variável, o painel
// continua aberto e sem fricção pra desenvolver.
//
// A sessão é um cookie HttpOnly assinado com HMAC (sem dependências externas):
// não guarda a senha, só um carimbo de validade assinado com um segredo.
import crypto from "node:crypto";

const SENHA = process.env.VEDO_SENHA || "";
export const authAtivo = Boolean(SENHA);

// Segredo da assinatura: usa VEDO_SESSION_SECRET se houver; senão deriva da
// própria senha (trocar a senha invalida as sessões abertas — aceitável).
const SEGREDO =
  process.env.VEDO_SESSION_SECRET ||
  crypto.createHash("sha256").update("vedo|" + SENHA).digest("hex");

const COOKIE = "vedo_sessao";
const DUR_MS = 30 * 24 * 60 * 60 * 1000; // 30 dias
const cookieSeguro = (process.env.PUBLIC_URL || "").startsWith("https");

function assinar(exp) {
  const h = crypto.createHmac("sha256", SEGREDO).update(String(exp)).digest("hex");
  return `${exp}.${h}`;
}

function tokenValido(token) {
  if (!token) return false;
  const ponto = token.indexOf(".");
  if (ponto < 0) return false;
  const exp = token.slice(0, ponto);
  const esperado = assinar(exp);
  if (esperado.length !== token.length) return false;
  if (!crypto.timingSafeEqual(Buffer.from(token), Buffer.from(esperado))) return false;
  return Number(exp) > Date.now();
}

function lerCookie(req, nome) {
  const raw = req.headers.cookie;
  if (!raw) return null;
  for (const parte of raw.split(";")) {
    const eq = parte.indexOf("=");
    if (eq < 0) continue;
    if (parte.slice(0, eq).trim() === nome) {
      return decodeURIComponent(parte.slice(eq + 1).trim());
    }
  }
  return null;
}

function definirCookie(res, token, maxAgeMs) {
  const attrs = [
    `${COOKIE}=${encodeURIComponent(token)}`,
    "HttpOnly",
    "SameSite=Lax",
    "Path=/",
    `Max-Age=${Math.floor(maxAgeMs / 1000)}`,
  ];
  if (cookieSeguro) attrs.push("Secure");
  res.setHeader("Set-Cookie", attrs.join("; "));
}

export function estaAutenticado(req) {
  if (!authAtivo) return true;
  return tokenValido(lerCookie(req, COOKIE));
}

export function rotaLogin(req, res) {
  if (!authAtivo) return res.json({ ok: true, necessario: false });
  const senha = String(req.body?.senha ?? "");
  const a = Buffer.from(senha);
  const b = Buffer.from(SENHA);
  const ok = a.length === b.length && crypto.timingSafeEqual(a, b);
  if (!ok) return res.status(401).json({ ok: false, erro: "Senha incorreta." });
  definirCookie(res, assinar(Date.now() + DUR_MS), DUR_MS);
  res.json({ ok: true });
}

export function rotaLogout(_req, res) {
  definirCookie(res, "", 0);
  res.json({ ok: true });
}

export function rotaEstado(req, res) {
  res.json({ necessario: authAtivo, autenticado: estaAutenticado(req) });
}

// Rotas que ficam SEMPRE abertas (o webhook da Meta chama sem cookie; o
// health é usado pelo keep-alive; login/auth precisam ser acessíveis).
const PUBLICAS = [
  "/api/login",
  "/api/logout",
  "/api/auth",
  "/api/health",
  "/api/instagram/webhook",
  "/privacidade",
];

export function exigirAuth(req, res, next) {
  if (!authAtivo) return next();
  // Arquivos estáticos do painel (GET fora de /api) são públicos — a tela de
  // login é do próprio painel, que só busca dados depois de autenticar.
  if (req.method === "GET" && !req.path.startsWith("/api/")) return next();
  if (PUBLICAS.some((p) => req.path === p || req.path.startsWith(p))) return next();
  if (estaAutenticado(req)) return next();
  res.status(401).json({ erro: "não autenticado" });
}
