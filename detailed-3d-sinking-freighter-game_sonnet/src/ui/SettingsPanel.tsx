import { useState } from "react";
import { DEFAULTS, PRESETS, Preset, Settings, sanitize } from "../game/settings";

interface Props {
  settings: Settings;
  onChange: (s: Settings) => void;
  onClose: () => void;
  inGame?: boolean;
}

function Row({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5 py-2.5 border-b border-white/5 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
      <div className="min-w-0 sm:w-1/2">
        <div className="text-[15px] font-medium text-slate-100">{label}</div>
        {hint && <div className="text-xs text-slate-400 leading-snug">{hint}</div>}
      </div>
      <div className="sm:w-1/2 sm:max-w-[320px]">{children}</div>
    </div>
  );
}

function Slider({ value, min, max, step, onChange, fmt }: { value: number; min: number; max: number; step: number; onChange: (v: number) => void; fmt?: (v: number) => string }) {
  return (
    <div className="flex items-center gap-3">
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="h-8 w-full cursor-pointer accent-orange-500"
      />
      <span className="w-14 shrink-0 text-right font-mono text-sm text-orange-300">{fmt ? fmt(value) : value}</span>
    </div>
  );
}

function Seg<T extends string | number>({ value, options, onChange }: { value: T; options: [T, string][]; onChange: (v: T) => void }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map(([v, l]) => (
        <button
          key={String(v)}
          onClick={() => onChange(v)}
          className={`min-h-[40px] flex-1 rounded-lg border px-2.5 py-1.5 text-sm font-medium transition ${
            value === v ? "border-orange-400 bg-orange-500/90 text-white shadow" : "border-white/10 bg-white/5 text-slate-200 hover:bg-white/10"
          }`}
        >
          {l}
        </button>
      ))}
    </div>
  );
}

function Toggle({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      onClick={() => onChange(!value)}
      aria-pressed={value}
      className={`relative h-8 w-14 rounded-full border transition ${value ? "border-orange-400 bg-orange-500" : "border-white/15 bg-white/10"}`}
    >
      <span className={`absolute top-0.5 h-6 w-6 rounded-full bg-white shadow transition-all ${value ? "left-[30px]" : "left-0.5"}`} />
    </button>
  );
}

const pct = (v: number) => Math.round(v * 100) + "%";

