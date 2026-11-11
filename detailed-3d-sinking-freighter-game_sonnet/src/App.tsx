import { useCallback, useEffect, useRef, useState } from "react";
import { Game, EndInfo, HudState, Mode } from "./game/game";
import { PRESETS, Settings, isMobileDevice, loadSettings, saveSettings, sanitize } from "./game/settings";
import CrashScreen, { CrashInfo, toCrashInfo } from "./ui/CrashScreen";
import Hud from "./ui/Hud";
import SettingsPanel from "./ui/SettingsPanel";
import TouchControls from "./ui/TouchControls";
import { EndScreen, HelpPanel, Loading, MainMenu, ReadyPanel } from "./ui/Screens";

type Screen = "menu" | "playing";
type Overlay = null | "ready" | "pause" | "settings" | "help" | "end";

function useTouchMode(settings: Settings): boolean {
  if (settings.touch === "on") return true;
  if (settings.touch === "off") return false;
  return isMobileDevice();
}

function GameView(props: {
  settings: Settings;
  mode: Mode;
  gameRef: React.MutableRefObject<Game | null>;
  onHud: (h: HudState) => void;
  onEnd: (e: EndInfo) => void;
  onCrash: (e: unknown, where: string) => void;
  onPause: () => void;
  onProgress: (p: number, l: string) => void;
  onReady: () => void;
}) {
  const host = useRef<HTMLDivElement>(null);
  const p = useRef(props);
  p.current = props;

  useEffect(() => {
    let cancelled = false;
    let game: Game | null = null;
    const t = window.setTimeout(() => {
      if (cancelled || !host.current) return;
      try {
        game = new Game(host.current, p.current.settings, p.current.mode, {
          onHud: (h) => p.current.onHud(h),
          onEnd: (e) => p.current.onEnd(e),
          onCrash: (e) => p.current.onCrash(e, "Spielschleife"),
          onPause: () => p.current.onPause(),
          onProgress: (a, b) => p.current.onProgress(a, b),
        });
        p.current.gameRef.current = game;
        game.init();
        game.setPaused(true);
        game.start();
        p.current.onReady();
      } catch (e) {
        try {
          game?.dispose();
        } catch {
          /* ignore */
        }
        p.current.gameRef.current = null;
        p.current.onCrash(e, "Initialisierung");
      }
    }, 60);
    return () => {
      cancelled = true;
      window.clearTimeout(t);
      try {
        game?.dispose();
      } catch {
        /* ignore */
      }
      if (p.current.gameRef.current === game) p.current.gameRef.current = null;
    };
  }, []);

  useEffect(() => {
    props.gameRef.current?.applySettings(props.settings);
  }, [props.settings, props.gameRef]);

  return <div ref={host} className="fixed inset-0 bg-black" style={{ touchAction: "none" }} />;
}

