import { useEffect, useRef, useState } from "react";
import type { ChatMessage } from "../hooks/useVoiceAssistant";
import { Markdown } from "./Markdown";

// Roteiro e legenda existem para sair daqui e ir pro Instagram — copiar tem
// que ser um clique, não uma seleção manual de texto longo.
function BotaoCopiar({ texto }: { texto: string }) {
  const [copiado, setCopiado] = useState(false);
  return (
    <button
      className="msg-copiar"
      title="Copiar"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(texto);
          setCopiado(true);
          setTimeout(() => setCopiado(false), 1500);
        } catch {
          /* clipboard bloqueado */
        }
      }}
    >
      {copiado ? "copiado ✓" : "copiar"}
    </button>
  );
}

interface Props {
  messages: ChatMessage[];
  interim: string;
  error: string | null;
  onSend: (text: string) => void;
  parcial?: string;
  ferramenta?: string | null;
}

// Nome técnico da ferramenta -> o que ele está fazendo, em português.
const FAZENDO: Record<string, string> = {
  web_search: "pesquisando na web",
  desempenho_conteudo: "analisando o que performou",
  biblioteca_conteudo: "consultando a biblioteca",
  buscar_templates_video: "buscando templates",
  metricas_sociais: "puxando métricas",
  listar_emails: "lendo e-mails",
  criar_rascunho_email: "escrevendo rascunho",
  listar_eventos: "vendo a agenda",
  horarios_livres: "procurando horário livre",
  criar_evento: "criando evento",
  cancelar_evento: "cancelando evento",
  gerenciar_tarefas: "mexendo nas tarefas",
  salvar_memoria: "guardando na memória",
};

export function ChatPanel({
  messages,
  interim,
  error,
  onSend,
  parcial = "",
  ferramenta = null,
}: Props) {
  const [input, setInput] = useState("");
  const logRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, interim, parcial, ferramenta]);

  const submit = () => {
    const text = input.trim();
    if (!text) return;
    setInput("");
    onSend(text);
  };

  // Roteiro e análise não cabem numa caixa de 4 linhas — o mesmo "expandir"
  // dos outros cards abre a conversa em tela cheia para ler e copiar.
  const [expandido, setExpandido] = useState(false);
  useEffect(() => {
    if (!expandido) return;
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setExpandido(false);
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [expandido]);

  const corpo = (
    <>
      <div className="cell-title">
        <span>Conversa</span>
        <button
          className="chat-expandir"
          onClick={() => setExpandido((v) => !v)}
          title={expandido ? "Recolher" : "Abrir em tela cheia"}
        >
          {expandido ? "✕" : "⤢"}
        </button>
      </div>
      <div className="chat-log" ref={logRef}>
        {messages.length === 0 && !interim && (
          <div className="chat-empty">
            Fale pelo microfone ou escreva aqui — no texto ele trabalha como
            agente: pesquisa, analisa o que performou e entrega roteiro pronto.
            <br />
            Ex.: "Me dá 3 pautas de Reels pra semana com base no que foi melhor."
          </div>
        )}
        {messages.map((m, i) => (
          <div key={i} className={`msg ${m.role}`}>
            {m.tools && m.tools.length > 0 && (
              <div className="tools-line">⚙ {[...new Set(m.tools)].join(" · ")}</div>
            )}
            {m.role === "assistant" ? (
              <>
                <Markdown texto={m.content} />
                <BotaoCopiar texto={m.content} />
              </>
            ) : (
              m.content
            )}
          </div>
        ))}
        {/* Resposta chegando em tempo real */}
        {parcial && (
          <div className="msg assistant">
            <Markdown texto={parcial} />
            <span className="cursor-escrevendo" />
          </div>
        )}
        {/* Enquanto ele trabalha (sem texto ainda), mostra o que está fazendo */}
        {ferramenta && (
          <div className="msg trabalhando">
            <span className="pontinhos"><i /><i /><i /></span>
            {FAZENDO[ferramenta] ?? ferramenta}…
          </div>
        )}
        {interim && <div className="msg interim">{interim}…</div>}
      </div>
      {error && <div className="error-bar">{error}</div>}
      <div className="chat-input">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && submit()}
          placeholder="Peça um roteiro, uma análise, uma pauta…"
        />
        <button onClick={submit}>Enviar</button>
      </div>
    </>
  );

  if (expandido) {
    return (
      <div className="overlay" onClick={() => setExpandido(false)}>
        <div className="detail chat-cheio" onClick={(e) => e.stopPropagation()}>
          {corpo}
        </div>
      </div>
    );
  }

  return <div className="cell chat-cell">{corpo}</div>;
}
