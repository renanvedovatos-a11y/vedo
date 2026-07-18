import { useEffect, useState } from "react";
import type { AssistantStatus } from "../hooks/useVoiceAssistant";
import { VoiceOrb } from "./VoiceOrb";

/* ---------- tipos ---------- */
interface SeriePonto {
  data: string;
  views: number;
  reach?: number;
  interacoes?: number;
  minutos?: number;
  spend?: number;
  clicks?: number;
}
interface TopPost {
  link: string;
  legenda: string;
  tipo: string;
  imagem?: string | null;
  engajamento: number;
  likes: number;
  comentarios: number;
  alcance?: number;
  salvos?: number;
  quando?: string;
}
interface TopVideo {
  titulo: string;
  link: string;
  imagem?: string | null;
  views: number;
  likes: number;
  comentarios?: number;
  publicado?: string;
}
interface InstagramResumo {
  followers: number | null;
  totalViews: number;
  engajamento: number | null;
  melhorDia: SeriePonto | null;
  serie: SeriePonto[];
  topPosts: TopPost[];
}
interface YoutubeResumo {
  subscribers: number | null;
  viewCount: number | null;
  videoCount: number | null;
  totalViews: number;
  serie: SeriePonto[];
  topVideos: TopVideo[];
}
interface AnunciosResumo {
  conectado: boolean;
  erro?: string;
  moeda?: string;
  gasto: number;
  impressoes: number;
  cliques: number;
  alcance: number;
  ctr: number | null;
  cpc: number | null;
  serie: SeriePonto[];
}
interface SocialData {
  configured: boolean;
  error?: string;
  instagram?: InstagramResumo;
  youtube?: YoutubeResumo;
  anuncios?: AnunciosResumo;
}

/* ---------- utilitários ---------- */
export function fmt(n: number | null | undefined): string {
  if (n == null) return "—";
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
  if (n >= 10_000) return (n / 1_000).toFixed(1).replace(".0", "") + "k";
  if (n >= 1_000) return (n / 1_000).toFixed(2).replace(/\.?0+$/, "") + "k";
  return String(Math.round(n));
}

const SIMBOLO_MOEDA: Record<string, string> = {
  BRL: "R$",
  USD: "US$",
  EUR: "€",
  GBP: "£",
};

// Dinheiro: R$ 1,2 mil / R$ 12,3 mil para caber no card; valor cheio no detalhe.
export function fmtMoeda(
  n: number | null | undefined,
  moeda = "BRL",
  compacto = true,
): string {
  const s = SIMBOLO_MOEDA[moeda] ?? moeda + " ";
  if (n == null) return "—";
  if (compacto && n >= 1000) {
    if (n >= 1_000_000) return `${s} ${(n / 1_000_000).toFixed(1)}M`;
    return `${s} ${(n / 1000).toFixed(1).replace(".0", "")} mil`;
  }
  return `${s} ${n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function dataCurta(iso?: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso.slice(5, 10);
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "short" });
}

/* ---------- sparkline (área com gradiente) ---------- */
export function Spark({
  serie,
  campo = "views",
  cor,
  className = "spark",
}: {
  serie: SeriePonto[];
  campo?: keyof SeriePonto;
  cor: string;
  className?: string;
}) {
  const pontos = (serie ?? []).map((p) => Number(p[campo]) || 0);
  if (pontos.length < 2) return <div className="spark-empty">coletando série…</div>;
  const W = 300;
  const H = 60;
  const max = Math.max(...pontos, 1);
  const step = W / (pontos.length - 1);
  const coords = pontos.map(
    (v, i) => [i * step, H - 4 - (v / max) * (H - 8)] as const,
  );
  const line = coords.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const gid = `g${cor.replace(/[^a-z0-9]/gi, "")}${String(campo)}`;
  return (
    <svg className={className} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none">
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={cor} stopOpacity="0.35" />
          <stop offset="100%" stopColor={cor} stopOpacity="0" />
        </linearGradient>
      </defs>
      <polygon points={`0,${H} ${line} ${W},${H}`} fill={`url(#${gid})`} />
      <polyline points={line} fill="none" stroke={cor} strokeWidth="1.6" />
      <circle
        cx={coords[coords.length - 1][0]}
        cy={coords[coords.length - 1][1]}
        r="2.6"
        fill={cor}
      />
    </svg>
  );
}

/* ---------- dados sociais compartilhados ---------- */
export function useSocial(): SocialData | null {
  const [data, setData] = useState<SocialData | null>(null);
  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const res = await fetch("/api/dashboard/social");
        const json = await res.json();
        if (alive) setData(json);
      } catch {
        /* mantém */
      }
    };
    void load();
    const id = setInterval(load, 60000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, []);
  return data;
}

