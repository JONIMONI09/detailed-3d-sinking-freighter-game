/* Prozedurale Sound-Engine (Web Audio) - keine externen Dateien. Alle Aufrufe sind fehlertolerant. */

export class AudioEngine {
  ctx: AudioContext | null = null;
  master!: GainNode;
  sfxBus!: GainNode;
  ambBus!: GainNode;
  musBus!: GainNode;
  sfxFilter!: BiquadFilterNode;
  noiseBuf!: AudioBuffer;
  vols = { master: 0.8, sfx: 1, ambient: 0.8, music: 0.5 };
  private oceanGain!: GainNode;
  private oceanFilter!: BiquadFilterNode;
  private windGain!: GainNode;
  private windFilter!: BiquadFilterNode;
  private engineGain!: GainNode;
  private engineOsc: OscillatorNode[] = [];
  private rushGain!: GainNode;
  private alarmGain!: GainNode;
  private alarmOsc!: OscillatorNode;
  private heartGain!: GainNode;
  private musicGain!: GainNode;
  private pad: OscillatorNode[] = [];
  private padFilter!: BiquadFilterNode;
  private chordT = 0;
  private chordI = 0;
  private lastStep = 0;
  private alarmOn = false;
  ready = false;

  init() {
    if (this.ctx) {
      this.resume();
      return;
    }
    try {
      const AC = window.AudioContext || (window as any).webkitAudioContext;
      if (!AC) return;
      const ctx = new AC();
      this.ctx = ctx;
      this.master = ctx.createGain();
      this.master.connect(ctx.destination);
      this.sfxFilter = ctx.createBiquadFilter();
      this.sfxFilter.type = "lowpass";
      this.sfxFilter.frequency.value = 20000;
      this.sfxBus = ctx.createGain();
      this.sfxBus.connect(this.sfxFilter);
      this.sfxFilter.connect(this.master);
      this.ambBus = ctx.createGain();
      this.ambBus.connect(this.sfxFilter);
      this.musBus = ctx.createGain();
      this.musBus.connect(this.master);
      // noise buffer
      const len = ctx.sampleRate * 2;
      this.noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
      const d = this.noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      this.buildAmbient();
      this.setVolumes(this.vols);
      this.ready = true;
    } catch (e) {
      console.warn("Audio init failed", e);
      this.ctx = null;
    }
  }

  resume() {
    try {
      if (this.ctx && this.ctx.state !== "running") this.ctx.resume();
    } catch {
      /* ignore */
    }
  }

  setVolumes(v: { master: number; sfx: number; ambient: number; music: number }) {
    this.vols = v;
    if (!this.ctx) return;
    this.master.gain.value = v.master;
    this.sfxBus.gain.value = v.sfx;
    this.ambBus.gain.value = v.ambient;
    this.musBus.gain.value = v.music * 0.5;
  }

  private loopNoise(): AudioBufferSourceNode {
    const s = this.ctx!.createBufferSource();
    s.buffer = this.noiseBuf;
    s.loop = true;
    s.start();
    return s;
  }

