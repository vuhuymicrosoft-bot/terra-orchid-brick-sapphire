export type SfxName =
  | "mine"
  | "break"
  | "place"
  | "jump"
  | "hurt"
  | "pickup"
  | "craft"
  | "hit"
  | "eat"
  | "dawn"
  | "die"
  | "ui";

export class AudioBus {
  on: boolean;
  private ctx: AudioContext | null = null;
  private lastMine = 0;

  constructor(on: boolean) {
    this.on = on;
  }

  unlock() {
    if (!this.ctx) {
      const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new AC();
    }
    if (this.ctx.state === "suspended") void this.ctx.resume();
  }

  play(name: SfxName) {
    if (!this.on) return;
    this.unlock();
    const ctx = this.ctx;
    if (!ctx) return;
    const now = ctx.currentTime;
    if (name === "mine") {
      if (now - this.lastMine < 0.07) return;
      this.lastMine = now;
      this.blip(now, 180 + Math.random() * 80, 0.04, "square", 0.045);
      return;
    }
    if (name === "break") {
      this.noise(now, 0.08, 0.08);
      this.blip(now, 140, 0.09, "triangle", 0.06);
      return;
    }
    if (name === "place") {
      this.blip(now, 220, 0.06, "square", 0.05);
      this.blip(now + 0.03, 160, 0.07, "triangle", 0.04);
      return;
    }
    if (name === "jump") {
      this.blip(now, 320, 0.07, "sine", 0.04, 480);
      return;
    }
    if (name === "hurt") {
      this.blip(now, 180, 0.12, "sawtooth", 0.05, 80);
      return;
    }
    if (name === "hit") {
      this.blip(now, 240, 0.06, "square", 0.05, 90);
      return;
    }
    if (name === "pickup") {
      this.blip(now, 620, 0.05, "sine", 0.04);
      this.blip(now + 0.05, 880, 0.07, "sine", 0.03);
      return;
    }
    if (name === "craft") {
      this.blip(now, 523, 0.06, "triangle", 0.04);
      this.blip(now + 0.07, 784, 0.09, "triangle", 0.04);
      return;
    }
    if (name === "eat") {
      this.blip(now, 400, 0.08, "sine", 0.04, 600);
      return;
    }
    if (name === "dawn") {
      this.blip(now, 523, 0.16, "sine", 0.035);
      this.blip(now + 0.16, 659, 0.16, "sine", 0.03);
      this.blip(now + 0.32, 784, 0.28, "sine", 0.03);
      return;
    }
    if (name === "die") {
      this.blip(now, 220, 0.25, "triangle", 0.06, 70);
      return;
    }
    this.blip(now, 500, 0.04, "sine", 0.03);
  }

  private blip(
    t: number,
    freq: number,
    dur: number,
    type: OscillatorType,
    gain: number,
    slideTo?: number,
  ) {
    const ctx = this.ctx;
    if (!ctx) return;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(40, slideTo), t + dur);
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g);
    g.connect(ctx.destination);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  private noise(t: number, dur: number, gain: number) {
    const ctx = this.ctx;
    if (!ctx) return;
    const n = Math.floor(ctx.sampleRate * dur);
    const buf = ctx.createBuffer(1, n, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < n; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / n);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const g = ctx.createGain();
    const f = ctx.createBiquadFilter();
    f.type = "highpass";
    f.frequency.value = 400;
    g.gain.setValueAtTime(gain, t);
    src.connect(f);
    f.connect(g);
    g.connect(ctx.destination);
    src.start(t);
  }
}
