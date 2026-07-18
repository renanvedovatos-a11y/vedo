import { useState } from "react";

// Tela de acesso do painel. Aparece quando o servidor está com login ativo
// (VEDO_SENHA definida em produção) e ainda não há sessão válida.
export function Login({ onOk }: { onOk: () => void }) {
  const [senha, setSenha] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  const entrar = async (e: React.FormEvent) => {
    e.preventDefault();
    setErro(null);
    setEnviando(true);
    try {
      const res = await fetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ senha }),
      });
      if (res.ok) {
        onOk();
      } else {
        const j = await res.json().catch(() => ({}));
        setErro(j.erro ?? "Senha incorreta.");
      }
    } catch {
      setErro("Não consegui falar com o servidor.");
    } finally {
      setEnviando(false);
    }
  };

  return (
    <div className="login-tela">
      <form className="login-card" onSubmit={entrar}>
        <div className="login-marca">
          VE<span>D</span>O
        </div>
        <div className="login-sub">Acesso ao painel</div>
        <input
          className="login-input"
          type="password"
          placeholder="Senha"
          value={senha}
          onChange={(e) => setSenha(e.target.value)}
          autoFocus
        />
        {erro && <div className="login-erro">{erro}</div>}
        <button className="login-btn" type="submit" disabled={enviando || !senha}>
          {enviando ? "Entrando…" : "Entrar"}
        </button>
      </form>
    </div>
  );
}
