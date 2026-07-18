// Tarefas do dia/semana — persistidas em data/tasks.json.
// Usadas tanto pela UI (checklist semanal) quanto pelo assistente (por voz).
import { randomUUID } from "node:crypto";
import * as store from "../store.mjs";

function load() {
  const arr = store.ler("tasks", []);
  return Array.isArray(arr) ? arr : [];
}

function save(tasks) {
  store.gravar("tasks", tasks);
}

function isoLocal(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// Normaliza data para YYYY-MM-DD usando o relógio local (nunca UTC).
function normalizarData(data) {
  if (!data) return isoLocal(new Date());
  // Já está em YYYY-MM-DD? mantém como veio (evita deslocamento de fuso).
  if (/^\d{4}-\d{2}-\d{2}$/.test(String(data))) return String(data);
  const d = new Date(data);
  if (!Number.isNaN(d.getTime())) return isoLocal(d);
  return String(data).slice(0, 10);
}

// Normaliza hora para HH:MM (aceita "15", "15h", "15:30", "9h30"). Vazio = sem hora.
function normalizarHora(hora) {
  if (!hora) return null;
  const s = String(hora).trim().toLowerCase().replace("h", ":");
  const m = s.match(/^(\d{1,2})(?::(\d{1,2}))?$/);
  if (!m) return null;
  const hh = String(Math.min(23, parseInt(m[1], 10))).padStart(2, "0");
  const mm = String(Math.min(59, parseInt(m[2] ?? "0", 10))).padStart(2, "0");
  return `${hh}:${mm}`;
}

// Marca como feita, automaticamente, tarefas com hora cujo horário já passou.
// Retorna true se algo mudou (para o chamador salvar).
function autoConcluir(tasks) {
  const agora = new Date();
  let mudou = false;
  for (const t of tasks) {
    if (t.feita || !t.hora) continue;
    const quando = new Date(`${t.data}T${t.hora}:00`);
    if (!Number.isNaN(quando.getTime()) && quando <= agora) {
      t.feita = true;
      t.autoConcluida = true;
      mudou = true;
    }
  }
  return mudou;
}

export function listarTarefas({ de, ate } = {}) {
  const all = load();
  if (autoConcluir(all)) save(all);
  let tasks = all;
  if (de) tasks = tasks.filter((t) => t.data >= normalizarData(de));
  if (ate) tasks = tasks.filter((t) => t.data <= normalizarData(ate));
  tasks.sort((a, b) => {
    if (a.data !== b.data) return a.data < b.data ? -1 : 1;
    if ((a.hora ?? "") !== (b.hora ?? "")) return (a.hora ?? "99") < (b.hora ?? "99") ? -1 : 1;
    return a.criadaEm - b.criadaEm;
  });
  return tasks;
}

export function adicionarTarefa({ texto, data, hora }) {
  if (!texto || !texto.trim()) throw new Error("Texto da tarefa é obrigatório.");
  const tasks = load();
  const nova = {
    id: randomUUID().slice(0, 8),
    texto: texto.trim(),
    data: normalizarData(data),
    hora: normalizarHora(hora),
    feita: false,
    criadaEm: Date.now(),
  };
  tasks.push(nova);
  save(tasks);
  return nova;
}

// Adiciona várias de uma vez (ex.: "terça: gravar vídeo, dentista, cortar cabelo").
// itens pode ser lista de strings ou de objetos { texto, hora }.
export function adicionarVarias({ itens, data }) {
  if (!Array.isArray(itens) || itens.length === 0) {
    throw new Error("Informe uma lista de itens.");
  }
  return itens.map((item) =>
    typeof item === "string"
      ? adicionarTarefa({ texto: item, data })
      : adicionarTarefa({ texto: item.texto, hora: item.hora, data }),
  );
}

export function atualizarTarefa({ id, feita, texto, data, hora }) {
  const tasks = load();
  const t = tasks.find((x) => x.id === id);
  if (!t) throw new Error(`Tarefa ${id} não encontrada.`);
  if (typeof feita === "boolean") {
    t.feita = feita;
    if (!feita) t.autoConcluida = false; // desmarcar manualmente cancela o auto
  }
  if (texto !== undefined) t.texto = texto;
  if (data !== undefined) t.data = normalizarData(data);
  if (hora !== undefined) t.hora = normalizarHora(hora);
  save(tasks);
  return t;
}

export function removerTarefa({ id }) {
  const tasks = load();
  const idx = tasks.findIndex((x) => x.id === id);
  if (idx === -1) throw new Error(`Tarefa ${id} não encontrada.`);
  const [removida] = tasks.splice(idx, 1);
  save(tasks);
  return { ok: true, removida: removida.texto };
}