/* ---------- heróis ---------- */
export function HeroInstagram({
  data,
  onOpen,
}: {
  data: SocialData | null;
  onOpen: () => void;
}) {
  const ig = data?.instagram;
  return (
    <div className="cell hero hero-ig" onClick={onOpen} role="button" tabIndex={0}
      onKeyDown={(e) => e.key === "Enter" && onOpen()}>
      <span className="expand">⤢</span>
      <div className="hero-head">
        <span className="badge badge-ig" />
        @renanvedovato
      </div>
      {!data ? (
        <div className="spark-empty">carregando…</div>
      ) : data.error || !ig ? (
        <div className="spark-empty">{data.error ?? "Conecte o Windsor.ai no .env"}</div>
      ) : (
        <>
          <div className="hero-num">{fmt(ig.followers)}</div>
          <div className="mlabel">seguidores</div>
          <div className="hero-three">
            <div>
              <div className="n">{ig.engajamento == null ? "—" : ig.engajamento.toFixed(1) + "%"}</div>
              <div className="mlabel">engajamento</div>
            </div>
            <div>
              <div className="n">{fmt(ig.totalViews)}</div>
              <div className="mlabel">views 30d</div>
            </div>
            <div>
              <div className="n">{fmt(ig.melhorDia?.views)}</div>
              <div className="mlabel">pico {dataCurta(ig.melhorDia?.data)}</div>
            </div>
          </div>
          <Spark serie={ig.serie} cor="#ff3d77" />
        </>
      )}
    </div>
  );
}

export function HeroYoutube({
  data,
  onOpen,
}: {
  data: SocialData | null;
  onOpen: () => void;
}) {
  const yt = data?.youtube;
  return (
    <div className="cell hero hero-yt" onClick={onOpen} role="button" tabIndex={0}
      onKeyDown={(e) => e.key === "Enter" && onOpen()}>
      <span className="expand">⤢</span>
      <div className="hero-head">
        <span className="badge badge-yt" />
        Renan Vedovato
      </div>
      {!data ? (
        <div className="spark-empty">carregando…</div>
      ) : data.error || !yt ? (
        <div className="spark-empty">{data.error ?? "Conecte o Windsor.ai no .env"}</div>
      ) : (
        <>
          <div className="hero-num">{fmt(yt.subscribers)}</div>
          <div className="mlabel">inscritos</div>
          <div className="hero-three">
            <div>
              <div className="n">{fmt(yt.totalViews)}</div>
              <div className="mlabel">views 30d</div>
            </div>
            <div>
              <div className="n">{fmt(yt.viewCount)}</div>
              <div className="mlabel">views canal</div>
            </div>
            <div>
              <div className="n">{fmt(yt.videoCount)}</div>
              <div className="mlabel">vídeos</div>
            </div>
          </div>
          <Spark serie={yt.serie} cor="#ff5252" />
        </>
      )}
    </div>
  );
}

export function HeroAnuncios({
  data,
  onOpen,
}: {
  data: SocialData | null;
  onOpen: () => void;
}) {
  const ad = data?.anuncios;
  const moeda = ad?.moeda ?? "BRL";
  return (
    <div className="cell hero hero-ads" onClick={onOpen} role="button" tabIndex={0}
      onKeyDown={(e) => e.key === "Enter" && onOpen()}>
      <span className="expand">⤢</span>
      <div className="hero-head">
        <span className="badge badge-ads" />
        Anúncios · Meta
      </div>
      {!data ? (
        <div className="spark-empty">carregando…</div>
      ) : data.error || !ad ? (
        <div className="spark-empty">{data.error ?? "Conecte o Windsor.ai no .env"}</div>
      ) : ad.erro ? (
        <div className="spark-empty">{ad.erro}</div>
      ) : !ad.conectado ? (
        <div className="spark-empty">
          Conecte sua conta de anúncios da Meta no Windsor.ai para ver os números aqui.
        </div>
      ) : (
        <>
          <div className="hero-num">{fmtMoeda(ad.gasto, moeda)}</div>
          <div className="mlabel">investido · 30d</div>
          <div className="hero-three">
            <div>
              <div className="n">{fmt(ad.alcance)}</div>
              <div className="mlabel">alcance</div>
            </div>
            <div>
              <div className="n">{fmt(ad.cliques)}</div>
              <div className="mlabel">cliques</div>
            </div>
            <div>
              <div className="n">{ad.ctr == null ? "—" : ad.ctr.toFixed(2) + "%"}</div>
              <div className="mlabel">CTR</div>
            </div>
          </div>
          <Spark serie={ad.serie} campo="spend" cor="#4a9eff" />
        </>
      )}
    </div>
  );
}

/* ---------- célula de voz ---------- */
const STATUS_TXT: Record<AssistantStatus, string> = {
  idle: "Toque para falar",
  listening: "Ouvindo…",
  processing: "Pensando…",
  speaking: "Falando…",
};

export function VoiceCell({
  status,
  onMicToggle,
  voices,
  voiceURI,
  setVoice,
  testVoice,
  wakeAtivo,
  setWakeAtivo,
}: {
  status: AssistantStatus;
  onMicToggle: () => void;
  voices: SpeechSynthesisVoice[];
  voiceURI: string;
  setVoice: (uri: string) => void;
  testVoice: () => void;
  wakeAtivo: boolean;
  setWakeAtivo: (on: boolean) => void;
}) {
  const statusTxt =
    status === "idle" && wakeAtivo ? "Diga “Olá VEDO” ou toque" : STATUS_TXT[status];
  return (
    <div className="cell voice-cell">
      <VoiceOrb status={status} size={150} onClick={onMicToggle} title={statusTxt} />
      <div className="vc-status">{statusTxt}</div>
      <div className="vc-controls">
        <select
          className="voice-select"
          value={voiceURI}
          onChange={(e) => setVoice(e.target.value)}
        >
          {voices.length === 0 && <option value="">sem voz pt detectada</option>}
          {voices.map((v) => (
            <option key={v.voiceURI} value={v.voiceURI}>
              {v.name.replace(/^Microsoft\s+/, "").replace(/\s+-\s+Portuguese.*$/i, "")} ({v.lang})
            </option>
          ))}
        </select>
        <button className="voice-test" onClick={testVoice} disabled={status === "speaking"} title="Testar voz">
          ▶
        </button>
      </div>
      <label className="wake-toggle" title="Com isso ligado, basta dizer “Olá VEDO” com a página aberta">
        <input
          type="checkbox"
          checked={wakeAtivo}
          onChange={(e) => setWakeAtivo(e.target.checked)}
        />
        <span className="wake-track"><i /></span>
        Ativar dizendo “Olá VEDO”
      </label>
    </div>
  );
}

