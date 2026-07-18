// Métricas de redes sociais via Windsor.ai (Instagram @renanvedovato + YouTube).
// Requer WINDSOR_API_KEY no .env. Nomes de campo confirmados via get_fields.

const BASE = "https://connectors.windsor.ai";

// Métricas de rede social são consolidadas por dia — rebuscar a cada pergunta
// só adiciona segundos de espera. Cache em memória por consulta idêntica.
const TTL_MS = 5 * 60 * 1000;
const cacheWindsor = new Map(); // chave -> { quando, dados | promessa }

async function windsorGet(connector, { fields, date_preset }) {
  const key = process.env.WINDSOR_API_KEY;
  if (!key) {
    throw new Error(
      "Windsor.ai não configurado: falta WINDSOR_API_KEY no .env. Peça ao Renan para adicionar a chave (windsor.ai → Preview and Destination → API).",
    );
  }

  const chave = `${connector}|${fields}|${date_preset ?? ""}`;
  const cached = cacheWindsor.get(chave);
  if (cached && Date.now() - cached.quando < TTL_MS) {
    return cached.promessa; // reaproveita inclusive chamadas em voo
  }

  const promessa = (async () => {
    const url =
      `${BASE}/${connector}?api_key=${encodeURIComponent(key)}` +
      (date_preset ? `&date_preset=${encodeURIComponent(date_preset)}` : "") +
      `&fields=${encodeURIComponent(fields)}`;
    const res = await fetch(url);
    const raw = await res.text();
    if (!res.ok) {
      throw new Error(`Windsor.ai (${connector}) respondeu ${res.status}: ${raw.slice(0, 300)}`);
    }
    let json;
    try {
      json = JSON.parse(raw);
    } catch {
      throw new Error(`Resposta inesperada do Windsor.ai (${connector}): ${raw.slice(0, 300)}`);
    }
    const data = json.data ?? json;
    return Array.isArray(data) ? data : [];
  })();

  // Guarda a promessa (dedupe de chamadas simultâneas); some do cache se falhar.
  cacheWindsor.set(chave, { quando: Date.now(), promessa });
  promessa.catch(() => cacheWindsor.delete(chave));
  return promessa;
}

const num = (v) => {
  const n = Number(v);
  return Number.isNaN(n) ? 0 : n;
};

// Última contagem não-nula (followers/subscribers vêm só no snapshot de hoje).
function ultimoNaoNulo(linhas, campo) {
  for (let i = linhas.length - 1; i >= 0; i--) {
    const n = Number(linhas[i][campo]);
    if (!Number.isNaN(n) && n > 0) return n;
  }
  return null;
}

function serieViews(linhas) {
  const serie = linhas
    .filter((r) => r.date)
    .map((r) => ({ data: r.date, views: num(r.views) }))
    .sort((a, b) => (a.data < b.data ? -1 : 1));
  const melhorDia = serie.reduce((m, x) => (x.views > (m?.views ?? -1) ? x : m), null);
  return { serie: serie.slice(-30), melhorDia, total: serie.reduce((s, x) => s + x.views, 0) };
}

function corta(texto, n = 70) {
  if (!texto) return "";
  const t = String(texto).replace(/\s+/g, " ").trim();
  return t.length > n ? t.slice(0, n) + "…" : t;
}

// ---------- Dashboard: Instagram (engajamento + melhores posts) ----------
export async function dashboardInstagram() {
  const [diario, posts] = await Promise.all([
    windsorGet("instagram", {
      fields: "date,followers_count,reach,total_interactions,views",
      date_preset: "last_30d",
    }),
    windsorGet("instagram", {
      fields:
        "media_permalink,media_caption,media_type,media_like_count,media_comments_count,media_engagement,timestamp",
      date_preset: "last_90d",
    }).catch(() => []),
  ]);

  const { serie, melhorDia, total: totalViews } = serieViews(diario);
  const reachTotal = diario.reduce((s, r) => s + num(r.reach), 0);
  const interacoes = diario.reduce((s, r) => s + num(r.total_interactions), 0);
  const followers = ultimoNaoNulo(diario, "followers_count");
  const engajamento = reachTotal > 0 ? (interacoes / reachTotal) * 100 : null;

  const topPosts = posts
    .filter((p) => p.media_permalink)
    .map((p) => ({
      link: p.media_permalink,
      legenda: corta(p.media_caption),
      tipo: p.media_type || "POST",
      engajamento: num(p.media_engagement),
      likes: num(p.media_like_count),
      comentarios: num(p.media_comments_count),
    }))
    .sort((a, b) => b.engajamento - a.engajamento)
    .slice(0, 3);

  return { followers, totalViews, engajamento, reachTotal, interacoes, melhorDia, serie, topPosts };
}

