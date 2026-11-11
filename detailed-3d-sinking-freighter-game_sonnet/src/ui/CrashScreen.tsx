import { useState } from "react";

export interface CrashInfo {
  message: string;
  stack?: string;
  where: string;
  time: string;
  extra?: string;
}

export function toCrashInfo(e: unknown, where: string, extra?: string): CrashInfo {
  const err = e instanceof Error ? e : new Error(typeof e === "string" ? e : (() => { try { return JSON.stringify(e); } catch { return String(e); } })());
  return { message: err.message || "Unbekannter Fehler", stack: err.stack, where, time: new Date().toLocaleString("de-DE"), extra };
}

interface Props {
  info: CrashInfo;
  onRestart: () => void;
  onLowGfx: () => void;
  onMenu: () => void;
}

export default function CrashScreen({ info, onRestart, onLowGfx, onMenu }: Props) {
  const [copied, setCopied] = useState(false);
  const [open, setOpen] = useState(false);
  const report = () =>
    [
      "NORDWIND – Absturzbericht",
      `Zeit: ${info.time}`,
      `Ort: ${info.where}`,
      `Fehler: ${info.message}`,
      `Browser: ${navigator.userAgent}`,
      `Bildschirm: ${window.innerWidth}x${window.innerHeight} @${window.devicePixelRatio}`,
      info.extra ? `Info: ${info.extra}` : "",
      "",
      info.stack || "(kein Stacktrace)",
    ].join("\n");
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(report());
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setOpen(true);
    }
  };
  return (
    <div className="fixed inset-0 z-[100] flex overflow-y-auto bg-gradient-to-b from-[#1a0505] via-[#120a0a] to-black p-4 text-white">
      <div className="m-auto w-full max-w-xl rounded-2xl border border-red-500/40 bg-black/70 p-5 shadow-[0_0_60px_rgba(255,40,40,0.25)] sm:p-7">
        <div className="mb-3 flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-red-600/90 text-2xl">⚠</div>
          <div>
            <h1 className="text-2xl font-extrabold tracking-wide text-red-400">Absturz abgefangen</h1>
            <p className="text-sm text-slate-300">Das Spiel ist auf ein Problem gestoßen, wurde aber sicher angehalten.</p>
          </div>
        </div>
        <div className="mb-3 rounded-lg border border-red-500/30 bg-red-950/40 p-3 font-mono text-[13px] leading-snug text-red-200 break-words">{info.message}</div>
        <p className="mb-4 text-sm text-slate-300">
          Tipps: Mit <b>„Niedrige Grafik & Neustart"</b> läuft das Spiel auch auf schwachen Geräten. Wenn der Fehler „WebGL" lautet, aktiviere die Hardware-Beschleunigung deines Browsers oder nutze einen anderen Browser.
        </p>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <button onClick={onRestart} className="min-h-[48px] rounded-lg bg-orange-500 px-4 py-2 font-bold text-white hover:bg-orange-400 active:scale-95">
            ↻ Neu starten
          </button>
          <button onClick={onLowGfx} className="min-h-[48px] rounded-lg bg-emerald-600 px-4 py-2 font-bold text-white hover:bg-emerald-500 active:scale-95">
            ⚡ Niedrige Grafik & Neustart
          </button>
          <button onClick={onMenu} className="min-h-[48px] rounded-lg border border-white/20 bg-white/10 px-4 py-2 font-semibold hover:bg-white/20 active:scale-95">
            ⌂ Hauptmenü
          </button>
          <button onClick={copy} className="min-h-[48px] rounded-lg border border-white/20 bg-white/10 px-4 py-2 font-semibold hover:bg-white/20 active:scale-95">
            {copied ? "✓ Kopiert" : "⧉ Fehlerbericht kopieren"}
          </button>
        </div>
        <button onClick={() => setOpen(!open)} className="mt-3 text-xs text-slate-400 underline">
          {open ? "Details verbergen" : "Technische Details anzeigen"}
        </button>
        {open && <pre className="mt-2 max-h-56 overflow-auto rounded-lg bg-black/60 p-3 text-[11px] leading-snug text-slate-300 whitespace-pre-wrap break-words">{report()}</pre>}
      </div>
    </div>
  );
}
