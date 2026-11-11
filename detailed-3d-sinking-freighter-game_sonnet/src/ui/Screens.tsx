import type { EndInfo } from "../game/game";

const btnBase = "min-h-[50px] w-full rounded-xl px-5 py-3 text-base font-bold tracking-wide transition active:scale-[0.97] sm:text-lg";

export function toggleFullscreen() {
  try {
    const d: any = document;
    if (document.fullscreenElement || d.webkitFullscreenElement) {
      (document.exitFullscreen || d.webkitExitFullscreen)?.call(document);
    } else {
      const el: any = document.documentElement;
      (el.requestFullscreen || el.webkitRequestFullscreen)?.call(el);
    }
  } catch {
    /* nicht unterstützt */
  }
}

export function MainMenu({ onStart, onSandbox, onSettings, onHelp, touch }: { onStart: () => void; onSandbox: () => void; onSettings: () => void; onHelp: () => void; touch: boolean }) {
  return (
    <div className="fixed inset-0 overflow-y-auto overflow-x-hidden bg-gradient-to-b from-[#07121f] via-[#12304d] to-[#e0803a] text-white">
      {/* Sterne */}
      <div className="pointer-events-none absolute inset-0 opacity-60" style={{ backgroundImage: "radial-gradient(1.5px 1.5px at 20% 15%, #fff, transparent), radial-gradient(1px 1px at 70% 10%, #fff, transparent), radial-gradient(1.5px 1.5px at 40% 30%, #fff, transparent), radial-gradient(1px 1px at 85% 28%, #fff, transparent), radial-gradient(1px 1px at 10% 40%, #fff, transparent), radial-gradient(1.5px 1.5px at 55% 8%, #fff, transparent)" }} />
      {/* Mond/Sonne */}
      <div className="pointer-events-none absolute left-1/2 top-[34%] h-40 w-40 -translate-x-1/2 rounded-full bg-orange-300/80 blur-2xl sm:h-64 sm:w-64" />
      {/* Schiff */}
      <div className="pointer-events-none absolute inset-x-0 bottom-[10%] flex justify-center">
        <svg viewBox="0 0 600 160" className="menu-ship w-[min(92vw,720px)] drop-shadow-[0_6px_14px_rgba(0,0,0,0.6)]">
          <path d="M20 90 L580 90 L540 135 L60 135 Z" fill="#1c1f26" />
          <path d="M20 90 L580 90 L575 98 L25 98 Z" fill="#b02a22" />
          <path d="M60 135 L540 135 L530 142 L70 142 Z" fill="#7a1a15" />
          <rect x="60" y="64" width="120" height="26" fill="#e9e6dc" />
          <rect x="72" y="42" width="96" height="22" fill="#e9e6dc" />
          <rect x="84" y="24" width="72" height="18" fill="#d8d4c8" />
          <rect x="96" y="12" width="48" height="12" fill="#cfcabd" />
          <rect x="95" y="30" width="50" height="5" fill="#2c4a6b" />
          <rect x="180" y="40" width="26" height="50" fill="#b02a22" />
          <rect x="180" y="34" width="26" height="8" fill="#111" />
          {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => (
            <g key={i}>
              <rect x={235 + i * 45} y="62" width="40" height="28" fill={["#b33a2e", "#2f5d8a", "#3c7a4a", "#d9a13a"][i % 4]} />
              <rect x={235 + i * 45} y="34" width="40" height="28" fill={["#2f5d8a", "#d9a13a", "#b33a2e", "#3c7a4a"][i % 4]} />
            </g>
          ))}
        </svg>
      </div>
      {/* Wellen */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-[16%] overflow-hidden">
        <div className="menu-wave absolute -left-1/2 bottom-0 h-full w-[200%]" style={{ background: "linear-gradient(180deg,#0b3550,#04121d)", clipPath: "polygon(0 30%,8% 20%,16% 30%,25% 18%,33% 30%,41% 20%,50% 30%,58% 18%,66% 30%,75% 20%,83% 30%,91% 18%,100% 30%,100% 100%,0 100%)" }} />
      </div>
      <style>{`
        @keyframes shipBob { 0%,100% { transform: translateY(0) rotate(-0.8deg);} 50% { transform: translateY(8px) rotate(0.8deg);} }
        @keyframes waveMove { from { transform: translateX(0);} to { transform: translateX(25%);} }
        .menu-ship { animation: shipBob 6s ease-in-out infinite; }
        .menu-wave { animation: waveMove 9s linear infinite alternate; }
      `}</style>

      <div className="relative z-10 mx-auto flex min-h-full max-w-md flex-col items-center justify-start px-5 pb-[34vh] pt-[6vh] text-center sm:pt-[8vh]">
        <div className="mb-1 text-xs font-semibold uppercase tracking-[0.4em] text-orange-200 sm:text-sm">3D Sabotage-Abenteuer</div>
        <h1 className="bg-gradient-to-b from-white to-orange-200 bg-clip-text text-5xl font-black tracking-wider text-transparent drop-shadow-[0_4px_12px_rgba(0,0,0,0.5)] sm:text-7xl">NORDWIND</h1>
        <p className="mb-6 mt-2 max-w-sm text-sm text-slate-200 sm:text-base">Schleiche an Bord eines riesigen Frachters, öffne Türen, finde Zugangskarten, platziere TNT – und flieh, bevor alles untergeht.</p>
        <div className="flex w-full max-w-xs flex-col gap-2.5">
          <button onClick={onStart} className={`${btnBase} bg-orange-500 text-white shadow-lg shadow-orange-900/40 hover:bg-orange-400`}>
            ▶ Mission starten
          </button>
          <button onClick={onSandbox} className={`${btnBase} border border-white/25 bg-white/10 text-white backdrop-blur hover:bg-white/20`}>
            🧪 Sandbox (alle Waffen)
          </button>
          <div className="grid grid-cols-2 gap-2.5">
            <button onClick={onSettings} className={`${btnBase} border border-white/20 bg-black/35 text-base backdrop-blur hover:bg-black/55`}>
              ⚙ Einstellungen
            </button>
            <button onClick={onHelp} className={`${btnBase} border border-white/20 bg-black/35 text-base backdrop-blur hover:bg-black/55`}>
              ❓ Hilfe
            </button>
          </div>
          <button onClick={toggleFullscreen} className="min-h-[44px] rounded-lg text-sm font-semibold text-slate-200 underline-offset-4 hover:underline">
            ⛶ Vollbild umschalten
          </button>
        </div>
        <div className="mt-3 rounded-full bg-black/40 px-3 py-1 text-xs text-slate-200">{touch ? "📱 Touch-Steuerung erkannt" : "🖱 Maus & Tastatur"} · läuft auf jedem Gerät</div>
      </div>
    </div>
  );
}