  private buildAmbient() {
    const ctx = this.ctx!;
    // ocean
    this.oceanFilter = ctx.createBiquadFilter();
    this.oceanFilter.type = "lowpass";
    this.oceanFilter.frequency.value = 500;
    this.oceanGain = ctx.createGain();
    this.oceanGain.gain.value = 0.25;
    this.loopNoise().connect(this.oceanFilter);
    this.oceanFilter.connect(this.oceanGain);
    this.oceanGain.connect(this.ambBus);
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.11;
    const lg = ctx.createGain();
    lg.gain.value = 0.12;
    lfo.connect(lg);
    lg.connect(this.oceanGain.gain);
    lfo.start();
    // wind
    this.windFilter = ctx.createBiquadFilter();
    this.windFilter.type = "bandpass";
    this.windFilter.frequency.value = 600;
    this.windFilter.Q.value = 0.7;
    this.windGain = ctx.createGain();
    this.windGain.gain.value = 0.08;
    this.loopNoise().connect(this.windFilter);
    this.windFilter.connect(this.windGain);
    this.windGain.connect(this.ambBus);
    const lfo2 = ctx.createOscillator();
    lfo2.frequency.value = 0.07;
    const lg2 = ctx.createGain();
    lg2.gain.value = 250;
    lfo2.connect(lg2);
    lg2.connect(this.windFilter.frequency);
    lfo2.start();
    // engine
    this.engineGain = ctx.createGain();
    this.engineGain.gain.value = 0;
    const ef = ctx.createBiquadFilter();
    ef.type = "lowpass";
    ef.frequency.value = 220;
    for (const [f, t] of [
      [38, "sawtooth"],
      [57, "square"],
      [19, "sine"],
    ] as [number, OscillatorType][]) {
      const o = ctx.createOscillator();
      o.type = t;
      o.frequency.value = f;
      const g = ctx.createGain();
      g.gain.value = t === "sine" ? 0.9 : 0.35;
      o.connect(g);
      g.connect(ef);
      o.start();
      this.engineOsc.push(o);
    }
    const beat = ctx.createOscillator();
    beat.frequency.value = 7.5;
    const bg = ctx.createGain();
    bg.gain.value = 0.25;
    beat.connect(bg);
    bg.connect(this.engineGain.gain);
    beat.start();
    ef.connect(this.engineGain);
    this.engineGain.connect(this.ambBus);
    // water rush
    const rf = ctx.createBiquadFilter();
    rf.type = "bandpass";
    rf.frequency.value = 900;
    rf.Q.value = 0.5;
    this.rushGain = ctx.createGain();
    this.rushGain.gain.value = 0;
    this.loopNoise().connect(rf);
    rf.connect(this.rushGain);
    this.rushGain.connect(this.sfxBus);
    // alarm
    this.alarmOsc = ctx.createOscillator();
    this.alarmOsc.type = "square";
    this.alarmOsc.frequency.value = 600;
    const af = ctx.createBiquadFilter();
    af.type = "lowpass";
    af.frequency.value = 1500;
    this.alarmGain = ctx.createGain();
    this.alarmGain.gain.value = 0;
    this.alarmOsc.connect(af);
    af.connect(this.alarmGain);
    this.alarmGain.connect(this.sfxBus);
    this.alarmOsc.start();
    // heartbeat gain
    this.heartGain = ctx.createGain();
    this.heartGain.gain.value = 0;
    this.heartGain.connect(this.sfxBus);
    // music pad
    this.padFilter = ctx.createBiquadFilter();
    this.padFilter.type = "lowpass";
    this.padFilter.frequency.value = 500;
    this.musicGain = ctx.createGain();
    this.musicGain.gain.value = 0;
    for (let i = 0; i < 4; i++) {
      const o = ctx.createOscillator();
      o.type = i % 2 ? "triangle" : "sawtooth";
      o.frequency.value = 110;
      o.detune.value = (i - 1.5) * 6;
      const g = ctx.createGain();
      g.gain.value = 0.18;
      o.connect(g);
      g.connect(this.padFilter);
      o.start();
      this.pad.push(o);
    }
    this.padFilter.connect(this.musicGain);
    this.musicGain.connect(this.musBus);
  }

  /** called each frame */
  update(dt: number, p: { engine: number; wind: number; waves: number; underwater: boolean; inside: boolean; rush: number; alarm: boolean; heart: number; tension: number; musicOn: boolean }) {
    if (!this.ctx || !this.ready) return;
    const t = this.ctx.currentTime;
    const k = 0.15;
    const inside = p.inside ? 0.45 : 1;
    this.oceanGain.gain.setTargetAtTime(0.18 * (0.5 + p.waves * 0.5) * inside, t, k);
    this.oceanFilter.frequency.setTargetAtTime(p.underwater ? 200 : 380 + p.waves * 400, t, k);
    this.windGain.gain.setTargetAtTime(0.05 * (0.4 + p.wind) * (p.inside ? 0.25 : 1), t, k);
    this.engineGain.gain.setTargetAtTime(p.engine * 0.35, t, 0.3);
    this.engineOsc[0].frequency.setTargetAtTime(30 + p.engine * 10, t, 0.5);
    this.rushGain.gain.setTargetAtTime(p.rush * 0.5, t, 0.2);
    this.sfxFilter.frequency.setTargetAtTime(p.underwater ? 450 : 20000, t, 0.08);
    if (p.alarm !== this.alarmOn) {
      this.alarmOn = p.alarm;
      this.alarmGain.gain.setTargetAtTime(p.alarm ? 0.07 : 0, t, 0.05);
    }
    if (this.alarmOn) {
      const ph = Math.floor((t * 1.6) % 2);
      this.alarmOsc.frequency.setTargetAtTime(ph ? 520 : 760, t, 0.02);
    }
    // heartbeat
    if (p.heart > 0) {
      this.chordT -= 0; // noop
      const beatPeriod = 1.1 - p.heart * 0.5;
      if (t - this.lastBeat > beatPeriod) {
        this.lastBeat = t;
        this.thump(55, 0.5 * p.heart, 0.12);
        setTimeout(() => this.thump(48, 0.35 * p.heart, 0.12), 170);
      }
    }
    // music
    this.musicGain.gain.setTargetAtTime(p.musicOn ? 0.35 + p.tension * 0.4 : 0, t, 1.5);
    this.padFilter.frequency.setTargetAtTime(350 + p.tension * 900, t, 1);
    this.chordT -= dt;
    if (this.chordT <= 0) {
      this.chordT = 7 + Math.random() * 3;
      const chords = [
        [110, 165, 220, 262],
        [87.3, 131, 174.6, 220],
        [98, 147, 196, 247],
        [82.4, 123.5, 164.8, 207.7],
      ];
      const tense = [
        [110, 155.6, 220, 233],
        [98, 138.6, 196, 207.7],
      ];
      const ch = p.tension > 0.5 ? tense[this.chordI % tense.length] : chords[this.chordI % chords.length];
      this.chordI++;
      this.pad.forEach((o, i) => o.frequency.setTargetAtTime(ch[i], t, 2.5));
    }
  }
  private lastBeat = 0;

