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

export const IS_IOS = /iPhone|iPad|iPod/i.test(navigator.userAgent);

function createRecognition(): SpeechRecognitionLike | null {
  const Ctor =
    (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
  if (!Ctor) return null;
  const rec: SpeechRecognitionLike = new Ctor();
  rec.lang = "pt-BR";
  // Desktop: contínuo — não encerra na primeira pausa; o fim é decidido pelo
  // timer de silêncio ou pelo clique. iOS: o modo contínuo do Safari é
  // quebrado (resultados não chegam); usa frase única e deixa o PRÓPRIO iOS
  // detectar o fim da fala.
  rec.continuous = !IS_IOS;
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
  // Resposta do chat sendo escrita agora + ferramenta em execução no momento.
  const [parcial, setParcial] = useState("");
  const [ferramenta, setFerramenta] = useState<string | null>(null);
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
    async (text: string, modo: "voz" | "texto" = "voz") => {
      const clean = text.trim();
      if (!clean) {
        setStatus("idle");
        return;
      }
      setError(null);
      setStatus("processing");
      const history = [...messagesRef.current, { role: "user" as const, content: clean }];
      setMessages(history);

      // Chat: consome o turno em streaming, então o texto aparece enquanto é
      // escrito (e as ferramentas aparecem conforme rodam).
      if (modo === "texto") {
        setParcial("");
        setFerramenta(null);
        try {
          const res = await fetch("/api/chat/stream", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              messages: history.map(({ role, content }) => ({ role, content })),
            }),
          });
          if (!res.ok || !res.body) throw new Error(`Erro ${res.status}`);

          const reader = res.body.getReader();
          const decoder = new TextDecoder();
          let buffer = "";
          let acumulado = "";
          let usadas: string[] = [];
          let erroStream: string | null = null;

          for (;;) {
            const { done, value } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });
            // Eventos SSE são separados por linha em branco.
            const partes = buffer.split("\n\n");
            buffer = partes.pop() ?? "";
            for (const parte of partes) {
              const linha = parte.split("\n").find((l) => l.startsWith("data: "));
              if (!linha) continue;
              let ev: any;
              try {
                ev = JSON.parse(linha.slice(6));
              } catch {
                continue;
              }
              if (ev.tipo === "texto") {
                acumulado += ev.delta;
                setParcial(acumulado);
                setFerramenta(null);
              } else if (ev.tipo === "ferramenta") {
                setFerramenta(ev.nome);
              } else if (ev.tipo === "fim") {
                acumulado = ev.texto ?? acumulado;
                usadas = ev.tools_used ?? [];
              } else if (ev.tipo === "erro") {
                erroStream = ev.erro;
              }
            }
          }

          setParcial("");
          setFerramenta(null);
          if (erroStream) throw new Error(erroStream);
          setMessages([
            ...history,
            { role: "assistant", content: acumulado || "Feito.", tools: usadas },
          ]);
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          setParcial("");
          setFerramenta(null);
          setError(message);
          setMessages([...history, { role: "assistant", content: `[erro] ${message}` }]);
        } finally {
          setStatus("idle");
        }
        return;
      }

      try {
        const res = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            modo,
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
        // Resposta do chat é para LER (markdown, roteiro longo) — falar isso em
        // voz alta seria ruído. Só o modo voz dispara o TTS.
        if (modo === "voz") speak(reply);
        else setStatus("idle");
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
    const rec = recRef.current;
    rec?.stop();
    // Safari/iOS às vezes NÃO dispara onend depois do stop() quando nenhum
    // áudio foi captado — sem isto a tela ficava presa em "Ouvindo…".
    setTimeout(() => {
      if (rec && recRef.current === rec) {
        try {
          rec.abort();
        } catch {
          /* já morta */
        }
        recRef.current = null;
        audioEngine.stop();
        setInterim("");
        setStatus("idle");
      }
    }, 1500);
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
    // No iOS o Safari muitas vezes NÃO manda resultados parciais — um timer
    // curto cortaria a fala no meio. Lá o próprio iOS detecta o fim da frase
    // (continuous=false); o timer vira só uma trava de segurança longa.
    const silencioMs = IS_IOS ? 12000 : SILENCE_MS;
    const armSilenceTimer = () => {
      clearSilenceTimer();
      silenceTimerRef.current = setTimeout(() => {
        stopListening();
      }, silencioMs);
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
      // (No iOS não: reiniciar fora de um toque é bloqueado pelo Safari, e o
      // encerramento natural é o sinal de que a frase acabou.)
      if (!stoppingRef.current && !text && !IS_IOS && restartsRef.current < 20) {
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

  // ---------- gravação + transcrição no servidor (caminho do iPhone) ----------
  // O Web Speech do Safari/iOS é quebrado pra muita gente (fica "ouvindo" sem
  // nunca entregar texto). Quando o servidor tem STT (GROQ_API_KEY), o iPhone
  // grava o áudio com MediaRecorder e manda pro /api/transcrever.
  const sttServidorRef = useRef(false);
  useEffect(() => {
    fetch("/api/health")
      .then((r) => r.json())
      .then((d) => {
        sttServidorRef.current = Boolean(d.stt);
      })
      .catch(() => {});
  }, []);

  const mediaRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);

  const pararGravacao = useCallback(() => {
    try {
      mediaRef.current?.stop();
    } catch {
      /* já parada */
    }
  }, []);

  const iniciarGravacao = useCallback(async () => {
    setError(null);
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      setError(erroAmigavel("not-allowed"));
      return;
    }
    const mime =
      ["audio/mp4", "audio/webm;codecs=opus", "audio/webm"].find(
        (m) => typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(m),
      ) ?? "";
    const mr = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
    chunksRef.current = [];
    streamRef.current = stream;

    mr.ondataavailable = (e) => {
      if (e.data.size > 0) chunksRef.current.push(e.data);
    };
    mr.onstop = async () => {
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
      mediaRef.current = null;
      const blob = new Blob(chunksRef.current, { type: mr.mimeType || "audio/mp4" });
      chunksRef.current = [];
      setInterim("");
      // Gravação minúscula = toque acidental; volta ao repouso sem chamar a API.
      if (blob.size < 2000) {
        setStatus("idle");
        return;
      }
      setStatus("processing");
      try {
        const res = await fetch("/api/transcrever", {
          method: "POST",
          headers: { "Content-Type": blob.type },
          body: blob,
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? `Erro ${res.status}`);
        const texto = String(data.text ?? "").trim();
        if (texto) {
          void process(texto);
        } else {
          setError("Não entendi o áudio — tente falar mais perto do microfone.");
          setStatus("idle");
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
        setStatus("idle");
      }
    };

    mediaRef.current = mr;
    setStatus("listening");
    setInterim("Gravando… toque de novo para enviar.");
    mr.start();
  }, [process]);

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
      if (mediaRef.current) pararGravacao();
      else stopListening();
    } else if (status === "speaking") {
      window.speechSynthesis?.cancel();
      setStatus("idle");
    } else if (status === "idle") {
      // iPhone com STT no servidor: grava e transcreve (o Web Speech do iOS
      // é instável). Nos demais, reconhecimento nativo do navegador.
      if (IS_IOS && sttServidorRef.current) void iniciarGravacao();
      else void startListening();
    }
  }, [status, startListening, stopListening, iniciarGravacao, pararGravacao]);

  const sendText = useCallback(
    (text: string) => {
      if (status === "processing") return;
      if (status === "speaking") window.speechSynthesis?.cancel();
      if (status === "listening") recRef.current?.abort();
      void process(text, "texto");
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
    parcial,
    ferramenta,
  };
}