export function Loading({ p, label }: { p: number; label: string }) {
  return (
    <div className="fixed inset-0 z-40 flex flex-col items-center justify-center bg-[#07121f] px-6 text-white">
      <div className="mb-2 text-3xl font-black tracking-widest text-orange-300">NORDWIND</div>
      <div className="mb-4 text-sm text-slate-300">{label}</div>
      <div className="h-3 w-full max-w-xs overflow-hidden rounded-full bg-white/10">
        <div className="h-full rounded-full bg-gradient-to-r from-orange-500 to-amber-300 transition-all duration-300" style={{ width: `${Math.round(p * 100)}%` }} />
      </div>
    </div>
  );
}

export function HelpPanel({ onClose }: { onClose: () => void }) {
  const Sec = ({ t, children }: { t: string; children: React.ReactNode }) => (
    <section className="mb-4">
      <h3 className="mb-1.5 text-sm font-bold uppercase tracking-wider text-orange-300">{t}</h3>
      <div className="space-y-1 text-sm leading-relaxed text-slate-200">{children}</div>
    </section>
  );
  const K = ({ k }: { k: string }) => <kbd className="mx-0.5 rounded border border-white/30 bg-white/10 px-1.5 py-0.5 font-mono text-xs">{k}</kbd>;
  return (
    <div className="fixed inset-0 z-50 flex items-stretch justify-center bg-black/75 backdrop-blur-sm sm:items-center sm:p-4">
      <div className="flex max-h-full w-full flex-col overflow-hidden bg-slate-900/95 text-white shadow-2xl sm:max-w-2xl sm:rounded-2xl sm:border sm:border-white/10">
        <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
          <h2 className="text-lg font-bold">Steuerung & Hilfe</h2>
          <button onClick={onClose} className="min-h-[44px] rounded-lg bg-orange-500 px-5 py-2 font-semibold hover:bg-orange-400">
            Zurück
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-4 py-4">
          <Sec t="Ziel der Mission">
            <p>
              Die <b>NORDWIND</b> ist ein riesiger Frachter. Finde Zugangskarten, schleiche an den Wachen vorbei, platziere <b>TNT</b> an mindestens <b>2 orangen Sprengpunkten</b> im Rumpf (Maschinenraum und Laderäume) und zünde sie
              mit dem Fernzünder. Das Schiff läuft voll Wasser, kippt und sinkt. Erreiche ein <b>Rettungsboot</b> an den Seiten, bevor es zu spät ist!
            </p>
          </Sec>
          <Sec t="Tastatur & Maus">
            <p>
              <K k="W" />
              <K k="A" />
              <K k="S" />
              <K k="D" /> Bewegen · <b>Maus</b> Umsehen · <K k="Shift" /> Rennen · <K k="Strg" />/<K k="C" /> Ducken · <K k="Leertaste" /> Springen
            </p>
            <p>
              <K k="E" /> Türen öffnen/schließen, Rettungsboot · <b>Linke Maustaste</b> Schießen / TNT werfen · <b>Rechte Maustaste</b> TNT ablegen
            </p>
            <p>
              <K k="R" /> Nachladen · <K k="1" />–<K k="4" /> oder <b>Mausrad</b> Waffe · <K k="Q" /> letzte Waffe · <K k="G" /> Fernzünder · <K k="F" /> Taschenlampe · <K k="Esc" /> Pause
            </p>
          </Sec>
          <Sec t="Touch (Handy & Tablet)">
            <p>Linker Daumen: Joystick (ganz nach oben = rennen). Rechter Daumen: Wischen zum Umsehen. Tasten: FEUER, SPRUNG, BENUTZEN, NACHLADEN, WAFFE, DUCKEN, ZÜNDEN, LAMPE. Größe, Seite und Deckkraft sind einstellbar.</p>
          </Sec>
          <Sec t="Gamepad">
            <p>Linker Stick bewegen, rechter Stick umsehen, RT schießen, LT TNT ablegen, A springen, X nachladen, Y benutzen, Bumper Waffe wechseln.</p>
          </Sec>
          <Sec t="Tipps">
            <ul className="list-disc space-y-1 pl-5">
              <li>Türen haben echte Kollision – du kommst nur durch geöffnete Türen. Verschlossene Türen brauchen die passende Zugangskarte (blau/rot). Eine Tür schließt nie auf dich zu.</li>
              <li>Die <b>blaue Karte</b> liegt in den Kajüten (Deck 1) – sie öffnet das Gittertor zum Laderaum 2. Die <b>rote Karte</b> liegt auf der Brücke – sie öffnet den Maschinenraum.</li>
              <li>TNT: Wirf es oder lege es mit der rechten Maustaste ab. Die Zündschnur brennt – oder zünde alle Ladungen sofort mit <K k="G" />. Schüsse auf TNT und rote Fässer lösen Explosionen aus.</li>
              <li>Nur Explosionen nahe der Außenhaut <i>unter</i> der Wasserlinie reißen ein Leck. Das Wasser kommt durch Löcher, steigt, und das Schiff bekommt Schlagseite – du rutschst den Hang hinab!</li>
              <li>Unter Wasser hast du etwa 30 Sekunden Luft. Fenster können zerschossen werden. Wachen hören Schüsse und Explosionen.</li>
            </ul>
          </Sec>
        </div>
      </div>
    </div>
  );
}

