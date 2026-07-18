import { useEffect, useMemo, useState } from "react";

/* ---------- tipos ---------- */
interface Template {
  id: number;
  ganchos: string[];
  cenas: string[];
  conclusao: string;
}
interface Tema {
  template_id: number;
  titulo: string;
  ganchos: string[];
  roteiro: string[];
  conclusao: string;
  thumbnail_titulo: string;
}

type Aba = "gerar" | "biblioteca" | "favoritos";
type Modo = "reels" | "youtube";

const TIPOS_YT: Array<[string, string, string]> = [
  ["vlog", "🎒", "Vlog com trade no meio"],
  ["tecnico", "📐", "Técnico / educativo"],
  ["analise", "📊", "Análise de mercado"],
  ["storytelling", "🎙", "Storytelling / bastidores"],
  ["reacao", "🗞", "Reação / opinião"],
  ["qa", "❓", "Q&A estruturado"],
];

const SUBTEMAS = [
  "Day trade",
  "WDO / Mini dólar",
  "Ações",
  "Cripto",
  "Psicologia",
  "Gestão de risco",
  "Finanças pessoais",
  "Vida de trader",
];

function roteiroCompleto(t: Tema, modo: Modo): string {
  const linhas = [
    `TÍTULO: ${t.titulo}`,
    "",
    "GANCHOS:",
    ...t.ganchos.map((g, i) => `${i + 1}. ${g}`),
    "",
    "ROTEIRO:",
    ...t.roteiro.map((c, i) => `Cena ${i + 1}: ${c}`),
    "",
    `CONCLUSÃO: ${t.conclusao}`,
  ];
  if (modo === "youtube" && t.thumbnail_titulo) {
    linhas.push("", `THUMBNAIL/TÍTULO: ${t.thumbnail_titulo}`);
  }
  linhas.push("", `(template #${t.template_id})`);
  return linhas.join("\n");
}

/* ---------- card de tema ---------- */
function TemaCard({
  tema,
  modo,
  favorito,
  onFavoritar,
  onVariacao,
  gerandoVariacao,
}: {
  tema: Tema;
  modo: Modo;
  favorito: boolean;
  onFavoritar: () => void;
  onVariacao: () => void;
  gerandoVariacao: boolean;
}) {
  const [copiado, setCopiado] = useState(false);

  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(roteiroCompleto(tema, modo));
      setCopiado(true);
      setTimeout(() => setCopiado(false), 1600);
    } catch {
      /* clipboard bloqueado */
    }
  };

  return (
    <div className="cell tema-card">
      <div className="tema-head">
        <span className="tema-badge">#{tema.template_id}</span>
        <h3>{tema.titulo}</h3>
        <button
          className={`tema-fav ${favorito ? "on" : ""}`}
          onClick={onFavoritar}
          title={favorito ? "Remover dos favoritos" : "Favoritar"}
        >
          {favorito ? "♥" : "♡"}
        </button>
      </div>

      <div className="tema-section">Ganchos</div>
      {tema.ganchos.map((g, i) => (
        <div className="tema-gancho" key={i}>
          <span>{i + 1}</span>
          {g}
        </div>
      ))}

      <div className="tema-section">Roteiro</div>
      {tema.roteiro.map((c, i) => (
        <div className="tema-cena" key={i}>
          <b>Cena {i + 1}</b>
          {c}
        </div>
      ))}

      <div className="tema-section">Conclusão</div>
      <div className="tema-conclusao">{tema.conclusao}</div>

      {modo === "youtube" && tema.thumbnail_titulo && (
        <>
          <div className="tema-section">Thumbnail + título</div>
          <div className="tema-conclusao">{tema.thumbnail_titulo}</div>
        </>
      )}

      <div className="tema-actions">
        <button onClick={copiar}>{copiado ? "✓ Copiado" : "Copiar roteiro"}</button>
        <button onClick={onVariacao} disabled={gerandoVariacao}>
          {gerandoVariacao ? "Gerando…" : "Gerar variação"}
        </button>
      </div>
    </div>
  );
}