export default function App() {
  const [settings, setSettingsState] = useState<Settings>(() => loadSettings());
  const [screen, setScreen] = useState<Screen>("menu");
  const [overlay, setOverlay] = useState<Overlay>(null);
  const [menuOverlay, setMenuOverlay] = useState<null | "settings" | "help">(null);
  const [mode, setMode] = useState<Mode>("mission");
  const [session, setSession] = useState(0);
  const [hud, setHud] = useState<HudState | null>(null);
  const [end, setEnd] = useState<EndInfo | null>(null);
  const [crash, setCrash] = useState<CrashInfo | null>(null);
  const [loading, setLoading] = useState<{ p: number; label: string } | null>(null);
  const [started, setStarted] = useState(false);
  const gameRef = useRef<Game | null>(null);
  const overlayRef = useRef<Overlay>(null);
  overlayRef.current = overlay;
  const screenRef = useRef<Screen>("menu");
  screenRef.current = screen;
  const settingsReturn = useRef<Overlay>(null);
  const touch = useTouchMode(settings);

  const setSettings = useCallback((s: Settings) => {
    const c = sanitize(s);
    setSettingsState(c);
    saveSettings(c);
  }, []);

  // globale Fehlerfänger -> Absturzbildschirm
  useEffect(() => {
    const onErr = (e: ErrorEvent) => {
      const msg = e.message || "";
      if (/ResizeObserver loop/i.test(msg) || /Script error\.?$/i.test(msg)) return;
      if (screenRef.current === "playing") {
        gameRef.current?.setPaused(true);
        setCrash(toCrashInfo(e.error ?? msg, "window.onerror"));
      }
    };
    const onRej = (e: PromiseRejectionEvent) => {
      const r = e.reason;
      const msg = r instanceof Error ? r.message : String(r);
      if (/AbortError|play\(\) request|The operation was aborted|NotAllowedError/i.test(msg)) return;
      if (screenRef.current === "playing") {
        gameRef.current?.setPaused(true);
        setCrash(toCrashInfo(r, "unhandledrejection"));
      }
    };
    window.addEventListener("error", onErr);
    window.addEventListener("unhandledrejection", onRej);
    return () => {
      window.removeEventListener("error", onErr);
      window.removeEventListener("unhandledrejection", onRej);
    };
  }, []);

  const startGame = (m: Mode) => {
    setMode(m);
    setEnd(null);
    setCrash(null);
    setHud(null);
    setStarted(false);
    setOverlay(null);
    setLoading({ p: 0.02, label: "Starte …" });
    setSession((s) => s + 1);
    setScreen("playing");
  };

  const toMenu = () => {
    gameRef.current?.setPaused(true);
    setScreen("menu");
    setOverlay(null);
    setCrash(null);
    setEnd(null);
    setHud(null);
    setLoading(null);
    setStarted(false);
    try {
      if (document.pointerLockElement) document.exitPointerLock();
    } catch {
      /* ignore */
    }
  };

  const onPause = useCallback(() => {
    if (overlayRef.current === "end") return;
    gameRef.current?.setPaused(true);
    setOverlay((o) => (o === "settings" || o === "help" ? o : o ? o : "pause"));
  }, []);

  const play = () => {
    const g = gameRef.current;
    if (!g) return;
    setOverlay(null);
    setStarted(true);
    g.setPaused(false);
    g.requestLock();
  };

  const openSettings = () => {
    settingsReturn.current = overlay;
    setOverlay("settings");
  };
  const openHelp = () => {
    settingsReturn.current = overlay;
    setOverlay("help");
  };
  const closeSub = () => setOverlay(settingsReturn.current ?? "pause");

  const lowGfxRestart = () => {
    const s = sanitize({ ...settings, ...PRESETS.low, preset: "low", shadows: 0, particles: 0.3, lights: 2, resolution: 0.6 });
    setSettings(s);
    startGame(mode);
  };

  const handleCrash = useCallback((e: unknown, where: string) => {
    try {
      gameRef.current?.setPaused(true);
    } catch {
      /* ignore */
    }
    setLoading(null);
    setCrash(toCrashInfo(e, where));
    try {
      if (document.pointerLockElement) document.exitPointerLock();
    } catch {
      /* ignore */
    }
  }, []);

  if (crash) {
    return <CrashScreen info={crash} onRestart={() => startGame(mode)} onLowGfx={lowGfxRestart} onMenu={toMenu} />;
  }

  return (
    <div className="fixed inset-0 select-none overflow-hidden bg-black">
      {screen === "menu" && (
        <>
          <MainMenu touch={touch} onStart={() => startGame("mission")} onSandbox={() => startGame("sandbox")} onSettings={() => setMenuOverlay("settings")} onHelp={() => setMenuOverlay("help")} />
          {menuOverlay === "settings" && <SettingsPanel settings={settings} onChange={setSettings} onClose={() => setMenuOverlay(null)} />}
          {menuOverlay === "help" && <HelpPanel onClose={() => setMenuOverlay(null)} />}
        </>
      )}
      {screen === "playing" && (
        <>
          <GameView
            key={session}
            settings={settings}
            mode={mode}
            gameRef={gameRef}
            onHud={setHud}
            onEnd={(e) => {
              setEnd(e);
              setOverlay("end");
              try {
                if (document.pointerLockElement) document.exitPointerLock();
              } catch {
                /* ignore */
              }
            }}
            onCrash={handleCrash}
            onPause={onPause}
            onProgress={(p, label) => setLoading({ p, label })}
            onReady={() => {
              setLoading(null);
              setOverlay("ready");
            }}
          />
          {hud && overlay !== "ready" && <Hud h={hud} settings={settings} touch={touch} />}
          {touch && started && hud && overlay === null && !hud.escape && (
            <TouchControls game={gameRef.current} settings={settings} tnt={hud.owned.tnt} detonatable={hud.detonatable} onPause={onPause} />
          )}
          {loading && <Loading p={loading.p} label={loading.label} />}
          {overlay === "ready" && (
            <ReadyPanel title={mode === "mission" ? "Mission bereit" : "Sandbox bereit"} resume={false} touch={touch} onPlay={play} onSettings={openSettings} onHelp={openHelp} onMenu={toMenu} />
          )}
          {overlay === "pause" && (
            <ReadyPanel title="Pausiert" resume touch={touch} onPlay={play} onSettings={openSettings} onHelp={openHelp} onMenu={toMenu} onRestart={() => startGame(mode)} />
          )}
          {overlay === "settings" && <SettingsPanel inGame settings={settings} onChange={setSettings} onClose={closeSub} />}
          {overlay === "help" && <HelpPanel onClose={closeSub} />}
          {overlay === "end" && end && <EndScreen info={end} onRetry={() => startGame(mode)} onMenu={toMenu} />}
        </>
      )}
    </div>
  );
}
