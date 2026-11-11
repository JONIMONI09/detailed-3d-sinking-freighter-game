export type Preset = "low" | "medium" | "high" | "ultra";
export type Weather = "clear" | "cloudy" | "storm";
export type Difficulty = "easy" | "normal" | "hard";

export interface Settings {
  preset: Preset | "custom";
  resolution: number; // render scale
  shadows: 0 | 1 | 2 | 3;
  antialias: boolean;
  water: 0 | 1 | 2;
  particles: number; // 0..1
  lights: number; // pooled lights 0..8
  fov: number;
  viewDistance: number; // 0.3 .. 1
  autoQuality: boolean;
  showFps: boolean;
  timeOfDay: number;
  weather: Weather;
  waveHeight: number;
  sens: number;
  invertY: boolean;
  touch: "auto" | "on" | "off";
  touchSens: number;
  touchOpacity: number;
  touchScale: number;
  leftHanded: boolean;
  hudScale: number;
  headBob: boolean;
  shake: number;
  master: number;
  sfx: number;
  ambient: number;
  music: number;
  crosshair: "dot" | "cross" | "circle";
  difficulty: Difficulty;
  floodSpeed: number;
  guards: boolean;
}

export const PRESETS: Record<Preset, Partial<Settings>> = {
  low: { resolution: 0.6, shadows: 0, antialias: false, water: 0, particles: 0.35, lights: 2, viewDistance: 0.55 },
  medium: { resolution: 0.85, shadows: 1, antialias: false, water: 1, particles: 0.65, lights: 4, viewDistance: 0.75 },
  high: { resolution: 1, shadows: 2, antialias: true, water: 2, particles: 1, lights: 6, viewDistance: 0.9 },
  ultra: { resolution: 1.25, shadows: 3, antialias: true, water: 2, particles: 1, lights: 8, viewDistance: 1 },
};

export const DEFAULTS: Settings = {
  preset: "medium",
  resolution: 0.85,
  shadows: 1,
  antialias: false,
  water: 1,
  particles: 0.65,
  lights: 4,
  fov: 75,
  viewDistance: 0.75,
  autoQuality: true,
  showFps: false,
  timeOfDay: 15,
  weather: "clear",
  waveHeight: 1,
  sens: 1,
  invertY: false,
  touch: "auto",
  touchSens: 1,
  touchOpacity: 0.7,
  touchScale: 1,
  leftHanded: false,
  hudScale: 1,
  headBob: true,
  shake: 1,
  master: 0.8,
  sfx: 1,
  ambient: 0.8,
  music: 0.5,
  crosshair: "cross",
  difficulty: "normal",
  floodSpeed: 1,
  guards: true,
};

const KEY = "nordwind_settings_v1";

export function isMobileDevice(): boolean {
  try {
    const coarse = window.matchMedia && window.matchMedia("(pointer: coarse)").matches;
    return coarse || navigator.maxTouchPoints > 1;
  } catch {
    return false;
  }
}

export function loadSettings(): Settings {
  let s: Settings = { ...DEFAULTS };
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const p = JSON.parse(raw) as Partial<Settings>;
      s = { ...s, ...p };
    } else if (isMobileDevice()) {
      s = { ...s, preset: "low", ...(PRESETS.low as Partial<Settings>) };
    }
  } catch {
    /* ignore */
  }
  return sanitize(s);
}

export function saveSettings(s: Settings) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* ignore */
  }
}

const clamp = (v: number, a: number, b: number, d: number) =>
  typeof v === "number" && isFinite(v) ? Math.min(b, Math.max(a, v)) : d;

export function sanitize(s: Settings): Settings {
  const o = { ...DEFAULTS, ...s };
  o.resolution = clamp(o.resolution, 0.4, 1.5, 0.85);
  o.particles = clamp(o.particles, 0, 1, 0.65);
  o.lights = Math.round(clamp(o.lights, 0, 8, 4));
  o.fov = clamp(o.fov, 50, 110, 75);
  o.viewDistance = clamp(o.viewDistance, 0.3, 1, 0.75);
  o.timeOfDay = clamp(o.timeOfDay, 0, 24, 15);
  o.waveHeight = clamp(o.waveHeight, 0.2, 2.5, 1);
  o.sens = clamp(o.sens, 0.2, 3, 1);
  o.touchSens = clamp(o.touchSens, 0.3, 3, 1);
  o.touchOpacity = clamp(o.touchOpacity, 0.2, 1, 0.7);
  o.touchScale = clamp(o.touchScale, 0.6, 1.6, 1);
  o.hudScale = clamp(o.hudScale, 0.6, 1.6, 1);
  o.shake = clamp(o.shake, 0, 1.5, 1);
  o.master = clamp(o.master, 0, 1, 0.8);
  o.sfx = clamp(o.sfx, 0, 1, 1);
  o.ambient = clamp(o.ambient, 0, 1, 0.8);
  o.music = clamp(o.music, 0, 1, 0.5);
  o.floodSpeed = clamp(o.floodSpeed, 0.3, 4, 1);
  if (![0, 1, 2, 3].includes(o.shadows)) o.shadows = 1;
  if (![0, 1, 2].includes(o.water)) o.water = 1;
  return o;
}
