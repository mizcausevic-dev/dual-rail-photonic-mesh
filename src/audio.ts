import { logicalString, parseOcc } from "./math/fock";
import { fixedTrialKeys, TRIAL_COUNT } from "./timeline";

type Cue = { t: number; kind: "reveal" | "program" | "joint" | "preset" | "accept" | "outside" };

const FIXED_CUES: Cue[] = [
  { t: 5, kind: "reveal" },
  { t: 6.5, kind: "program" },
  { t: 7.2, kind: "program" },
  { t: 8, kind: "program" },
  { t: 10, kind: "reveal" },
  { t: 13.5, kind: "joint" },
  { t: 17, kind: "preset" },
  { t: 19.6, kind: "preset" },
  { t: 22.2, kind: "preset" },
];

function detectorCues(): Cue[] {
  const keys = fixedTrialKeys();
  const cues: Cue[] = [];
  let last = -10;
  keys.forEach((key, index) => {
    const t = 25 + ((index + 1) * 8) / TRIAL_COUNT;
    if (t > 33) return;
    const accepted = logicalString(parseOcc(key)) !== null;
    if (t - last < 0.24) return;
    if (accepted || index % 10 === 0) {
      cues.push({ t, kind: accepted ? "accept" : "outside" });
      last = t;
    }
  });
  return cues;
}

/**
 * Original procedural score. Oscillators and a generated noise buffer only.
 * These cues are explanatory, not optical frequencies and not collision sounds.
 */
export class Score {
  musicLevel = 0.7;
  sfxLevel = 0.75;
  muted = false;
  running = false;

  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private music: GainNode | null = null;
  private sfx: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private nodes: AudioScheduledSourceNode[] = [];
  private token = 0;
  private anchorT = 0;
  private anchorAudio = 0;

  attach(): void {
    if (this.ctx) return;
    const ctx = new AudioContext();
    const master = ctx.createGain();
    const music = ctx.createGain();
    const sfx = ctx.createGain();
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -16;
    comp.knee.value = 10;
    comp.ratio.value = 2;
    comp.attack.value = 0.008;
    comp.release.value = 0.2;
    music.connect(comp);
    sfx.connect(comp);
    comp.connect(master);
    master.connect(ctx.destination);
    this.ctx = ctx;
    this.master = master;
    this.music = music;
    this.sfx = sfx;
    this.noise = makeNoise(ctx);
    this.applyGains();
  }

  currentT(): number {
    if (!this.ctx || !this.running) return this.anchorT;
    return this.anchorT + (this.ctx.currentTime - this.anchorAudio);
  }

  async startAt(t: number): Promise<boolean> {
    this.attach();
    const token = ++this.token;
    const ctx = this.ctx!;
    this.stopNodes();
    if (ctx.state === "suspended") {
      try {
        await ctx.resume();
      } catch {
        this.running = false;
        return false;
      }
    }
    if (token !== this.token) return false;
    if (ctx.state !== "running") {
      this.running = false;
      return false;
    }
    this.anchorT = t;
    this.anchorAudio = ctx.currentTime;
    this.running = true;
    this.schedule(t);
    return true;
  }

  silence(): void {
    this.token += 1;
    this.running = false;
    this.stopNodes();
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    this.applyGains();
  }

  setMusic(level: number): void {
    this.musicLevel = level;
    this.applyGains();
  }

  setSfx(level: number): void {
    this.sfxLevel = level;
    this.applyGains();
  }

  private applyGains(): void {
    if (!this.master || !this.music || !this.sfx) return;
    this.master.gain.value = this.muted ? 0 : 0.85;
    this.music.gain.value = this.musicLevel;
    this.sfx.gain.value = this.sfxLevel;
  }

  private stopNodes(): void {
    const now = this.ctx?.currentTime ?? 0;
    for (const node of this.nodes) {
      try {
        node.stop(now);
      } catch {
        /* already stopped */
      }
    }
    this.nodes = [];
  }

  private schedule(fromT: number): void {
    const bed: [number, OscillatorType, number, number, number][] = [
      [110, "sine", 0.046, 0, 34],
      [164.81, "triangle", 0.016, 0.2, 34],
      [220, "sine", 0.011, 5, 17],
      [87.31, "sine", 0.034, 10, 17.3],
      [130.81, "triangle", 0.014, 10, 17.3],
      [146.83, "sine", 0.036, 17, 25.2],
      [220, "sine", 0.012, 17, 25.2],
      [174.61, "triangle", 0.011, 22.2, 25.2],
      [329.63, "sine", 0.009, 25, 33.2],
    ];
    for (const [freq, type, gain, start, end] of bed) this.bed(freq, type, gain, start, end, fromT);

    const motif = [220, 261.63, 329.63, 196, 246.94, 329.63, 174.61, 220, 261.63, 392, 329.63, 246.94, 220, 164.81, 196, 261.63, 329.63, 220, 174.61, 220, 261.63];
    motif.forEach((freq, index) => {
      const start = 0.8 + index * 1.55;
      if (start < 32.6) this.motif(freq, start, fromT);
    });

    for (const cue of FIXED_CUES) this.cue(cue, fromT);
    for (const cue of detectorCues()) this.cue(cue, fromT);
  }