export default function SettingsPanel({ settings, onChange, onClose, inGame }: Props) {
  const [tab, setTab] = useState<"gfx" | "audio" | "ctrl" | "game">("gfx");
  const s = settings;
  const set = (p: Partial<Settings>, custom = true) => onChange(sanitize({ ...s, ...p, ...(custom ? { preset: "custom" as const } : {}) }));
  const preset = (q: Preset) => onChange(sanitize({ ...s, ...PRESETS[q], preset: q }));
  const tabs: [typeof tab, string][] = [
    ["gfx", "🖥 Graphics"],
    ["audio", "🔊 Audio"],
    ["ctrl", "🎮 Controls"],
    ["game", "⚙ Game"],
  ];
  return (
    <div className="fixed inset-0 z-50 flex items-stretch justify-center bg-black/70 p-0 backdrop-blur-sm sm:items-center sm:p-4">
      <div className="flex max-h-full w-full flex-col overflow-hidden border-white/10 bg-slate-900/95 text-white shadow-2xl sm:max-w-3xl sm:rounded-2xl sm:border">
        <div className="flex items-center justify-between gap-2 border-b border-white/10 px-4 py-3">
          <h2 className="text-lg font-bold tracking-wide">Settings</h2>
          <button onClick={onClose} className="min-h-[44px] rounded-lg bg-orange-500 px-5 py-2 font-semibold text-white hover:bg-orange-400 active:scale-95">
            Done
          </button>
        </div>
        <div className="flex gap-1 overflow-x-auto border-b border-white/10 px-2 py-2">
          {tabs.map(([k, l]) => (
            <button
              key={k}
              onClick={() => setTab(k)}
              className={`min-h-[42px] shrink-0 rounded-lg px-4 py-2 text-sm font-semibold ${tab === k ? "bg-white/15 text-white" : "text-slate-300 hover:bg-white/5"}`}
            >
              {l}
            </button>
          ))}
        </div>
        <div className="flex-1 overflow-y-auto px-4 pb-6 pt-2">
          {tab === "gfx" && (
            <>
              <Row label="Quality preset" hint="One click sets everything up. On phones: Low / Medium.">
                <Seg
                  value={s.preset}
                  options={[
                    ["low", "Low"],
                    ["medium", "Medium"],
                    ["high", "High"],
                    ["ultra", "Ultra"],
                  ]}
                  onChange={(v) => preset(v as Preset)}
                />
              </Row>
              <Row label="Render resolution" hint="Lower = faster, slightly softer image.">
                <Slider value={s.resolution} min={0.4} max={1.5} step={0.05} onChange={(v) => set({ resolution: v })} fmt={pct} />
              </Row>
              <Row label="Shadows">
                <Seg
                  value={s.shadows}
                  options={[
                    [0, "Off"],
                    [1, "Low"],
                    [2, "Medium"],
                    [3, "High"],
                  ]}
                  onChange={(v) => set({ shadows: v as Settings["shadows"] })}
                />
              </Row>
              <Row label="Water quality" hint="Number of wave polygons.">
                <Seg
                  value={s.water}
                  options={[
                    [0, "Low"],
                    [1, "Medium"],
                    [2, "High"],
                  ]}
                  onChange={(v) => set({ water: v as Settings["water"] })}
                />
              </Row>
              <Row label="Dynamic lights" hint="Number of simultaneous interior lights.">
                <Slider value={s.lights} min={0} max={8} step={1} onChange={(v) => set({ lights: v })} />
              </Row>
              <Row label="Particle density" hint="Smoke, fire, sparks, water.">
                <Slider value={s.particles} min={0} max={1} step={0.05} onChange={(v) => set({ particles: v })} fmt={pct} />
              </Row>
              <Row label="View distance" hint="Fog density at the horizon.">
                <Slider value={s.viewDistance} min={0.3} max={1} step={0.05} onChange={(v) => set({ viewDistance: v })} fmt={pct} />
              </Row>
              <Row label="Field of view (FOV)">
                <Slider value={s.fov} min={50} max={110} step={1} onChange={(v) => set({ fov: v }, false)} fmt={(v) => v + "°"} />
              </Row>
              <Row label="Anti-aliasing (AA)" hint="Takes effect on the next game start.">
                <Toggle value={s.antialias} onChange={(v) => set({ antialias: v })} />
              </Row>
              <Row label="Auto quality" hint="Automatically lowers resolution when FPS drops.">
                <Toggle value={s.autoQuality} onChange={(v) => set({ autoQuality: v }, false)} />
              </Row>
              <Row label="Show FPS">
                <Toggle value={s.showFps} onChange={(v) => set({ showFps: v }, false)} />
              </Row>
              <Row label="Time of day" hint="0 = midnight, 12 = noon.">
                <Slider value={s.timeOfDay} min={0} max={24} step={0.5} onChange={(v) => set({ timeOfDay: v }, false)} fmt={(v) => `${String(Math.floor(v)).padStart(2, "0")}:${v % 1 ? "30" : "00"}`} />
              </Row>
              <Row label="Weather">
                <Seg
                  value={s.weather}
                  options={[
                    ["clear", "☀ Clear"],
                    ["cloudy", "☁ Cloudy"],
                    ["storm", "⛈ Storm"],
                  ]}
                  onChange={(v) => set({ weather: v as Settings["weather"] }, false)}
                />
              </Row>
              <Row label="Wave height">
                <Slider value={s.waveHeight} min={0.2} max={2.5} step={0.1} onChange={(v) => set({ waveHeight: v }, false)} fmt={(v) => v.toFixed(1) + "x"} />
              </Row>
              <Row label="Screen shake" hint="Explosions, hits, ship quakes.">
                <Slider value={s.shake} min={0} max={1.5} step={0.1} onChange={(v) => set({ shake: v }, false)} fmt={pct} />
              </Row>
              <Row label="Head bob while walking">
                <Toggle value={s.headBob} onChange={(v) => set({ headBob: v }, false)} />
              </Row>
            </>
          )}
          {tab === "audio" && (
            <>
              <Row label="Master volume">
                <Slider value={s.master} min={0} max={1} step={0.05} onChange={(v) => set({ master: v }, false)} fmt={pct} />
              </Row>
              <Row label="Effects" hint="Shots, explosions, doors, footsteps.">
                <Slider value={s.sfx} min={0} max={1} step={0.05} onChange={(v) => set({ sfx: v }, false)} fmt={pct} />
              </Row>
              <Row label="Ambience" hint="Sea, wind, ship engine.">
                <Slider value={s.ambient} min={0} max={1} step={0.05} onChange={(v) => set({ ambient: v }, false)} fmt={pct} />
              </Row>
              <Row label="Music">
                <Slider value={s.music} min={0} max={1} step={0.05} onChange={(v) => set({ music: v }, false)} fmt={pct} />
              </Row>
            </>
          )}
          {tab === "ctrl" && (
            <>
              <Row label="Mouse sensitivity">
                <Slider value={s.sens} min={0.2} max={3} step={0.05} onChange={(v) => set({ sens: v }, false)} fmt={(v) => v.toFixed(2)} />
              </Row>
              <Row label="Invert Y axis">
                <Toggle value={s.invertY} onChange={(v) => set({ invertY: v }, false)} />
              </Row>
              <Row label="Touch controls" hint="Auto detects phones/tablets.">
                <Seg
                  value={s.touch}
                  options={[
                    ["auto", "Auto"],
                    ["on", "On"],
                    ["off", "Off"],
                  ]}
                  onChange={(v) => set({ touch: v as Settings["touch"] }, false)}
                />
              </Row>
              <Row label="Touch sensitivity">
                <Slider value={s.touchSens} min={0.3} max={3} step={0.05} onChange={(v) => set({ touchSens: v }, false)} fmt={(v) => v.toFixed(2)} />
              </Row>
              <Row label="Touch button size">
                <Slider value={s.touchScale} min={0.6} max={1.6} step={0.05} onChange={(v) => set({ touchScale: v }, false)} fmt={pct} />
              </Row>
              <Row label="Touch button opacity">
                <Slider value={s.touchOpacity} min={0.2} max={1} step={0.05} onChange={(v) => set({ touchOpacity: v }, false)} fmt={pct} />
              </Row>
              <Row label="Left-handed layout" hint="Swaps joystick and fire side.">
                <Toggle value={s.leftHanded} onChange={(v) => set({ leftHanded: v }, false)} />
              </Row>
              <Row label="Crosshair">
                <Seg
                  value={s.crosshair}
                  options={[
                    ["cross", "Cross"],
                    ["dot", "Dot"],
                    ["circle", "Ring"],
                  ]}
                  onChange={(v) => set({ crosshair: v as Settings["crosshair"] }, false)}
                />
              </Row>
              <Row label="HUD size">
                <Slider value={s.hudScale} min={0.6} max={1.6} step={0.05} onChange={(v) => set({ hudScale: v }, false)} fmt={pct} />
              </Row>
              <div className="mt-3 rounded-lg bg-white/5 p-3 text-xs leading-relaxed text-slate-300">
                <b className="text-white">Keyboard:</b> WASD move · mouse look · Shift sprint · Ctrl/C crouch · Space jump · E use · LMB shoot/throw · RMB place TNT · R reload · 1–4 / mouse wheel weapon · G
                detonator · F flashlight · Esc pause. <b className="text-white">Gamepad</b> is supported.
              </div>
            </>
          )}
          {tab === "game" && (
            <>
              <Row label="Difficulty" hint="Affects guards, damage and the fuse.">
                <Seg
                  value={s.difficulty}
                  options={[
                    ["easy", "Easy"],
                    ["normal", "Normal"],
                    ["hard", "Hard"],
                  ]}
                  onChange={(v) => set({ difficulty: v as Settings["difficulty"] }, false)}
                />
              </Row>
              <Row label="Guards enabled" hint="Applies in mission mode from the next start.">
                <Toggle value={s.guards} onChange={(v) => set({ guards: v }, false)} />
              </Row>
              <Row label="Flood speed" hint="How fast the ship sinks after a leak.">
                <Slider value={s.floodSpeed} min={0.3} max={4} step={0.1} onChange={(v) => set({ floodSpeed: v }, false)} fmt={(v) => v.toFixed(1) + "x"} />
              </Row>
              <div className="pt-4">
                <button
                  onClick={() => onChange(sanitize({ ...DEFAULTS }))}
                  className="min-h-[44px] rounded-lg border border-white/15 bg-white/5 px-4 py-2 text-sm font-semibold text-slate-100 hover:bg-white/10"
                >
                  Reset everything to defaults
                </button>
              </div>
              {inGame && <p className="mt-3 text-xs text-slate-400">Changes apply immediately (except anti-aliasing).</p>}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