export function ReadyPanel({ title, onPlay, onSettings, onHelp, onMenu, onRestart, resume, touch }: { title: string; onPlay: () => void; onSettings: () => void; onHelp: () => void; onMenu: () => void; onRestart?: () => void; resume: boolean; touch: boolean }) {
  return (
    <div className="fixed inset-0 z-40 flex overflow-y-auto bg-black/65 p-4 backdrop-blur-sm">
      <div className="m-auto w-full max-w-sm rounded-2xl border border-white/15 bg-slate-900/90 p-5 text-center text-white shadow-2xl">
        <h2 className="mb-1 text-2xl font-black tracking-wide text-orange-300">{title}</h2>
        <p className="mb-4 text-sm text-slate-300">{touch ? "Tippe zum Spielen." : resume ? "Klicke, um die Maus wieder einzufangen." : "Klicke, um zu starten – die Maus wird eingefangen (Esc = Pause)."}</p>
        <div className="flex flex-col gap-2.5">
          <button onClick={onPlay} className={`${btnBase} bg-orange-500 text-white hover:bg-orange-400`}>
            {resume ? "▶ Fortsetzen" : "▶ Spielen"}
          </button>
          <button onClick={onSettings} className={`${btnBase} border border-white/20 bg-white/10 hover:bg-white/20`}>
            ⚙ Einstellungen
          </button>
          <button onClick={onHelp} className={`${btnBase} border border-white/20 bg-white/10 hover:bg-white/20`}>
            ❓ Steuerung
          </button>
          <div className="grid grid-cols-2 gap-2.5">
            {onRestart && (
              <button onClick={onRestart} className={`${btnBase} border border-white/20 bg-white/10 text-base hover:bg-white/20`}>
                ↻ Neustart
              </button>
            )}
            <button onClick={onMenu} className={`${btnBase} border border-white/20 bg-white/10 text-base hover:bg-white/20`}>
              ⌂ Menü
            </button>
          </div>
          <button onClick={toggleFullscreen} className="min-h-[40px] text-sm font-semibold text-slate-300 underline-offset-4 hover:underline">
            ⛶ Vollbild
          </button>
        </div>
      </div>
    </div>
  );
}