/* ---------- página ---------- */
export function TemasPage() {
  const [aba, setAba] = useState<Aba>("gerar");
  const [modo, setModo] = useState<Modo>("reels");
  const [tipoYt, setTipoYt] = useState("tecnico");
  const [assunto, setAssunto] = useState("");
  const [subtema, setSubtema] = useState("");
  const [quantidade, setQuantidade] = useState(4);
  const [travado, setTravado] = useState<number | null>(null);

  const [temas, setTemas] = useState<Tema[]>([]);
  const [loading, setLoading] = useState(false);
  const [variando, setVariando] = useState<number | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  const [biblioteca, setBiblioteca] = useState<Template[]>([]);
  const [busca, setBusca] = useState("");
  const [favoritos, setFavoritos] = useState<Tema[]>([]);

  useEffect(() => {
    fetch("/api/temas/biblioteca")
      .then((r) => r.json())
      .then((j) => setBiblioteca(j.templates ?? []))
      .catch(() => {});
  }, []);

  const filtrados = useMemo(() => {
    const q = busca.trim().toLowerCase();
    if (!q) return biblioteca;
    return biblioteca.filter(
      (t) =>
        String(t.id) === q ||
        t.ganchos.some((g) => g.toLowerCase().includes(q)) ||
        t.conclusao.toLowerCase().includes(q),
    );
  }, [biblioteca, busca]);

  const gerar = async () => {
    setLoading(true);
    setErro(null);
    try {
      const res = await fetch("/api/temas/gerar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          modo,
          tipo: modo === "youtube" ? tipoYt : undefined,
          assunto,
          subtema,
          quantidade,
          templateIds: travado != null ? [travado] : undefined,
        }),
      });
      const json = await res.json();
      if (!res.ok || json.error) throw new Error(json.error ?? `Erro ${res.status}`);
      setTemas(json.temas ?? []);
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  const gerarVariacao = async (tema: Tema, idx: number) => {
    setVariando(idx);
    setErro(null);
    try {
      const res = await fetch("/api/temas/gerar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          modo,
          tipo: modo === "youtube" ? tipoYt : undefined,
          assunto,
          subtema,
          quantidade: 1,
          templateIds: [tema.template_id],
        }),
      });
      const json = await res.json();
      if (!res.ok || json.error) throw new Error(json.error ?? `Erro ${res.status}`);
      if (json.temas?.[0]) {
        setTemas((prev) => prev.map((t, i) => (i === idx ? json.temas[0] : t)));
      }
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e));
    } finally {
      setVariando(null);
    }
  };

  const chaveTema = (t: Tema) => `${t.template_id}|${t.titulo}`;
  const ehFavorito = (t: Tema) => favoritos.some((f) => chaveTema(f) === chaveTema(t));
  const alternarFavorito = (t: Tema) => {
    setFavoritos((prev) =>
      ehFavorito(t) ? prev.filter((f) => chaveTema(f) !== chaveTema(t)) : [...prev, t],
    );
  };

  const templateTravado = travado != null ? biblioteca.find((t) => t.id === travado) : null;

  return (
    <div className="temas">
      <div className="temas-tabs">
        {(
          [
            ["gerar", "Gerar"],
            ["biblioteca", `Biblioteca (${biblioteca.length})`],
            ["favoritos", `Favoritos (${favoritos.length})`],
          ] as Array<[Aba, string]>
        ).map(([id, rotulo]) => (
          <button key={id} className={aba === id ? "on" : ""} onClick={() => setAba(id)}>
            {rotulo}
          </button>
        ))}
      </div>

      {aba === "gerar" && (
        <>
          <div className="cell temas-controles">
            <div className="temas-linha">
              <div className="seg">
                <button className={modo === "reels" ? "on" : ""} onClick={() => setModo("reels")}>
                  Reels / Shorts
                </button>
                <button
                  className={modo === "youtube" ? "on" : ""}
                  onClick={() => setModo("youtube")}
                >
                  YouTube
                </button>
              </div>
              <select value={subtema} onChange={(e) => setSubtema(e.target.value)}>
                <option value="">Subtema: variado</option>
                {SUBTEMAS.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
              <select
                value={quantidade}
                onChange={(e) => setQuantidade(Number(e.target.value))}
              >
                {[1, 2, 3, 4, 5, 6, 8, 10].map((n) => (
                  <option key={n} value={n}>
                    {n} tema{n > 1 ? "s" : ""}
                  </option>
                ))}
              </select>
            </div>

            {modo === "youtube" && (
              <div className="tipos-yt">
                {TIPOS_YT.map(([id, icone, rotulo]) => (
                  <button
                    key={id}
                    className={tipoYt === id ? "on" : ""}
                    onClick={() => setTipoYt(id)}
                  >
                    <span>{icone}</span>
                    {rotulo}
                  </button>
                ))}
              </div>
            )}

            <div className="temas-linha">
              <input
                className="assunto"
                value={assunto}
                onChange={(e) => setAssunto(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && !loading && gerar()}
                placeholder='Assunto base (opcional) — ex.: "stop loss", "payroll", "primeiro mês na mesa"'
              />
              <button className="btn-gerar" onClick={gerar} disabled={loading}>
                {loading ? "Gerando…" : "Gerar temas"}
              </button>
            </div>

            {templateTravado && (
              <div className="travado">
                Template travado: <b>#{templateTravado.id}</b> "{templateTravado.ganchos[0]}"
                <button onClick={() => setTravado(null)}>× soltar</button>
              </div>
            )}
          </div>

          {erro && <div className="error-bar">{erro}</div>}

          {loading && (
            <div className="temas-loading">
              <span className="orb live" style={{ "--oc": "#ff3d77" } as React.CSSProperties}>
                <i />
              </span>
              Adaptando templates ao nicho…
            </div>
          )}

          <div className="temas-grid">
            {temas.map((t, i) => (
              <TemaCard
                key={`${chaveTema(t)}|${i}`}
                tema={t}
                modo={modo}
                favorito={ehFavorito(t)}
                onFavoritar={() => alternarFavorito(t)}
                onVariacao={() => gerarVariacao(t, i)}
                gerandoVariacao={variando === i}
              />
            ))}
          </div>
          {!loading && temas.length === 0 && (
            <div className="chat-empty" style={{ marginTop: 40 }}>
              Escolha o formato e clique em "Gerar temas".
              <br />
              Cada tema nasce de um template real da biblioteca, adaptado ao seu nicho.
            </div>
          )}
        </>
      )}

      {aba === "biblioteca" && (
        <>
          <div className="cell temas-controles">
            <input
              className="assunto"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar por texto do gancho ou id…"
            />
          </div>
          <div className="lib-list">
            {filtrados.map((t) => (
              <div className="cell lib-item" key={t.id}>
                <span className="tema-badge">#{t.id}</span>
                <div className="lib-body">
                  <div className="lib-gancho">{t.ganchos[0]}</div>
                  <div className="lib-meta">
                    {t.ganchos.length} ganchos · {t.cenas.length} cenas
                  </div>
                </div>
                <button
                  className="lib-usar"
                  onClick={() => {
                    setTravado(t.id);
                    setAba("gerar");
                  }}
                >
                  Usar
                </button>
              </div>
            ))}
            {filtrados.length === 0 && (
              <div className="chat-empty" style={{ marginTop: 30 }}>
                Nenhum template bate com "{busca}".
              </div>
            )}
          </div>
        </>
      )}

      {aba === "favoritos" && (
        <div className="temas-grid">
          {favoritos.length === 0 ? (
            <div className="chat-empty" style={{ marginTop: 40, gridColumn: "1 / -1" }}>
              Nenhum favorito ainda. Gere temas e toque no ♡.
            </div>
          ) : (
            favoritos.map((t, i) => (
              <TemaCard
                key={`${chaveTema(t)}|fav${i}`}
                tema={t}
                modo={t.thumbnail_titulo ? "youtube" : "reels"}
                favorito
                onFavoritar={() => alternarFavorito(t)}
                onVariacao={() => {}}
                gerandoVariacao={false}
              />
            ))
          )}
        </div>
      )}
    </div>
  );
}
