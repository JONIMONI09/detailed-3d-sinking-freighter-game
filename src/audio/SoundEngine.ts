import { AudioSettings, WeaponType } from '../types/game';

class SoundEngine {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private oceanGain: GainNode | null = null;
  private engineGain: GainNode | null = null;
  private engineOsc: OscillatorNode | null = null;
  private waterRushGain: GainNode | null = null;
  private settings: AudioSettings = {
    masterVolume: 0.75,
    sfxVolume: 0.85,
    alarmVolume: 0.65,
    ambientVolume: 0.6,
    muted: false,
  };
  private initialized = false;
  private lastAlarmTime = 0;
  private lastFootstepTime = 0;
  private lastGroanTime = 0;
  private noiseBuffer: AudioBuffer | null = null;

  public init(): void {
    if (this.initialized && this.ctx) {
      if (this.ctx.state === 'suspended') {
        this.ctx.resume().catch(() => {});
      }
      return;
    }

    try {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) return;

      this.ctx = new AudioCtx();
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.value = this.settings.muted ? 0 : this.settings.masterVolume;
      this.masterGain.connect(this.ctx.destination);

      // Create shared 2-second white/pink noise buffer
      const bufferSize = this.ctx.sampleRate * 2;
      this.noiseBuffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
      const output = this.noiseBuffer.getChannelData(0);
      let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
      for (let i = 0; i < bufferSize; i++) {
        const white = Math.random() * 2 - 1;
        b0 = 0.99886 * b0 + white * 0.0555179;
        b1 = 0.99332 * b1 + white * 0.0750759;
        b2 = 0.96900 * b2 + white * 0.1538520;
        b3 = 0.86650 * b3 + white * 0.3104856;
        b4 = 0.55000 * b4 + white * 0.5329522;
        b5 = -0.7616 * b5 - white * 0.0168980;
        output[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362) * 0.04;
        b6 = white * 0.115926;
      }

      // Ocean Surf Continuous Loop
      const oceanSource = this.ctx.createBufferSource();
      oceanSource.buffer = this.noiseBuffer;
      oceanSource.loop = true;
      const oceanFilter = this.ctx.createBiquadFilter();
      oceanFilter.type = 'lowpass';
      oceanFilter.frequency.value = 320;
      this.oceanGain = this.ctx.createGain();
      this.oceanGain.gain.value = 0.08 * this.settings.ambientVolume;
      oceanSource.connect(oceanFilter);
      oceanFilter.connect(this.oceanGain);
      this.oceanGain.connect(this.masterGain);
      oceanSource.start();

      // Water Rushing Ingress Continuous Loop
      const rushSource = this.ctx.createBufferSource();
      rushSource.buffer = this.noiseBuffer;
      rushSource.loop = true;
      const rushFilter = this.ctx.createBiquadFilter();
      rushFilter.type = 'bandpass';
      rushFilter.frequency.value = 720;
      rushFilter.Q.value = 0.9;
      this.waterRushGain = this.ctx.createGain();
      this.waterRushGain.gain.value = 0;
      rushSource.connect(rushFilter);
      rushFilter.connect(this.waterRushGain);
      this.waterRushGain.connect(this.masterGain);
      rushSource.start();

      // Marine Diesel Engine Rumble Loop
      this.engineOsc = this.ctx.createOscillator();
      this.engineOsc.type = 'sawtooth';
      this.engineOsc.frequency.value = 36;
      const engineFilter = this.ctx.createBiquadFilter();
      engineFilter.type = 'lowpass';
      engineFilter.frequency.value = 95;
      this.engineGain = this.ctx.createGain();
      this.engineGain.gain.value = 0.04 * this.settings.ambientVolume;
      this.engineOsc.connect(engineFilter);
      engineFilter.connect(this.engineGain);
      this.engineGain.connect(this.masterGain);
      this.engineOsc.start();

      this.initialized = true;
    } catch {
      // Ignore audio init errors on restricted platforms
    }
  }

  public updateSettings(newSettings: AudioSettings): void {
    this.settings = { ...newSettings };
    if (this.masterGain && this.ctx) {
      const target = this.settings.muted ? 0 : this.settings.masterVolume;
      this.masterGain.gain.setTargetAtTime(target, this.ctx.currentTime, 0.05);
    }
  }

  public updateContinuousAmbience(params: {
    breachCount: number;
    engineRoomProximity: number; // 0..1
    engineRunning: boolean;
    underwater: boolean;
    alarmActive: boolean;
    rollDeg: number;
    nowSeconds: number;
  }): void {
    if (!this.initialized || !this.ctx || !this.masterGain) return;
    if (this.ctx.state === 'suspended') return;

    const now = this.ctx.currentTime;
    const amb = this.settings.muted ? 0 : this.settings.ambientVolume;

    if (this.oceanGain) {
      const targetOcean = (params.underwater ? 0.18 : 0.1) * amb;
      this.oceanGain.gain.setTargetAtTime(targetOcean, now, 0.15);
    }

    if (this.waterRushGain) {
      const breachFactor = Math.min(1, params.breachCount * 0.25);
      const targetRush = breachFactor * 0.28 * amb;
      this.waterRushGain.gain.setTargetAtTime(targetRush, now, 0.2);
    }

    if (this.engineGain && this.engineOsc) {
      const engTarget = params.engineRunning ? (0.02 + params.engineRoomProximity * 0.16) * amb : 0;
      this.engineGain.gain.setTargetAtTime(engTarget, now, 0.15);
      const chug = 34 + Math.sin(params.nowSeconds * 18) * 3;
      this.engineOsc.frequency.setTargetAtTime(chug, now, 0.04);
    }

    // Periodic Emergency Alarm Klaxon
    if (params.alarmActive && params.nowSeconds - this.lastAlarmTime > 1.8) {
      this.lastAlarmTime = params.nowSeconds;
      this.playAlarmKlaxon();
    }

    // Periodic Hull Groaning when listing heavily
    if (Math.abs(params.rollDeg) > 10 && params.nowSeconds - this.lastGroanTime > 6.5) {
      this.lastGroanTime = params.nowSeconds;
      this.playHullGroan();
    }
  }

  public playFootstep(surface: 'steel' | 'water' | 'stair'): void {
    this.init();
    if (!this.ctx || !this.masterGain || this.settings.muted) return;
    const now = performance.now();
    if (now - this.lastFootstepTime < 260) return;
    this.lastFootstepTime = now;

    try {
      const t = this.ctx.currentTime;
      const vol = 0.14 * this.settings.sfxVolume;

      if (surface === 'water') {
        if (!this.noiseBuffer) return;
        const src = this.ctx.createBufferSource();
        src.buffer = this.noiseBuffer;
        const filter = this.ctx.createBiquadFilter();
        filter.type = 'bandpass';
        filter.frequency.setValueAtTime(450, t);
        filter.frequency.exponentialRampToValueAtTime(950, t + 0.14);
        const gain = this.ctx.createGain();
        gain.gain.setValueAtTime(vol * 1.3, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
        src.connect(filter);
        filter.connect(gain);
        gain.connect(this.masterGain);
        src.start(t);
        src.stop(t + 0.19);
      } else {
        // Metallic boot clank on steel deck
        const osc = this.ctx.createOscillator();
        osc.type = 'triangle';
        const baseFreq = surface === 'stair' ? 195 + Math.random() * 40 : 125 + Math.random() * 25;
        osc.frequency.setValueAtTime(baseFreq, t);
        osc.frequency.exponentialRampToValueAtTime(42, t + 0.09);

        const gain = this.ctx.createGain();
        gain.gain.setValueAtTime(vol, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.095);

        osc.connect(gain);
        gain.connect(this.masterGain);
        osc.start(t);
        osc.stop(t + 0.1);
      }
    } catch {}
  }

  public playDoorSound(type: 'hinged' | 'bulkhead' | 'locked', opening: boolean): void {
    this.init();
    if (!this.ctx || !this.masterGain || this.settings.muted) return;

    try {
      const t = this.ctx.currentTime;
      const vol = 0.35 * this.settings.sfxVolume;

      if (type === 'locked') {
        // Metallic rattle
        for (let i = 0; i < 2; i++) {
          const osc = this.ctx.createOscillator();
          osc.type = 'square';
          osc.frequency.setValueAtTime(220 - i * 40, t + i * 0.08);
          const g = this.ctx.createGain();
          g.gain.setValueAtTime(vol * 0.6, t + i * 0.08);
          g.gain.exponentialRampToValueAtTime(0.001, t + i * 0.08 + 0.06);
          osc.connect(g);
          g.connect(this.masterGain);
          osc.start(t + i * 0.08);
          osc.stop(t + i * 0.08 + 0.07);
        }
        return;
      }

      if (type === 'bulkhead') {
        // Heavy hydraulic bulkhead slide + pneumatic hiss
        const osc = this.ctx.createOscillator();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(opening ? 68 : 92, t);
        osc.frequency.linearRampToValueAtTime(opening ? 95 : 58, t + 0.65);

        const filter = this.ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.value = 260;

        const gain = this.ctx.createGain();
        gain.gain.setValueAtTime(vol * 0.85, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.7);

        osc.connect(filter);
        filter.connect(gain);
        gain.connect(this.masterGain);
        osc.start(t);
        osc.stop(t + 0.72);
      } else {
        // Steel hinged ship door latch wheel + creak
        const osc = this.ctx.createOscillator();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(opening ? 310 : 420, t);
        osc.frequency.exponentialRampToValueAtTime(opening ? 480 : 180, t + 0.28);

        const gain = this.ctx.createGain();
        gain.gain.setValueAtTime(vol * 0.7, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.3);

        osc.connect(gain);
        gain.connect(this.masterGain);
        osc.start(t);
        osc.stop(t + 0.32);
      }
    } catch {}
  }

  public playTntBeep(urgent: boolean): void {
    this.init();
    if (!this.ctx || !this.masterGain || this.settings.muted) return;

    try {
      const t = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(urgent ? 1850 : 1240, t);

      const gain = this.ctx.createGain();
      gain.gain.setValueAtTime(0.18 * this.settings.sfxVolume, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + (urgent ? 0.055 : 0.08));

      osc.connect(gain);
      gain.connect(this.masterGain);
      osc.start(t);
      osc.stop(t + 0.09);
    } catch {}
  }

  public playPlantCharge(): void {
    this.init();
    if (!this.ctx || !this.masterGain || this.settings.muted) return;

    try {
      const t = this.ctx.currentTime;
      // Magnetic thud + arming chirp
      const osc = this.ctx.createOscillator();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(160, t);
      osc.frequency.exponentialRampToValueAtTime(55, t + 0.12);

      const gain = this.ctx.createGain();
      gain.gain.setValueAtTime(0.35 * this.settings.sfxVolume, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.13);

      osc.connect(gain);
      gain.connect(this.masterGain);
      osc.start(t);
      osc.stop(t + 0.14);

      // High tech chirp
      const chirp = this.ctx.createOscillator();
      chirp.type = 'sine';
      chirp.frequency.setValueAtTime(980, t + 0.08);
      chirp.frequency.setValueAtTime(1480, t + 0.13);
      const cg = this.ctx.createGain();
      cg.gain.setValueAtTime(0.16 * this.settings.sfxVolume, t + 0.08);
      cg.gain.exponentialRampToValueAtTime(0.001, t + 0.2);
      chirp.connect(cg);
      cg.connect(this.masterGain);
      chirp.start(t + 0.08);
      chirp.stop(t + 0.21);
    } catch {}
  }

  public playC4Clacker(): void {
    this.init();
    if (!this.ctx || !this.masterGain || this.settings.muted) return;

    try {
      const t = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      osc.type = 'square';
      osc.frequency.setValueAtTime(640, t);
      osc.frequency.setValueAtTime(2100, t + 0.04);

      const gain = this.ctx.createGain();
      gain.gain.setValueAtTime(0.28 * this.settings.sfxVolume, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.11);

      osc.connect(gain);
      gain.connect(this.masterGain);
      osc.start(t);
      osc.stop(t + 0.12);
    } catch {}
  }

  public playWeaponFire(weapon: WeaponType): void {
    this.init();
    if (!this.ctx || !this.masterGain || this.settings.muted) return;

    try {
      const t = this.ctx.currentTime;
      const vol = this.settings.sfxVolume;

      if (weapon === 'shotgun') {
        // Punchy shotgun blast
        if (this.noiseBuffer) {
          const src = this.ctx.createBufferSource();
          src.buffer = this.noiseBuffer;
          const filter = this.ctx.createBiquadFilter();
          filter.type = 'lowpass';
          filter.frequency.setValueAtTime(1800, t);
          filter.frequency.exponentialRampToValueAtTime(240, t + 0.25);

          const g = this.ctx.createGain();
          g.gain.setValueAtTime(0.6 * vol, t);
          g.gain.exponentialRampToValueAtTime(0.001, t + 0.28);

          src.connect(filter);
          filter.connect(g);
          g.connect(this.masterGain);
          src.start(t);
          src.stop(t + 0.3);
        }
        const sub = this.ctx.createOscillator();
        sub.type = 'sine';
        sub.frequency.setValueAtTime(140, t);
        sub.frequency.exponentialRampToValueAtTime(38, t + 0.18);
        const sg = this.ctx.createGain();
        sg.gain.setValueAtTime(0.5 * vol, t);
        sg.gain.exponentialRampToValueAtTime(0.001, t + 0.2);
        sub.connect(sg);
        sg.connect(this.masterGain);
        sub.start(t);
        sub.stop(t + 0.21);
      } else if (weapon === 'rpg') {
        // Thump + rocket propellant whoosh
        const osc = this.ctx.createOscillator();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(180, t);
        osc.frequency.exponentialRampToValueAtTime(48, t + 0.22);
        const g = this.ctx.createGain();
        g.gain.setValueAtTime(0.5 * vol, t);
        g.gain.exponentialRampToValueAtTime(0.001, t + 0.25);
        osc.connect(g);
        g.connect(this.masterGain);
        osc.start(t);
        osc.stop(t + 0.26);

        if (this.noiseBuffer) {
          const src = this.ctx.createBufferSource();
          src.buffer = this.noiseBuffer;
          const filter = this.ctx.createBiquadFilter();
          filter.type = 'bandpass';
          filter.frequency.setValueAtTime(900, t);
          filter.frequency.linearRampToValueAtTime(420, t + 0.45);
          const ng = this.ctx.createGain();
          ng.gain.setValueAtTime(0.35 * vol, t);
          ng.gain.exponentialRampToValueAtTime(0.001, t + 0.48);
          src.connect(filter);
          filter.connect(ng);
          ng.connect(this.masterGain);
          src.start(t);
          src.stop(t + 0.5);
        }
      } else if (weapon === 'welder') {
        // Electric plasma arc sizzle
        const osc = this.ctx.createOscillator();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(420 + Math.random() * 280, t);
        const g = this.ctx.createGain();
        g.gain.setValueAtTime(0.14 * vol, t);
        g.gain.exponentialRampToValueAtTime(0.001, t + 0.09);
        osc.connect(g);
        g.connect(this.masterGain);
        osc.start(t);
        osc.stop(t + 0.1);
      }
    } catch {}
  }

  public playExplosion(intensity = 1.0, underwater = false): void {
    this.init();
    if (!this.ctx || !this.masterGain || this.settings.muted) return;

    try {
      const t = this.ctx.currentTime;
      const vol = Math.min(1.2, intensity) * this.settings.sfxVolume;

      // 1. Sub-bass shockwave boom
      const sub = this.ctx.createOscillator();
      sub.type = 'sine';
      sub.frequency.setValueAtTime(95, t);
      sub.frequency.exponentialRampToValueAtTime(22, t + 1.1);

      const subGain = this.ctx.createGain();
      subGain.gain.setValueAtTime(0.85 * vol, t);
      subGain.gain.exponentialRampToValueAtTime(0.001, t + 1.2);

      sub.connect(subGain);
      subGain.connect(this.masterGain);
      sub.start(t);
      sub.stop(t + 1.25);

      // 2. Explosive broadband roar + metallic hull tear
      if (this.noiseBuffer) {
        const src = this.ctx.createBufferSource();
        src.buffer = this.noiseBuffer;

        const filter = this.ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(underwater ? 480 : 1650, t);
        filter.frequency.exponentialRampToValueAtTime(110, t + 1.5);

        const nGain = this.ctx.createGain();
        nGain.gain.setValueAtTime(0.95 * vol, t);
        nGain.gain.exponentialRampToValueAtTime(0.001, t + 1.6);

        src.connect(filter);
        filter.connect(nGain);
        nGain.connect(this.masterGain);
        src.start(t);
        src.stop(t + 1.65);
      }
    } catch {}
  }

  public playHullGroan(): void {
    this.init();
    if (!this.ctx || !this.masterGain || this.settings.muted) return;

    try {
      const t = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(52, t);
      osc.frequency.linearRampToValueAtTime(39, t + 0.9);
      osc.frequency.linearRampToValueAtTime(61, t + 1.7);

      const filter = this.ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.value = 140;
      filter.Q.value = 4.5;

      const gain = this.ctx.createGain();
      gain.gain.setValueAtTime(0.001, t);
      gain.gain.linearRampToValueAtTime(0.22 * this.settings.ambientVolume, t + 0.4);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 1.85);

      osc.connect(filter);
      filter.connect(gain);
      gain.connect(this.masterGain);
      osc.start(t);
      osc.stop(t + 1.9);
    } catch {}
  }

  public playAlarmKlaxon(): void {
    this.init();
    if (!this.ctx || !this.masterGain || this.settings.muted) return;

    try {
      const t = this.ctx.currentTime;
      const vol = 0.22 * this.settings.alarmVolume;
      if (vol <= 0.005) return;

      const osc = this.ctx.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(440, t);
      osc.frequency.linearRampToValueAtTime(680, t + 0.42);
      osc.frequency.linearRampToValueAtTime(420, t + 0.65);

      const filter = this.ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 1200;

      const gain = this.ctx.createGain();
      gain.gain.setValueAtTime(0.01, t);
      gain.gain.linearRampToValueAtTime(vol, t + 0.08);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.7);

      osc.connect(filter);
      filter.connect(gain);
      gain.connect(this.masterGain);
      osc.start(t);
      osc.stop(t + 0.72);
    } catch {}
  }

  public playUiClick(): void {
    this.init();
    if (!this.ctx || !this.masterGain || this.settings.muted) return;

    try {
      const t = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(1100, t);
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(0.08 * this.settings.sfxVolume, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.035);
      osc.connect(g);
      g.connect(this.masterGain);
      osc.start(t);
      osc.stop(t + 0.04);
    } catch {}
  }
}

export const soundEngine = new SoundEngine();
