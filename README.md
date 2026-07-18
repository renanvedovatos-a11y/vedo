# VEDO — Assistente Pessoal de Voz

Secretária digital operada por voz para day trader / criador de conteúdo (Vedovato & Co.).
Dashboard dark fintech + pipeline de voz + cérebro na API da Anthropic (Claude).

## Status: Fases 1, 2 e 3 ✅ (Fase 4 parcial)

- **Fase 1** — Dashboard dark fintech completo + voz (Web Speech API pt-BR, Chrome/Edge)
  + cérebro `claude-opus-4-8` com prompt caching.
- **Fases 2 e 3** — Cérebro com ferramentas (tool use / loop agêntico):
  - `listar_emails` / `criar_rascunho_email` — Gmail (rascunho apenas, nunca envia)
  - `listar_eventos` / `horarios_livres` / `criar_evento` / `cancelar_evento` — Calendar
  - `metricas_sociais` — Instagram/YouTube via Windsor.ai
  - `buscar_templates_video` — biblioteca de templates (9 arquétipos, expansível a 365)
  - `salvar_memoria` — memória persistente entre conversas (data/memoria.json)
  - Briefing diário: "bom dia, me dá o briefing" combina e-mails + agenda + métricas.
- **Fase 4 (parcial)** — CPU/RAM reais no painel Recursos (`/api/system`), memória
  persistente. Pendente: Whisper/ElevenLabs (STT/TTS premium).

### Integrações (painel "Integrações" no dashboard)

| Serviço | O que precisa | Onde |
|---|---|---|
| Google (Gmail+Agenda) | `GOOGLE_CLIENT_ID` + `GOOGLE_CLIENT_SECRET` no `.env`, depois clicar CONECTAR no dashboard | console.cloud.google.com (instruções no `.env.example`) |
| Windsor.ai (IG+YT) | `WINDSOR_API_KEY` no `.env` | onboard.windsor.ai → API Keys |

Sem as chaves, o assistente continua funcionando e avisa o que falta quando a
ferramenta é chamada.

## Como rodar

1. Configure a chave da API:

   ```
   copy .env.example .env
   # edite .env e cole sua ANTHROPIC_API_KEY (https://platform.claude.com/)
   ```

2. Instale e rode:

   ```
   npm install
   npm run dev
   ```

3. Abra http://localhost:5173 — aperte o microfone e fale, ou digite no campo de texto.

`npm run dev` sobe os dois processos: Vite (frontend, porta 5173) e o servidor
do cérebro (Express, porta 3001, proxy em `/api`).

## Estrutura

```
server/index.mjs          cérebro: Express + @anthropic-ai/sdk + system prompt do negócio
src/hooks/useVoiceAssistant.ts   máquina de estados de voz (ouvindo → processando → falando)
src/audio/engine.ts       captura do microfone p/ os visualizadores (Web Audio API)
src/components/           CoreVisualizer, VoiceViz (waveform/espectro/analytics),
                          SidePanels, ChatPanel, Header
```

## Roadmap (próximas fases)

- **Fase 2** — leitura: Gmail, Google Calendar, métricas Instagram/YouTube (Windsor.ai); briefing diário.
- **Fase 3** — escrita: rascunhos de e-mail, criação de eventos; base dos 365 templates de temas de vídeo.
- **Fase 4** — polimento: Whisper + ElevenLabs (PT-BR), indicadores reais, memória persistente.

## Regras de segurança (fixas)

- E-mail nunca é enviado automaticamente — só rascunho.
- Ações irreversíveis exigem confirmação explícita.
- Credenciais só via variáveis de ambiente (`.env` fora do git).
