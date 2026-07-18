// Captura o microfone e expõe dados de espectro/onda para os visualizadores.
// Singleton: os canvases leem via sample() dentro dos seus próprios rAF loops.
class AudioEngine {
  private ctx: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private stream: MediaStream | null = null;

  freq = new Uint8Array(64);
  wave = new Uint8Array(256);
  level = 0;
  active = false;

  async start(): Promise<void> {
    if (this.active) return;
    this.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    this.ctx = new AudioContext();
    const source = this.ctx.createMediaStreamSource(this.stream);
    this.analyser = this.ctx.createAnalyser();
    this.analyser.fftSize = 512;
    this.analyser.smoothingTimeConstant = 0.75;
    source.connect(this.analyser);
    this.active = true;
  }

  stop(): void {
    this.stream?.getTracks().forEach((t) => t.stop());
    this.ctx?.close().catch(() => {});
    this.stream = null;
    this.ctx = null;
    this.analyser = null;
    this.active = false;
    this.level = 0;
    this.freq.fill(0);
    this.wave.fill(128);
  }

  sample(): void {
    if (!this.active || !this.analyser) return;
    const freqData = new Uint8Array(this.analyser.frequencyBinCount);
    const waveData = new Uint8Array(this.analyser.fftSize);
    this.analyser.getByteFrequencyData(freqData);
    this.analyser.getByteTimeDomainData(waveData);
    this.freq = freqData.slice(0, 64);
    this.wave = waveData.slice(0, 256);
    let sum = 0;
    for (let i = 0; i < freqData.length; i++) sum += freqData[i];
    this.level = sum / freqData.length / 255;
  }
}

export const audioEngine = new AudioEngine();
