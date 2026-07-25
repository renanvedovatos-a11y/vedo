// Ferramentas de criação de conteúdo e social media.
//
// Duas capacidades que o assistente não tinha:
//  1. biblioteca_conteudo — um backlog editorial persistente (ideias, roteiros,
//     legendas, status de produção). É o que transforma "me dá uma ideia" em
//     um pipeline: gerar -> guardar -> produzir -> publicar.
//  2. desempenho_conteudo — leitura consolidada do que funcionou (posts,
//     vídeos e anúncios juntos), para as decisões de pauta serem baseadas em
//     dado real e não em achismo.
import { randomUUID } from "node:crypto";
import * as store from "../store.mjs";
import { detalheInstagram, detalheYoutube, detalheAnuncios } from "./windsor.mjs";

const CHAVE = "conteudos";
const STATUS = ["ideia", "roteiro", "gravar", "editar", "publicado"];

function carregar() {
  const arr = store.ler(CHAVE, []);
  return Array.isArray(arr) ? arr : [];
}

function salvar(itens) {
  store.gravar(CHAVE, itens);
}

const normaliza = (s) =>
  (s ?? "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

// ---------- biblioteca editorial ----------
export async function bibliotecaConteudo({
  acao,
  id,
  titulo,
  formato,
  status,
  roteiro,
  legenda,
  tags,
  notas,
  busca,
  limite = 20,
} = {}) {
  const itens = carregar();

  switch (acao) {
    case "salvar": {
      if (!titulo?.trim()) throw new Error("Informe o título do conteúdo.");
      const novo = {
        id: randomUUID().slice(0, 8),
        titulo: titulo.trim(),
        formato: formato ?? "reels",
        status: STATUS.includes(status) ? status : "ideia",
        roteiro: roteiro ?? null,
        legenda: legenda ?? null,
        tags: Array.isArray(tags) ? tags : [],
        notas: notas ?? null,
        criadoEm: Date.now(),
        atualizadoEm: Date.now(),
      };
      itens.push(novo);
      salvar(itens);
      // O agente tende a tratar "guardei" como entrega concluída e responder só
      // o id — mas quem pediu o roteiro quer lê-lo. O lembrete chega no momento
      // exato em que ele salva, que é onde a instrução realmente pega.
      const entregavel = novo.roteiro || novo.legenda;
      return {
        ok: true,
        salvo: novo,
        ...(entregavel
          ? {
              lembrete:
                "Salvo. Agora escreva o conteúdo COMPLETO na resposta ao Renan, por extenso e pronto para copiar — o id sozinho não serve como entrega.",
            }
          : {}),
      };
    }

    case "listar": {
      let lista = itens;
      if (status) lista = lista.filter((c) => c.status === status);
      if (formato) lista = lista.filter((c) => c.formato === formato);
      lista = [...lista].sort((a, b) => b.atualizadoEm - a.atualizadoEm);
      return {
        total: lista.length,
        // Só o resumo: mandar roteiros inteiros de 20 itens estoura o contexto
        // sem necessidade — o agente pede o detalhe do que interessa.
        conteudos: lista.slice(0, limite).map((c) => ({
          id: c.id,
          titulo: c.titulo,
          formato: c.formato,
          status: c.status,
          tags: c.tags,
          temRoteiro: Boolean(c.roteiro),
          temLegenda: Boolean(c.legenda),
        })),
      };
    }

    case "detalhe": {
      const c = itens.find((x) => x.id === id);
      if (!c) throw new Error(`Conteúdo ${id} não encontrado.`);
      return c;
    }

    case "buscar": {
      const alvo = normaliza(busca);
      if (!alvo) throw new Error("Informe o texto da busca.");
      const achados = itens.filter((c) =>
        [c.titulo, c.roteiro, c.legenda, c.notas, (c.tags ?? []).join(" ")]
          .some((campo) => normaliza(campo).includes(alvo)),
      );
      return {
        total: achados.length,
        conteudos: achados.slice(0, limite).map((c) => ({
          id: c.id,
          titulo: c.titulo,
          formato: c.formato,
          status: c.status,
        })),
      };
    }

    case "atualizar": {
      const c = itens.find((x) => x.id === id);
      if (!c) throw new Error(`Conteúdo ${id} não encontrado.`);
      if (titulo !== undefined) c.titulo = titulo;
      if (formato !== undefined) c.formato = formato;
      if (status !== undefined) {
        if (!STATUS.includes(status)) {
          throw new Error(`Status inválido. Use: ${STATUS.join(", ")}.`);
        }
        c.status = status;
      }
      if (roteiro !== undefined) c.roteiro = roteiro;
      if (legenda !== undefined) c.legenda = legenda;
      if (tags !== undefined) c.tags = tags;
      if (notas !== undefined) c.notas = notas;
      c.atualizadoEm = Date.now();
      salvar(itens);
      return { ok: true, atualizado: c };
    }

    case "remover": {
      const idx = itens.findIndex((x) => x.id === id);
      if (idx === -1) throw new Error(`Conteúdo ${id} não encontrado.`);
      const [removido] = itens.splice(idx, 1);
      salvar(itens);
      return { ok: true, removido: removido.titulo };
    }

    default:
      throw new Error(
        "Ação inválida. Use: salvar, listar, detalhe, buscar, atualizar, remover.",
      );
  }
}

// ---------- desempenho consolidado (o que funcionou) ----------
const corta = (t, n) => {
  const s = String(t ?? "").replace(/\s+/g, " ").trim();
  return s.length > n ? s.slice(0, n) + "…" : s;
};

export async function desempenhoConteudo({ plataforma = "tudo", limite = 5 } = {}) {
  const querIG = plataforma === "tudo" || plataforma === "instagram";
  const querYT = plataforma === "tudo" || plataforma === "youtube";
  const querAds = plataforma === "tudo" || plataforma === "anuncios";

  const [ig, yt, ads] = await Promise.all([
    querIG ? detalheInstagram().catch((e) => ({ erro: e.message })) : null,
    querYT ? detalheYoutube().catch((e) => ({ erro: e.message })) : null,
    querAds ? detalheAnuncios().catch((e) => ({ erro: e.message })) : null,
  ]);

  const out = { periodo: "últimos 30 dias" };

  if (ig && !ig.erro) {
    out.instagram = {
      seguidores: ig.seguidores,
      novosSeguidores30d: ig.novosSeguidores30d,
      engajamento: ig.engajamento == null ? null : Number(ig.engajamento.toFixed(2)),
      alcance: ig.reachTotal,
      salvos: ig.salvos,
      compartilhamentos: ig.compartilhamentos,
      melhoresPosts: (ig.topPosts ?? []).slice(0, limite).map((p) => ({
        legenda: corta(p.legenda, 90),
        tipo: p.tipo,
        engajamento: p.engajamento,
        alcance: p.alcance,
        salvos: p.salvos,
        comentarios: p.comentarios,
        link: p.link,
      })),
      audienciaTopPaises: (ig.audiencia?.paises ?? []).slice(0, 3),
      audienciaIdades: ig.audiencia?.idades ?? [],
    };
  } else if (ig?.erro) out.instagram = { erro: ig.erro };

  if (yt && !yt.erro) {
    out.youtube = {
      inscritos: yt.inscritos,
      saldoInscritos30d: yt.inscritosGanhos30d - yt.inscritosPerdidos30d,
      views30d: yt.views30d,
      minutosAssistidos30d: yt.minutosAssistidos30d,
      melhoresVideos: (yt.topVideos ?? []).slice(0, limite).map((v) => ({
        titulo: corta(v.titulo, 90),
        views: v.views,
        likes: v.likes,
        comentarios: v.comentarios,
        publicado: v.publicado,
        link: v.link,
      })),
    };
  } else if (yt?.erro) out.youtube = { erro: yt.erro };

  if (ads && !ads.erro) {
    out.anuncios = ads.conectado
      ? {
          moeda: ads.moeda,
          investido: Number(ads.gasto?.toFixed(2)),
          alcance: ads.alcance,
          cliques: ads.cliques,
          ctr: ads.ctr == null ? null : Number(ads.ctr.toFixed(2)),
          cpc: ads.cpc == null ? null : Number(ads.cpc.toFixed(2)),
          campanhas: (ads.campanhas ?? []).slice(0, limite).map((c) => ({
            campanha: corta(c.campanha, 70),
            gasto: Number(c.gasto.toFixed(2)),
            cliques: c.cliques,
            ctr: c.ctr == null ? null : Number(c.ctr.toFixed(2)),
          })),
        }
      : { conectado: false };
  } else if (ads?.erro) out.anuncios = { erro: ads.erro };

  return out;
}
