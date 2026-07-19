import { useCallback, useEffect, useRef, useState } from "react";
import { audioEngine } from "../audio/engine";

export type AssistantStatus = "idle" | "listening" | "processing" | "speaking";

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  tools?: string[];
}

interface SpeechRecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((e: any) => void) | null;
  onerror: ((e: any) => void) | null;
  onend: (() => void) | null;
  onspeechstart: (() => void) | null;
}

function createRecognition(): SpeechRecognitionLike | null {
  const Ctor =
    (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
  if (!Ctor) return null;
  const rec: SpeechRecognitionLike = new Ctor();
  rec.lang = "pt-BR";
  // Contínuo: não encerra na primeira pausa. Quem decide o fim é o timer de
  // silêncio (abaixo) ou o clique manual no microfone.
  rec.continuous = true;
  rec.interimResults = true;
  return rec;
}

// Quanto tempo de silêncio (ms) até considerar que o usuário terminou de falar.
const SILENCE_MS = 2500;

const VOICE_STORAGE_KEY = "vedo.voiceURI";
const WAKE_STORAGE_KEY = "vedo.wake";

// Palavra de ativação: "olá vedo", "oi vedo", "alô vedo" (com variações que o
// reconhecedor costuma transcrever). Aceita comando na mesma frase:
// "olá vedo, me dá o briefing" já dispara o briefing.
const HOTWORD = /\b(ol[aá]|oi|al[oô])[\s,.!]*(vedo|vedô|veto|vê\s?do|vedu)\b/i;

const IS_IOS = /iPhone|iPad|iPod/i.test(navigator.userAgent);

// Erros da Web Speech API viram instruções acionáveis (especialmente no iPhone,
// onde "service-not-allowed" significa o iOS barrando o serviço de ditado).
function erroAmigavel(code: string): string {
  const ios = IS_IOS;
  switch (code) {
    case "service-not-allowed":
      return ios
        ? "O iPhone barrou o serviço de voz. Confira: 1) use o SAFARI (Chrome e outros navegadores no iPhone não têm acesso ao ditado); 2) abra pelo endereço, não por atalho salvo na tela de início; 3) Ajustes → Geral → Teclado → Ativar Ditado ligado; 4) Ajustes → Siri ligada. Depois feche a aba e abra de novo."
        : "O navegador bloqueou o serviço de voz. Confira a permissão de microfone do site e tente de novo.";
    case "not-allowed":
      return "Permissão de microfone negada. Toque no ícone de cadeado/aA na barra de endereço, permita o Microfone e recarregue.";
    case "audio-capture":
      return "Nenhum microfone encontrado no aparelho.";
    case "network":
      return "O reconhecimento de voz precisa de internet e não conseguiu conectar. Tente de novo em instantes.";
    default:
      return `Erro no reconhecimento de voz: ${code}`;
  }
}

// Vozes em português disponíveis no navegador/SO.
function ptVoices(): SpeechSynthesisVoice[] {
  return (window.speechSynthesis?.getVoices() ?? []).filter((v) =>
    v.lang.toLowerCase().startsWith("pt"),
  );
}

// Escolhe uma voz padrão boa: prioriza as neurais ("Natural"/"Online"),
// depois qualquer pt-BR, depois qualquer pt.
function defaultVoiceURI(voices: SpeechSynthesisVoice[]): string {
  const natural = voices.find(
    (v) =>
      v.lang.toLowerCase().startsWith("pt-br") &&
      /natural|online/i.test(v.name),
  );
  const ptBR = voices.find((v) => v.lang.toLowerCase().startsWith("pt-br"));
  return (natural ?? ptBR ?? voices[0])?.voiceURI ?? "";
}

export function useVoiceAssistant() {
  const [status, setStatus] = useState<AssistantStatus>("idle");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [interim, setInterim] = useState("");
  const [confidence, setConfidence] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [speechSupported] = useState(() => createRecognition() !== null);

  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [voiceURI, setVoiceURI] = useState<string>(
    () => localStorage.getItem(VOICE_STORAGE_KEY) ?? "",
  );

  const recRef = useRef<SpeechRecognitionLike | null>(null);
  const finalTextRef = useRef("");
  const messagesRef = useRef<ChatMessage[]>([]);
  messagesRef.current = messages;
  const voiceURIRef = useRef(voiceURI);
  voiceURIRef.current = voiceURI;
  const silenceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stoppingRef = useRef(false);
  const restartsRef = useRef(0);

  const clearSilenceTimer = useCallback(() => {
    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }
  }, []);

  // Chrome/Edge carregam as vozes de forma assíncrona — popula a lista e,
  // na primeira vez, escolhe uma voz padrão boa (neural, se houver).
  useEffect(() => {
    const refresh = () => {
      const list = ptVoices();
      setVoices(list);
      setVoiceURI((cur) => {
        // Lista ainda não carregou: preserva o que estiver (inclusive o salvo).
        if (list.length === 0) return cur;
        // Voz salva/atual ainda existe: mantém.
        if (cur && list.some((v) => v.voiceURI === cur)) return cur;
        // Só aqui escolhe um padrão (primeira carga sem escolha válida).
        return defaultVoiceURI(list);
      });
    };
    refresh();
    window.speechSynthesis?.addEventListener?.("voiceschanged", refresh);
    return () =>
      window.speechSynthesis?.removeEventListener?.("voiceschanged", refresh);
  }, []);

  const setVoice = useCallback((uri: string) => {
    setVoiceURI(uri);
    localStorage.setItem(VOICE_STORAGE_KEY, uri);
  }, []);

  const speak = useCallback((text: string) => {
    if (!window.speechSynthesis) {
      setStatus("idle");
      return;
    }
    const utterance = new SpeechSynthesisUtterance(text);
    const chosen = (window.speechSynthesis.getVoices() ?? []).find(
      (v) => v.voiceURI === voiceURIRef.current,
    );
    if (chosen) {
      utterance.voice = chosen;
      utterance.lang = chosen.lang;
    } else {
      utterance.lang = "pt-BR";
    }
    utterance.rate = 1.05;
    utterance.onstart = () => setStatus("speaking");
    utterance.onend = () => setStatus("idle");
    utterance.onerror = () => setStatus("idle");
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utterance);
  }, []);

  const process = useCallback(
    async (text: string) => {
      const clean = text.trim();
      if (!clean) {
        setStatus("idle");
        return;
      }
      setError(null);
      setStatus("processing");
      const history = [...messagesRef.current, { role: "user" as const, content: clean }];
      setMessages(history);
      try {
        const res = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            messages: history.map(({ role, content }) => ({ role, content })),
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? `Erro ${res.status}`);
        const reply: string = data.text || "Não consegui gerar uma resposta.";
        setMessages([
          ...history,
          { role: "assistant", content: reply, tools: data.tools_used ?? [] },
        ]);
        speak(reply);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        setError(message);
        setMessages([
          ...history,
          { role: "assistant", content: `[erro] ${message}` },
        ]);
        setStatus("idle");
      }
    },
    [speak],
  );

  const stopListening = useCallback(() => {
    stoppingRef.current = true;
    clearSilenceTimer();
    recRef.current?.stop();
  }, [clearSilenceTimer]);

  const startListening = useCallback(async () => {
    if (status !== "idle") return;
    setError(null);
    const rec = createRecognition();
    if (!rec) {
      setError(
        "Reconhecimento de voz não suportado neste navegador. Use Chrome/Edge, ou digite abaixo.",
      );
      return;
    }
    // No iOS o microfone NÃO pode ser aberto duas vezes: se o visualizador
    // (getUserMedia) segurar o mic, o serviço de ditado da Apple falha com
    // "service-not-allowed" — e cada tentativa repete o pedido de permissão.
    // No iPhone/iPad o reconhecimento fica com o mic só pra ele; o orb anima
    // pelo estado (listening/speaking), sem nível de áudio real.
    if (!IS_IOS) {
      try {
        await audioEngine.start();
      } catch {
        // Sem permissão de microfone os visualizadores ficam em modo idle,
        // mas o reconhecimento ainda pode funcionar.
      }
    }
    finalTextRef.current = "";
    stoppingRef.current = false;
    restartsRef.current = 0;
    setInterim("");

    // (Re)arma o timer: se ficar SILENCE_MS sem nada novo, encerra e processa.
    const armSilenceTimer = () => {
      clearSilenceTimer();
      silenceTimerRef.current = setTimeout(() => {
        stopListening();
      }, SILENCE_MS);
    };

    rec.onresult = (e: any) => {
      let interimText = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const result = e.results[i];
        if (result.isFinal) {
          finalTextRef.current += result[0].transcript;
          if (typeof result[0].confidence === "number" && result[0].confidence > 0) {
            setConfidence(Math.round(result[0].confidence * 100));
          }
        } else {
          interimText += result[0].transcript;
        }
      }
      setInterim(finalTextRef.current + interimText);
      // Houve fala (parcial ou final): reinicia a contagem de silêncio.
      armSilenceTimer();
    };
    rec.onspeechstart = () => {
      restartsRef.current = 0; // detectou fala: zera o contador de reinícios
      armSilenceTimer();
    };
    rec.onerror = (e: any) => {
      // 'no-speech' e 'aborted' são normais (silêncio inicial / reinício) — ignora.
      if (e.error === "no-speech" || e.error === "aborted") return;
      // Erros de permissão/serviço são fatais: não adianta reiniciar a escuta
      // (entraria num loop de erro). Para e explica o que fazer.
      if (e.error === "not-allowed" || e.error === "service-not-allowed" || e.error === "audio-capture") {
        stoppingRef.current = true;
      }
      setError(erroAmigavel(e.error));
    };
    rec.onend = () => {
      const text = finalTextRef.current.trim();
      // O navegador pode encerrar sozinho por conta de silêncio, mas se o
      // usuário NÃO pediu pra parar e ainda não falou nada, reinicia a escuta
      // em vez de desistir — assim pausas longas antes de começar não cortam.
      if (!stoppingRef.current && !text && restartsRef.current < 20) {
        try {
          restartsRef.current += 1;
          rec.start();
          return;
        } catch {
          // se não der pra reiniciar, cai no encerramento normal abaixo
        }
      }
      clearSilenceTimer();
      audioEngine.stop();
      setInterim("");
      recRef.current = null;
      if (text) {
        void process(text);
      } else {
        setStatus("idle");
      }
    };
    recRef.current = rec;
    setStatus("listening");
    rec.start();
  }, [status, process, clearSilenceTimer, stopListening]);

  // ---------- modo "Olá VEDO" (palavra de ativação) ----------
  // Uma escuta de fundo, leve, que só procura a saudação. Ao ouvir "olá vedo"
  // começa a escuta de verdade; se vier comando junto ("olá vedo, briefing"),
  // processa direto. Pausa sozinha enquanto o VEDO ouve/pensa/fala.
  const [wakeAtivo, setWakeAtivoState] = useState(
    () => localStorage.getItem(WAKE_STORAGE_KEY) === "1",
  );
  const wakeRef = useRef<SpeechRecognitionLike | null>(null);
  const wakeAtivoRef = useRef(wakeAtivo);
  wakeAtivoRef.current = wakeAtivo;
  const statusRef = useRef(status);
  statusRef.current = status;

  const pararWake = useCallback(() => {
    const w = wakeRef.current;
    wakeRef.current = null;
    if (w) {
      w.onresult = null;
      w.onerror = null;
      w.onend = null;
      try {
        w.abort();
      } catch {
        /* já parada */
      }
    }
  }, []);

  const iniciarWake = useCallback(() => {
    if (wakeRef.current || !wakeAtivoRef.current || statusRef.current !== "idle") return;
    const rec = createRecognition();
    if (!rec) return;

    rec.onresult = (e: any) => {
      let texto = "";
      for (let i = 0; i < e.results.length; i++) texto += e.results[i][0].transcript;
      const m = texto.match(HOTWORD);
      if (!m) return;
      const resto = texto.slice((m.index ?? 0) + m[0].length).trim();
      pararWake();
      // Veio comando na mesma frase? Processa direto; senão, abre a escuta.
      if (resto.replace(/[^\p{L}\p{N}]/gu, "").length >= 3) {
        void process(resto);
      } else {
        void startListening();
      }
    };
    rec.onerror = (e: any) => {
      if (e.error === "no-speech" || e.error === "aborted") return;
      if (e.error === "not-allowed" || e.error === "service-not-allowed" || e.error === "audio-capture") {
        // Sem permissão não há o que insistir: desliga o modo e explica.
        wakeAtivoRef.current = false;
        setWakeAtivoState(false);
        localStorage.setItem(WAKE_STORAGE_KEY, "0");
        setError(erroAmigavel(e.error));
        pararWake();
      }
    };
    rec.onend = () => {
      // O navegador encerra a escuta sozinho de tempos em tempos — religa
      // enquanto o modo estiver ativo e o microfone estiver livre.
      if (wakeRef.current === rec) {
        wakeRef.current = null;
        setTimeout(() => iniciarWake(), 400);
      }
    };

    wakeRef.current = rec;
    try {
      rec.start();
    } catch {
      wakeRef.current = null;
    }
  }, [pararWake, process, startListening]);

  const setWakeAtivo = useCallback(
    (on: boolean) => {
      wakeAtivoRef.current = on;
      setWakeAtivoState(on);
      localStorage.setItem(WAKE_STORAGE_KEY, on ? "1" : "0");
      // Liga já dentro do clique (gesto do usuário — exigência do iOS/Safari).
      if (on) iniciarWake();
      else pararWake();
    },
    [iniciarWake, pararWake],
  );

  // Mantém a escuta de fundo em dia com o estado: só roda quando idle.
  useEffect(() => {
    if (wakeAtivo && status === "idle") iniciarWake();
    else pararWake();
    return pararWake;
  }, [wakeAtivo, status, iniciarWake, pararWake]);

  const toggleMic = useCallback(() => {
    if (status === "listening") {
      stopListening();
    } else if (status === "speaking") {
      window.speechSynthesis?.cancel();
      setStatus("idle");
    } else if (status === "idle") {
      void startListening();
    }
  }, [status, startListening, stopListening]);

  const sendText = useCallback(
    (text: string) => {
      if (status === "processing") return;
      if (status === "speaking") window.speechSynthesis?.cancel();
      if (status === "listening") recRef.current?.abort();
      void process(text);
    },
    [status, process],
  );

  const testVoice = useCallback(() => {
    if (status === "listening" || status === "processing") return;
    speak(
      "Bom dia, Renan! Aqui é o VEDO. Essa é a voz que você acabou de escolher.",
    );
  }, [status, speak]);

  return {
    status,
    messages,
    interim,
    confidence,
    error,
    speechSupported,
    toggleMic,
    sendText,
    voices,
    voiceURI,
    setVoice,
    testVoice,
    wakeAtivo,
    setWakeAtivo,
  };
}
