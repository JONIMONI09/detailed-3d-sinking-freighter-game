import React, { useState } from 'react';
import {
  Sliders,
  Volume2,
  Gamepad2,
  ShieldAlert,
  X,
  RotateCcw,
  Sun,
  Sunset,
  CloudLightning,
  CloudFog,
  Check,
  Eye,
} from 'lucide-react';
import {
  AudioSettings,
  ControlSettings,
  DEFAULT_AUDIO_SETTINGS,
  DEFAULT_CONTROL_SETTINGS,
  DEFAULT_GRAPHICS_SETTINGS,
  GraphicsPreset,
  GraphicsSettings,
  WeatherMode,
} from '../types/game';
import { soundEngine } from '../audio/SoundEngine';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  graphics: GraphicsSettings;
  onChangeGraphics: (g: GraphicsSettings) => void;
  audio: AudioSettings;
  onChangeAudio: (a: AudioSettings) => void;
  controls: ControlSettings;
  onChangeControls: (c: ControlSettings) => void;
  onTriggerSimulatedCrash: () => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  graphics,
  onChangeGraphics,
  audio,
  onChangeAudio,
  controls,
  onChangeControls,
  onTriggerSimulatedCrash,
}) => {
  const [activeTab, setActiveTab] = useState<'graphics' | 'audio' | 'controls' | 'diagnostics'>('graphics');

  if (!isOpen) return null;

  const applyPreset = (preset: GraphicsPreset) => {
    soundEngine.playUiClick();
    if (preset === 'low') {
      onChangeGraphics({
        ...graphics,
        preset: 'low',
        resolutionScale: 0.65,
        shadowQuality: 'off',
        waterQuality: 'low',
        particleDensity: 0.4,
        antiAliasing: false,
      });
    } else if (preset === 'medium') {
      onChangeGraphics({
        ...graphics,
        preset: 'medium',
        resolutionScale: 0.85,
        shadowQuality: 'low',
        waterQuality: 'medium',
        particleDensity: 0.75,
        antiAliasing: true,
      });
    } else if (preset === 'high') {
      onChangeGraphics({
        ...graphics,
        preset: 'high',
        resolutionScale: 1.0,
        shadowQuality: 'medium',
        waterQuality: 'high',
        particleDensity: 1.0,
        antiAliasing: true,
      });
    } else {
      onChangeGraphics({
        ...graphics,
        preset: 'ultra',
        resolutionScale: 1.35,
        shadowQuality: 'ultra',
        waterQuality: 'ultra',
        particleDensity: 1.75,
        antiAliasing: true,
      });
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-md flex items-center justify-center p-3 md:p-6">
      <div className="w-full max-w-3xl max-h-[90vh] naval-panel rounded-xl flex flex-col overflow-hidden border border-slate-600/70 shadow-2xl">
        {/* Header */}
        <div className="px-5 py-4 bg-slate-900/95 border-b border-slate-700/80 flex items-center justify-between">
          <div>
            <div className="text-[11px] font-mono-tech uppercase text-amber-400 font-semibold">
              SYSTEM-KONFIGURATION // FÜR ALLE GERÄTE OPTIMIERT
            </div>
            <h2 className="font-display text-lg md:text-xl font-bold text-white tracking-wide">
              GRAFIK, AUDIO, STEUERUNG & SYSTEM-PRÜFUNG
            </h2>
          </div>

          <button
            onClick={() => {
              soundEngine.playUiClick();
              onClose();
            }}
            className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white cursor-pointer transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Navigation Tabs */}
        <div className="grid grid-cols-2 sm:grid-cols-4 bg-slate-950/90 border-b border-slate-800 p-1.5 gap-1.5">
          {[
            { id: 'graphics', label: 'Grafik & Wetter', icon: Sliders },
            { id: 'audio', label: 'Sound & Alarme', icon: Volume2 },
            { id: 'controls', label: 'Steuerung & Touch', icon: Gamepad2 },
            { id: 'diagnostics', label: 'Crash-Guard & Test', icon: ShieldAlert },
          ].map((tab) => {
            const Icon = tab.icon;
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => {
                  soundEngine.playUiClick();
                  setActiveTab(tab.id as typeof activeTab);
                }}
                className={`py-2.5 px-3 rounded-lg font-display font-bold text-xs tracking-wider flex items-center justify-center gap-2 cursor-pointer transition ${
                  active
                    ? 'bg-amber-500 text-slate-950 shadow-md shadow-amber-500/20'
                    : 'bg-slate-900/60 text-slate-300 hover:bg-slate-800'
                }`}
              >
                <Icon className="w-4 h-4 shrink-0" />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>

        {/* Tab Body */}
        <div className="p-4 md:p-6 overflow-y-auto naval-scroll flex-1 space-y-5">
          {activeTab === 'graphics' && (
            <>
              {/* Quick Presets */}
              <div>
                <label className="block text-xs font-mono-tech uppercase text-slate-400 mb-2">
                  Schnell-Qualitätsprofile (Für Smartphone, Tablet, Laptop & High-End PC):
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                  {(
                    [
                      { id: 'low', label: 'NIEDRIG (MOBIL)' },
                      { id: 'medium', label: 'MITTEL' },
                      { id: 'high', label: 'HOCH (STANDARD)' },
                      { id: 'ultra', label: 'ULTRA (MAX 3D)' },
                    ] as const
                  ).map((p) => (
                    <button
                      key={p.id}
                      onClick={() => applyPreset(p.id)}
                      className={`py-2.5 px-3 rounded-lg border font-mono-tech text-xs font-bold cursor-pointer transition flex items-center justify-center gap-1.5 ${
                        graphics.preset === p.id
                          ? 'bg-amber-500/20 border-amber-400 text-amber-300'
                          : 'bg-slate-900/80 border-slate-700 text-slate-300 hover:border-slate-500'
                      }`}
                    >
                      {graphics.preset === p.id && <Check className="w-3.5 h-3.5" />}
                      <span>{p.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Weather & Time of Day */}
              <div>
                <label className="block text-xs font-mono-tech uppercase text-slate-400 mb-2">
                  Wetter, Seegang & Tageszeit:
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                  {(
                    [
                      { id: 'day', label: 'Klare See (Tag)', icon: Sun },
                      { id: 'sunset', label: 'Abendrot', icon: Sunset },
                      { id: 'storm', label: 'Schwerer Sturm', icon: CloudLightning },
                      { id: 'fog', label: 'Dichter Nebel', icon: CloudFog },
                    ] as { id: WeatherMode; label: string; icon: typeof Sun }[]
                  ).map((w) => {
                    const WIcon = w.icon;
                    return (
                      <button
                        key={w.id}
                        onClick={() => {
                          soundEngine.playUiClick();
                          onChangeGraphics({ ...graphics, weather: w.id });
                        }}
                        className={`py-2.5 px-3 rounded-lg border font-mono-tech text-xs font-semibold cursor-pointer transition flex items-center justify-center gap-2 ${
                          graphics.weather === w.id
                            ? 'bg-sky-500/20 border-sky-400 text-sky-300'
                            : 'bg-slate-900/80 border-slate-700 text-slate-300 hover:border-slate-500'
                        }`}
                      >
                        <WIcon className="w-4 h-4 shrink-0" />
                        <span>{w.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Sliders Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="p-3.5 rounded-lg bg-slate-900/80 border border-slate-800">
                  <div className="flex justify-between text-xs font-mono-tech mb-2">
                    <span className="text-slate-300">AUFLÖSUNGS-SKALIERUNG</span>
                    <span className="text-amber-400 font-bold">
                      {Math.round(graphics.resolutionScale * 100)}%
                    </span>
                  </div>
                  <input
                    type="range"
                    min={0.5}
                    max={1.5}
                    step={0.05}
                    value={graphics.resolutionScale}
                    onChange={(e) =>
                      onChangeGraphics({
                        ...graphics,
                        resolutionScale: parseFloat(e.target.value),
                      })
                    }
                    className="w-full naval-slider"
                  />
                </div>

                <div className="p-3.5 rounded-lg bg-slate-900/80 border border-slate-800">
                  <div className="flex justify-between text-xs font-mono-tech mb-2">
                    <span className="text-slate-300">SICHTFELD (FOV)</span>
                    <span className="text-amber-400 font-bold">{graphics.fov}°</span>
                  </div>
                  <input
                    type="range"
                    min={60}
                    max={105}
                    step={1}
                    value={graphics.fov}
                    onChange={(e) =>
                      onChangeGraphics({
                        ...graphics,
                        fov: parseInt(e.target.value, 10),
                      })
                    }
                    className="w-full naval-slider"
                  />
                </div>

                <div className="p-3.5 rounded-lg bg-slate-900/80 border border-slate-800">
                  <div className="flex justify-between text-xs font-mono-tech mb-2">
                    <span className="text-slate-300">PARTIKEL-DICHTE (FEUER & GISCHT)</span>
                    <span className="text-amber-400 font-bold">
                      {Math.round(graphics.particleDensity * 100)}%
                    </span>
                  </div>
                  <input
                    type="range"
                    min={0.25}
                    max={2.0}
                    step={0.05}
                    value={graphics.particleDensity}
                    onChange={(e) =>
                      onChangeGraphics({
                        ...graphics,
                        particleDensity: parseFloat(e.target.value),
                      })
                    }
                    className="w-full naval-slider"
                  />
                </div>

                <div className="p-3.5 rounded-lg bg-slate-900/80 border border-slate-800">
                  <div className="flex justify-between text-xs font-mono-tech mb-2">
                    <span className="text-slate-300">GERSTNER-WELLEN QUALITÄT</span>
                    <span className="text-sky-400 font-bold uppercase">{graphics.waterQuality}</span>
                  </div>
                  <div className="grid grid-cols-4 gap-1.5">
                    {(['low', 'medium', 'high', 'ultra'] as const).map((wq) => (
                      <button
                        key={wq}
                        onClick={() => onChangeGraphics({ ...graphics, waterQuality: wq })}
                        className={`py-1 rounded text-[11px] font-mono-tech uppercase cursor-pointer ${
                          graphics.waterQuality === wq
                            ? 'bg-sky-500 text-slate-950 font-bold'
                            : 'bg-slate-800 text-slate-300'
                        }`}
                      >
                        {wq}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Toggles including No-Clip Wireframe Inspector */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <button
                  onClick={() =>
                    onChangeGraphics({ ...graphics, showFps: !graphics.showFps })
                  }
                  className={`p-3 rounded-lg border text-left font-mono-tech text-xs cursor-pointer transition ${
                    graphics.showFps
                      ? 'bg-emerald-500/15 border-emerald-500/60 text-emerald-300'
                      : 'bg-slate-900 border-slate-800 text-slate-400'
                  }`}
                >
                  <div className="font-bold">FPS & TELEMETRIE: {graphics.showFps ? 'AN' : 'AUS'}</div>
                  <div className="text-[11px] opacity-80 mt-0.5">Echtzeit-Performance im HUD</div>
                </button>

                <button
                  onClick={() =>
                    onChangeGraphics({ ...graphics, cameraShake: !graphics.cameraShake })
                  }
                  className={`p-3 rounded-lg border text-left font-mono-tech text-xs cursor-pointer transition ${
                    graphics.cameraShake
                      ? 'bg-amber-500/15 border-amber-500/60 text-amber-300'
                      : 'bg-slate-900 border-slate-800 text-slate-400'
                  }`}
                >
                  <div className="font-bold">KAMERA-BEBEN: {graphics.cameraShake ? 'AN' : 'AUS'}</div>
                  <div className="text-[11px] opacity-80 mt-0.5">Erschütterung bei TNT-Detonation</div>
                </button>

                <button
                  onClick={() =>
                    onChangeGraphics({
                      ...graphics,
                      showCollisionDebug: !graphics.showCollisionDebug,
                    })
                  }
                  className={`p-3 rounded-lg border text-left font-mono-tech text-xs cursor-pointer transition ${
                    graphics.showCollisionDebug
                      ? 'bg-sky-500/20 border-sky-400 text-sky-200'
                      : 'bg-slate-900 border-slate-800 text-slate-400'
                  }`}
                >
                  <div className="font-bold flex items-center gap-1.5">
                    <Eye className="w-3.5 h-3.5" />
                    <span>NO-CLIP KOLLISIONS-BOXEN: {graphics.showCollisionDebug ? 'SICHTBAR' : 'AUS'}</span>
                  </div>
                  <div className="text-[11px] opacity-80 mt-0.5">Zeigt 3D-Wände & Tür-Blocker live</div>
                </button>
              </div>
            </>
          )}

          {activeTab === 'audio' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between p-4 rounded-lg bg-slate-900 border border-slate-800">
                <div>
                  <div className="font-display font-bold text-sm text-white">
                    PROZEDURALER WEB-AUDIO SYNTHESIZER
                  </div>
                  <div className="text-xs text-slate-400">
                    Explosionen, Schiffssirenen, Hydraulik-Schotten, Dieselmotor & Meeresrauschen
                  </div>
                </div>
                <button
                  onClick={() => {
                    onChangeAudio({ ...audio, muted: !audio.muted });
                  }}
                  className={`px-4 py-2 rounded-lg font-mono-tech font-bold text-xs cursor-pointer ${
                    audio.muted
                      ? 'bg-red-500 text-white'
                      : 'bg-emerald-500 text-slate-950'
                  }`}
                >
                  {audio.muted ? 'TON STUMMGESCHALTET' : 'TON AKTIV'}
                </button>
              </div>

              {[
                { key: 'masterVolume', label: 'GESAMTLAUTSTÄRKE (MASTER)', val: audio.masterVolume },
                { key: 'sfxVolume', label: 'WAFFEN, TNT-TIMER, TÜREN & EXPLOSIONEN', val: audio.sfxVolume },
                { key: 'alarmVolume', label: 'SCHIFFS-NOTSIRENE & KLAXON-ALARM', val: audio.alarmVolume },
                { key: 'ambientVolume', label: 'OZEAN, DIESELMOTOR & WASSEREINBRUCH', val: audio.ambientVolume },
              ].map((item) => (
                <div key={item.key} className="p-3.5 rounded-lg bg-slate-900/80 border border-slate-800">
                  <div className="flex justify-between text-xs font-mono-tech mb-2">
                    <span className="text-slate-300">{item.label}</span>
                    <span className="text-amber-400 font-bold">{Math.round(item.val * 100)}%</span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={1}
                    step={0.05}
                    value={item.val}
                    onChange={(e) =>
                      onChangeAudio({
                        ...audio,
                        [item.key]: parseFloat(e.target.value),
                      })
                    }
                    className="w-full naval-slider"
                  />
                </div>
              ))}
            </div>
          )}

          {activeTab === 'controls' && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="p-3.5 rounded-lg bg-slate-900/80 border border-slate-800">
                  <div className="flex justify-between text-xs font-mono-tech mb-2">
                    <span className="text-slate-300">MAUS- & TOUCH-EMPFINDLICHKEIT</span>
                    <span className="text-amber-400 font-bold">
                      {controls.mouseSensitivity.toFixed(1)}x
                    </span>
                  </div>
                  <input
                    type="range"
                    min={0.2}
                    max={2.5}
                    step={0.1}
                    value={controls.mouseSensitivity}
                    onChange={(e) =>
                      onChangeControls({
                        ...controls,
                        mouseSensitivity: parseFloat(e.target.value),
                      })
                    }
                    className="w-full naval-slider"
                  />
                </div>

                <div className="p-3.5 rounded-lg bg-slate-900/80 border border-slate-800">
                  <div className="flex justify-between text-xs font-mono-tech mb-2">
                    <span className="text-slate-300">GRÖSSE DER TOUCH-BUTTONS</span>
                    <span className="text-amber-400 font-bold">
                      {Math.round(controls.touchScale * 100)}%
                    </span>
                  </div>
                  <input
                    type="range"
                    min={0.8}
                    max={1.35}
                    step={0.05}
                    value={controls.touchScale}
                    onChange={(e) =>
                      onChangeControls({
                        ...controls,
                        touchScale: parseFloat(e.target.value),
                      })
                    }
                    className="w-full naval-slider"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="p-3.5 rounded-lg bg-slate-900/80 border border-slate-800">
                  <div className="text-xs font-mono-tech text-slate-300 mb-2">
                    TOUCH-JOYSTICK & BILDSCHIRM-TASTEN (MOBIL / TABLET / PC):
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    {(
                      [
                        { id: 'auto', label: 'AUTO' },
                        { id: 'on', label: 'IMMER AN' },
                        { id: 'off', label: 'AUS' },
                      ] as const
                    ).map((m) => (
                      <button
                        key={m.id}
                        onClick={() => onChangeControls({ ...controls, touchControlsMode: m.id })}
                        className={`py-2 rounded font-mono-tech text-xs font-bold cursor-pointer ${
                          controls.touchControlsMode === m.id
                            ? 'bg-amber-500 text-slate-950'
                            : 'bg-slate-800 text-slate-300'
                        }`}
                      >
                        {m.label}
                      </button>
                    ))}
                  </div>
                </div>

                <button
                  onClick={() =>
                    onChangeControls({ ...controls, invertY: !controls.invertY })
                  }
                  className={`p-3.5 rounded-lg border text-left font-mono-tech text-xs cursor-pointer transition ${
                    controls.invertY
                      ? 'bg-amber-500/20 border-amber-400 text-amber-300'
                      : 'bg-slate-900/80 border-slate-800 text-slate-300'
                  }`}
                >
                  <div className="font-bold">Y-ACHSE INVERTIEREN: {controls.invertY ? 'JA' : 'NEIN'}</div>
                  <div className="text-[11px] text-slate-400 mt-1">
                    Vertikale Kamera-Blickrichtung umkehren
                  </div>
                </button>
              </div>

              {/* Complete Keyboard Reference Table */}
              <div className="p-4 rounded-lg bg-slate-950 border border-slate-800 text-xs font-mono-tech space-y-1.5">
                <div className="text-amber-400 font-bold uppercase mb-2">
                  TASTATUR- & MAUS-BELEGUNG (ÜBERSICHT):
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1.5 text-slate-300">
                  <div className="flex justify-between"><span>Bewegen / Laufen:</span><strong className="text-white">W, A, S, D / Pfeiltasten</strong></div>
                  <div className="flex justify-between"><span>Türen / Schotten / Computer:</span><strong className="text-amber-400">Taste [E]</strong></div>
                  <div className="flex justify-between"><span>TNT / C4 platzieren / Schießen:</span><strong className="text-red-400">Linksklick</strong></div>
                  <div className="flex justify-between"><span>Alle C4-Ladungen zünden:</span><strong className="text-amber-400">Taste [G] / Rechtsklick</strong></div>
                  <div className="flex justify-between"><span>Waffen wechseln:</span><strong className="text-white">Tasten [1] bis [5]</strong></div>
                  <div className="flex justify-between"><span>Springen / Auftauchen:</span><strong className="text-white">Leertaste [Space]</strong></div>
                  <div className="flex justify-between"><span>Sprinten / Ducken:</span><strong className="text-white">[Shift] / [C]</strong></div>
                  <div className="flex justify-between"><span>Taschenlampe / Außenkamera:</span><strong className="text-sky-400">[F] / [V]</strong></div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'diagnostics' && (
            <div className="space-y-4">
              <div className="p-4 rounded-lg bg-red-950/35 border border-red-500/50 space-y-3">
                <div className="flex items-center gap-2.5 text-red-400 font-display font-bold text-base">
                  <ShieldAlert className="w-5 h-5 shrink-0" />
                  <span>CRASH-SCREEN & FEHLER-ABFANGSYSTEM PRÜFEN</span>
                </div>
                <p className="text-xs text-slate-300 leading-relaxed">
                  Alle Laufzeitfehler, WebGL-Kontextverluste und React-Ausnahmen werden automatisch
                  vom <strong>Naval Blackbox Crash-Guard</strong> abgefangen. Klicke auf den Button unten,
                  um einen <strong>simulierten Test-Absturz</strong> auszulösen und den Crash-Screen
                  sowie die 1-Klick-Wiederherstellung direkt zu prüfen!
                </p>
                <button
                  onClick={() => {
                    soundEngine.playAlarmKlaxon();
                    onClose();
                    onTriggerSimulatedCrash();
                  }}
                  className="px-4 py-2.5 rounded-lg bg-red-600 hover:bg-red-500 text-white font-display font-bold text-xs tracking-wider cursor-pointer transition shadow-lg shadow-red-600/25"
                >
                  TEST-CRASH AUSLÖSEN (CRASH-SCREEN VERIFIZIEREN)
                </button>
              </div>

              <div className="p-4 rounded-lg bg-slate-900 border border-slate-800 space-y-2 text-xs font-mono-tech">
                <div className="text-emerald-400 font-bold">SYSTEM-STATUS CHECKLISTE:</div>
                <div className="text-slate-300">✓ 12 Funktionsfähige Schiffs-Türen & Hydraulische Wasserschotten [E]</div>
                <div className="text-slate-300">✓ Striktes Schiff-Lokales OBB/AABB Kollisionssystem (Kein No-Clip!)</div>
                <div className="text-slate-300">✓ 4 Flutbare Abteilungen mit Echtzeit-Krängung, Trimmung & Kielbruch</div>
                <div className="text-slate-300">✓ 5 Animierte 3D-Werkzeuge/Waffen (TNT, C4, Granatwerfer, Breacher, Schweißbrenner)</div>
                <div className="text-slate-300">✓ Integrierter Foto ➔ .TXT Forensik-Decoder & Eigener Datei-Konverter</div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3.5 bg-slate-900/95 border-t border-slate-800 flex items-center justify-between">
          <button
            onClick={() => {
              soundEngine.playUiClick();
              onChangeGraphics(DEFAULT_GRAPHICS_SETTINGS);
              onChangeAudio(DEFAULT_AUDIO_SETTINGS);
              onChangeControls(DEFAULT_CONTROL_SETTINGS);
            }}
            className="px-3.5 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 font-mono-tech text-xs flex items-center gap-1.5 cursor-pointer transition"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Standardwerte wiederherstellen</span>
          </button>

          <button
            onClick={() => {
              soundEngine.playUiClick();
              onClose();
            }}
            className="px-5 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-display font-bold text-xs tracking-wider cursor-pointer transition"
          >
            ÜBERNEHMEN & ZURÜCK ZUM SCHIFF
          </button>
        </div>
      </div>
    </div>
  );
};
