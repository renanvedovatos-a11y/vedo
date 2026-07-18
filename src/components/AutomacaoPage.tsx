import { useCallback, useEffect, useState } from "react";

interface Regra {
  id: string;
  palavra: string;
  mensagem: string;
  ativa: boolean;
}
interface LogItem {
  id: string;
  quando: number;
  de: string;
  comentario: string;
  palavra: string;
  mensagemEnviada: string;
  status: string;
  erro?: string;
}
interface Status {
  webhookConfigurado: boolean;
  envioConfigurado: boolean;
  assinaturaConfigurada: boolean;
  tunel?: {
    url: string | null;
    registro?: { estado: string; detalhe?: string; callback?: string };
  } | null;
}

const STATUS_LABEL: Record<string, string> = {
  enviado: "enviado",
  simulado: "simulado",
  erro: "erro",
  duplicado: "duplicado",
  sem_regra: "sem regra",
};

export function AutomacaoPage() {
  const [status, setStatus] = useState<Status | null>(null);
  const [regras, setRegras] = useState<Regra[]>([]);
  const [log, setLog] = useState<LogItem[]>([]);

  const [palavra, setPalavra] = useState("");
  const [mensagem, setMensagem] = useState(
    "Olá {usuario}, vi que você tem interesse na comunidade ProTrader. Gostaria de mais informações?",
  );
  const [testeTexto, setTesteTexto] = useState("quero saber da comunidade!");
  const [testeUser, setTesteUser] = useState("maria.trader");
  const [testeResult, setTesteResult] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    try {
      const [s, r, l] = await Promise.all([
        fetch("/api/instagram/status").then((x) => x.json()),
        fetch("/api/instagram/rules").then((x) => x.json()),
        fetch("/api/instagram/log").then((x) => x.json()),
      ]);
      setStatus(s);
      setRegras(r.regras ?? []);
      setLog(l.log ?? []);
    } catch {
      /* mantém */
    }
  }, []);

  useEffect(() => {
    void carregar();
    const id = setInterval(carregar, 8000);
    return () => clearInterval(id);
  }, [carregar]);

  const adicionar = async () => {
    if (!palavra.trim() || !mensagem.trim()) return;
    await fetch("/api/instagram/rules", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ palavra, mensagem }),
    });
    setPalavra("");
    void carregar();
  };
  const alternar = async (r: Regra) => {
    await fetch(`/api/instagram/rules/${r.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ativa: !r.ativa }),
    });
    void carregar();
  };
  const remover = async (r: Regra) => {
    await fetch(`/api/instagram/rules/${r.id}`, { method: "DELETE" });
    void carregar();
  };
  const testar = async () => {
    setTesteResult("Testando…");
    const res = await fetch("/api/instagram/test", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: testeUser, texto: testeTexto }),
    }).then((r) => r.json());
    if (res.status === "sem_regra") setTesteResult("Nenhuma palavra-chave casou com esse comentário.");
    else if (res.mensagem) setTesteResult(`✓ Dispararia: "${res.mensagem}"`);
    else setTesteResult(`Status: ${res.status}${res.erro ? " — " + res.erro : ""}`);
    void carregar();
  };

  const modoSimulacao = status && !status.envioConfigurado;

  return (
    <div className="automacao">
      <div className="auto-head">
        <h2>Comentário → Direct automático</h2>
        <p>
          Quando alguém comenta uma palavra-chave num post seu do Instagram, o VEDO responde
          no direct dela automaticamente.
        </p>
      </div>

      {status?.tunel && (
        <div
          className="cell auto-aviso"
          style={
            status.tunel.registro?.estado === "ok"
              ? { borderColor: "rgba(74,222,128,.3)" }
              : undefined
          }
        >
          {status.tunel.url ? (
            status.tunel.registro?.estado === "ok" ? (
              <>
                <b>Túnel no ar e webhook registrado automaticamente.</b> URL atual:{" "}
                <code>{status.tunel.url}</code>
              </>
            ) : status.tunel.registro?.estado === "manual" ? (
              <>
                <b>Túnel no ar, mas o registro automático está desativado.</b> Se esta URL
                mudou desde o último cadastro, atualize na Meta (webhook e política):{" "}
                <code>{status.tunel.registro?.callback}</code>
              </>
            ) : (
              <>
                <b>Túnel no ar, mas o registro na Meta falhou.</b>{" "}
                {status.tunel.registro?.detalhe} — atualize manualmente:{" "}
                <code>{status.tunel.registro?.callback}</code>
              </>
            )
          ) : (
            <>
              <b>Túnel fora do ar.</b> O gerenciador vai reiniciar sozinho; se persistir,
              confira se o cloudflared está instalado.
            </>
          )}
        </div>
      )}

      {modoSimulacao && (
        <div className="cell auto-aviso">
          <b>Modo simulação ativo.</b> As regras e o teste já funcionam, mas o envio real
          só liga depois que você configurar a conexão com a Meta no arquivo <code>.env</code>{" "}
          (<code>IG_ACCESS_TOKEN</code>, <code>IG_USER_ID</code>, <code>META_APP_SECRET</code>,{" "}
          <code>META_WEBHOOK_VERIFY_TOKEN</code>) e cadastrar o webhook. Enquanto isso, cada
          disparo aparece no histórico como <b>simulado</b>.
        </div>
      )}

      <div className="auto-cols">
        <div className="auto-col">
          <div className="cell">
            <div className="cell-title"><span>Nova regra</span></div>
            <label className="auto-label">Palavra-chave</label>
            <input
              className="auto-input"
              value={palavra}
              onChange={(e) => setPalavra(e.target.value)}
              placeholder="comunidade"
            />
            <label className="auto-label">
              Mensagem no direct <span className="auto-dica">use {"{usuario}"} para @ da pessoa</span>
            </label>
            <textarea
              className="auto-textarea"
              value={mensagem}
              onChange={(e) => setMensagem(e.target.value)}
              rows={4}
            />
            <button className="auto-btn" onClick={adicionar}>
              Adicionar regra
            </button>
          </div>

          <div className="cell">
            <div className="cell-title"><span>Testar sem a Meta</span></div>
            <div className="auto-teste-linha">
              <input
                className="auto-input"
                value={testeUser}
                onChange={(e) => setTesteUser(e.target.value)}
                placeholder="usuário"
                style={{ maxWidth: 130 }}
              />
              <input
                className="auto-input"
                value={testeTexto}
                onChange={(e) => setTesteTexto(e.target.value)}
                placeholder="comentário de teste"
              />
            </div>
            <button className="auto-btn ghost" onClick={testar}>
              Simular comentário
            </button>
            {testeResult && <div className="auto-teste-result">{testeResult}</div>}
          </div>
        </div>

        <div className="auto-col">
          <div className="cell">
            <div className="cell-title">
              <span>Regras ativas</span>
              <span>{regras.length}</span>
            </div>
            {regras.length === 0 ? (
              <div className="spark-empty">Nenhuma regra ainda.</div>
            ) : (
              regras.map((r) => (
                <div className={`auto-regra ${r.ativa ? "" : "off"}`} key={r.id}>
                  <button
                    className={`auto-toggle ${r.ativa ? "on" : ""}`}
                    onClick={() => alternar(r)}
                    title={r.ativa ? "Desativar" : "Ativar"}
                  >
                    <span />
                  </button>
                  <div className="auto-regra-body">
                    <div className="auto-regra-palavra">"{r.palavra}"</div>
                    <div className="auto-regra-msg">{r.mensagem}</div>
                  </div>
                  <button className="auto-del" onClick={() => remover(r)}>×</button>
                </div>
              ))
            )}
          </div>

          <div className="cell">
            <div className="cell-title">
              <span>Histórico</span>
              <span>{log.length}</span>
            </div>
            {log.length === 0 ? (
              <div className="spark-empty">Nenhum disparo ainda.</div>
            ) : (
              <div className="auto-log">
                {log.map((l) => (
                  <div className="auto-log-item" key={l.id}>
                    <div className="auto-log-top">
                      <span className="auto-log-de">@{l.de}</span>
                      <span className={`auto-badge ${l.status}`}>
                        {STATUS_LABEL[l.status] ?? l.status}
                      </span>
                    </div>
                    <div className="auto-log-com">"{l.comentario}" → {l.palavra}</div>
                    {l.mensagemEnviada && (
                      <div className="auto-log-msg">{l.mensagemEnviada}</div>
                    )}
                    {l.erro && <div className="auto-log-erro">{l.erro}</div>}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
