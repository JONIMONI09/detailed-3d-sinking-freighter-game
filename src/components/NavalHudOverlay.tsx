import React, { useEffect, useState } from 'react';
import {
  Settings,
  FileText,
  RotateCcw,
  Camera,
  Flashlight,
  DoorOpen,
  Lock,
  LockOpen,
  ShieldCheck,
  AlertTriangle,
  Flame,
  Wrench,
  Navigation,
  ChevronDown,
  ChevronUp,
  Droplets,
  Volume2,
  VolumeX,
  Radio,
  ShieldAlert,
  Maximize,
  Minimize,
} from 'lucide-react';
import {
  AudioSettings,
  CompartmentId,
  GraphicsSettings,
  ShipTelemetry,
  WEAPONS_LIST,
} from '../types/game';
import { SimulationCommandRef } from './MaritimeViewport3D';
import { toggleFullscreen } from '../lib/browserGuards';
import { soundEngine } from '../audio/SoundEngine';

interface NavalHudOverlayProps {
  telemetry: ShipTelemetry;
  graphics: GraphicsSettings;
  audio: AudioSettings;
  onToggleMute: () => void;
  onOpenSettings: () => void;
  onOpenPhotoAnalyzer: () => void;
  commandRef: React.MutableRefObject<SimulationCommandRef | null>;
}

