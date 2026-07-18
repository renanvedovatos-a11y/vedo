import { useCallback, useEffect, useMemo, useState } from "react";

interface Task {
  id: string;
  texto: string;
  data: string; // YYYY-MM-DD
  hora: string | null; // HH:MM
  feita: boolean;
  autoConcluida?: boolean;
}

const DIAS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

// Data local YYYY-MM-DD (NÃO usar toISOString — ele converte para UTC e
// pode adiantar/atrasar o dia perto da meia-noite).
function iso(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

// Segunda-feira da semana atual (fuso local do navegador).
function inicioSemana(base = new Date()): Date {
  const d = new Date(base);
  d.setHours(0, 0, 0, 0);
  const diff = (d.getDay() + 6) % 7; // 0 = segunda
  d.setDate(d.getDate() - diff);
  return d;
}

export function WeekTasks() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [semanaBase, setSemanaBase] = useState(() => inicioSemana());
  const [novoTexto, setNovoTexto] = useState("");
  const [novoDia, setNovoDia] = useState(() => iso(new Date()));
  const [novaHora, setNovaHora] = useState("");

  const dias = useMemo(() => {
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(semanaBase);
      d.setDate(d.getDate() + i);
      return d;
    });
  }, [semanaBase]);

  const range = useMemo(
    () => ({ de: iso(dias[0]), ate: iso(dias[6]) }),
    [dias],
  );

  const carregar = useCallback(async () => {
    try {
      const res = await fetch(`/api/tasks?de=${range.de}&ate=${range.ate}`);
      const json = await res.json();
      setTasks(json.tarefas ?? []);
    } catch {
      /* mantém último */
    }
  }, [range.de, range.ate]);

  // Recarrega periodicamente para refletir tarefas criadas por voz.
  useEffect(() => {
    void carregar();
    const id = setInterval(carregar, 6000);
    return () => clearInterval(id);
  }, [carregar]);

  const adicionar = async () => {
    const texto = novoTexto.trim();
    if (!texto) return;
    setNovoTexto("");
    const hora = novaHora;
    setNovaHora("");
    await fetch("/api/tasks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ texto, data: novoDia, hora: hora || undefined }),
    });
    void carregar();
  };

  const alternar = async (t: Task) => {
    // otimista
    setTasks((prev) =>
      prev.map((x) => (x.id === t.id ? { ...x, feita: !x.feita } : x)),
    );
    await fetch(`/api/tasks/${t.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ feita: !t.feita }),
    });
    void carregar();
  };

  const remover = async (t: Task) => {
    setTasks((prev) => prev.filter((x) => x.id !== t.id));
    await fetch(`/api/tasks/${t.id}`, { method: "DELETE" });
    void carregar();
  };

  const hojeIso = iso(new Date());
  const label = `${dias[0].toLocaleDateString("pt-BR", { day: "2-digit", month: "short" })} – ${dias[6].toLocaleDateString("pt-BR", { day: "2-digit", month: "short" })}`;

  return (
    <div className="cell tasks-cell">
      <div className="cell-title">
        <span>Tarefas da Semana</span>
        <span>{label}</span>
      </div>
      <div className="week-nav" style={{ marginBottom: 8 }}>
        <button
          onClick={() =>
            setSemanaBase((b) => {
              const d = new Date(b);
              d.setDate(d.getDate() - 7);
              return d;
            })
          }
        >
          ‹
        </button>
        <button onClick={() => setSemanaBase(inicioSemana())}>hoje</button>
        <button
          onClick={() =>
            setSemanaBase((b) => {
              const d = new Date(b);
              d.setDate(d.getDate() + 7);
              return d;
            })
          }
        >
          ›
        </button>
      </div>

      <div className="week-grid">
        {dias.map((d) => {
          const diaIso = iso(d);
          const doDia = tasks.filter((t) => t.data === diaIso);
          return (
            <div
              className={`week-day ${diaIso === hojeIso ? "today" : ""}`}
              key={diaIso}
            >
              <div className="week-day-head">
                {DIAS[d.getDay()]} {d.getDate()}
              </div>
              {doDia.length === 0 ? (
                <div className="week-empty">—</div>
              ) : (
                doDia.map((t) => (
                  <div className={`task ${t.feita ? "done" : ""}`} key={t.id}>
                    <button className="task-check" onClick={() => alternar(t)}>
                      {t.feita ? "✓" : ""}
                    </button>
                    <span className="task-text" onClick={() => alternar(t)}>
                      {t.hora && <span className="task-hora">{t.hora}</span>}
                      {t.texto}
                      {t.autoConcluida && <span className="task-auto" title="Concluída automaticamente ao passar o horário">⏱</span>}
                    </span>
                    <button className="task-del" onClick={() => remover(t)}>
                      ×
                    </button>
                  </div>
                ))
              )}
            </div>
          );
        })}
      </div>

      <div className="week-add">
        <select value={novoDia} onChange={(e) => setNovoDia(e.target.value)}>
          {dias.map((d) => (
            <option key={iso(d)} value={iso(d)}>
              {DIAS[d.getDay()]} {d.getDate()}
            </option>
          ))}
        </select>
        <input
          value={novoTexto}
          onChange={(e) => setNovoTexto(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && adicionar()}
          placeholder="Nova tarefa…"
        />
        <input
          className="week-hora"
          type="time"
          value={novaHora}
          onChange={(e) => setNovaHora(e.target.value)}
          title="Horário opcional"
        />
        <button onClick={adicionar}>+</button>
      </div>
    </div>
  );
}