/* ---------- agenda ---------- */
interface Evento {
  id: string;
  titulo: string;
  inicio: string;
  fim?: string;
  local?: string | null;
  meet: string | null;
}
interface AgendaData {
  connected: boolean;
  error?: string;
  eventos?: Evento[];
}

function isoLocal(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function diaDoEvento(e: Evento): string {
  const d = new Date(e.inicio);
  return Number.isNaN(d.getTime()) ? e.inicio.slice(0, 10) : isoLocal(d);
}

function horaDoEvento(e: Evento): string {
  const d = new Date(e.inicio);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

const MESES = [
  "janeiro", "fevereiro", "março", "abril", "maio", "junho",
  "julho", "agosto", "setembro", "outubro", "novembro", "dezembro",
];
const DOW = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];

// Busca eventos de um intervalo explícito (para pintar o calendário do mês).
function useAgendaIntervalo(deISO: string | null, ateISO: string | null): AgendaData | null {
  const [data, setData] = useState<AgendaData | null>(null);
  useEffect(() => {
    if (!deISO || !ateISO) return;
    let alive = true;
    const load = async () => {
      try {
        const res = await fetch(
          `/api/dashboard/agenda?de=${encodeURIComponent(deISO)}&ate=${encodeURIComponent(ateISO)}`,
        );
        const json = await res.json();
        if (alive) setData(json);
      } catch {
        /* mantém */
      }
    };
    void load();
    const id = setInterval(load, 60000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [deISO, ateISO]);
  return data;
}

// Agrupa eventos por dia (YYYY-MM-DD).
function agruparPorDia(eventos: Evento[] | undefined): Map<string, Evento[]> {
  const m = new Map<string, Evento[]>();
  for (const e of eventos ?? []) {
    const dia = diaDoEvento(e);
    if (!m.has(dia)) m.set(dia, []);
    m.get(dia)!.push(e);
  }
  return m;
}

// Grade de 6 semanas (Dom–Sáb) que contém o mês inteiro, como no Google Agenda.
function gradeDoMes(ano: number, mes: number): Date[] {
  const primeiro = new Date(ano, mes, 1);
  const inicio = new Date(ano, mes, 1 - primeiro.getDay());
  return Array.from({ length: 42 }, (_, i) => {
    const d = new Date(inicio);
    d.setDate(inicio.getDate() + i);
    return d;
  });
}

// Card compacto: mini-calendário do mês. Clicar num DIA abre o detalhe do dia;
// clicar no card (fora dos dias) abre o mês inteiro.
export function AgendaCell({
  onOpen,
  onOpenDia,
}: {
  onOpen: () => void;
  onOpenDia: (iso: string) => void;
}) {
  const hoje = new Date();
  const ano = hoje.getFullYear();
  const mes = hoje.getMonth();
  const de = new Date(ano, mes, 1).toISOString();
  const ate = new Date(ano, mes + 1, 0, 23, 59, 59).toISOString();
  const data = useAgendaIntervalo(de, ate);
  const porDia = agruparPorDia(data?.eventos);
  const hojeIso = isoLocal(hoje);
  const dias = gradeDoMes(ano, mes);
  const proximos = (data?.eventos ?? [])
    .filter((e) => new Date(e.inicio) >= new Date(Date.now() - 3600000))
    .slice(0, 1);

  return (
    <div className="cell agenda-cell hero" onClick={onOpen} role="button" tabIndex={0}
      onKeyDown={(e) => e.key === "Enter" && onOpen()}>
      <span className="expand">⤢</span>
      <div className="cell-title">
        <span>{MESES[mes]} {ano}</span>
      </div>
      {data && !data.connected ? (
        <div className="spark-empty">Google não conectado.</div>
      ) : data?.error ? (
        <div className="spark-empty">{data.error}</div>
      ) : (
        <>
          <div className="minical">
            {DOW.map((d) => (
              <span className="minical-dow" key={d}>{d[0]}</span>
            ))}
            {dias.map((d, i) => {
              const iso = isoLocal(d);
              const foraDoMes = d.getMonth() !== mes;
              const temEvento = porDia.has(iso);
              return (
                <button
                  type="button"
                  key={i}
                  className={`minical-dia${foraDoMes ? " fora" : ""}${iso === hojeIso ? " hoje" : ""}`}
                  onClick={(ev) => {
                    ev.stopPropagation(); // não deixa o clique abrir o mês inteiro
                    onOpenDia(iso);
                  }}
                >
                  {d.getDate()}
                  {temEvento && !foraDoMes && <i className="minical-dot" />}
                </button>
              );
            })}
          </div>
          <div className="minical-prox">
            {proximos.length === 0 ? (
              "Sem próximos compromissos."
            ) : (
              <>
                <b>{horaDoEvento(proximos[0])}</b> {proximos[0].titulo}
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
}

// Modal de UM dia: compromissos (agenda) + tarefas daquele dia, com checkbox.
export function DiaModal({ iso, onClose }: { iso: string; onClose: () => void }) {
  const dIni = `${iso}T00:00:00`;
  const dFim = `${iso}T23:59:59`;
  const agenda = useAgendaIntervalo(
    new Date(dIni).toISOString(),
    new Date(dFim).toISOString(),
  );
  const [tarefas, setTarefas] = useState<Task[] | null>(null);

  const carregarTarefas = async () => {
    try {
      const res = await fetch(`/api/tasks?de=${iso}&ate=${iso}`);
      const json = await res.json();
      setTarefas(json.tarefas ?? []);
    } catch {
      /* mantém */
    }
  };
  useEffect(() => {
    void carregarTarefas();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [iso]);

  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [onClose]);

  const alternar = async (t: Task) => {
    setTarefas((prev) => prev?.map((x) => (x.id === t.id ? { ...x, feita: !x.feita } : x)) ?? null);
    await fetch(`/api/tasks/${t.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ feita: !t.feita }),
    });
    void carregarTarefas();
  };

  const eventos = agenda?.eventos ?? [];
  const titulo = new Date(`${iso}T12:00:00`).toLocaleDateString("pt-BR", {
    weekday: "long",
    day: "2-digit",
    month: "long",
  });

  return (
    <div className="overlay" onClick={onClose}>
      <div className="detail detail-dia" onClick={(e) => e.stopPropagation()}>
        <div className="detail-head">
          <h2>{titulo.charAt(0).toUpperCase() + titulo.slice(1)}</h2>
          <button className="detail-close" onClick={onClose}>✕</button>
        </div>

        <div className="detail-section">Compromissos</div>
        {!agenda ? (
          <div className="spark-empty">Carregando…</div>
        ) : eventos.length === 0 ? (
          <div className="spark-empty">Nenhum compromisso neste dia.</div>
        ) : (
          eventos.map((e) => (
            <div className="agenda-item" key={e.id}>
              <span className="agenda-when">{horaDoEvento(e)}</span>
              <span className="agenda-title">
                {e.titulo}
                {e.local && <span className="agenda-loc"> · {e.local}</span>}
                {e.meet && (
                  <a className="agenda-meet" href={e.meet} target="_blank" rel="noreferrer">
                    Meet
                  </a>
                )}
              </span>
            </div>
          ))
        )}

        <div className="detail-section">Tarefas</div>
        {tarefas === null ? (
          <div className="spark-empty">Carregando…</div>
        ) : tarefas.length === 0 ? (
          <div className="spark-empty">Nenhuma tarefa neste dia.</div>
        ) : (
          tarefas.map((t) => (
            <div className={`task ${t.feita ? "done" : ""}`} key={t.id}>
              <button className="task-check" onClick={() => alternar(t)}>
                {t.feita ? "✓" : ""}
              </button>
              <span className="task-text" onClick={() => alternar(t)}>
                {t.hora && <span className="task-hora">{t.hora}</span>}
                {t.texto}
                {t.autoConcluida && <span className="task-auto">⏱</span>}
              </span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

// Modal: calendário mensal completo, navegável, estilo Google Agenda.
export function AgendaModal({ onClose }: { onClose: () => void }) {
  const hoje = new Date();
  const [ano, setAno] = useState(hoje.getFullYear());
  const [mes, setMes] = useState(hoje.getMonth());

  const de = new Date(ano, mes, 1).toISOString();
  const ate = new Date(ano, mes + 1, 0, 23, 59, 59).toISOString();
  const data = useAgendaIntervalo(de, ate);
  const porDia = agruparPorDia(data?.eventos);
  const hojeIso = isoLocal(hoje);
  const dias = gradeDoMes(ano, mes);

  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [onClose]);

  const navegar = (delta: number) => {
    const d = new Date(ano, mes + delta, 1);
    setAno(d.getFullYear());
    setMes(d.getMonth());
  };
  const irHoje = () => {
    setAno(hoje.getFullYear());
    setMes(hoje.getMonth());
  };

  return (
    <div className="overlay" onClick={onClose}>
      <div className="detail detail-cal" onClick={(e) => e.stopPropagation()}>
        <div className="detail-head">
          <h2>{MESES[mes].charAt(0).toUpperCase() + MESES[mes].slice(1)} {ano}</h2>
          <div className="cal-nav">
            <button onClick={() => navegar(-1)}>‹</button>
            <button onClick={irHoje}>hoje</button>
            <button onClick={() => navegar(1)}>›</button>
          </div>
          <button className="detail-close" onClick={onClose}>✕</button>
        </div>

        {data && !data.connected ? (
          <div className="spark-empty">Google não conectado.</div>
        ) : data?.error ? (
          <div className="spark-empty">{data.error}</div>
        ) : (
          <div className="cal-grid">
            {DOW.map((d) => (
              <div className="cal-dow" key={d}>{d}</div>
            ))}
            {dias.map((d, i) => {
              const iso = isoLocal(d);
              const foraDoMes = d.getMonth() !== mes;
              const eventos = porDia.get(iso) ?? [];
              return (
                <div className={`cal-cel${foraDoMes ? " fora" : ""}`} key={i}>
                  <div className={`cal-num${iso === hojeIso ? " hoje" : ""}`}>{d.getDate()}</div>
                  <div className="cal-eventos">
                    {eventos.slice(0, 3).map((e) => (
                      <a
                        className="cal-chip"
                        key={e.id}
                        href={e.meet ?? undefined}
                        target={e.meet ? "_blank" : undefined}
                        rel="noreferrer"
                        title={`${horaDoEvento(e)} ${e.titulo}`}
                      >
                        <b>{horaDoEvento(e)}</b> {e.titulo}
                      </a>
                    ))}
                    {eventos.length > 3 && (
                      <span className="cal-mais">+{eventos.length - 3} mais</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
        {!data && <div className="detail-loading">Carregando calendário…</div>}
      </div>
    </div>
  );
}

/* ---------- e-mails ---------- */
interface Email {
  id: string;
  de: string;
  assunto: string;
  data: string;
  resumo: string;
  naoLido: boolean;
}
interface EmailData {
  connected: boolean;
  error?: string;
  total?: number;
  emails?: Email[];
}

// "Fulano <fulano@x.com>" -> "Fulano". Sem nome, usa o começo do e-mail.
function nomeRemetente(de: string): string {
  if (!de) return "—";
  const m = de.match(/^\s*"?([^"<]+?)"?\s*</);
  if (m) return m[1].trim();
  const semColchete = de.replace(/[<>]/g, "").trim();
  return semColchete.split("@")[0] || semColchete;
}

function useEmails(query: string, max: number): EmailData | null {
  const [data, setData] = useState<EmailData | null>(null);
  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const res = await fetch(
          `/api/dashboard/emails?query=${encodeURIComponent(query)}&max=${max}`,
        );
        const json = await res.json();
        if (alive) setData(json);
      } catch {
        /* mantém */
      }
    };
    void load();
    const id = setInterval(load, 120000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [query, max]);
  return data;
}

// Card compacto: os não lidos, resumidos. Clique abre a caixa completa.
export function EmailsCell({ onOpen }: { onOpen: () => void }) {
  const data = useEmails("is:unread", 6);

  return (
    <div className="cell emails-cell hero" onClick={onOpen} role="button" tabIndex={0}
      onKeyDown={(e) => e.key === "Enter" && onOpen()}>
      <span className="expand">⤢</span>
      <div className="cell-title">
        <span>E-mails · não lidos</span>
        <span>{data?.emails ? `${data.emails.length}${data.emails.length === 6 ? "+" : ""}` : ""}</span>
      </div>
      {data && !data.connected ? (
        <div className="spark-empty">Google não conectado.</div>
      ) : data?.error ? (
        <div className="spark-empty">{data.error}</div>
      ) : !data ? (
        <div className="spark-empty">Carregando…</div>
      ) : data.emails?.length === 0 ? (
        <div className="spark-empty">Caixa em dia. Nenhum não lido.</div>
      ) : (
        data.emails?.map((e) => (
          <div className="email-item" key={e.id}>
            <span className="email-de">{nomeRemetente(e.de)}</span>
            <span className="email-assunto">{e.assunto || "(sem assunto)"}</span>
          </div>
        ))
      )}
    </div>
  );
}

// Modal: caixa completa (não lidos + recentes), com remetente, assunto e prévia.
export function EmailsModal({ onClose }: { onClose: () => void }) {
  const [somenteNaoLidos, setSomenteNaoLidos] = useState(true);
  const data = useEmails(somenteNaoLidos ? "is:unread" : "in:inbox", 25);

  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [onClose]);

  return (
    <div className="overlay" onClick={onClose}>
      <div className="detail" onClick={(e) => e.stopPropagation()}>
        <div className="detail-head">
          <h2>Caixa de entrada</h2>
          <button className="detail-close" onClick={onClose}>✕</button>
        </div>
        <div className="email-filtros">
          <button
            className={somenteNaoLidos ? "on" : ""}
            onClick={() => setSomenteNaoLidos(true)}
          >
            Não lidos
          </button>
          <button
            className={!somenteNaoLidos ? "on" : ""}
            onClick={() => setSomenteNaoLidos(false)}
          >
            Recentes
          </button>
        </div>
        {!data ? (
          <div className="detail-loading">Carregando e-mails…</div>
        ) : !data.connected ? (
          <div className="spark-empty">Google não conectado.</div>
        ) : data.error ? (
          <div className="spark-empty">{data.error}</div>
        ) : data.emails?.length === 0 ? (
          <div className="spark-empty">Nada por aqui.</div>
        ) : (
          <div className="email-list">
            {data.emails?.map((e) => (
              <a
                className={`email-full ${e.naoLido ? "unread" : ""}`}
                key={e.id}
                href={`https://mail.google.com/mail/u/0/#all/${e.id}`}
                target="_blank"
                rel="noreferrer"
              >
                <div className="email-full-top">
                  <span className="email-full-de">{nomeRemetente(e.de)}</span>
                  <span className="email-full-data">
                    {new Date(e.data).toLocaleDateString("pt-BR", {
                      day: "2-digit",
                      month: "2-digit",
                    })}
                  </span>
                </div>
                <div className="email-full-assunto">{e.assunto || "(sem assunto)"}</div>
                <div className="email-full-resumo">{e.resumo}</div>
              </a>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/* ---------- tarefas de hoje (compacta) ---------- */
interface Task {
  id: string;
  texto: string;
  data: string;
  hora: string | null;
  feita: boolean;
  autoConcluida?: boolean;
}

export function TasksTodayCell({ onOpen }: { onOpen: () => void }) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const hoje = isoLocal(new Date());

  const carregar = async () => {
    try {
      const res = await fetch(`/api/tasks?de=${hoje}&ate=${hoje}`);
      const json = await res.json();
      setTasks(json.tarefas ?? []);
    } catch {
      /* mantém */
    }
  };

  useEffect(() => {
    void carregar();
    const id = setInterval(carregar, 6000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hoje]);

  const alternar = async (t: Task, ev: React.MouseEvent) => {
    ev.stopPropagation();
    setTasks((prev) => prev.map((x) => (x.id === t.id ? { ...x, feita: !x.feita } : x)));
    await fetch(`/api/tasks/${t.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ feita: !t.feita }),
    });
    void carregar();
  };

  const pendentes = tasks.filter((t) => !t.feita).length;

  return (
    <div className="cell tasks-today hero" onClick={onOpen} role="button" tabIndex={0}
      onKeyDown={(e) => e.key === "Enter" && onOpen()}>
      <span className="expand">⤢</span>
      <div className="cell-title">
        <span>Tarefas · hoje</span>
        <span>{tasks.length === 0 ? "" : `${pendentes} pendente${pendentes === 1 ? "" : "s"}`}</span>
      </div>
      {tasks.length === 0 ? (
        <div className="spark-empty">Nada por hoje. Clique para planejar a semana.</div>
      ) : (
        tasks.map((t) => (
          <div className={`task ${t.feita ? "done" : ""}`} key={t.id}>
            <button className="task-check" onClick={(ev) => alternar(t, ev)}>
              {t.feita ? "✓" : ""}
            </button>
            <span className="task-text">
              {t.hora && <span className="task-hora">{t.hora}</span>}
              {t.texto}
              {t.autoConcluida && <span className="task-auto">⏱</span>}
            </span>
          </div>
        ))
      )}
    </div>
  );
}

/* ---------- modal de detalhe ---------- */
interface DetalheIG {
  seguidores: number | null;
  novosSeguidores30d: number;
  viewsTotais: number;
  reachTotal: number;
  interacoes: number;
  engajamento: number | null;
  likes: number;
  comentarios: number;
  compartilhamentos: number;
  salvos: number;
  serie: SeriePonto[];
  topPosts: TopPost[];
  audiencia: {
    paises: { rotulo: string; total: number }[];
    generos: { rotulo: string; total: number }[];
    idades: { rotulo: string; total: number }[];
  };
}
interface DetalheYT {
  inscritos: number | null;
  viewsTotaisCanal: number | null;
  videosPublicados: number | null;
  views30d: number;
  minutosAssistidos30d: number;
  likes30d: number;
  comentarios30d: number;
  inscritosGanhos30d: number;
  inscritosPerdidos30d: number;
  serie: SeriePonto[];
  topVideos: TopVideo[];
}
interface Campanha {
  campanha: string;
  gasto: number;
  impressoes: number;
  cliques: number;
  alcance: number;
  ctr: number | null;
  cpc: number | null;
}
interface DetalheADS {
  conectado: boolean;
  moeda: string;
  gasto: number;
  impressoes: number;
  cliques: number;
  alcance: number;
  ctr: number | null;
  cpc: number | null;
  cpm: number | null;
  frequencia: number | null;
  serie: SeriePonto[];
  campanhas: Campanha[];
}

function Thumb({ src, fallback }: { src?: string | null; fallback: string }) {
  const [broken, setBroken] = useState(false);
  if (!src || broken) {
    return <div className="media-thumb placeholder">{fallback}</div>;
  }
  return (
    <img className="media-thumb" src={src} alt="" loading="lazy" onError={() => setBroken(true)} />
  );
}

function AudBars({ itens }: { itens: { rotulo: string; total: number }[] }) {
  if (!itens?.length) return <div className="spark-empty">sem dados</div>;
  const max = Math.max(...itens.map((i) => i.total), 1);
  return (
    <>
      {itens.map((i) => (
        <div className="aud-row" key={i.rotulo}>
          <span className="lbl">{i.rotulo}</span>
          <span className="bar">
            <i style={{ width: `${(i.total / max) * 100}%` }} />
          </span>
          <span className="val">{fmt(i.total)}</span>
        </div>
      ))}
    </>
  );
}

const DETAIL_META: Record<
  "instagram" | "youtube" | "anuncios",
  { badge: string; titulo: string; sub: string }
> = {
  instagram: {
    badge: "badge-ig",
    titulo: "Instagram · @renanvedovato",
    sub: "Últimos 30 dias · posts por desempenho",
  },
  youtube: {
    badge: "badge-yt",
    titulo: "YouTube · Renan Vedovato",
    sub: "Últimos 30 dias · vídeos por desempenho",
  },
  anuncios: {
    badge: "badge-ads",
    titulo: "Anúncios · Meta (Facebook + Instagram)",
    sub: "Últimos 30 dias · campanhas por investimento",
  },
};

export function DetailModal({
  plataforma,
  onClose,
}: {
  plataforma: "instagram" | "youtube" | "anuncios";
  onClose: () => void;
}) {
  const [ig, setIg] = useState<DetalheIG | null>(null);
  const [yt, setYt] = useState<DetalheYT | null>(null);
  const [ad, setAd] = useState<DetalheADS | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    fetch(`/api/dashboard/social/${plataforma}/detalhe`)
      .then((r) => r.json())
      .then((json) => {
        if (!alive) return;
        if (json.error) setErro(json.error);
        else if (plataforma === "instagram") setIg(json.detalhe);
        else if (plataforma === "youtube") setYt(json.detalhe);
        else setAd(json.detalhe);
      })
      .catch((e) => alive && setErro(String(e)));
    return () => {
      alive = false;
    };
  }, [plataforma]);

  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [onClose]);

  const carregando = !erro && !ig && !yt && !ad;
  const meta = DETAIL_META[plataforma];

  return (
    <div className="overlay" onClick={onClose}>
      <div className="detail" onClick={(e) => e.stopPropagation()}>
        <div className="detail-head">
          <span className={`badge ${meta.badge}`} />
          <h2>{meta.titulo}</h2>
          <button className="detail-close" onClick={onClose}>✕</button>
        </div>
        <div className="detail-sub">{meta.sub}</div>

        {carregando && <div className="detail-loading">Buscando métricas completas…</div>}
        {erro && <div className="spark-empty">{erro}</div>}

        {ig && (
          <>
            <div className="stat-grid">
              <div className="stat"><div className="n">{fmt(ig.seguidores)}</div><div className="mlabel">seguidores</div></div>
              <div className="stat"><div className={`n ${ig.novosSeguidores30d >= 0 ? "up" : "down"}`}>{ig.novosSeguidores30d >= 0 ? "+" : ""}{fmt(ig.novosSeguidores30d)}</div><div className="mlabel">novos 30d</div></div>
              <div className="stat"><div className="n">{ig.engajamento == null ? "—" : ig.engajamento.toFixed(2) + "%"}</div><div className="mlabel">engajamento</div></div>
              <div className="stat"><div className="n">{fmt(ig.reachTotal)}</div><div className="mlabel">alcance</div></div>
              <div className="stat"><div className="n">{fmt(ig.viewsTotais)}</div><div className="mlabel">views</div></div>
              <div className="stat"><div className="n">{fmt(ig.interacoes)}</div><div className="mlabel">interações</div></div>
              <div className="stat"><div className="n">{fmt(ig.likes)}</div><div className="mlabel">likes</div></div>
              <div className="stat"><div className="n">{fmt(ig.comentarios)}</div><div className="mlabel">comentários</div></div>
              <div className="stat"><div className="n">{fmt(ig.compartilhamentos)}</div><div className="mlabel">shares</div></div>
              <div className="stat"><div className="n">{fmt(ig.salvos)}</div><div className="mlabel">salvos</div></div>
            </div>

            <div className="detail-section">Views por dia</div>
            <Spark serie={ig.serie} cor="#ff3d77" className="big-spark" />
            <div className="spark-legend"><span><i style={{ background: "#ff3d77" }} />views</span></div>

            <div className="detail-section">Alcance por dia</div>
            <Spark serie={ig.serie} campo="reach" cor="#ffb03d" className="big-spark" />
            <div className="spark-legend"><span><i style={{ background: "#ffb03d" }} />alcance</span></div>

            <div className="detail-section">Melhores posts · 90 dias</div>
            <div className="media-grid">
              {ig.topPosts.map((p, i) => (
                <a className="media-card" key={i} href={p.link} target="_blank" rel="noreferrer">
                  <Thumb src={p.imagem} fallback={p.tipo === "REELS" || p.tipo === "REEL" ? "🎬" : "📸"} />
                  <div className="media-body">
                    <div className="media-text">{p.legenda || "(sem legenda)"}</div>
                    <div className="media-nums">
                      <b>{fmt(p.engajamento)} <span>eng.</span></b>
                      <b>{fmt(p.likes)} <span>likes</span></b>
                      <b>{fmt(p.comentarios)} <span>com.</span></b>
                    </div>
                  </div>
                </a>
              ))}
            </div>

            <div className="detail-section">Audiência (lifetime)</div>
            <div className="aud-grid">
              <div><div className="mlabel" style={{ marginBottom: 6 }}>Países</div><AudBars itens={ig.audiencia.paises} /></div>
              <div><div className="mlabel" style={{ marginBottom: 6 }}>Gênero</div><AudBars itens={ig.audiencia.generos} /></div>
              <div><div className="mlabel" style={{ marginBottom: 6 }}>Idade</div><AudBars itens={ig.audiencia.idades} /></div>
            </div>
          </>
        )}

        {yt && (
          <>
            <div className="stat-grid">
              <div className="stat"><div className="n">{fmt(yt.inscritos)}</div><div className="mlabel">inscritos</div></div>
              <div className="stat"><div className={`n ${yt.inscritosGanhos30d - yt.inscritosPerdidos30d >= 0 ? "up" : "down"}`}>{yt.inscritosGanhos30d - yt.inscritosPerdidos30d >= 0 ? "+" : ""}{fmt(yt.inscritosGanhos30d - yt.inscritosPerdidos30d)}</div><div className="mlabel">saldo 30d</div></div>
              <div className="stat"><div className="n">{fmt(yt.views30d)}</div><div className="mlabel">views 30d</div></div>
              <div className="stat"><div className="n">{fmt(yt.viewsTotaisCanal)}</div><div className="mlabel">views canal</div></div>
              <div className="stat"><div className="n">{fmt(yt.minutosAssistidos30d)}</div><div className="mlabel">min assistidos</div></div>
              <div className="stat"><div className="n">{fmt(yt.likes30d)}</div><div className="mlabel">likes 30d</div></div>
              <div className="stat"><div className="n">{fmt(yt.comentarios30d)}</div><div className="mlabel">comentários</div></div>
              <div className="stat"><div className="n">{fmt(yt.videosPublicados)}</div><div className="mlabel">vídeos</div></div>
            </div>

            <div className="detail-section">Views por dia</div>
            <Spark serie={yt.serie} cor="#ff5252" className="big-spark" />
            <div className="spark-legend"><span><i style={{ background: "#ff5252" }} />views</span></div>

            <div className="detail-section">Minutos assistidos por dia</div>
            <Spark serie={yt.serie} campo="minutos" cor="#ffb03d" className="big-spark" />
            <div className="spark-legend"><span><i style={{ background: "#ffb03d" }} />minutos</span></div>

            <div className="detail-section">Vídeos mais vistos</div>
            <div className="media-grid">
              {yt.topVideos.map((v, i) => (
                <a className="media-card" key={i} href={v.link} target="_blank" rel="noreferrer">
                  <Thumb src={v.imagem} fallback="▶" />
                  <div className="media-body">
                    <div className="media-text">{v.titulo}</div>
                    <div className="media-nums">
                      <b>{fmt(v.views)} <span>views</span></b>
                      <b>{fmt(v.likes)} <span>likes</span></b>
                    </div>
                  </div>
                </a>
              ))}
            </div>
          </>
        )}

        {ad && !ad.conectado && (
          <div className="spark-empty" style={{ padding: "24px 8px", lineHeight: 1.6 }}>
            Nenhuma conta de anúncios da Meta conectada no Windsor.ai ainda.
            <br />
            Conecte em{" "}
            <a href="https://onboard.windsor.ai?datasource=facebook" target="_blank" rel="noreferrer">
              onboard.windsor.ai
            </a>{" "}
            (fonte "Facebook Ads", com a mesma conta da Meta dos seus anúncios do Instagram) e os
            números aparecem aqui.
          </div>
        )}

        {ad && ad.conectado && (
          <>
            <div className="stat-grid">
              <div className="stat"><div className="n">{fmtMoeda(ad.gasto, ad.moeda, false)}</div><div className="mlabel">investido</div></div>
              <div className="stat"><div className="n">{fmt(ad.alcance)}</div><div className="mlabel">alcance</div></div>
              <div className="stat"><div className="n">{fmt(ad.impressoes)}</div><div className="mlabel">impressões</div></div>
              <div className="stat"><div className="n">{fmt(ad.cliques)}</div><div className="mlabel">cliques</div></div>
              <div className="stat"><div className="n">{ad.ctr == null ? "—" : ad.ctr.toFixed(2) + "%"}</div><div className="mlabel">CTR</div></div>
              <div className="stat"><div className="n">{fmtMoeda(ad.cpc, ad.moeda, false)}</div><div className="mlabel">CPC</div></div>
              <div className="stat"><div className="n">{fmtMoeda(ad.cpm, ad.moeda, false)}</div><div className="mlabel">CPM</div></div>
              <div className="stat"><div className="n">{ad.frequencia == null ? "—" : ad.frequencia.toFixed(2)}</div><div className="mlabel">frequência</div></div>
            </div>

            <div className="detail-section">Investimento por dia</div>
            <Spark serie={ad.serie} campo="spend" cor="#4a9eff" className="big-spark" />
            <div className="spark-legend"><span><i style={{ background: "#4a9eff" }} />gasto</span></div>

            <div className="detail-section">Cliques por dia</div>
            <Spark serie={ad.serie} campo="clicks" cor="#3ddc97" className="big-spark" />
            <div className="spark-legend"><span><i style={{ background: "#3ddc97" }} />cliques</span></div>

            <div className="detail-section">Campanhas por investimento</div>
            {ad.campanhas.length === 0 ? (
              <div className="spark-empty">Sem campanhas no período.</div>
            ) : (
              <div className="camp-list">
                {ad.campanhas.map((c, i) => (
                  <div className="camp-row" key={i}>
                    <div className="camp-nome">{c.campanha}</div>
                    <div className="camp-nums">
                      <b>{fmtMoeda(c.gasto, ad.moeda)} <span>gasto</span></b>
                      <b>{fmt(c.alcance)} <span>alcance</span></b>
                      <b>{fmt(c.cliques)} <span>cliques</span></b>
                      <b>{c.ctr == null ? "—" : c.ctr.toFixed(2) + "%"} <span>CTR</span></b>
                      <b>{fmtMoeda(c.cpc, ad.moeda, false)} <span>CPC</span></b>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