  private at(t: number, fromT: number): number {
    return this.ctx!.currentTime + Math.max(0, t - fromT);
  }

  private bed(freq: number, type: OscillatorType, peak: number, start: number, end: number, fromT: number): void {
    if (!this.ctx || !this.music || end <= fromT) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    const filter = this.ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 1400;
    osc.type = type;
    osc.frequency.value = freq;
    osc.connect(filter);
    filter.connect(gain);
    gain.connect(this.music);
    const when = this.at(Math.max(start, fromT), fromT);
    const stop = this.at(end, fromT);
    const begin = Math.max(start, fromT);
    if (begin <= start + 0.05) {
      gain.gain.setValueAtTime(0.0001, when);
      gain.gain.exponentialRampToValueAtTime(peak, when + 0.45);
    } else {
      gain.gain.setValueAtTime(peak, when);
    }
    const releaseAt = Math.max(when + 0.05, stop - 0.8);
    gain.gain.setValueAtTime(peak, releaseAt);
    gain.gain.exponentialRampToValueAtTime(0.0001, stop);
    osc.start(when);
    osc.stop(stop + 0.02);
    this.nodes.push(osc);
  }

  private motif(freq: number, start: number, fromT: number): void {
    if (!this.ctx || !this.music || start + 0.7 <= fromT) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = "sine";
    osc.frequency.value = freq;
    osc.connect(gain);
    gain.connect(this.music);
    const when = this.at(start, fromT);
    gain.gain.setValueAtTime(0.0001, when);
    gain.gain.exponentialRampToValueAtTime(0.02, when + 0.03);
    gain.gain.exponentialRampToValueAtTime(0.0001, when + 0.55);
    osc.start(when);
    osc.stop(when + 0.58);
    this.nodes.push(osc);
  }

  private cue(cue: Cue, fromT: number): void {
    if (cue.t + 0.4 < fromT) return;
    if (cue.kind === "reveal") this.whoosh(cue.t, fromT);
    else if (cue.kind === "program") this.blip(cue.t, 740, 0.09, 0.03, fromT);
    else if (cue.kind === "joint") this.blip(cue.t, 392, 0.16, 0.028, fromT);
    else if (cue.kind === "preset") this.blip(cue.t, 523.25, 0.12, 0.03, fromT);
    else if (cue.kind === "accept") this.blip(cue.t, 1174, 0.05, 0.022, fromT);
    else this.blip(cue.t, 311, 0.05, 0.012, fromT);
  }

  private blip(t: number, freq: number, dur: number, peak: number, fromT: number): void {
    if (!this.ctx || !this.sfx) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    const filter = this.ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 2400;
    osc.type = "sine";
    osc.frequency.value = freq;
    osc.connect(filter);
    filter.connect(gain);
    gain.connect(this.sfx);
    const when = this.at(t, fromT);
    gain.gain.setValueAtTime(0.0001, when);
    gain.gain.exponentialRampToValueAtTime(peak, when + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, when + dur);
    osc.start(when);
    osc.stop(when + dur + 0.02);
    this.nodes.push(osc);
  }

  private whoosh(t: number, fromT: number): void {
    if (!this.ctx || !this.sfx || !this.noise) return;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noise;
    const filter = this.ctx.createBiquadFilter();
    filter.type = "bandpass";
    filter.frequency.value = 520;
    filter.Q.value = 0.7;
    const gain = this.ctx.createGain();
    src.connect(filter);
    filter.connect(gain);
    gain.connect(this.sfx);
    const when = this.at(t, fromT);
    gain.gain.setValueAtTime(0.0001, when);
    gain.gain.exponentialRampToValueAtTime(0.04, when + 0.04);
    gain.gain.exponentialRampToValueAtTime(0.0001, when + 0.28);
    src.start(when);
    src.stop(when + 0.3);
    this.nodes.push(src);
  }
}

function makeNoise(ctx: AudioContext): AudioBuffer {
  const length = Math.floor(ctx.sampleRate * 0.4);
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  let state = 214013;
  for (let i = 0; i < length; i++) {
    state = (state * 16807) % 2147483647;
    data[i] = (state / 2147483647) * 2 - 1;
  }
  return buffer;
}
