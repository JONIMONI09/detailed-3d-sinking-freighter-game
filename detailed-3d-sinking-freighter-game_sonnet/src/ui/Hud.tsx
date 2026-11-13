import { useEffect, useState } from "react";
import type { Game, HudState } from "../game/game";
import type { Settings } from "../game/settings";
import type { TerminalEntry } from "../game/doorSecurity";

function Bar({ value, color, label, icon }: { value: number; color: string; label: string; icon: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="w-5 text-center text-base">{icon}</span>
      <div className="relative h-4 w-40 overflow-hidden rounded-full border border-white/25 bg-black/55">
        <div className="h-full transition-[width] duration-150" style={{ width: `${Math.max(0, Math.min(100, value))}%`, background: color }} />
        <span className="absolute inset-0 flex items-center justify-center text-[10px] font-bold text-white drop-shadow">{label}</span>
      </div>
    </div>
  );
}

function Crosshair({ type, hit, holdProgress }: { type: Settings["crosshair"]; hit: number; holdProgress: number }) {
  const r = 18;
  const circ = 2 * Math.PI * r;
  const offset = circ * (1 - Math.max(0, Math.min(1, holdProgress)));
  return (
    <div className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
      {type === "dot" && <div className="h-1.5 w-1.5 rounded-full bg-white shadow-[0_0_3px_#000]" />}
      {type === "circle" && <div className="h-7 w-7 rounded-full border-2 border-white/90 shadow-[0_0_3px_#000]" />}
      {type === "cross" && (
        <div className="relative h-8 w-8">
          <div className="absolute left-1/2 top-0 h-2.5 w-0.5 -translate-x-1/2 bg-white shadow-[0_0_2px_#000]" />
          <div className="absolute bottom-0 left-1/2 h-2.5 w-0.5 -translate-x-1/2 bg-white shadow-[0_0_2px_#000]" />
          <div className="absolute left-0 top-1/2 h-0.5 w-2.5 -translate-y-1/2 bg-white shadow-[0_0_2px_#000]" />
          <div className="absolute right-0 top-1/2 h-0.5 w-2.5 -translate-y-1/2 bg-white shadow-[0_0_2px_#000]" />
          <div className="absolute left-1/2 top-1/2 h-0.5 w-0.5 -translate-x-1/2 -translate-y-1/2 bg-white" />
        </div>
      )}
      {hit > 0 && (
        <div className="absolute left-1/2 top-1/2 h-9 w-9 -translate-x-1/2 -translate-y-1/2 rotate-45" style={{ opacity: hit }}>
          <div className="absolute inset-0 border-2 border-red-500" style={{ clipPath: "polygon(0 0,30% 0,30% 10%,10% 10%,10% 30%,0 30%, 0 0, 100% 0,100% 30%,90% 30%,90% 10%,70% 10%,70% 0, 100% 100%,70% 100%,70% 90%,90% 90%,90% 70%,100% 70%, 0 100%,0 70%,10% 70%,10% 90%,30% 90%,30% 100%)" }} />
        </div>
      )}
      {holdProgress > 0 && (
        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 flex flex-col items-center">
          <svg className="h-12 w-12 -rotate-90">
            <circle cx="24" cy="24" r={r} stroke="rgba(255,255,255,0.25)" strokeWidth="3" fill="none" />
            <circle
              cx="24"
              cy="24"
              r={r}
              stroke="#f59e0b"
              strokeWidth="3"
              fill="none"
              strokeDasharray={circ}
              strokeDashoffset={offset}
              strokeLinecap="round"
            />
          </svg>
          <span className="text-[9px] font-mono font-bold text-amber-300 drop-shadow -mt-1 tracking-wider whitespace-nowrap">
            HOLD [G] TO DEACTIVATE GOD MODE
          </span>
        </div>
      )}
    </div>
  );
}

