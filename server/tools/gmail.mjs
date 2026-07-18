import { google } from "googleapis";
import { getAuthedClient } from "../googleAuth.mjs";

function gmail() {
  return google.gmail({ version: "v1", auth: getAuthedClient() });
}

function header(headers, name) {
  return headers?.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value ?? "";
}

// Lista e-mails (metadados + snippet). query usa a sintaxe de busca do Gmail
// (ex.: "is:unread newer_than:12h", "from:fulano").
export async function listarEmails({ query = "is:unread", max = 10 } = {}) {
  const api = gmail();
  const list = await api.users.messages.list({
    userId: "me",
    q: query,
    maxResults: Math.min(max, 25),
  });
  const ids = list.data.messages ?? [];
  if (ids.length === 0) return { total: 0, emails: [] };

  const emails = await Promise.all(
    ids.map(async ({ id }) => {
      const msg = await api.users.messages.get({
        userId: "me",
        id,
        format: "metadata",
        metadataHeaders: ["From", "Subject", "Date"],
      });
      const headers = msg.data.payload?.headers;
      return {
        id,
        de: header(headers, "From"),
        assunto: header(headers, "Subject"),
        data: header(headers, "Date"),
        // Snippet cortado: o assistente só precisa do suficiente pra triar.
        resumo: (msg.data.snippet ?? "").slice(0, 160),
        naoLido: msg.data.labelIds?.includes("UNREAD") ?? false,
      };
    }),
  );
  return { total: emails.length, emails };
}

// Cria um RASCUNHO no Gmail (nunca envia — regra de segurança do projeto).
export async function criarRascunho({ para, assunto, corpo }) {
  if (!para || !assunto || !corpo) {
    throw new Error("Campos obrigatórios: para, assunto, corpo.");
  }
  const api = gmail();
  const subjectB64 = Buffer.from(assunto, "utf8").toString("base64");
  const raw = Buffer.from(
    [
      `To: ${para}`,
      `Subject: =?UTF-8?B?${subjectB64}?=`,
      'Content-Type: text/plain; charset="UTF-8"',
      "MIME-Version: 1.0",
      "",
      corpo,
    ].join("\r\n"),
    "utf8",
  )
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");

  const draft = await api.users.drafts.create({
    userId: "me",
    requestBody: { message: { raw } },
  });
  return {
    ok: true,
    rascunhoId: draft.data.id,
    aviso: "Rascunho criado no Gmail. O envio é manual, pelo Renan.",
  };
}
