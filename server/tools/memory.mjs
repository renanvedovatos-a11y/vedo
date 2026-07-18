// Memória persistente do assistente (Fase 4) — arquivo JSON simples em data/.
import * as store from "../store.mjs";

export function lerMemoria() {
  return store.ler("memoria", {});
}

export function salvarMemoria({ chave, valor }) {
  if (!chave || valor === undefined) {
    throw new Error("Campos obrigatórios: chave, valor.");
  }
  const mem = lerMemoria();
  if (valor === null || valor === "") {
    delete mem[chave];
  } else {
    mem[chave] = { valor, atualizadoEm: new Date().toISOString() };
  }
  store.gravar("memoria", mem);
  return { ok: true, chave };
}
