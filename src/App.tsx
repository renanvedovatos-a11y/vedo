import { useEffect, useState } from "react";
import { ChatPanel } from "./components/ChatPanel";
import { WeekTasks } from "./components/WeekTasks";
import { TemasPage } from "./components/TemasPage";
import { AutomacaoPage } from "./components/AutomacaoPage";
import {
  HeroInstagram,
  HeroYoutube,
  HeroAnuncios,
  VoiceCell,
  AgendaCell,
  AgendaModal,
  DiaModal,
  TasksTodayCell,
  EmailsCell,
  EmailsModal,
  DetailModal,
  useSocial,
} from "./components/Bento";
import { Login } from "./components/Login";
import { useVoiceAssistant, type AssistantStatus } from "./hooks/useVoiceAssistant";

const MIC_TXT: Record<AssistantStatus, string> = {
  idle: "Falar com o VEDO",
  listening: "Ouvindo… (toque para enviar)",
  processing: "Pensando…",
  speaking: "Falando… (toque para parar)",
};

type View = "painel" | "temas" | "automacao";

function Topbar({
  status,
  onMicToggle,
  view,
  setView,
}: {
  status: AssistantStatus;
  onMicToggle: () => void;
  view: View;
  setView: (v: View) => void;
}) {
  const [now, setNow] = useState(() => new Date());
  const [serverOk, setServerOk] = useState<boolean | null>(null);
  const [googleOff, setGoogleOff] = useState(false);

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    let alive = true;
    const ping = async () => {
      try {
        const res = await fetch("/api/health");
        const data = await res.json();
        if (!alive) return;
        setServerOk(res.ok);
        setGoogleOff(Boolean(data.google?.configured && !data.google?.connected));
      } catch {
        if (alive) setServerOk(false);
      }
    };
    void ping();
    const id = setInterval(ping, 8000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, []);

  return (
    <div className="topbar">
      <div className="topbar-left">
        <div className="wordmark">
          VE<span>D</span>O
        </div>
        <nav className="view-tabs">
          <button className={view === "painel" ? "on" : ""} onClick={() => setView("painel")}>
            Painel
          </button>
          <button className={view === "temas" ? "on" : ""} onClick={() => setView("temas")}>
            Temas
          </button>
          <button className={view === "automacao" ? "on" : ""} onClick={() => setView("automacao")}>
            Automação
          </button>
        </nav>
      </div>
      <div className="topbar-right">
        {googleOff && (
          <button
            className="mic-pill"
            style={{ color: "#ffb03d", borderColor: "#3a2f18" }}
            onClick={() => window.open("/api/google/connect", "_blank")}
          >
            Reconectar Google
          </button>
        )}
        <span className="clock">
          {now.toLocaleDateString("pt-BR", { weekday: "short", day: "2-digit", month: "short" }).toUpperCase()}{" "}
          {now.toLocaleTimeString("pt-BR")}
        </span>
        <span className={`server-dot ${serverOk === false ? "bad" : ""}`} title={serverOk === false ? "Servidor offline" : "Servidor online"} />
        <button className={`mic-pill ${status}`} onClick={onMicToggle}>
          <span>{MIC_TXT[status]}</span>
          <span className={`orb ${status !== "idle" ? "live" : ""}`}>
            <i />
          </span>
        </button>
      </div>
    </div>
  );
}

export default function App() {
  // Portão de acesso: null = verificando; depois guarda se precisa e se já entrou.
  const [auth, setAuth] = useState<{ necessario: boolean; autenticado: boolean } | null>(null);
  const checarAuth = () =>
    fetch("/api/auth")
      .then((r) => r.json())
      .then(setAuth)
      .catch(() => setAuth({ necessario: false, autenticado: true }));
  useEffect(() => {
    void checarAuth();
  }, []);

  if (auth === null) {
    return <div className="login-tela"><div className="login-sub">Carregando…</div></div>;
  }
  if (auth.necessario && !auth.autenticado) {
    return <Login onOk={checarAuth} />;
  }
  return <Painel />;
}

function Painel() {
  const {
    status,
    messages,
    interim,
    error,
    toggleMic,
    sendText,
    voices,
    voiceURI,
    setVoice,
    testVoice,
    wakeAtivo,
    setWakeAtivo,
  } = useVoiceAssistant();

  const social = useSocial();
  const [view, setView] = useState<View>("painel");
  const [detail, setDetail] = useState<
    null | "instagram" | "youtube" | "anuncios" | "agenda" | "tarefas" | "emails"
  >(null);
  const [dia, setDia] = useState<string | null>(null);
  const fechar = () => setDetail(null);

  return (
    <div className="app">
      <Topbar status={status} onMicToggle={toggleMic} view={view} setView={setView} />
      {view === "temas" ? (
        <TemasPage />
      ) : view === "automacao" ? (
        <AutomacaoPage />
      ) : (
        <div className="bento">
          <HeroInstagram data={social} onOpen={() => setDetail("instagram")} />
          <HeroYoutube data={social} onOpen={() => setDetail("youtube")} />
          <HeroAnuncios data={social} onOpen={() => setDetail("anuncios")} />
          <VoiceCell
            status={status}
            onMicToggle={toggleMic}
            voices={voices}
            voiceURI={voiceURI}
            setVoice={setVoice}
            testVoice={testVoice}
            wakeAtivo={wakeAtivo}
            setWakeAtivo={setWakeAtivo}
          />
          <div className="bottom">
            <EmailsCell onOpen={() => setDetail("emails")} />
            <ChatPanel messages={messages} interim={interim} error={error} onSend={sendText} />
            <AgendaCell onOpen={() => setDetail("agenda")} onOpenDia={setDia} />
            <TasksTodayCell onOpen={() => setDetail("tarefas")} />
          </div>
        </div>
      )}
      {(detail === "instagram" || detail === "youtube" || detail === "anuncios") && (
        <DetailModal key={detail} plataforma={detail} onClose={fechar} />
      )}
      {detail === "agenda" && <AgendaModal onClose={fechar} />}
      {dia && <DiaModal iso={dia} onClose={() => setDia(null)} />}
      {detail === "tarefas" && <TasksModal onClose={fechar} />}
      {detail === "emails" && <EmailsModal onClose={fechar} />}
    </div>
  );
}

// Modal de tarefas: a visão semanal completa (com edição) dentro do overlay.
function TasksModal({ onClose }: { onClose: () => void }) {
  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [onClose]);

  return (
    <div className="overlay" onClick={onClose}>
      <div className="detail detail-tasks" onClick={(e) => e.stopPropagation()}>
        <div className="detail-head">
          <h2>Tarefas da semana</h2>
          <button className="detail-close" onClick={onClose}>✕</button>
        </div>
        <div className="detail-sub">
          Marque, adicione ou remova — ou peça por voz ("quinta: gravar vídeo às 10h").
        </div>
        <WeekTasks />
      </div>
    </div>
  );
}
