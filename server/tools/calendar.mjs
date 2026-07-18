import { randomUUID } from "node:crypto";
import { google } from "googleapis";
import { getAuthedClient } from "../googleAuth.mjs";

function calendar() {
  return google.calendar({ version: "v3", auth: getAuthedClient() });
}

// Fuso do sistema (mesmo relógio que o Renan vê no dashboard).
const TZ = Intl.DateTimeFormat().resolvedOptions().timeZone;

// Lista eventos entre duas datas ISO (padrão: próximos 7 dias).
export async function listarEventos({ de, ate, max = 15 } = {}) {
  const timeMin = de ? new Date(de).toISOString() : new Date().toISOString();
  const timeMax = ate
    ? new Date(ate).toISOString()
    : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

  const res = await calendar().events.list({
    calendarId: "primary",
    timeMin,
    timeMax,
    maxResults: Math.min(max, 250),
    singleEvents: true,
    orderBy: "startTime",
  });

  return {
    total: res.data.items?.length ?? 0,
    eventos: (res.data.items ?? []).map((e) => ({
      id: e.id,
      titulo: e.summary ?? "(sem título)",
      inicio: e.start?.dateTime ?? e.start?.date,
      fim: e.end?.dateTime ?? e.end?.date,
      local: e.location ?? null,
      meet: e.hangoutLink ?? null,
      participantes: e.attendees?.map((a) => a.email) ?? [],
    })),
  };
}

// Cria evento. inicio/fim em ISO 8601 (o Claude converte linguagem natural).
export async function criarEvento({
  titulo,
  inicio,
  fim,
  descricao,
  participantes,
  comMeet = false,
}) {
  if (!titulo || !inicio || !fim) {
    throw new Error("Campos obrigatórios: titulo, inicio, fim (ISO 8601).");
  }
  const requestBody = {
    summary: titulo,
    description: descricao ?? undefined,
    start: { dateTime: new Date(inicio).toISOString(), timeZone: TZ },
    end: { dateTime: new Date(fim).toISOString(), timeZone: TZ },
    attendees: participantes?.map((email) => ({ email })) ?? undefined,
  };
  if (comMeet) {
    requestBody.conferenceData = {
      createRequest: {
        requestId: randomUUID(),
        conferenceSolutionKey: { type: "hangoutsMeet" },
      },
    };
  }
  const res = await calendar().events.insert({
    calendarId: "primary",
    requestBody,
    conferenceDataVersion: comMeet ? 1 : 0,
    sendUpdates: participantes?.length ? "all" : "none",
  });
  return {
    ok: true,
    id: res.data.id,
    link: res.data.htmlLink,
    meet: res.data.hangoutLink ?? null,
  };
}

// Cancela (deleta) um evento — o Claude só chama após confirmação explícita.
export async function cancelarEvento({ eventoId, avisarParticipantes = true }) {
  if (!eventoId) throw new Error("Campo obrigatório: eventoId.");
  await calendar().events.delete({
    calendarId: "primary",
    eventId: eventoId,
    sendUpdates: avisarParticipantes ? "all" : "none",
  });
  return { ok: true, aviso: "Evento cancelado." };
}

// Procura janelas livres na agenda em um dia (para 'acha 1h livre pra call').
export async function horariosLivres({ dia, duracaoMinutos = 60 } = {}) {
  const date = dia ? new Date(dia) : new Date();
  const dayStart = new Date(date);
  dayStart.setHours(8, 0, 0, 0);
  const dayEnd = new Date(date);
  dayEnd.setHours(20, 0, 0, 0);

  const res = await calendar().freebusy.query({
    requestBody: {
      timeMin: dayStart.toISOString(),
      timeMax: dayEnd.toISOString(),
      items: [{ id: "primary" }],
    },
  });
  const busy = res.data.calendars?.primary?.busy ?? [];
  const livres = [];
  let cursor = dayStart.getTime();
  for (const b of busy) {
    const start = new Date(b.start).getTime();
    if (start - cursor >= duracaoMinutos * 60 * 1000) {
      livres.push({
        de: new Date(cursor).toISOString(),
        ate: new Date(start).toISOString(),
      });
    }
    cursor = Math.max(cursor, new Date(b.end).getTime());
  }
  if (dayEnd.getTime() - cursor >= duracaoMinutos * 60 * 1000) {
    livres.push({ de: new Date(cursor).toISOString(), ate: dayEnd.toISOString() });
  }
  return { dia: dayStart.toDateString(), janelasLivres: livres };
}
