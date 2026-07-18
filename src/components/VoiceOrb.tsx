import { useEffect, useRef } from "react";
import type { AssistantStatus } from "../hooks/useVoiceAssistant";
import { audioEngine } from "../audio/engine";

/*
 * Orb de voz estilo "esfera wireframe": malha lat/long em 3D projetada no
 * canvas, deformada por ondas senoidais compostas (ruído barato) e colorida
 * por um gradiente azul → magenta na tela, como a referência do Renan.
 * A amplitude da deformação segue o estado: em escuta acompanha o nível REAL
 * do microfone; falando, ondula com um envelope orgânico que imita fala.
 */

interface Props {
  status: AssistantStatus;
  size?: number;
  onClick?: () => void;
  title?: string;
}

export function VoiceOrb({ status, size = 110, onClick, title }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const statusRef = useRef(status);
  statusRef.current = status;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const reduzMovimento = window.matchMedia?.(
      "(prefers-reduced-motion: reduce)",
    ).matches;

    // Pontinhos fixos flutuando ao redor da esfera (como na referência).
    const DOTS = Array.from({ length: 70 }, () => {
      const phi = Math.acos(2 * Math.random() - 1);
      const theta = Math.random() * Math.PI * 2;
      return {
        phi,
        theta,
        r: 1.22 + Math.random() * 0.28,
        tw: Math.random() * Math.PI * 2, // fase do cintilar
      };
    });

    let raf = 0;
    let amp = 0.05; // amplitude suavizada da deformação
    let vel = 0.22; // velocidade de rotação suavizada

    const draw = (tms: number) => {
      const t = tms / 1000;
      const s = statusRef.current;

      const dpr = window.devicePixelRatio || 1;
      const px = size * dpr;
      if (canvas.width !== px || canvas.height !== px) {
        canvas.width = px;
        canvas.height = px;
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, size, size);

      // ---- alvo de amplitude/velocidade por estado ----
      let alvoAmp: number;
      let alvoVel: number;
      if (s === "listening") {
        audioEngine.sample();
        alvoAmp = 0.07 + (audioEngine.active ? audioEngine.level * 0.5 : 0.04);
        alvoVel = 0.35;
      } else if (s === "speaking") {
        // envelope orgânico: parece cadência de fala, sem precisar do áudio do TTS
        const env =
          0.55 +
          0.45 *
            Math.abs(Math.sin(t * 6.1) * 0.6 + Math.sin(t * 2.7 + 1.3) * 0.4);
        alvoAmp = 0.09 + env * 0.14;
        alvoVel = 0.5;
      } else if (s === "processing") {
        alvoAmp = 0.09;
        alvoVel = 1.15;
      } else {
        alvoAmp = 0.045 + Math.sin(t * 0.9) * 0.012; // respiração em repouso
        alvoVel = 0.22;
      }
      if (reduzMovimento) {
        alvoAmp = 0.04;
        alvoVel = 0.05;
      }
      amp += (alvoAmp - amp) * 0.08;
      vel += (alvoVel - vel) * 0.06;

      const cx = size / 2;
      const cy = size / 2;
      const R = size * 0.34 * (1 + amp * 0.25);
      const rotY = t * vel;
      const tiltX = 0.42;
      const persp = R * 3.2;

      // ---- brilho de fundo (glow) ----
      const glow = ctx.createRadialGradient(cx, cy, R * 0.2, cx, cy, R * 1.7);
      glow.addColorStop(0, `rgba(150, 80, 255, ${0.16 + amp * 0.5})`);
      glow.addColorStop(0.6, "rgba(90, 60, 220, 0.07)");
      glow.addColorStop(1, "rgba(0, 0, 0, 0)");
      ctx.fillStyle = glow;
      ctx.fillRect(0, 0, size, size);

      // gradiente de cor na tela: azul (cima/esq) → magenta (baixo/dir)
      const grad = ctx.createLinearGradient(cx - R, cy - R, cx + R, cy + R);
      grad.addColorStop(0, "#5d7bff");
      grad.addColorStop(0.5, "#a55bff");
      grad.addColorStop(1, "#ff3dd0");

      // deformação orgânica da casca
      const deform = (theta: number, phi: number) =>
        1 +
        amp *
          (Math.sin(3 * theta + 2 * phi + t * 1.5) * 0.55 +
            Math.sin(5 * phi - theta + t * 2.1) * 0.3 +
            Math.sin(7 * theta - t * 2.8) * 0.15);

      // projeta um ponto (theta, phi, fator de raio) para a tela
      const proj = (theta: number, phi: number, rf = 1) => {
        const r = R * deform(theta, phi) * rf;
        let x = r * Math.sin(phi) * Math.cos(theta);
        let y = r * Math.cos(phi);
        let z = r * Math.sin(phi) * Math.sin(theta);
        // rotação Y
        const xz = x * Math.cos(rotY) + z * Math.sin(rotY);
        const zz = -x * Math.sin(rotY) + z * Math.cos(rotY);
        x = xz;
        z = zz;
        // inclinação X
        const yz = y * Math.cos(tiltX) - z * Math.sin(tiltX);
        const zz2 = y * Math.sin(tiltX) + z * Math.cos(tiltX);
        y = yz;
        z = zz2;
        const esc = persp / (persp - z);
        return { x: cx + x * esc, y: cy + y * esc, z };
      };

      ctx.globalCompositeOperation = "lighter";
      ctx.strokeStyle = grad;
      ctx.lineWidth = 0.6;

      // desenha a malha em dois passes: fundo (translúcido) e frente
      const passes: Array<[boolean, number]> = [
        [false, 0.14],
        [true, 0.5],
      ];
      for (const [frente, alpha] of passes) {
        ctx.globalAlpha = alpha;
        // linhas de latitude
        for (let i = 1; i < 12; i++) {
          const phi = (i / 12) * Math.PI;
          ctx.beginPath();
          let pen = false;
          for (let j = 0; j <= 40; j++) {
            const theta = (j / 40) * Math.PI * 2;
            const p = proj(theta, phi);
            const ok = frente ? p.z >= -R * 0.05 : p.z < -R * 0.05;
            if (ok) {
              pen ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y);
              pen = true;
            } else {
              pen = false;
            }
          }
          ctx.stroke();
        }
        // linhas de longitude
        for (let i = 0; i < 16; i++) {
          const theta = (i / 16) * Math.PI * 2;
          ctx.beginPath();
          let pen = false;
          for (let j = 0; j <= 24; j++) {
            const phi = (j / 24) * Math.PI;
            const p = proj(theta, phi);
            const ok = frente ? p.z >= -R * 0.05 : p.z < -R * 0.05;
            if (ok) {
              pen ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y);
              pen = true;
            } else {
              pen = false;
            }
          }
          ctx.stroke();
        }
      }

      // pontinhos cintilando ao redor
      ctx.globalAlpha = 1;
      for (const d of DOTS) {
        const p = proj(d.theta + t * 0.05, d.phi, d.r);
        const brilho = 0.25 + 0.55 * Math.abs(Math.sin(t * 1.3 + d.tw));
        ctx.fillStyle = `rgba(216, 130, 255, ${brilho * (p.z > 0 ? 1 : 0.4)})`;
        ctx.beginPath();
        ctx.arc(p.x, p.y, 0.9, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.globalCompositeOperation = "source-over";
      raf = requestAnimationFrame(draw);
    };

    // Primeiro frame síncrono: o orb aparece já no mount, mesmo se o
    // requestAnimationFrame estiver adiado (aba oculta, throttling etc.).
    draw(performance.now());
    return () => cancelAnimationFrame(raf);
  }, [size]);

  return (
    <canvas
      ref={canvasRef}
      className="voice-orb"
      style={{ width: size, height: size }}
      onClick={onClick}
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={(e) => e.key === "Enter" && onClick?.()}
      title={title}
    />
  );
}