// ---------- Dashboard: YouTube (inscritos + melhores vídeos) ----------
export async function dashboardYoutube() {
  const [canal, diario, videos] = await Promise.all([
    windsorGet("youtube", { fields: "subscriber_count,view_count,video_count" }).catch(() => []),
    windsorGet("youtube", { fields: "date,views", date_preset: "last_30d" }).catch(() => []),
    windsorGet("youtube", {
      fields: "video_title,video_view_count,video_like_count,videourl,published_at",
      date_preset: "last_2years",
    }).catch(() => []),
  ]);

  const { serie, melhorDia, total: totalViews } = serieViews(diario);
  const subscribers = ultimoNaoNulo(canal, "subscriber_count");
  const viewCount = ultimoNaoNulo(canal, "view_count");
  const videoCount = ultimoNaoNulo(canal, "video_count");

  const topVideos = videos
    .filter((v) => v.video_title)
    .map((v) => ({
      titulo: corta(v.video_title, 60),
      link: v.videourl,
      views: num(v.video_view_count),
      likes: num(v.video_like_count),
      publicado: v.published_at,
    }))
    .sort((a, b) => b.views - a.views)
    .slice(0, 3);

  return { subscribers, viewCount, videoCount, totalViews, melhorDia, serie, topVideos };
}

// ---------- Detalhe completo: Instagram ----------
export async function detalheInstagram() {
  const [diario, posts, paises, generos, idades] = await Promise.all([
    windsorGet("instagram", {
      fields:
        "date,followers_count,reach,total_interactions,views,likes,comments,shares,saves,follower_count",
      date_preset: "last_30d",
    }),
    windsorGet("instagram", {
      fields:
        "media_permalink,media_caption,media_type,media_like_count,media_comments_count,media_engagement,media_reach,media_saved,media_url,media_thumbnail_url,timestamp",
      date_preset: "last_90d",
    }).catch(() => []),
    windsorGet("instagram", {
      fields: "audience_country_name,audience_country_size",
    }).catch(() => []),
    windsorGet("instagram", {
      fields: "audience_gender_name,audience_gender_size",
    }).catch(() => []),
    windsorGet("instagram", {
      fields: "audience_age_name,audience_age_size",
    }).catch(() => []),
  ]);

  const soma = (campo) => diario.reduce((s, r) => s + num(r[campo]), 0);
  const serie = diario
    .filter((r) => r.date)
    .map((r) => ({
      data: r.date,
      views: num(r.views),
      reach: num(r.reach),
      interacoes: num(r.total_interactions),
      novosSeguidores: num(r.follower_count),
    }))
    .sort((a, b) => (a.data < b.data ? -1 : 1));

  const reachTotal = soma("reach");
  const interacoes = soma("total_interactions");

  const topPosts = posts
    .filter((p) => p.media_permalink)
    .map((p) => ({
      link: p.media_permalink,
      legenda: corta(p.media_caption, 90),
      tipo: p.media_type || "POST",
      imagem: p.media_thumbnail_url || p.media_url || null,
      engajamento: num(p.media_engagement),
      likes: num(p.media_like_count),
      comentarios: num(p.media_comments_count),
      alcance: num(p.media_reach),
      salvos: num(p.media_saved),
      quando: p.timestamp,
    }))
    .sort((a, b) => b.engajamento - a.engajamento)
    .slice(0, 9);

  const agrega = (linhas, nome, tamanho) => {
    const mapa = new Map();
    for (const r of linhas) {
      const k = r[nome];
      if (!k) continue;
      mapa.set(k, (mapa.get(k) ?? 0) + num(r[tamanho]));
    }
    return [...mapa.entries()]
      .map(([rotulo, total]) => ({ rotulo, total }))
      .sort((a, b) => b.total - a.total);
  };

  return {
    seguidores: ultimoNaoNulo(diario, "followers_count"),
    novosSeguidores30d: soma("follower_count"),
    viewsTotais: soma("views"),
    reachTotal,
    interacoes,
    engajamento: reachTotal > 0 ? (interacoes / reachTotal) * 100 : null,
    likes: soma("likes"),
    comentarios: soma("comments"),
    compartilhamentos: soma("shares"),
    salvos: soma("saves"),
    serie,
    topPosts,
    audiencia: {
      paises: agrega(paises, "audience_country_name", "audience_country_size").slice(0, 5),
      generos: agrega(generos, "audience_gender_name", "audience_gender_size"),
      idades: agrega(idades, "audience_age_name", "audience_age_size"),
    },
  };
}

