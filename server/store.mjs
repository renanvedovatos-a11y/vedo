// Camada única de persistência do VEDO.
//
// - Local (padrão de desenvolvimento): arquivos JSON em data/, exatamente como
//   sempre foi.
// - Produção com Supabase (SUPABASE_URL + SUPABASE_SERVICE_KEY no ambiente):
//   uma tabela chave→valor (vedo_store). Os dados são hidratados para um cache
//   em memória na inicialização, então as LEITURAS continuam SÍNCRONAS (as APIs
//   existentes não precisam virar async). As ESCRITAS atualizam o cache na hora
//   e sobem para o Supabase em segundo plano (serializadas por chave).
//
// Isso é necessário porque o plano grátis do Render não tem disco persistente:
// sem um armazenamento externo, tokens/tarefas/regras sumiriam a cada deploy.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const DATA_DIR = path.join(ROOT, "data");

const SUPABASE_URL = process.env.SUPABASE_URL?.replace(/\/+$/, "");
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;
const usandoSupabase = Boolean(SUPABASE_URL && SUPABASE_KEY);
const TABELA = "vedo_store";

const cache = new Map(); // nome -> valor (objeto/array)

function arquivoDe(nome) {
  return path.join(DATA_DIR, `${nome}.json`);
}

// ---------- REST do Supabase (PostgREST) ----------
function cabecalhos(extra = {}) {
  return {
    apikey: SUPABASE_KEY,
    Authorization: `Bearer ${SUPABASE_KEY}`,
    "Content-Type": "application/json",
    ...extra,
  };
}

async function supaHidratar() {
  const url = `${SUPABASE_URL}/rest/v1/${TABELA}?select=chave,valor`;
  const res = await fetch(url, { headers: cabecalhos() });
  if (!res.ok) {
    throw new Error(`Supabase hidratar ${res.status}: ${(await res.text()).slice(0, 300)}`);
  }
  for (const linha of await res.json()) cache.set(linha.chave, linha.valor);
}

// Escritas serializadas por chave, para não haver corrida entre dois upserts
// da mesma chave disparados em sequência.
const filas = new Map(); // nome -> Promise
function supaUpsert(nome, valor) {
  const anterior = filas.get(nome) ?? Promise.resolve();
  const proxima = anterior
    .then(async () => {
      const res = await fetch(`${SUPABASE_URL}/rest/v1/${TABELA}`, {
        method: "POST",
        headers: cabecalhos({ Prefer: "resolution=merge-duplicates" }),
        body: JSON.stringify({
          chave: nome,
          valor,
          atualizado_em: new Date().toISOString(),
        }),
      });
      if (!res.ok) {
        console.error(`[store] upsert "${nome}" falhou ${res.status}: ${(await res.text().catch(() => "")).slice(0, 200)}`);
      }
    })
    .catch((e) => console.error(`[store] upsert "${nome}" erro:`, e?.message));
  filas.set(nome, proxima);
  return proxima;
}

function supaDelete(nome) {
  fetch(`${SUPABASE_URL}/rest/v1/${TABELA}?chave=eq.${encodeURIComponent(nome)}`, {
    method: "DELETE",
    headers: cabecalhos(),
  }).catch((e) => console.error(`[store] delete "${nome}" erro:`, e?.message));
}

// ---------- API pública (síncrona para os chamadores) ----------

// Deve ser chamada (e aguardada) antes do app.listen quando em produção, para
// que o cache esteja preenchido antes da primeira leitura.
export async function iniciarStore() {
  if (usandoSupabase) {
    await supaHidratar();
    console.log(`[store] Supabase conectado — ${cache.size} registro(s) carregado(s).`);
  } else {
    console.log("[store] modo arquivo local (data/).");
  }
}

export function ler(nome, fallback) {
  if (usandoSupabase) {
    return cache.has(nome) ? cache.get(nome) : fallback;
  }
  try {
    return JSON.parse(fs.readFileSync(arquivoDe(nome), "utf8"));
  } catch {
    return fallback;
  }
}

export function gravar(nome, valor) {
  if (usandoSupabase) {
    cache.set(nome, valor);
    void supaUpsert(nome, valor);
    return;
  }
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(arquivoDe(nome), JSON.stringify(valor, null, 2));
}

export function remover(nome) {
  if (usandoSupabase) {
    cache.delete(nome);
    supaDelete(nome);
    return;
  }
  try {
    fs.unlinkSync(arquivoDe(nome));
  } catch {}
}

export const modoSupabase = usandoSupabase;
