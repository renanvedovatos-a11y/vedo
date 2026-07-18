// Leva os dados locais (data/*.json) para o Supabase — roda UMA vez, na sua
// máquina, depois de criar a tabela vedo_store.
//
// Uso (PowerShell, na pasta do projeto):
//   $env:SUPABASE_URL="https://xxxx.supabase.co"
//   $env:SUPABASE_SERVICE_KEY="a-service-role-key"
//   node server/migrar-supabase.mjs
//
// É seguro rodar mais de uma vez (faz upsert: sobrescreve pela chave).
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const DATA_DIR = path.join(ROOT, "data");
const URL = process.env.SUPABASE_URL?.replace(/\/+$/, "");
const KEY = process.env.SUPABASE_SERVICE_KEY;

if (!URL || !KEY) {
  console.error("Defina SUPABASE_URL e SUPABASE_SERVICE_KEY antes de rodar.");
  process.exit(1);
}

// nome lógico (chave no store) -> arquivo em data/
const MAPA = {
  "google-tokens": "google-tokens.json",
  tasks: "tasks.json",
  memoria: "memoria.json",
  "ig-rules": "ig-rules.json",
  "ig-log": "ig-log.json",
};

async function upsert(chave, valor) {
  const res = await fetch(`${URL}/rest/v1/vedo_store`, {
    method: "POST",
    headers: {
      apikey: KEY,
      Authorization: `Bearer ${KEY}`,
      "Content-Type": "application/json",
      Prefer: "resolution=merge-duplicates",
    },
    body: JSON.stringify({ chave, valor, atualizado_em: new Date().toISOString() }),
  });
  if (!res.ok) throw new Error(`${res.status}: ${(await res.text()).slice(0, 200)}`);
}

let enviados = 0;
for (const [chave, arquivo] of Object.entries(MAPA)) {
  const caminho = path.join(DATA_DIR, arquivo);
  if (!fs.existsSync(caminho)) {
    console.log(`· ${chave}: (sem arquivo local, pulando)`);
    continue;
  }
  try {
    const valor = JSON.parse(fs.readFileSync(caminho, "utf8"));
    await upsert(chave, valor);
    console.log(`✓ ${chave}: enviado`);
    enviados++;
  } catch (e) {
    console.error(`✗ ${chave}: ${e.message}`);
  }
}
console.log(`\nPronto — ${enviados} registro(s) no Supabase.`);