export function EndScreen({ info, onRetry, onMenu }: { info: EndInfo; onRetry: () => void; onMenu: () => void }) {
  const win = info.kind === "win";
  const mm = Math.floor(info.time / 60),
    ss = Math.floor(info.time % 60);
  return (
    <div className={`fixed inset-0 z-40 flex overflow-y-auto p-4 backdrop-blur-sm ${win ? "bg-emerald-950/70" : "bg-red-950/75"}`}>
      <div className="m-auto w-full max-w-sm rounded-2xl border border-white/20 bg-slate-950/85 p-6 text-center text-white shadow-2xl">
        <div className="mb-1 text-5xl">{win ? "🏆" : info.kind === "drown" ? "🌊" : "💀"}</div>
        <h2 className={`mb-1 text-3xl font-black tracking-wide ${win ? "text-emerald-300" : "text-red-400"}`}>{win ? "MISSION ERFÜLLT" : info.kind === "drown" ? "ERTRUNKEN" : "GESCHEITERT"}</h2>
        <p className="mb-4 text-sm text-slate-300">{win ? "Du bist entkommen und die NORDWIND versinkt in den Wellen." : info.cause}</p>
        <div className="mb-5 grid grid-cols-3 gap-2 text-center">
          <div className="rounded-lg bg-white/5 p-2">
            <div className="text-xs text-slate-400">Zeit</div>
            <div className="font-mono text-lg font-bold">
              {String(mm).padStart(2, "0")}:{String(ss).padStart(2, "0")}
            </div>
          </div>
          <div className="rounded-lg bg-white/5 p-2">
            <div className="text-xs text-slate-400">Wachen</div>
            <div className="font-mono text-lg font-bold">{info.kills}</div>
          </div>
          <div className="rounded-lg bg-white/5 p-2">
            <div className="text-xs text-slate-400">Geflutet</div>
            <div className="font-mono text-lg font-bold">{Math.round(info.flood * 100)}%</div>
          </div>
        </div>
        <div className="flex flex-col gap-2.5">
          <button onClick={onRetry} className={`${btnBase} bg-orange-500 hover:bg-orange-400`}>
            ↻ Nochmal
          </button>
          <button onClick={onMenu} className={`${btnBase} border border-white/20 bg-white/10 hover:bg-white/20`}>
            ⌂ Hauptmenü
          </button>
        </div>
      </div>
    </div>
  );
}