  private out(pos?: { dist: number; pan: number }, gain = 1): AudioNode | null {
    if (!this.ctx) return null;
    const g = this.ctx.createGain();
    let v = gain;
    if (pos) v *= 1 / (1 + pos.dist * 0.07);
    g.gain.value = v;
    if (pos && (this.ctx as any).createStereoPanner) {
      const p = this.ctx.createStereoPanner();
      p.pan.value = Math.max(-1, Math.min(1, pos.pan));
      g.connect(p);
      p.connect(this.sfxBus);
    } else g.connect(this.sfxBus);
    return g;
  }

  private noise(dur: number, type: BiquadFilterType, f0: number, f1: number, q: number, vol: number, dest: AudioNode | null, attack = 0.002, delay = 0) {
    if (!this.ctx || !dest) return;
    const ctx = this.ctx;
    const t = ctx.currentTime + delay;
    const s = ctx.createBufferSource();
    s.buffer = this.noiseBuf;
    s.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.Q.value = q;
    f.frequency.setValueAtTime(f0, t);
    f.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vol, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f);
    f.connect(g);
    g.connect(dest);
    s.start(t, Math.random());
    s.stop(t + dur + 0.05);
  }

  private tone(type: OscillatorType, f0: number, f1: number, dur: number, vol: number, dest: AudioNode | null, delay = 0, attack = 0.005) {
    if (!this.ctx || !dest) return;
    const ctx = this.ctx;
    const t = ctx.currentTime + delay;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(10, f1), t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vol, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g);
    g.connect(dest);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  private thump(f: number, vol: number, dur: number) {
    this.tone("sine", f, f * 0.5, dur, vol, this.out());
  }

  private safe(fn: () => void) {
    if (!this.ctx || !this.ready) return;
    try {
      fn();
    } catch (e) {
      console.warn("audio", e);
    }
  }

  shot(kind: "pistol" | "shotgun" | "rifle", pos?: { dist: number; pan: number }) {
    this.safe(() => {
      const o = this.out(pos, kind === "shotgun" ? 1 : 0.85);
      if (kind === "pistol") {
        this.noise(0.18, "bandpass", 3000, 700, 0.8, 0.9, o);
        this.tone("square", 300, 60, 0.12, 0.5, o);
      } else if (kind === "shotgun") {
        this.noise(0.45, "lowpass", 4500, 300, 0.6, 1, o);
        this.tone("sawtooth", 140, 35, 0.3, 0.8, o);
        this.noise(0.15, "highpass", 2000, 4000, 0.5, 0.5, o);
      } else {
        this.noise(0.14, "bandpass", 3600, 900, 0.9, 0.8, o);
        this.tone("square", 240, 70, 0.1, 0.5, o);
      }
    });
  }

  explosion(pos?: { dist: number; pan: number }, power = 1) {
    this.safe(() => {
      const o = this.out(pos, 1.4);
      this.noise(2.8 * power, "lowpass", 3500, 60, 0.7, 1.2, o, 0.004);
      this.tone("sine", 90, 18, 1.6, 1.3, o);
      this.noise(0.5, "bandpass", 1500, 400, 0.5, 0.8, o);
      this.noise(2.2, "lowpass", 600, 40, 0.5, 0.7, o, 0.2, 0.25);
      this.tone("sawtooth", 60, 25, 1.0, 0.5, o, 0.05);
    });
  }

  step(kind: "metal" | "wet" | "carpet" | "wood", vol = 1) {
    this.safe(() => {
      const o = this.out(undefined, 0.35 * vol);
      if (kind === "wet") {
        this.noise(0.18, "bandpass", 900, 300, 1.2, 0.8, o);
      } else if (kind === "carpet") {
        this.noise(0.1, "lowpass", 500, 200, 0.5, 0.7, o);
      } else if (kind === "wood") {
        this.noise(0.09, "bandpass", 500, 250, 1.5, 0.9, o);
        this.tone("sine", 160, 90, 0.08, 0.4, o);
      } else {
        const f = 900 + Math.random() * 500;
        this.noise(0.1, "bandpass", f, f * 0.5, 3, 0.9, o);
        this.tone("triangle", 220 + Math.random() * 60, 120, 0.12, 0.25, o);
      }
    });
  }

  door(kind: "open" | "close" | "slide" | "hatch", pos?: { dist: number; pan: number }) {
    this.safe(() => {
      const o = this.out(pos, 0.9);
      if (kind === "open") {
        this.tone("sawtooth", 140, 260, 0.55, 0.18, o, 0, 0.1);
        this.noise(0.5, "bandpass", 900, 1500, 4, 0.18, o, 0.1);
        this.noise(0.08, "lowpass", 400, 200, 1, 0.6, o);
      } else if (kind === "close") {
        this.tone("sawtooth", 240, 120, 0.4, 0.15, o, 0, 0.05);
        this.noise(0.18, "lowpass", 700, 120, 1, 1, o, 0.002, 0.35);
        this.tone("sine", 110, 50, 0.25, 0.9, o, 0.35);
      } else if (kind === "slide") {
        this.noise(1.1, "bandpass", 500, 300, 2, 0.4, o, 0.15);
        this.tone("sawtooth", 70, 55, 1.0, 0.15, o, 0, 0.2);
        this.tone("sine", 70, 40, 0.3, 0.8, o, 1.0);
      } else {
        this.noise(0.5, "bandpass", 600, 250, 3, 0.5, o, 0.05);
        this.tone("sine", 100, 45, 0.3, 0.8, o, 0.4);
      }
    });
  }

  locked() {
    this.safe(() => {
      const o = this.out(undefined, 0.5);
      this.tone("square", 180, 175, 0.12, 0.5, o);
      this.tone("square", 140, 135, 0.18, 0.5, o, 0.14);
    });
  }
  unlock() {
    this.safe(() => {
      const o = this.out(undefined, 0.5);
      this.tone("sine", 880, 880, 0.1, 0.6, o);
      this.tone("sine", 1320, 1320, 0.2, 0.6, o, 0.1);
    });
  }
  pickup() {
    this.safe(() => {
      const o = this.out(undefined, 0.6);
      this.tone("triangle", 520, 520, 0.1, 0.6, o);
      this.tone("triangle", 780, 780, 0.1, 0.6, o, 0.08);
      this.tone("triangle", 1040, 1040, 0.25, 0.6, o, 0.16);
    });
  }
  click() {
    this.safe(() => {
      const o = this.out(undefined, 0.4);
      this.tone("square", 900, 600, 0.04, 0.3, o);
    });
  }
  empty() {
    this.safe(() => {
      const o = this.out(undefined, 0.6);
      this.noise(0.04, "highpass", 3000, 3000, 1, 0.6, o);
      this.tone("square", 1200, 800, 0.03, 0.2, o);
    });
  }
  reload(kind: "mag" | "shell" | "pump") {
    this.safe(() => {
      const o = this.out(undefined, 0.7);
      if (kind === "mag") {
        this.noise(0.06, "bandpass", 2500, 1500, 3, 0.7, o);
        this.noise(0.08, "bandpass", 1800, 900, 3, 0.9, o, 0.002, 0.7);
        this.tone("square", 400, 300, 0.05, 0.3, o, 1.0);
      } else if (kind === "shell") {
        this.noise(0.05, "bandpass", 2000, 1200, 3, 0.7, o);
        this.tone("triangle", 300, 220, 0.06, 0.4, o);
      } else {
        this.noise(0.1, "bandpass", 1200, 500, 2, 0.8, o);
        this.noise(0.12, "bandpass", 1000, 400, 2, 0.8, o, 0.002, 0.18);
      }
    });
  }
  hit(head = false) {
    this.safe(() => {
      const o = this.out(undefined, 0.5);
      this.tone("sine", head ? 1500 : 1000, head ? 1500 : 1000, 0.07, 0.5, o);
    });
  }
  hurt() {
    this.safe(() => {
      const o = this.out(undefined, 0.9);
      this.tone("sawtooth", 160, 70, 0.25, 0.6, o);
      this.noise(0.2, "lowpass", 700, 200, 1, 0.8, o);
    });
  }
  bulletImpact(pos?: { dist: number; pan: number }, metal = true) {
    this.safe(() => {
      const o = this.out(pos, 0.5);
      if (metal) {
        this.noise(0.12, "bandpass", 3500, 2500, 6, 0.6, o);
        this.tone("triangle", 2200, 1500, 0.15, 0.2, o);
      } else this.noise(0.1, "lowpass", 900, 300, 1, 0.8, o);
    });
  }
  glass(pos?: { dist: number; pan: number }) {
    this.safe(() => {
      const o = this.out(pos, 0.8);
      this.noise(0.5, "highpass", 4000, 6000, 1, 0.9, o);
      for (let i = 0; i < 6; i++) this.tone("triangle", 2500 + Math.random() * 3000, 2000, 0.08, 0.2, o, Math.random() * 0.3);
    });
  }
  splash(pos?: { dist: number; pan: number }, big = false) {
    this.safe(() => {
      const o = this.out(pos, big ? 1 : 0.6);
      this.noise(big ? 1 : 0.5, "bandpass", 1500, 400, 0.6, 0.9, o, 0.02);
    });
  }
  beep(high = false, pos?: { dist: number; pan: number }) {
    this.safe(() => {
      const o = this.out(pos, 0.5);
      this.tone("square", high ? 1900 : 1400, high ? 1900 : 1400, 0.06, 0.4, o);
    });
  }
  fuseLit() {
    this.safe(() => {
      const o = this.out(undefined, 0.5);
      this.noise(0.5, "highpass", 3500, 6000, 0.7, 0.6, o, 0.05);
    });
  }
  throw() {
    this.safe(() => {
      const o = this.out(undefined, 0.5);
      this.noise(0.2, "bandpass", 700, 1500, 1, 0.5, o, 0.05);
    });
  }
  detonator() {
    this.safe(() => {
      const o = this.out(undefined, 0.7);
      this.tone("square", 2000, 2000, 0.05, 0.4, o);
      this.tone("square", 2600, 2600, 0.15, 0.4, o, 0.1);
    });
  }
  creak(vol = 1) {
    this.safe(() => {
      const o = this.out(undefined, 0.55 * vol);
      const f = 60 + Math.random() * 80;
      const d = 1.5 + Math.random() * 2;
      this.tone("sawtooth", f, f * (0.7 + Math.random() * 0.8), d, 0.35, o, 0, 0.4);
      this.tone("square", f * 2.02, f * 1.5, d * 0.8, 0.15, o, 0.1, 0.5);
      this.noise(d, "bandpass", 300 + Math.random() * 400, 200, 8, 0.25, o, 0.5);
    });
  }
  gull() {
    this.safe(() => {
      const o = this.out({ dist: 25 + Math.random() * 30, pan: Math.random() * 2 - 1 }, 0.6);
      for (let i = 0; i < 3; i++) this.tone("sawtooth", 1700 + Math.random() * 300, 1100, 0.22, 0.25, o, i * 0.25, 0.04);
    });
  }
  metalImpact(vol = 1) {
    this.safe(() => {
      const o = this.out(undefined, 0.6 * vol);
      this.tone("triangle", 180, 90, 0.5, 0.7, o);
      this.noise(0.3, "bandpass", 800, 300, 3, 0.6, o);
    });
  }
  gurgle() {
    this.safe(() => {
      const o = this.out(undefined, 0.5);
      for (let i = 0; i < 5; i++) this.tone("sine", 300 + Math.random() * 400, 800, 0.1, 0.4, o, i * 0.09);
    });
  }
  win() {
    this.safe(() => {
      const o = this.out(undefined, 0.8);
      [523, 659, 784, 1046].forEach((f, i) => this.tone("triangle", f, f, 0.6, 0.5, o, i * 0.18, 0.02));
    });
  }
  lose() {
    this.safe(() => {
      const o = this.out(undefined, 0.8);
      [330, 262, 208, 165].forEach((f, i) => this.tone("sawtooth", f, f * 0.98, 0.7, 0.35, o, i * 0.3, 0.05));
    });
  }
  stepTimer(now: number, interval: number, fn: () => void) {
    if (now - this.lastStep > interval) {
      this.lastStep = now;
      fn();
    }
  }
  dispose() {
    try {
      this.ctx?.close();
    } catch {
      /* ignore */
    }
    this.ctx = null;
    this.ready = false;
  }
}