function VesselStatus({ h }: { h: HudState }) {
  const col = (p: number) => (p < 30 ? "#ef4444" : p < 65 ? "#f59e0b" : "#34d399");
  const state = h.statusHullPct <= 0 ? "100% DESTROYED" : h.statusHullPct < 30 ? "CRITICAL" : h.statusHullPct < 65 ? "DAMAGED" : "INTACT";
  const icon = h.statusKind === "station" ? "🛰️" : "⚓";
  const label = h.statusKind === "station" ? "pressure" : "integrity";
  return (
    <div className="w-52 rounded-xl border border-white/15 bg-black/55 p-2.5 text-[11px] text-white backdrop-blur-sm">
      <div className="mb-1 flex items-center justify-between font-bold tracking-wide">
        <span>{icon} {h.statusTitle}</span>
        <span style={{ color: col(h.statusHullPct) }} className={h.statusHullPct <= 0 ? "animate-pulse" : ""}>{state}</span>
      </div>
      <div className="mb-1 flex items-center justify-between">
        <span className="text-slate-300">Hull {label}</span>
        <span className="font-mono">{h.statusHullPct}%</span>
      </div>
      <div className="mb-1.5 h-1.5 overflow-hidden rounded-full bg-white/10">
        <div className="h-full transition-all" style={{ width: `${h.statusHullPct}%`, background: col(h.statusHullPct) }} />
      </div>
      <div className="space-y-0.5">
        {h.statusParts.map((pt, i) => (
          <div key={i} className="flex items-center gap-1.5">
            <span className="w-24 truncate text-slate-300" title={pt.name}>{pt.name}</span>
            <div className="h-1 flex-1 overflow-hidden rounded-full bg-white/10">
              <div className="h-full transition-all" style={{ width: `${pt.pct}%`, background: col(pt.pct) }} />
            </div>
            <span className="w-8 text-right font-mono">{pt.pct}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function ShipStatus({ h }: { h: HudState }) {
  if (h.statusKind !== "freighter") return <VesselStatus h={h} />;
  const col = (f: number) => (f > 0.7 ? "#ef4444" : f > 0.35 ? "#f59e0b" : "#38bdf8");
  const sinkPct = Math.min(100, (h.F / 0.3) * 100);
  return (
    <div className="w-52 rounded-xl border border-white/15 bg-black/55 p-2.5 text-[11px] text-white backdrop-blur-sm">
      <div className="mb-1 flex items-center justify-between font-bold tracking-wide">
        <span>⚓ SHIP STATUS</span>
        <span className={h.sinking ? "animate-pulse text-red-400" : h.F > 0.02 ? "text-amber-300" : "text-emerald-300"}>{h.sinking ? "SINKING!" : h.F > 0.02 ? "LEAK" : "INTACT"}</span>
      </div>
      <div className="relative mb-1.5 h-12 overflow-hidden rounded-md bg-slate-800/80">
        <div className="absolute inset-x-1 bottom-1 top-3 flex gap-0.5" style={{ transform: `rotate(${Math.max(-25, Math.min(25, h.pitchDeg * -0.6))}deg)` }}>
          {[...h.flood].map((c, i) => (
            <div key={i} className="relative flex-1 overflow-hidden rounded-sm border border-white/20 bg-slate-600/60" title={c.name}>
              <div className="absolute inset-x-0 bottom-0 transition-all" style={{ height: `${c.fill * 100}%`, background: col(c.fill) }} />
              {c.flow > 0.1 && <div className="absolute inset-0 animate-pulse bg-white/10" />}
            </div>
          ))}
        </div>
        <div className="absolute inset-x-0 top-0 h-3 bg-gradient-to-b from-slate-300/20 to-transparent" />
      </div>
      <div className="grid grid-cols-2 gap-x-2 gap-y-0.5">
        <span className="text-slate-300">Flood limit</span>
        <span className="text-right font-mono">{sinkPct.toFixed(0)}%</span>
        <span className="text-slate-300">List</span>
        <span className="text-right font-mono">{h.tilt.toFixed(0)}°</span>
      </div>
      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-white/10">
        <div className="h-full" style={{ width: `${sinkPct}%`, background: sinkPct > 80 ? "#ef4444" : "#f59e0b" }} />
      </div>
    </div>
  );
}

const TERMINAL_VISIBLE_SECONDS = 9;

const TERMINAL_COLOR: Record<TerminalEntry["level"], string> = {
  info: "text-slate-200",
  ok: "text-emerald-300",
  warn: "text-amber-300",
  alert: "text-red-300",
};

/** Door and bulkhead security terminal. Fades out unless pinned with [T]. */
function Terminal({ h }: { h: HudState }) {
  const lines = h.terminalPinned ? h.terminal : h.terminal.filter((e) => h.time - e.time < TERMINAL_VISIBLE_SECONDS).slice(-5);
  if (lines.length === 0) return null;
  return (
    <div className="w-[340px] max-w-[70vw] rounded-lg border border-emerald-400/30 bg-black/65 p-2 font-mono text-[10px] leading-snug backdrop-blur-sm">
      <div className="mb-0.5 flex justify-between font-bold tracking-wider text-emerald-300">
        <span>▮ DOOR SECURITY TERMINAL</span>
        <span className="text-slate-400">[T] {h.terminalPinned ? "unpin" : "pin"}</span>
      </div>
      {lines.map((e) => (
        <div key={e.id} className={`truncate ${TERMINAL_COLOR[e.level]}`} title={e.text}>
          <span className="text-slate-500">{String(Math.floor(e.time / 60)).padStart(2, "0")}:{String(Math.floor(e.time % 60)).padStart(2, "0")}</span> {e.source} {e.text}
        </div>
      ))}
    </div>
  );
}

function Compass({ deg }: { deg: number }) {
  const marks = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
  const w = 280;
  const items: React.ReactElement[] = [];
  for (let i = -2; i <= 10; i++) {
    const a = i * 45;
    const diff = ((a - deg + 540) % 360) - 180;
    if (Math.abs(diff) > 70) continue;
    items.push(
      <span key={i} className="absolute top-0 -translate-x-1/2 text-xs font-bold text-white/90" style={{ left: w / 2 + (diff / 70) * (w / 2) }}>
        {marks[((i % 8) + 8) % 8]}
      </span>,
    );
  }
  return (
    <div className="relative h-5 overflow-hidden rounded-full bg-black/40 text-center" style={{ width: w }}>
      {items}
      <div className="absolute bottom-0 left-1/2 h-1.5 w-0.5 -translate-x-1/2 bg-orange-400" />
    </div>
  );
}

const WEAP: { id: "pistol" | "shotgun" | "rifle" | "tnt"; n: string; k: string }[] = [
  { id: "pistol", n: "Pistol", k: "1" },
  { id: "shotgun", n: "Shotgun", k: "2" },
  { id: "rifle", n: "Rifle", k: "3" },
  { id: "tnt", n: "TNT", k: "4" },
];

export default function Hud({ h, settings, touch, game }: { h: HudState; settings: Settings; touch: boolean; game?: Game | null }) {
  const [vp, setVp] = useState({ w: window.innerWidth, h: window.innerHeight });
  useEffect(() => {
    const f = () => setVp({ w: window.innerWidth, h: window.innerHeight });
    window.addEventListener("resize", f);
    return () => window.removeEventListener("resize", f);
  }, []);
  const auto = Math.max(0.62, Math.min(1.1, Math.min(vp.w, vp.h) / 640));
  const sc = auto * settings.hudScale;
  const small = vp.h < 480 || vp.w < 560;
  const mm = Math.floor(h.time / 60),
    ss = Math.floor(h.time % 60);
  const lowHp = h.hp < 30;
  const dead = h.hp <= 0;
  return (
    <div className="pointer-events-none fixed inset-0 z-20 overflow-hidden font-sans text-white">
      {/* Vollbild-Effekte */}
      {h.underwater && <div className="absolute inset-0 bg-cyan-900/45 mix-blend-multiply" style={{ boxShadow: "inset 0 0 160px rgba(0,40,70,0.9)" }} />}
      {h.underwater && <div className="absolute inset-0 bg-blue-500/10" />}
      {h.dmg > 0 && <div className="absolute inset-0" style={{ opacity: Math.min(0.9, h.dmg), background: "radial-gradient(ellipse at center, rgba(255,0,0,0) 35%, rgba(190,0,0,0.85) 100%)" }} />}
      {lowHp && !dead && <div className="absolute inset-0 animate-pulse" style={{ background: "radial-gradient(ellipse at center, rgba(0,0,0,0) 50%, rgba(120,0,0,0.55) 100%)" }} />}
      {h.alarm && !dead && <div className="absolute inset-0 animate-pulse" style={{ boxShadow: "inset 0 0 90px rgba(255,0,0,0.35)" }} />}
      {dead && <div className="absolute inset-0 bg-red-950/50" />}

      {!h.escape && !h.orbitalLaserMode && <Crosshair type={settings.crosshair} hit={h.hit} holdProgress={h.godModeHoldProgress} />}

      {/* Oben links: Auftrag */}
      {!h.orbitalLaserMode && (
      <div className="absolute left-2 top-2 origin-top-left" style={{ transform: `scale(${sc})` }}>
        <div className="w-[280px] max-w-[60vw] rounded-xl border border-white/15 bg-black/50 p-2.5 text-xs backdrop-blur-sm">
          <div className="mb-1 flex items-center justify-between text-[11px] font-bold tracking-wider text-orange-300">
            <span>{h.mode === "mission" ? "MISSION" : "SANDBOX"}</span>
            <span className="font-mono text-slate-200">
              {String(mm).padStart(2, "0")}:{String(ss).padStart(2, "0")}
            </span>
          </div>
          {h.mode === "sandbox" ? (
            <ul className="space-y-0.5 text-xs">
              <li className="flex gap-1.5 leading-snug font-semibold text-emerald-300">
                <span>✔</span>
                <span>Free Stormworks Sandbox</span>
              </li>
              <li className="flex gap-1.5 leading-snug text-sky-200">
                <span>•</span>
                <span>All weapons free · Infinite ammo (∞)</span>
              </li>
              <li className="flex gap-1.5 leading-snug text-amber-200">
                <span>•</span>
                <span>Auto-regeneration · God Mode [G]</span>
              </li>
            </ul>
          ) : (
            <ul className="space-y-0.5">
              {h.objectives.map((o, i) => (
                <li key={i} className={`flex gap-1.5 leading-snug ${o.done ? "text-emerald-300 line-through opacity-70" : "text-slate-100"}`}>
                  <span>{o.done ? "☑" : "☐"}</span>
                  <span>{o.text}</span>
                </li>
              ))}
            </ul>
          )}
          <div className="mt-1.5 flex flex-wrap gap-2 text-[11px]">
            <span className={h.keys.blue ? "text-sky-300" : "text-slate-500"}>▮ Blue</span>
            <span className={h.keys.red ? "text-red-400" : "text-slate-500"}>▮ Red</span>
            <span className="text-slate-300">☠ {h.kills}</span>
            {h.guardsAlive > 0 && <span className="text-slate-400">Guards: {h.guardsAlive}</span>}
          </div>
        </div>
      </div>
      )}

      {/* Oben Mitte: Kompass */}
      {!small && (
        <div className="absolute left-1/2 top-2 origin-top" style={{ transform: `translateX(-50%) scale(${sc})` }}>
          <Compass deg={h.heading} />
          {h.chase && <div className="mt-1 animate-pulse text-center text-xs font-extrabold tracking-widest text-red-400">⚠ SPOTTED</div>}
        </div>
      )}
      {small && h.chase && <div className="absolute left-1/2 top-2 -translate-x-1/2 animate-pulse text-xs font-extrabold tracking-widest text-red-400">⚠ SPOTTED</div>}

      {/* Oben rechts: Schiffszustand */}
      <div className="absolute right-2 top-2 origin-top-right" style={{ transform: `scale(${sc})`, marginRight: touch ? 46 : 0 }}>
        {h.mode === "mission" || h.F > 0 || h.statusKind !== "freighter" ? <ShipStatus h={h} /> : null}
        {settings.showFps && <div className="mt-1 text-right font-mono text-[11px] text-lime-300">{h.fps} FPS</div>}
      </div>

      {/* Door-Security-Terminal */}
      {!h.escape && (
        <div className="absolute left-2 origin-bottom-left" style={{ transform: `scale(${sc})`, bottom: touch ? 8 : 76 }}>
          <Terminal h={h} />
        </div>
      )}

      {/* Meldungen */}
      <div className="absolute left-1/2 top-[18%] flex w-full flex-col items-center gap-1 px-3" style={{ transform: `translateX(-50%) scale(${sc})` }}>
        {h.messages.slice(-4).map((m) => (
          <div
            key={m.id}
            className={`max-w-[92vw] rounded-lg border px-3 py-1.5 text-center text-sm font-semibold shadow-lg backdrop-blur-sm ${
              m.kind === "alert"
                ? "animate-pulse border-red-400/60 bg-red-900/70 text-red-100"
                : m.kind === "warn"
                  ? "border-amber-400/50 bg-amber-900/60 text-amber-100"
                  : m.kind === "good"
                    ? "border-emerald-400/50 bg-emerald-900/60 text-emerald-100"
                    : m.kind === "pickup"
                      ? "border-sky-400/40 bg-sky-900/60 text-sky-100"
                      : "border-white/20 bg-black/60 text-white"
            }`}
          >
            {m.text}
          </div>
        ))}
      </div>

      {/* Interaktions-Hinweis */}
      {h.prompt && !h.escape && !h.orbitalLaserMode && (
        <div className="absolute left-1/2 top-[58%]" style={{ transform: `translateX(-50%) scale(${sc})` }}>
          <div className={`flex items-center gap-2 rounded-xl border px-4 py-2 text-sm font-bold shadow-xl backdrop-blur-sm ${h.promptKind === "locked" ? "border-red-400/60 bg-red-950/70 text-red-100" : h.promptKind === "confirm" ? "animate-pulse border-amber-400/70 bg-amber-950/80 text-amber-100" : "border-white/40 bg-black/70 text-white"}`}>
            <span className="rounded-md border border-white/60 bg-white/15 px-2 py-0.5 font-mono text-xs">{touch ? "USE" : "E"}</span>
            <span>{h.prompt}</span>
          </div>
        </div>
      )}

      {/* Sauerstoff */}
      {!h.escape && (h.underwater || h.oxygen < 0.98) && (
        <div className="absolute left-1/2 top-[66%]" style={{ transform: `translateX(-50%) scale(${sc})` }}>
          <div className="w-52 rounded-full border border-cyan-300/50 bg-black/60 p-1">
            <div className="h-2.5 rounded-full" style={{ width: `${h.oxygen * 100}%`, background: h.oxygen < 0.3 ? "#ef4444" : "#22d3ee" }} />
          </div>
          <div className="mt-0.5 text-center text-[11px] font-bold tracking-widest text-cyan-200">OXYGEN</div>
        </div>
      )}

      {/* Unten links: Gesundheit */}
      {(() => {
        const isInfinite = h.godMode || h.mode === "sandbox";
        return (
          <div className="absolute bottom-2 left-2 origin-bottom-left space-y-1" hidden={h.escape || h.orbitalLaserMode} style={{ transform: `scale(${sc})`, bottom: touch ? undefined : 8, top: touch ? 96 : undefined, display: (touch && vp.h < 420) || h.orbitalLaserMode ? "none" : undefined }}>
            <Bar value={isInfinite ? 100 : h.hp} color={h.hp > 50 ? "linear-gradient(90deg,#16a34a,#4ade80)" : h.hp > 25 ? "linear-gradient(90deg,#d97706,#fbbf24)" : "linear-gradient(90deg,#b91c1c,#f87171)"} label={isInfinite ? "∞" : `${Math.ceil(h.hp)}`} icon="❤" />
            {(h.armor > 0 || isInfinite) && <Bar value={isInfinite ? 100 : h.armor} color="linear-gradient(90deg,#1d4ed8,#60a5fa)" label={isInfinite ? "∞" : `${Math.ceil(h.armor)}`} icon="🛡" />}
            {(h.sprint || h.crouch || h.wading) && <div className="text-[11px] font-semibold text-slate-200">{h.sprint ? "Sprinting" : h.crouch ? "Crouched" : "In water"}</div>}
          </div>
        );
      })()}

      {/* Unten rechts: Munition & Waffen */}
      {(() => {
        const isInfiniteAmmo = h.godMode || h.mode === "sandbox";
        return (
          <div className="absolute bottom-2 right-2 origin-bottom-right text-right" style={{ transform: `scale(${sc})`, display: touch || h.escape || h.orbitalLaserMode ? "none" : undefined }}>
            <div className="mb-1 flex justify-end gap-1">
              {WEAP.map((w) => (
                <div
                  key={w.id}
                  className={`rounded-md border px-2 py-1 text-[11px] font-bold ${h.weapon === w.id ? "border-orange-400 bg-orange-500/80" : h.owned[w.id] ? "border-white/30 bg-black/55" : "border-white/10 bg-black/30 text-slate-500"}`}
                >
                  <span className="mr-1 text-slate-300">{w.k}</span>
                  {w.n}
                </div>
              ))}
            </div>
            <div className="inline-block rounded-xl border border-white/15 bg-black/55 px-4 py-2 backdrop-blur-sm">
              {h.weapon === "tnt" ? (
                <div className="text-3xl font-extrabold leading-none">
                  <span className="text-red-400">{isInfiniteAmmo ? "∞" : h.tnt}</span>
                  <span className="ml-1 text-sm font-semibold text-slate-300">TNT</span>
                </div>
              ) : (
                <div className="text-3xl font-extrabold leading-none">
                  <span className={!isInfiniteAmmo && h.mag === 0 ? "text-red-400" : "text-white"}>{isInfiniteAmmo ? "∞" : h.mag}</span>
                  <span className="mx-1 text-lg text-slate-400">/</span>
                  <span className="text-xl text-slate-300">{isInfiniteAmmo ? "∞" : h.reserve}</span>
                </div>
              )}
              <div className="mt-0.5 text-[11px] font-semibold uppercase tracking-wider text-slate-300">{h.reloading ? "Reloading …" : h.weaponName}</div>
              {h.weapon !== "tnt" && <div className="text-[11px] text-slate-400">TNT: {isInfiniteAmmo ? "∞" : h.tnt}</div>}
              {h.weapon === "tnt" && <div className="text-[10px] text-slate-400">LMB throw · RMB place · G detonate</div>}
            </div>
            {h.detonatable && <div className="mt-1 animate-pulse text-xs font-bold text-orange-300">💥 Charge active – [G] detonator</div>}
          </div>
        );
      })()}
      {touch && !h.escape && (() => {
        const isInfiniteAmmo = h.godMode || h.mode === "sandbox";
        return (
          <div className="absolute left-1/2 origin-bottom text-center" style={{ transform: `translateX(-50%) scale(${sc})`, bottom: 6 }}>
            <div className="rounded-lg border border-white/15 bg-black/55 px-3 py-1 text-sm font-extrabold">
              {h.weapon === "tnt" ? (
                <>
                  <span className="text-red-400">{isInfiniteAmmo ? "∞" : h.tnt}</span> TNT
                </>
              ) : (
                <>
                  {isInfiniteAmmo ? "∞" : h.mag}
                  <span className="text-slate-400"> / {isInfiniteAmmo ? "∞" : h.reserve}</span>
                </>
              )}
              <span className="ml-2 text-[10px] font-semibold uppercase text-slate-300">{h.weaponName}</span>
            </div>
          </div>
        );
      })()}
      {h.tabletOpen && game && (
        <div className="pointer-events-auto absolute inset-0 z-30 flex items-center justify-center bg-black/55 backdrop-blur-sm">
          <div className="max-h-[90vh] w-[480px] max-w-[92vw] overflow-y-auto rounded-2xl border border-cyan-400/40 bg-slate-950/95 p-4 text-slate-100 shadow-2xl">
            <div className="mb-3 flex items-center justify-between border-b border-white/10 pb-2">
              <div>
                <div className="text-sm font-black tracking-wider text-cyan-300">📱 BRIDGE COMMAND TABLET</div>
                <div className="text-[11px] text-slate-400">
                  Active Vessel: <span className="font-bold uppercase text-amber-300">{h.activeVessel}</span> · Freighter Hull {h.freighterIntegrityPct}% · Speed {h.vesselSpeed.toFixed(1)} m/s · Rudder {h.vesselRudder.toFixed(0)}°
                </div>
              </div>
              <button
                onClick={() => game.toggleTablet(false)}
                className="rounded-lg border border-white/20 bg-white/10 px-2.5 py-1 text-xs font-bold hover:bg-white/20"
              >
                Close [TAB]
              </button>
            </div>

            <div className="mb-3 grid grid-cols-2 gap-2">
              {(() => {
                const targetDestroyed =
                  h.theatre === "orbital"
                    ? h.freighterDestroyed && h.battleshipSunk
                    : h.activeVessel === "freighter"
                      ? h.battleshipSunk
                      : h.freighterDestroyed;
                return (
                  <button
                    onClick={() => game.switchVessel()}
                    disabled={targetDestroyed}
                    className={`rounded-lg border border-amber-400/40 bg-amber-500/20 px-3 py-2 text-xs font-bold text-amber-200 hover:bg-amber-500/35 ${
                      targetDestroyed ? "cursor-not-allowed opacity-40 grayscale" : ""
                    }`}
                  >
                    🚢 Switch Ship [V] ({h.activeVessel === "freighter" ? "→ Battleship" : "→ Freighter"})
                    {targetDestroyed && (
                      <span className="ml-1.5 rounded bg-red-600/80 px-1.5 py-0.5 text-[9px] font-black text-white">
                        100% DESTROYED
                      </span>
                    )}
                  </button>
                );
              })()}
              <button
                onClick={() => game.restoreFreighter()}
                className="rounded-lg border border-emerald-400/40 bg-emerald-500/20 px-3 py-2 text-xs font-bold text-emerald-200 hover:bg-emerald-500/35"
              >
                🔄 Restart / Restore Freighter
                {h.freighterDestroyed && (
                  <span className="ml-1.5 rounded bg-red-600/80 px-1.5 py-0.5 text-[9px] font-black text-white">
                    100% DESTROYED
                  </span>
                )}
              </button>
              <button
                onClick={() => game.spawnExtraBattleship()}
                className="rounded-lg border border-cyan-400/40 bg-cyan-500/20 px-3 py-2 text-xs font-bold text-cyan-200 hover:bg-cyan-500/35"
              >
                ⚓ Spawn Battleship ({h.battleshipCount}/6)
              </button>
              <button
                onClick={() => game.toggleFleetBattle()}
                className={`rounded-lg border px-3 py-2 text-xs font-bold ${
                  h.fleetBattle
                    ? "border-red-400/60 bg-red-600/40 text-red-100"
                    : "border-orange-400/40 bg-orange-500/20 text-orange-200 hover:bg-orange-500/35"
                }`}
              >
                ⚔️ {h.fleetBattle ? "Stop Fleet Battle" : "Start Fleet Battle"}
              </button>
            </div>

            <div className="mb-3 rounded-xl border border-amber-400/25 bg-amber-950/20 p-2.5">
              <div className="mb-1.5 flex items-center justify-between text-[11px] font-bold uppercase tracking-wider text-amber-300">
                <span>🎯 Fleet Strike on Freighter ({h.aliveBattleshipCount} Active Ships)</span>
                {h.freighterDestroyed && <span className="text-red-400">100% DESTROYED</span>}
              </div>
              <div className="grid grid-cols-3 gap-2">
                <button
                  onClick={() => game.fleetStrikeFreighter("salvo")}
                  disabled={h.freighterDestroyed || h.aliveBattleshipCount === 0}
                  className={`rounded-lg border border-red-400/40 bg-red-500/20 px-2 py-2 text-[11px] font-bold text-red-200 hover:bg-red-500/35 ${
                    h.freighterDestroyed || h.aliveBattleshipCount === 0 ? "cursor-not-allowed opacity-40 grayscale" : ""
                  }`}
                >
                  💥 All: Salvo → Freighter
                </button>
                <button
                  onClick={() => game.fleetStrikeFreighter("torpedo")}
                  disabled={h.freighterDestroyed || h.aliveBattleshipCount === 0}
                  className={`rounded-lg border border-cyan-400/40 bg-cyan-500/20 px-2 py-2 text-[11px] font-bold text-cyan-200 hover:bg-cyan-500/35 ${
                    h.freighterDestroyed || h.aliveBattleshipCount === 0 ? "cursor-not-allowed opacity-40 grayscale" : ""
                  }`}
                >
                  ⚓ All: Torpedo → Freighter
                </button>
                <button
                  onClick={() => game.fleetStrikeFreighter("missile")}
                  disabled={h.freighterDestroyed || h.aliveBattleshipCount === 0}
                  className={`rounded-lg border border-purple-400/40 bg-purple-500/20 px-2 py-2 text-[11px] font-bold text-purple-200 hover:bg-purple-500/35 ${
                    h.freighterDestroyed || h.aliveBattleshipCount === 0 ? "cursor-not-allowed opacity-40 grayscale" : ""
                  }`}
                >
                  🚀 All: Missiles → Freighter
                </button>
              </div>
            </div>

            <div className="mb-3 rounded-xl border border-white/10 bg-white/5 p-2.5">
              <div className="mb-1.5 text-[11px] font-bold uppercase tracking-wider text-slate-300">
                Remote Helm &amp; Telegraph ({h.vesselTelegraph})
              </div>
              <div className="mb-2 flex gap-2">
                <button onClick={() => game.remoteTelegraph(-1)} className="flex-1 rounded bg-slate-800 py-1.5 text-xs font-bold hover:bg-slate-700">
                  ▼ Astern / Slower
                </button>
                <button onClick={() => game.remoteTelegraph(1)} className="flex-1 rounded bg-emerald-700/70 py-1.5 text-xs font-bold hover:bg-emerald-600/80">
                  ▲ Ahead / Faster
                </button>
              </div>
              <div className="flex gap-2">
                <button onClick={() => game.remoteRudder(-25)} className="flex-1 rounded bg-slate-800 py-1.5 text-xs font-bold hover:bg-slate-700">
                  ◄ Port (-25°)
                </button>
                <button onClick={() => game.remoteRudder(0)} className="flex-1 rounded bg-slate-800 py-1.5 text-xs font-bold hover:bg-slate-700">
                  ● Midships (0°)
                </button>
                <button onClick={() => game.remoteRudder(25)} className="flex-1 rounded bg-slate-800 py-1.5 text-xs font-bold hover:bg-slate-700">
                  Stbd (+25°) ►
                </button>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 text-xs font-bold">
              <button onClick={() => game.remoteLockdown()} className="rounded-lg border border-red-400/30 bg-red-900/40 py-2 hover:bg-red-800/50">
                🔒 Bulkhead Lockdown [B]
              </button>
              <button onClick={() => game.remoteToggleGodMode()} className="rounded-lg border border-emerald-400/30 bg-emerald-900/40 py-2 hover:bg-emerald-800/50">
                🛡️ God Mode [G]: {h.godMode ? "ON" : "OFF"}
              </button>
              <button onClick={() => game.remoteToggleNoclip()} className="rounded-lg border border-cyan-400/30 bg-cyan-900/40 py-2 hover:bg-cyan-800/50">
                ✈️ Flight / Noclip [N]
              </button>
              <button onClick={() => game.remoteCycleFlood()} className="rounded-lg border border-blue-400/30 bg-blue-900/40 py-2 hover:bg-blue-800/50">
                🌊 Cycle Flood Rate [F]
              </button>
              {(() => {
                const allDestroyed = h.theatre === "orbital" && h.freighterDestroyed && h.battleshipSunk;
                return (
                  <button
                    onClick={() => game.toggleTheatre()}
                    disabled={allDestroyed}
                    className={`col-span-2 rounded-lg border border-indigo-400/50 bg-indigo-700/40 py-2 text-indigo-100 hover:bg-indigo-600/50 ${
                      allDestroyed ? "cursor-not-allowed opacity-40 grayscale" : ""
                    }`}
                  >
                    {h.theatre === "orbital" ? "⚓ Return to Ocean / Ships" : "🛰️ Enter Orbital Space Station (HYPERION-9)"}
                    {allDestroyed && (
                      <span className="ml-1.5 rounded bg-red-600/80 px-1.5 py-0.5 text-[9px] font-black text-white">
                        100% DESTROYED
                      </span>
                    )}
                  </button>
                );
              })()}
              {h.theatre === "orbital" && (
                <button
                  onClick={() => game.toggleOrbitalLaser()}
                  className="col-span-2 rounded-lg border border-cyan-400/60 bg-cyan-800/40 py-2 font-black text-cyan-200 hover:bg-cyan-700/50"
                >
                  {h.orbitalLaserMode ? "🛰️ Exit Orbital Death Ray" : "☄️ Activate Orbital Death Ray"}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
      {!h.tabletOpen && h.orbitalLaserMode && (
        <>
          <div className="pointer-events-none fixed inset-0 flex items-center justify-center">
            <div className="relative h-28 w-28 rounded-full border-2 border-cyan-400/70 shadow-[0_0_24px_rgba(34,211,238,0.45)]">
              <div className="absolute left-1/2 top-0 h-5 w-0.5 -translate-x-1/2 bg-cyan-300" />
              <div className="absolute bottom-0 left-1/2 h-5 w-0.5 -translate-x-1/2 bg-cyan-300" />
              <div className="absolute left-0 top-1/2 h-0.5 w-5 -translate-y-1/2 bg-cyan-300" />
              <div className="absolute right-0 top-1/2 h-0.5 w-5 -translate-y-1/2 bg-cyan-300" />
              <div className="absolute left-1/2 top-1/2 h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-red-500" />
            </div>
          </div>
          <div className="pointer-events-none absolute bottom-10 left-1/2 -translate-x-1/2 rounded-xl border border-cyan-400/60 bg-slate-950/90 px-4 py-2 text-center shadow-xl backdrop-blur-sm">
            <div className="text-xs font-black tracking-wider text-cyan-300">
              ☄️ ORBITAL DEATH RAY TARGETING · ZOOM FOV {h.orbitalZoomFov.toFixed(0)}°
            </div>
            <div className="mt-1 text-[11px] font-bold text-slate-300">
              [Mouse / WASD] Aim · [Q / Z / +/-] Zoom · [LMB] Fire Death Ray · [E] Exit Console
            </div>
          </div>
        </>
      )}
      {!h.tabletOpen && h.activeVessel === "battleship" && (
        <div className="pointer-events-none absolute bottom-10 left-1/2 -translate-x-1/2 rounded-xl border border-amber-400/50 bg-slate-950/85 px-4 py-2 text-center shadow-xl backdrop-blur-sm">
          <div className="text-xs font-black tracking-wider text-amber-300">
            ⚓ BATTLESHIP COMMAND · SPEED {h.vesselSpeed.toFixed(1)} m/s · RUDDER {h.vesselRudder.toFixed(0)}° ·{" "}
            <span className={h.lockedTargetLabel !== "NONE" ? "text-emerald-300" : "text-slate-400"}>
              🎯 [X] LOCK: {h.lockedTargetLabel} {h.lockedTargetLabel !== "NONE" ? `(${h.lockedTargetDist}m)` : ""}
            </span>
          </div>
          <div className="mt-1 flex justify-center gap-4 text-[11px] font-bold">
            <span className={h.cannonCd <= 0 ? "text-emerald-300" : "text-slate-400"}>
              💥 [LMB] Cannons: {h.cannonCd <= 0 ? "READY" : `${h.cannonCd.toFixed(1)}s`}
            </span>
            <span className={h.torpCd <= 0 ? "text-cyan-300" : "text-slate-400"}>
              ⚓ [RMB/Q] Torpedo: {h.torpCd <= 0 ? "READY" : `${h.torpCd.toFixed(1)}s`}
            </span>
            <span className={h.missileCd <= 0 ? "text-purple-300" : "text-slate-400"}>
              🚀 [E] Missile: {h.missileCd <= 0 ? "READY" : `${h.missileCd.toFixed(1)}s`}
            </span>
            <span className="text-slate-300">[W/S] Speed · [A/D] Steer · [V] Freighter</span>
          </div>
        </div>
      )}
      {!h.tabletOpen && !h.orbitalLaserMode && (
        <div className="pointer-events-auto absolute bottom-3 left-1/2 flex -translate-x-1/2 gap-2 rounded-full border border-cyan-400/30 bg-black/65 px-3 py-1 text-[10px] font-bold tracking-wide text-cyan-200">
          <button onClick={() => game?.toggleTablet(true)} className="hover:text-white">
            [TAB] Command Tablet
          </button>
          <span className="text-slate-500">·</span>
          {(() => {
            const targetDestroyed =
              h.theatre === "orbital"
                ? h.freighterDestroyed && h.battleshipSunk
                : h.activeVessel === "freighter"
                  ? h.battleshipSunk
                  : h.freighterDestroyed;
            return (
              <button
                onClick={() => game?.switchVessel()}
                disabled={targetDestroyed}
                className={targetDestroyed ? "cursor-not-allowed opacity-40 grayscale" : "hover:text-amber-300"}
              >
                [V] {h.theatre === "orbital" ? "Return to Ship" : `Switch Ship (${h.activeVessel.toUpperCase()})`}
                {targetDestroyed ? " · 100% DESTROYED" : ""}
              </button>
            );
          })()}
          <span className="text-slate-500">·</span>
          <span>[N] Fly</span>
        </div>
      )}
    </div>
  );
}