// ---------- Detalhe completo: YouTube ----------
export async function detalheYoutube() {
  const [canal, diario, videos] = await Promise.all([
    windsorGet("youtube", { fields: "subscriber_count,view_count,video_count,comment_count" }).catch(
      () => [],
    ),
    windsorGet("youtube", {
      fields:
        "date,views,estimated_minutes_watched,likes,comments,shares,subscribers_gained,subscribers_lost",
      date_preset: "last_30d",
    }).catch(() => []),
    windsorGet("youtube", {
      fields:
        "video_title,video_view_count,video_like_count,video_comment_count,videourl,videoimage,published_at,video_length",
      date_preset: "last_2years",
    }).catch(() => []),
  ]);

  const soma = (campo) => diario.reduce((s, r) => s + num(r[campo]), 0);
  const serie = diario
    .filter((r) => r.date)
    .map((r) => ({
      data: r.date,
      views: num(r.views),
      minutos: num(r.estimated_minutes_watched),
    }))
    .sort((a, b) => (a.data < b.data ? -1 : 1));

  const topVideos = videos
    .filter((v) => v.video_title)
    .map((v) => ({
      titulo: corta(v.video_title, 80),
      link: v.videourl,
      imagem: v.videoimage || null,
      views: num(v.video_view_count),
      likes: num(v.video_like_count),
      comentarios: num(v.video_comment_count),
      duracao: v.video_length,
      publicado: v.published_at,
    }))
    .sort((a, b) => b.views - a.views)
    .slice(0, 9);

  return {
    inscritos: ultimoNaoNulo(canal, "subscriber_count"),
    viewsTotaisCanal: ultimoNaoNulo(canal, "view_count"),
    videosPublicados: ultimoNaoNulo(canal, "video_count"),
    comentariosCanal: ultimoNaoNulo(canal, "comment_count"),
    views30d: soma("views"),
    minutosAssistidos30d: soma("estimated_minutes_watched"),
    likes30d: soma("likes"),
    comentarios30d: soma("comments"),
    inscritosGanhos30d: soma("subscribers_gained"),
    inscritosPerdidos30d: soma("subscribers_lost"),
    serie,
    topVideos,
  };
}

// ---------- Anúncios (Meta Ads / Instagram Ads via conector "facebook") ----------
// O Windsor usa o mesmo conector "facebook" para anúncios do Facebook e do
// Instagram (é a mesma conta de anúncios da Meta). Se a conta ainda não foi
// ligada no Windsor, a API responde 400 com "No facebook account…"; tratamos
// isso como "não conectado" (o painel mostra o passo de conectar).
const MOEDA_SIMBOLO = { BRL: "R$", USD: "US$", EUR: "€", GBP: "£" };

function adsNaoConectado(err) {
  return /No .*account for user|add your accounts|datasource=facebook/i.test(
    String(err?.message ?? err),
  );
}

// Agrega linhas (uma por campanha, possivelmente por dia) somando por campanha.
function agregarCampanhas(linhas) {
  const mapa = new Map();
  for (const r of linhas) {
    const nome = r.campaign || r.campaign_name || "(sem nome)";
    const cur = mapa.get(nome) ?? {
      campanha: nome,
      gasto: 0,
      impressoes: 0,
      cliques: 0,
      alcance: 0,
    };
    cur.gasto += num(r.spend);
    cur.impressoes += num(r.impressions);
    cur.cliques += num(r.clicks);
    cur.alcance += num(r.reach);
    mapa.set(nome, cur);
  }
  return [...mapa.values()]
    .map((c) => ({
      ...c,
      ctr: c.impressoes > 0 ? (c.cliques / c.impressoes) * 100 : null,
      cpc: c.cliques > 0 ? c.gasto / c.cliques : null,
    }))
    .sort((a, b) => b.gasto - a.gasto);
}

// Card compacto: investimento + entrega dos últimos 30 dias.
export async function dashboardAnuncios() {
  let diario, moedaLinhas;
  try {
    [diario, moedaLinhas] = await Promise.all([
      windsorGet("facebook", {
        fields: "date,spend,impressions,clicks,reach",
        date_preset: "last_30d",
      }),
      windsorGet("facebook", { fields: "account_currency" }).catch(() => []),
    ]);
  } catch (err) {
    if (adsNaoConectado(err)) return { conectado: false };
    throw err;
  }

  const soma = (c) => diario.reduce((s, r) => s + num(r[c]), 0);
  const gasto = soma("spend");
  const impressoes = soma("impressions");
  const cliques = soma("clicks");
  const alcance = soma("reach");
  const moeda =
    moedaLinhas.find((r) => r.account_currency)?.account_currency ?? "BRL";

  const serie = diario
    .filter((r) => r.date)
    .map((r) => ({
      data: r.date,
      spend: num(r.spend),
      clicks: num(r.clicks),
      views: num(r.impressions),
    }))
    .sort((a, b) => (a.data < b.data ? -1 : 1))
    .slice(-30);

  return {
    conectado: true,
    moeda,
    gasto,
    impressoes,
    cliques,
    alcance,
    ctr: impressoes > 0 ? (cliques / impressoes) * 100 : null,
    cpc: cliques > 0 ? gasto / cliques : null,
    serie,
  };
}

