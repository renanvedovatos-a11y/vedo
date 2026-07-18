import { useEffect, useRef, useState } from "react";
import type { ChatMessage } from "../hooks/useVoiceAssistant";

interface Props {
  messages: ChatMessage[];
  interim: string;
  error: string | null;
  onSend: (text: string) => void;
}

export function ChatPanel({ messages, interim, error, onSend }: Props) {
  const [input, setInput] = useState("");
  const logRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, interim]);

  const submit = () => {
    const text = input.trim();
    if (!text) return;
    setInput("");
    onSend(text);
  };

  return (
    <div className="cell chat-cell">
      <div className="cell-title">
        <span>Conversa</span>
        <span>pt-BR</span>
      </div>
      <div className="chat-log" ref={logRef}>
        {messages.length === 0 && !interim && (
          <div className="chat-empty">
            Toque no ponto rosa (ou no microfone acima) e fale.
            <br />
            Ex.: "Bom dia, me dá o briefing do dia."
          </div>
        )}
        {messages.map((m, i) => (
          <div key={i} className={`msg ${m.role}`}>
            {m.tools && m.tools.length > 0 && (
              <div className="tools-line">⚙ {[...new Set(m.tools)].join(" · ")}</div>
            )}
            {m.content}
          </div>
        ))}
        {interim && <div className="msg interim">{interim}…</div>}
      </div>
      {error && <div className="error-bar">{error}</div>}
      <div className="chat-input">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && submit()}
          placeholder="Digite um comando…"
        />
        <button onClick={submit}>Enviar</button>
      </div>
    </div>
  );
}