export const NavalHudOverlay: React.FC<NavalHudOverlayProps> = ({
  telemetry,
  graphics,
  audio,
  onToggleMute,
  onOpenSettings,
  onOpenPhotoAnalyzer,
  commandRef,
}) => {
  // Phone landscape / split screen: the schematic starts collapsed so it cannot
  // overlap the thumbstick and the weapon dock.
  const [leftPanelCollapsed, setLeftPanelCollapsed] = useState<boolean>(
    () =>
      typeof window !== 'undefined' &&
      (window.innerHeight <= 560 || window.innerWidth < 640)
  );

  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);
  const [fullscreenBlocked, setFullscreenBlocked] = useState<boolean>(false);

  useEffect(() => {
    const doc = document as Document & { webkitFullscreenElement?: Element | null };
    const sync = () => {
      setIsFullscreen(Boolean(document.fullscreenElement || doc.webkitFullscreenElement));
    };
    document.addEventListener('fullscreenchange', sync);
    document.addEventListener('webkitfullscreenchange', sync);
    sync();
    return () => {
      document.removeEventListener('fullscreenchange', sync);
      document.removeEventListener('webkitfullscreenchange', sync);
    };
  }, []);

  const handleFullscreen = async () => {
    const result = await toggleFullscreen();
    setIsFullscreen(result.active);
    setFullscreenBlocked(result.error);
  };

  const statusColor =
    telemetry.shipStatus === 'NOMINAL'
      ? 'text-emerald-400 border-emerald-500/40 bg-emerald-500/10'
      : telemetry.shipStatus === 'FLOODING'
      ? 'text-amber-400 border-amber-500/50 bg-amber-500/15'
      : 'text-red-400 border-red-500/70 bg-red-500/20 animate-pulse';

  return (
    <div className="fixed inset-0 pointer-events-none z-10 flex flex-col justify-between hud-safe">
      {/* Underwater Submersion Tint Overlay */}
      {telemetry.playerUnderwater && (
        <div className="fixed inset-0 pointer-events-none bg-sky-900/35 backdrop-blur-[2px] border-4 border-sky-400/30 z-0 flex items-start justify-center pt-20 short:pt-10">
          <div className="px-4 py-1.5 rounded-full bg-sky-950/90 border border-sky-400 text-sky-200 font-mono-tech text-xs font-bold tracking-wider">
            UNDERWATER // PRESS [SPACE] TO SURFACE
          </div>
        </div>
      )}

      {fullscreenBlocked && (
        <div
          role="status"
          className="pointer-events-none fixed left-1/2 top-24 z-30 -translate-x-1/2 rounded-lg bg-amber-500 px-3 py-1.5 text-xs font-bold text-slate-950 shadow-xl"
        >
          Fullscreen is blocked by this browser. Use the browser menu.
        </div>
      )}

      {/* =====================================================================
          1. TOP TACTICAL BAR (SHIP STATUS, DECK LOCATION, PHOTO->TXT & SETTINGS)
      ===================================================================== */}
      <div className="relative z-10 flex flex-wrap items-center justify-between gap-2 short:gap-1 pointer-events-auto">
        {/* Left Brand & Current Deck Badge */}
        <div className="naval-panel rounded-xl px-3.5 py-2 short:px-2 short:py-1 flex items-center gap-3 short:gap-2">
          <div className="flex items-center gap-2">
            <div className="w-2.5 h-2.5 rounded-full bg-amber-400 shadow-[0_0_8px_#f59e0b]" />
            <span className="font-display font-bold text-sm sm:text-base short:text-[11px] tracking-wider text-white">
              MS POSEIDON VII
            </span>
          </div>

          <div className="h-4 w-[1px] bg-slate-700 hidden sm:block" />

          <div className="hidden md:flex items-center gap-1.5 text-xs font-mono-tech text-sky-300">
            <Navigation className="w-3.5 h-3.5 text-amber-400 shrink-0" />
            <span>{telemetry.playerDeckName}</span>
          </div>

          <div
            className={`px-2 py-0.5 short:px-1.5 short:py-0 rounded border text-[11px] short:text-[9px] font-mono-tech font-bold ${statusColor}`}
          >
            {telemetry.shipStatus}
          </div>

          <div
            className="hidden lg:flex items-center gap-1 px-2 py-0.5 rounded bg-emerald-500/15 border border-emerald-500/40 text-emerald-300 text-[10px] font-mono-tech font-bold"
            title="Ship-local OBB/AABB collision blocks any clipping through walls & closed doors"
          >
            <ShieldCheck className="w-3.5 h-3.5" />
            <span>NO-CLIP GUARD ACTIVE</span>
          </div>
        </div>

        {/* Right Utility & Modal Triggers */}
        <div className="flex items-center gap-1.5 sm:gap-2 short:gap-1 flex-wrap">
          {graphics.showFps && (
            <div className="naval-panel rounded-lg px-2.5 py-1.5 font-mono-tech text-xs hidden sm:flex short:hidden items-center gap-2">
              <span
                className={
                  telemetry.fps >= 45
                    ? 'text-emerald-400 font-bold'
                    : telemetry.fps >= 28
                    ? 'text-amber-400 font-bold'
                    : 'text-red-400 font-bold'
                }
              >
                {telemetry.fps} FPS
              </span>
              <span className="text-slate-500">|</span>
              <span className="text-slate-300">
                DOORS: {telemetry.doorsCount.open}/{telemetry.doorsCount.total}
              </span>
            </div>
          )}

          {/* Photo -> .TXT Decoder Modal Button */}
          <button
            onClick={() => {
              soundEngine.playUiClick();
              onOpenPhotoAnalyzer();
            }}
            className="px-3 py-2 short:px-2 short:py-1.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-display font-bold text-xs tracking-wider flex items-center gap-1.5 shadow-lg shadow-amber-500/20 cursor-pointer transition"
            title="Rename the secret photo to .txt & analyze the hidden content"
          >
            <FileText className="w-4 h-4 shrink-0" />
            <span className="short:hidden">PHOTO ➔ .TXT ANALYZER</span>
          </button>

          {/* Camera Mode Toggle [V] */}
          <button
            onClick={() => commandRef.current?.triggerToggleCamera()}
            className="naval-panel hover:border-amber-400/60 rounded-xl px-2.5 py-2 short:px-2 short:py-1.5 text-xs font-mono-tech text-slate-200 flex items-center gap-1.5 cursor-pointer transition"
            title="Switch camera: first person / 3D exterior [V]"
          >
            <Camera className="w-4 h-4 text-amber-400" />
            <span className="hidden sm:inline short:hidden">
              {telemetry.cameraMode === 'fpv' ? 'FIRST PERSON [V]' : 'EXTERIOR CAM [V]'}
            </span>
          </button>

          {/* Flashlight [F] */}
          <button
            onClick={() => commandRef.current?.triggerToggleFlashlight()}
            className={`naval-panel rounded-xl p-2 short:p-1.5 cursor-pointer transition ${
              telemetry.flashlightOn ? 'border-sky-400 text-sky-300' : 'text-slate-400'
            }`}
            title="Toggle flashlight [F]"
          >
            <Flashlight className="w-4 h-4" />
          </button>

          {/* Bridge Bulkhead Lockdown [B] */}
          <button
            onClick={() => {
              window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyB' }));
            }}
            className="naval-panel hover:border-red-500/80 rounded-xl px-2.5 py-2 short:px-2 short:py-1.5 text-xs font-mono-tech text-red-300 flex items-center gap-1 cursor-pointer transition"
            title="Bridge lockdown: lock/unlock all watertight bulkheads [B]"
          >
            <ShieldAlert className="w-4 h-4 text-red-400" />
            <span className="hidden lg:inline short:hidden">BULKHEADS [B]</span>
          </button>

          {/* Mute Toggle */}
          <button
            onClick={() => {
              onToggleMute();
            }}
            className="naval-panel rounded-xl p-2 short:p-1.5 text-slate-300 hover:text-white cursor-pointer transition"
            title="Toggle sound"
          >
            {audio.muted ? (
              <VolumeX className="w-4 h-4 text-red-400" />
            ) : (
              <Volume2 className="w-4 h-4 text-emerald-400" />
            )}
          </button>

          {/* Reset Ship */}
          <button
            onClick={() => commandRef.current?.triggerResetShip()}
            className="naval-panel hover:border-emerald-400/60 rounded-xl px-2.5 py-2 short:px-2 short:py-1.5 text-xs font-mono-tech text-emerald-300 flex items-center gap-1 cursor-pointer transition"
            title="Repair & reset the ship"
          >
            <RotateCcw className="w-4 h-4" />
            <span className="hidden md:inline short:hidden">RESET</span>
          </button>

          {/* Fullscreen Toggle */}
          <button
            onClick={() => void handleFullscreen()}
            className="naval-panel rounded-xl p-2 short:p-1.5 text-slate-300 hover:text-white cursor-pointer transition"
            title={
              fullscreenBlocked
                ? 'Fullscreen is blocked by this browser'
                : isFullscreen
                ? 'Exit fullscreen'
                : 'Enter fullscreen'
            }
            aria-label={isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
          >
            {isFullscreen ? (
              <Minimize className="w-4 h-4 text-amber-400" />
            ) : (
              <Maximize className="w-4 h-4 text-amber-400" />
            )}
          </button>

          {/* Settings Modal Button */}
          <button
            onClick={() => {
              soundEngine.playUiClick();
              onOpenSettings();
            }}
            className="naval-panel hover:border-amber-400 rounded-xl px-3 py-2 short:px-2 short:py-1.5 text-xs font-display font-bold text-white flex items-center gap-1.5 cursor-pointer transition"
          >
            <Settings className="w-4 h-4 text-amber-400" />
            <span className="hidden sm:inline short:hidden">GRAPHICS & OPTIONS</span>
          </button>
        </div>
      </div>

      {/* =====================================================================
          2. MIDDLE SECTION: LEFT HYDRO-SCHEMATIC + CENTER CROSSHAIR & PROMPTS
      ===================================================================== */}
      <div className="relative flex-1 flex items-start justify-between my-2 pointer-events-none">
        {/* Left Collapsible Hydrodynamic Sinking & Compartment Panel */}
        <div className="naval-panel rounded-xl w-72 sm:w-80 short:w-52 overflow-hidden pointer-events-auto transition-all shadow-2xl max-h-[calc(100dvh-10.5rem)] short:max-h-[46vh] flex flex-col">
          <button
            onClick={() => setLeftPanelCollapsed(!leftPanelCollapsed)}
            className="w-full shrink-0 px-3.5 py-2.5 short:px-2 short:py-1.5 bg-slate-900/90 border-b border-slate-800 flex items-center justify-between text-xs short:text-[10px] font-display font-bold tracking-wider text-amber-400 cursor-pointer"
          >
            <div className="flex items-center gap-2">
              <Droplets className="w-4 h-4 text-sky-400" />
              <span>HYDRODYNAMICS & BULKHEAD TELEMETRY</span>
            </div>
            {leftPanelCollapsed ? (
              <ChevronDown className="w-4 h-4" />
            ) : (
              <ChevronUp className="w-4 h-4" />
            )}
          </button>

          {!leftPanelCollapsed && (
            <div className="p-3 space-y-3 short:p-2 short:space-y-2 text-xs font-mono-tech overflow-y-auto naval-scroll min-h-0">
              {/* Primary Metrics Grid */}
              <div className="grid grid-cols-2 gap-2">
                <div className="p-2 rounded bg-slate-900/90 border border-slate-800">
                  <div className="text-[10px] text-slate-400">TOTAL FLOODING</div>
                  <div className="text-base font-bold text-sky-400">
                    {telemetry.totalFloodPercent}%
                  </div>
                </div>
                <div className="p-2 rounded bg-slate-900/90 border border-slate-800">
                  <div className="text-[10px] text-slate-400">DRAFT / SINK DEPTH</div>
                  <div className="text-base font-bold text-white">
                    -{telemetry.sinkDepthMeters} m
                  </div>
                </div>
                <div className="p-2 rounded bg-slate-900/90 border border-slate-800">
                  <div className="text-[10px] text-slate-400">LIST (ROLL)</div>
                  <div
                    className={`text-sm font-bold ${
                      Math.abs(telemetry.rollDeg) > 12 ? 'text-red-400' : 'text-amber-300'
                    }`}
                  >
                    {telemetry.rollDeg > 0 ? `+${telemetry.rollDeg}° STB` : `${telemetry.rollDeg}° BB`}
                  </div>
                </div>
                <div className="p-2 rounded bg-slate-900/90 border border-slate-800">
                  <div className="text-[10px] text-slate-400">TRIM (PITCH)</div>
                  <div className="text-sm font-bold text-amber-300">{telemetry.pitchDeg}°</div>
                </div>
              </div>

              {/* Live 2D Cross-Sectional Ship Schematic with 4 Compartments */}
              <div className="p-2.5 rounded-lg bg-[#060A10] border border-slate-800">
                <div className="flex items-center justify-between text-[10px] text-slate-400 mb-1.5">
                  <span>BOW (FRONT)</span>
                  <span className="text-sky-400">
                    LEAKS: {telemetry.activeBreaches} ({telemetry.waterIngressRate} m³/s)
                  </span>
                  <span>STERN</span>
                </div>

                {/* Tilting Ship Hull Diagram */}
                <div
                  style={{
                    transform: `rotate(${Math.max(-18, Math.min(18, -telemetry.pitchDeg * 0.6))}deg)`,
                  }}
                  className="transition-transform duration-150 grid grid-cols-4 gap-1 h-14 p-1 rounded bg-slate-900 border-2 border-slate-600 relative"
                >
                  {(['bow', 'midFwd', 'midAft', 'stern'] as CompartmentId[]).map((cid) => {
                    const comp = telemetry.compartments[cid];
                    return (
                      <div
                        key={cid}
                        onClick={() =>
                          commandRef.current?.triggerCreateTestBreach(
                            cid,
                            Math.random() > 0.5 ? 'port' : 'starboard'
                          )
                        }
                        title={`Click to blast a test leak in ${comp.name}`}
                        className="relative bg-slate-950 border border-slate-700/80 rounded-sm overflow-hidden flex flex-col justify-between p-1 cursor-pointer hover:border-red-400"
                      >
                        <div
                          style={{ height: `${comp.floodPercent}%` }}
                          className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-sky-600/90 to-sky-400/70 transition-all duration-200"
                        />
                        <div className="relative z-10 text-[9px] font-bold text-white leading-none">
                          {comp.shortCode.split(' ')[0]}
                        </div>
                        <div className="relative z-10 text-[10px] font-bold text-amber-300 self-end">
                          {comp.floodPercent}%
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div className="mt-1.5 flex items-center justify-between text-[10px] text-slate-400">
                  <span>Click a section = instant leak test</span>
                  <span className="text-emerald-400">Hull: {telemetry.hullIntegrity}%</span>
                </div>
              </div>

              {/* Watertight Bulkheads & Damage Control Quick Toggles */}
              <div className="grid grid-cols-2 gap-1.5">
                <button
                  onClick={() => commandRef.current?.triggerToggleAllBulkheads()}
                  className={`py-2 px-2 rounded border text-[11px] font-bold cursor-pointer transition flex items-center justify-center gap-1 ${
                    telemetry.bulkheadDoorsOpen.some(Boolean)
                      ? 'bg-amber-500/20 border-amber-400 text-amber-300'
                      : 'bg-emerald-500/20 border-emerald-500/60 text-emerald-300'
                  }`}
                >
                  <DoorOpen className="w-3.5 h-3.5 shrink-0" />
                  <span>
                    BULKHEADS: {telemetry.bulkheadDoorsOpen.some(Boolean) ? 'OPEN' : 'SEALED'}
                  </span>
                </button>

                <button
                  onClick={() => commandRef.current?.triggerToggleBilgePumps()}
                  className={`py-2 px-2 rounded border text-[11px] font-bold cursor-pointer transition flex items-center justify-center gap-1 ${
                    telemetry.bilgePumpsOn
                      ? 'bg-sky-500/25 border-sky-400 text-sky-200'
                      : 'bg-slate-900 border-slate-700 text-slate-400'
                  }`}
                >
                  <Droplets className="w-3.5 h-3.5 shrink-0" />
                  <span>PUMPS: {telemetry.bilgePumpsOn ? 'ON' : 'OFF'}</span>
                </button>

                <button
                  onClick={() => commandRef.current?.triggerRepairAll()}
                  className="py-1.5 px-2 rounded bg-emerald-950/60 hover:bg-emerald-900/70 border border-emerald-500/50 text-emerald-300 text-[11px] font-bold cursor-pointer transition flex items-center justify-center gap-1"
                >
                  <Wrench className="w-3.5 h-3.5" />
                  <span>EMERGENCY REPAIR</span>
                </button>

                <button
                  onClick={() => commandRef.current?.triggerInstantKeelBreach()}
                  className="py-1.5 px-2 rounded bg-red-950/70 hover:bg-red-900/80 border border-red-500/60 text-red-300 text-[11px] font-bold cursor-pointer transition flex items-center justify-center gap-1"
                >
                  <Flame className="w-3.5 h-3.5" />
                  <span>BLAST KEEL</span>
                </button>
              </div>

              {/* Deck Quick-Teleport Bar (Walk via stairs OR jump directly to any station) */}
              <div>
                <div className="text-[10px] text-slate-400 uppercase mb-1">
                  QUICK STATION SWITCH (OR WALK VIA STAIRS):
                </div>
                <div className="grid grid-cols-4 gap-1">
                  {(
                    [
                      { id: 'bridge', label: 'Bridge' },
                      { id: 'main', label: 'Deck' },
                      { id: 'hold', label: 'Cargo' },
                      { id: 'engine', label: 'Engine' },
                    ] as const
                  ).map((st) => (
                    <button
                      key={st.id}
                      onClick={() => commandRef.current?.triggerTeleportToDeck(st.id)}
                      className="py-1.5 rounded bg-slate-800 hover:bg-amber-500 hover:text-slate-950 text-slate-200 text-[11px] font-bold cursor-pointer transition"
                    >
                      {st.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Center Reticle, Active TNT Timers & Door Interaction Prompt */}
        <div className="fixed inset-0 pointer-events-none flex flex-col items-center justify-center">
          {/* Precision Tactical Crosshair */}
          {telemetry.cameraMode === 'fpv' && (
            <div className="relative flex items-center justify-center">
              <div className="w-1.5 h-1.5 rounded-full bg-amber-400 shadow-[0_0_6px_#f59e0b]" />
              <div className="absolute w-6 h-6 rounded-full border border-slate-200/35" />
            </div>
          )}

          {/* Active Timed TNT Countdown Pills */}
          {telemetry.plantedCharges.filter((c) => c.type === 'tnt').length > 0 && (
            <div className="mt-6 flex flex-col items-center gap-1.5">
              {telemetry.plantedCharges
                .filter((c) => c.type === 'tnt')
                .slice(0, 4)
                .map((charge) => (
                  <div
                    key={charge.id}
                    className="px-3 py-1 rounded-full bg-red-600/90 border border-red-300 text-white font-mono-tech text-xs font-bold flex items-center gap-2 shadow-lg animate-pulse"
                  >
                    <Flame className="w-3.5 h-3.5" />
                    <span>
                      TNT DETONATION ({charge.deckLabel}): {charge.remainingTime.toFixed(1)}s
                    </span>
                  </div>
                ))}
            </div>
          )}

          {/* Interactive Door / Bulkhead / Terminal Prompt */}
          {telemetry.nearbyInteractable && (
            <div className="mt-12 short:mt-2 naval-panel-amber rounded-xl px-4 py-3 short:px-3 short:py-2 max-w-md short:max-w-[17rem] short:max-h-[44vh] short:overflow-y-auto naval-scroll text-center pointer-events-auto shadow-2xl">
              <div className="text-[10px] font-mono-tech uppercase text-amber-300 font-bold short:hidden">
                INTERACTIVE SHIP OBJECT IN RANGE
              </div>

              {/* Status Badge for Doors & Bulkheads */}
              {(telemetry.nearbyInteractable.type === 'door' || telemetry.nearbyInteractable.type === 'bulkhead') && (
                <div className="flex items-center justify-center gap-2 mt-1 mb-0.5">
                  {telemetry.nearbyInteractable.isLocked ? (
                    <span className="px-2.5 py-0.5 rounded-full text-[10px] font-mono-tech font-bold bg-red-950/80 border border-red-500/60 text-red-300 flex items-center gap-1 shadow-sm">
                      <ShieldCheck className="w-3.5 h-3.5 text-red-400" />
                      WATERTIGHT LOCKED
                    </span>
                  ) : telemetry.nearbyInteractable.isOpen ? (
                    <span className="px-2.5 py-0.5 rounded-full text-[10px] font-mono-tech font-bold bg-emerald-950/80 border border-emerald-500/60 text-emerald-300 flex items-center gap-1">
                      <DoorOpen className="w-3.5 h-3.5 text-emerald-400" />
                      DOOR OPEN
                    </span>
                  ) : (
                    <span className="px-2.5 py-0.5 rounded-full text-[10px] font-mono-tech font-bold bg-amber-950/80 border border-amber-500/60 text-amber-300 flex items-center gap-1">
                      <DoorOpen className="w-3.5 h-3.5 text-amber-400" />
                      CLOSED (UNLOCKED)
                    </span>
                  )}
                </div>
              )}

              <div className="font-display font-bold text-sm sm:text-base short:text-xs text-white mt-0.5">
                {telemetry.nearbyInteractable.title}
              </div>
              <div className="text-xs short:hidden text-slate-300 mt-0.5">
                {telemetry.nearbyInteractable.subtitle}
              </div>

              {(telemetry.nearbyInteractable.type === 'door' || telemetry.nearbyInteractable.type === 'bulkhead') ? (
                <div className="grid grid-cols-2 gap-2 mt-3 short:gap-1.5 short:mt-1.5">
                  {/* Quick [E] Open/Close Toggle Button */}
                  <button
                    onClick={() => commandRef.current?.triggerInteract()}
                    disabled={telemetry.nearbyInteractable.isLocked}
                    className={`px-3 py-2 short:px-2 short:py-1.5 rounded-lg font-display font-bold text-xs short:text-[10px] tracking-wider inline-flex items-center justify-center gap-1.5 transition ${
                      telemetry.nearbyInteractable.isLocked
                        ? 'bg-slate-900/80 border border-red-900/50 text-slate-500 cursor-not-allowed opacity-60'
                        : 'bg-amber-500 hover:bg-amber-400 text-slate-950 cursor-pointer shadow-md active:scale-95'
                    }`}
                    title={
                      telemetry.nearbyInteractable.isLocked
                        ? 'Door is locked! Unlock it with [L] first.'
                        : 'Open/close the door with [E]'
                    }
                  >
                    {telemetry.nearbyInteractable.isLocked ? (
                      <Lock className="w-4 h-4 text-red-400 shrink-0" />
                    ) : (
                      <DoorOpen className="w-4 h-4 shrink-0" />
                    )}
                    <span className="truncate">{telemetry.nearbyInteractable.actionLabel}</span>
                  </button>

                  {/* Hold [L] Lock/Unlock Button with Circular SVG Progress Ring */}
                  {(() => {
                    const rawProgress =
                      telemetry.doorLockHoldProgress ?? telemetry.nearbyInteractable.lockProgress ?? 0;
                    const progress = Math.max(0, Math.min(1, rawProgress));
                    const radius = 14;
                    const circ = 2 * Math.PI * radius;
                    const offset = circ * (1 - progress);
                    const isLocked = Boolean(telemetry.nearbyInteractable.isLocked);

                    return (
                      <button
                        onPointerDown={(e) => {
                          e.preventDefault();
                          commandRef.current?.triggerLockHold?.(true);
                        }}
                        onPointerUp={() => commandRef.current?.triggerLockHold?.(false)}
                        onPointerLeave={() => commandRef.current?.triggerLockHold?.(false)}
                        className={`relative px-3 py-2 short:px-2 short:py-1.5 rounded-lg border font-display font-bold text-xs short:text-[10px] tracking-wider inline-flex items-center justify-center gap-2 cursor-pointer transition select-none overflow-hidden active:scale-95 ${
                          isLocked
                            ? 'bg-emerald-950/70 hover:bg-emerald-900/80 border-emerald-500/60 text-emerald-200'
                            : 'bg-red-950/70 hover:bg-red-900/80 border-red-500/60 text-red-200'
                        } ${progress > 0 ? 'ring-2 ring-amber-400' : ''}`}
                        title="Hold [L] on the keyboard or hold this button"
                      >
                        {/* Circular SVG Progress Ring */}
                        <div className="relative w-7 h-7 flex items-center justify-center shrink-0">
                          <svg className="w-full h-full -rotate-90 drop-shadow-sm" viewBox="0 0 36 36">
                            <circle
                              cx="18"
                              cy="18"
                              r={radius}
                              className="stroke-slate-800/80"
                              strokeWidth="3.5"
                              fill="rgba(15, 23, 42, 0.4)"
                            />
                            <circle
                              cx="18"
                              cy="18"
                              r={radius}
                              className={isLocked ? 'stroke-emerald-400' : 'stroke-amber-400'}
                              strokeWidth="3.5"
                              strokeDasharray={circ}
                              strokeDashoffset={offset}
                              strokeLinecap="round"
                              fill="transparent"
                              style={{ transition: 'stroke-dashoffset 0.05s linear' }}
                            />
                          </svg>
                          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                            {isLocked ? (
                              <LockOpen className="w-3.5 h-3.5 text-emerald-300" />
                            ) : (
                              <Lock className="w-3.5 h-3.5 text-amber-300" />
                            )}
                          </div>
                        </div>

                        <div className="text-left flex-1 min-w-0">
                          <div className="text-[9px] font-mono-tech uppercase text-slate-300 leading-tight">
                            {progress > 0
                              ? `HOLD (${Math.round(progress * 100)}%)`
                              : '[L] HOLD'}
                          </div>
                          <div className="text-[11px] font-display font-bold truncate">
                            {isLocked ? 'UNLOCK' : 'LOCK'}
                          </div>
                        </div>
                      </button>
                    );
                  })()}
                </div>
              ) : (
                <button
                  onClick={() => commandRef.current?.triggerInteract()}
                  className="mt-2.5 short:mt-1.5 px-4 short:px-3 py-1.5 short:py-1 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-display font-bold text-xs short:text-[10px] tracking-wider inline-flex items-center gap-1.5 cursor-pointer transition shadow-md"
                >
                  <DoorOpen className="w-4 h-4" />
                  <span>{telemetry.nearbyInteractable.actionLabel}</span>
                </button>
              )}
            </div>
          )}

          {/* Dynamic Center HUD Circular Progress Ring when holding [L] */}
          {(() => {
            const rawProgress =
              telemetry.doorLockHoldProgress ?? telemetry.nearbyInteractable?.lockProgress ?? 0;
            const progress = Math.max(0, Math.min(1, rawProgress));
            if (progress <= 0) return null;
            const radius = 32;
            const circ = 2 * Math.PI * radius;
            const offset = circ * (1 - progress);
            const isLocked = Boolean(telemetry.nearbyInteractable?.isLocked);

            return (
              <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 mt-16 pointer-events-none z-30 flex flex-col items-center animate-in fade-in zoom-in-95 duration-100">
                <div className="relative w-20 h-20 flex items-center justify-center">
                  <svg
                    className="w-full h-full -rotate-90 drop-shadow-[0_0_12px_rgba(245,158,11,0.6)]"
                    viewBox="0 0 80 80"
                  >
                    <circle
                      cx="40"
                      cy="40"
                      r={radius}
                      className="stroke-slate-900/90"
                      strokeWidth="6"
                      fill="rgba(15, 23, 42, 0.75)"
                    />
                    <circle
                      cx="40"
                      cy="40"
                      r={radius}
                      className={isLocked ? 'stroke-emerald-400' : 'stroke-amber-400'}
                      strokeWidth="6"
                      strokeDasharray={circ}
                      strokeDashoffset={offset}
                      strokeLinecap="round"
                      fill="transparent"
                      style={{ transition: 'stroke-dashoffset 0.05s linear' }}
                    />
                  </svg>
                  <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
                    {isLocked ? (
                      <LockOpen className="w-6 h-6 text-emerald-300 animate-pulse" />
                    ) : (
                      <Lock className="w-6 h-6 text-amber-300 animate-pulse" />
                    )}
                    <span className="text-[11px] font-mono-tech font-bold text-white leading-none mt-0.5">
                      {Math.round(progress * 100)}%
                    </span>
                  </div>
                </div>
                <div className="mt-2 px-3 py-1 rounded-full bg-slate-950/90 border border-slate-700/80 text-[11px] font-mono-tech text-amber-300 tracking-wider font-bold shadow-lg">
                  {isLocked ? 'UNLOCKING...' : 'WATERTIGHT LOCKING...'}
                </div>
              </div>
            );
          })()}
        </div>
      </div>

      {/* =====================================================================
          3. BOTTOM TACTICAL DOCK: EVENT TICKER & 5-SLOT WEAPON / TNT BAR
      ===================================================================== */}
      <div className="relative z-10 flex flex-col items-center gap-2 pointer-events-none">
        {/* Live Ship Event Ticker + Active C4 Detonate Button */}
        <div className="flex flex-wrap items-center justify-center gap-2 pointer-events-auto">
          <div className="naval-panel rounded-full px-4 py-1.5 short:px-2.5 short:py-1 text-xs font-mono-tech text-slate-200 flex items-center gap-2 max-w-[92vw] sm:max-w-xl short:max-w-[52vw] truncate">
            {telemetry.shipStatus !== 'NOMINAL' ? (
              <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0" />
            ) : (
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
            )}
            <span className="truncate min-w-0">{telemetry.lastEventMessage}</span>
          </div>

          {telemetry.c4Count > 0 && (
            <button
              onClick={() => commandRef.current?.triggerDetonateC4()}
              className="px-4 py-1.5 rounded-full bg-red-600 hover:bg-red-500 border border-red-300 text-white font-display font-bold text-xs tracking-wider flex items-center gap-1.5 shadow-lg shadow-red-600/30 animate-bounce cursor-pointer"
            >
              <Radio className="w-4 h-4" />
              <span>DETONATE ALL {telemetry.c4Count} C4 CHARGES [G]</span>
            </button>
          )}
        </div>

        {/* 5-Slot Demolition & Weapon Bar */}
        <div className="naval-panel rounded-2xl p-1.5 short:p-1 flex items-center gap-1.5 sm:gap-2 short:gap-1 pointer-events-auto overflow-x-auto naval-scroll-x max-w-full">
          {WEAPONS_LIST.map((w) => {
            const active = telemetry.activeWeapon === w.id;
            return (
              <button
                key={w.id}
                onClick={() => commandRef.current?.triggerSelectWeapon(w.id)}
                className={`px-3 py-2 short:px-2 short:py-1 rounded-xl border text-left transition cursor-pointer flex items-center gap-2.5 short:gap-1.5 shrink-0 ${
                  active
                    ? 'bg-amber-500/20 border-amber-400 text-white shadow-lg shadow-amber-500/15'
                    : 'bg-slate-900/75 border-slate-800 text-slate-400 hover:text-slate-200 hover:border-slate-600'
                }`}
              >
                <span
                  className={`w-6 h-6 short:w-5 short:h-5 rounded-lg font-mono-tech text-xs font-bold flex items-center justify-center ${
                    active ? 'bg-amber-500 text-slate-950' : 'bg-slate-800 text-slate-400'
                  }`}
                >
                  {w.key}
                </span>
                <div className="hidden min-[480px]:block">
                  <div className="font-display font-bold text-xs short:text-[10px] tracking-wide leading-tight">
                    {w.shortName}
                  </div>
                  <div className="text-[10px] font-mono-tech text-slate-400 hidden md:block">
                    {w.damage}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};