// Detalhe completo: KPIs + série de gasto/cliques + campanhas por investimento.
export async function detalheAnuncios() {
  let diario, campanhas, moedaLinhas;
  try {
    [diario, campanhas, moedaLinhas] = await Promise.all([
      windsorGet("facebook", {
        fields: "date,spend,impressions,clicks,reach",
        date_preset: "last_30d",
      }),
      windsorGet("facebook", {
        fields: "campaign,spend,impressions,clicks,reach",
        date_preset: "last_30d",
      }).catch(() => []),
      windsorGet("facebook", { fields: "account_currency" }).catch(() => []),
    ]);
  } catch (err) {
    if (adsNaoConectado(err)) return { conectado: false };
    throw err;
  }

  const soma = (c) => diario.reduce((s, r) => s + num(r[c]), 0);
  const gasto = soma("spend");
  const impressoes = soma("impressions");
  const cliques = soma("clicks");
  const alcance = soma("reach");
  const moeda =
    moedaLinhas.find((r) => r.account_currency)?.account_currency ?? "BRL";

  const serie = diario
    .filter((r) => r.date)
    .map((r) => ({
      data: r.date,
      spend: num(r.spend),
      clicks: num(r.clicks),
      views: num(r.impressions),
      reach: num(r.reach),
    }))
    .sort((a, b) => (a.data < b.data ? -1 : 1));

  return {
    conectado: true,
    moeda,
    gasto,
    impressoes,
    cliques,
    alcance,
    ctr: impressoes > 0 ? (cliques / impressoes) * 100 : null,
    cpc: cliques > 0 ? gasto / cliques : null,
    cpm: impressoes > 0 ? (gasto / impressoes) * 1000 : null,
    frequencia: alcance > 0 ? impressoes / alcance : null,
    serie,
    campanhas: agregarCampanhas(campanhas).slice(0, 8),
    simboloMoeda: MOEDA_SIMBOLO[moeda] ?? moeda + " ",
  };
}

// ---------- Ferramenta de chat (o assistente conversa sobre métricas) ----------
export async function metricasSociais({ plataforma = null, periodo = "last_30d" } = {}) {
  const alvo = plataforma?.toLowerCase();
  const querIG = !alvo || alvo === "instagram";
  const querYT = !alvo || alvo === "youtube";

  // Tudo em paralelo: pedir "como estão minhas redes" não deve custar
  // uma chamada de rede atrás da outra.
  const [igLinhas, ytCanal, ytDiario] = await Promise.all([
    querIG
      ? windsorGet("instagram", {
          fields:
            "date,followers_count,reach,total_interactions,views,likes,comments,shares,saves",
          date_preset: periodo,
        }).catch(() => [])
      : Promise.resolve(null),
    querYT
      ? windsorGet("youtube", { fields: "subscriber_count,view_count,video_count" }).catch(
          () => [],
        )
      : Promise.resolve(null),
    querYT
      ? windsorGet("youtube", { fields: "date,views", date_preset: periodo }).catch(() => [])
      : Promise.resolve(null),
  ]);

  const out = {};

  if (querIG && igLinhas) {
    const { serie, melhorDia, total } = serieViews(igLinhas);
    const reach = igLinhas.reduce((s, r) => s + num(r.reach), 0);
    const interacoes = igLinhas.reduce((s, r) => s + num(r.total_interactions), 0);
    out.instagram = {
      seguidores: ultimoNaoNulo(igLinhas, "followers_count"),
      viewsTotais: total,
      alcanceTotal: reach,
      interacoesTotais: interacoes,
      taxaEngajamento: reach > 0 ? Number(((interacoes / reach) * 100).toFixed(2)) : null,
      melhorDia,
      // Só os últimos 7 dias: o assistente responde por voz e raramente precisa
      // da série inteira — mandar 30 linhas só engorda o prompt e atrasa a fala.
      ultimos7Dias: serie.slice(-7),
    };
  }

  if (querYT && ytDiario) {
    const { serie, melhorDia, total } = serieViews(ytDiario);
    out.youtube = {
      inscritos: ultimoNaoNulo(ytCanal ?? [], "subscriber_count"),
      viewsTotaisCanal: ultimoNaoNulo(ytCanal ?? [], "view_count"),
      videosPublicados: ultimoNaoNulo(ytCanal ?? [], "video_count"),
      viewsPeriodo: total,
      melhorDia,
      // Só os últimos 7 dias: o assistente responde por voz e raramente precisa
      // da série inteira — mandar 30 linhas só engorda o prompt e atrasa a fala.
      ultimos7Dias: serie.slice(-7),
    };
  }

  return { periodo, ...out };
}
