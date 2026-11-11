import React, { useEffect, useRef, useState } from 'react';
import {
  Flame,
  DoorOpen,
  ArrowUp,
  Flashlight,
  Camera,
  Radio,
  Lock,
  LockOpen,
} from 'lucide-react';
import { ControlSettings, InteractablePrompt } from '../types/game';
import { SimulationCommandRef } from './MaritimeViewport3D';

interface TouchControlsOverlayProps {
  controls: ControlSettings;
  nearbyInteractable: InteractablePrompt | null;
  c4Count: number;
  commandRef: React.MutableRefObject<SimulationCommandRef | null>;
}

export const TouchControlsOverlay: React.FC<TouchControlsOverlayProps> = ({
  controls,
  nearbyInteractable,
  c4Count,
  commandRef,
}) => {
  const [knobPos, setKnobPos] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const joyCenterRef = useRef<{ x: number; y: number } | null>(null);
  const lookTouchRef = useRef<{ x: number; y: number } | null>(null);

  // Short viewports (phone landscape) get smaller touch targets so the HUD,
  // the ship view and the weapon dock keep their space.
  const [compact, setCompact] = useState<boolean>(
    () => typeof window !== 'undefined' && (window.innerHeight <= 560 || window.innerWidth < 480)
  );

  useEffect(() => {
    const mq = window.matchMedia('(max-height: 560px), (max-width: 479px)');
    const onChange = () => setCompact(mq.matches);
    onChange();
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  const isTouchDevice =
    typeof window !== 'undefined' &&
    ('ontouchstart' in window || navigator.maxTouchPoints > 0 || window.innerWidth < 900);

  const showTouch =
    controls.touchControlsMode === 'on' ||
    (controls.touchControlsMode === 'auto' && isTouchDevice);

  if (!showTouch) return null;

  const scale = controls.touchScale;
  const joySize = (compact ? 88 : 112) * scale;
  const knobSize = (compact ? 36 : 46) * scale;
  const maxRadius = joySize * 0.375;

  const handleJoystickStart = (e: React.PointerEvent<HTMLDivElement>) => {
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    const rect = e.currentTarget.getBoundingClientRect();
    joyCenterRef.current = {
      x: rect.left + rect.width / 2,
      y: rect.top + rect.height / 2,
    };
  };

  const handleJoystickMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!joyCenterRef.current) return;
    e.stopPropagation();
    const dx = e.clientX - joyCenterRef.current.x;
    const dy = e.clientY - joyCenterRef.current.y;
    const dist = Math.hypot(dx, dy);
    const clampedDist = Math.min(dist, maxRadius);
    const angle = Math.atan2(dy, dx);
    const kx = Math.cos(angle) * clampedDist;
    const ky = Math.sin(angle) * clampedDist;

    setKnobPos({ x: kx, y: ky });
    commandRef.current?.setTouchMoveVector(kx / maxRadius, ky / maxRadius);
  };

  const handleJoystickEnd = (e: React.PointerEvent<HTMLDivElement>) => {
    e.stopPropagation();
    joyCenterRef.current = null;
    setKnobPos({ x: 0, y: 0 });
    commandRef.current?.setTouchMoveVector(0, 0);
  };

  const handleLookStart = (e: React.PointerEvent<HTMLDivElement>) => {
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    lookTouchRef.current = { x: e.clientX, y: e.clientY };
  };

  const handleLookMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!lookTouchRef.current) return;
    e.stopPropagation();
    const dx = e.clientX - lookTouchRef.current.x;
    const dy = e.clientY - lookTouchRef.current.y;
    lookTouchRef.current = { x: e.clientX, y: e.clientY };
    commandRef.current?.addTouchLookDelta(dx * 1.4, dy * 1.4);
  };

  const handleLookEnd = (e: React.PointerEvent<HTMLDivElement>) => {
    e.stopPropagation();
    lookTouchRef.current = null;
  };

  return (
    <>
      {/* Right Half Touch Look Zone. It sits below the HUD (z-10) so top-bar
          buttons and panels stay clickable on touch devices. */}
      <div
        onPointerDown={handleLookStart}
        onPointerMove={handleLookMove}
        onPointerUp={handleLookEnd}
        onPointerCancel={handleLookEnd}
        className="fixed right-0 top-16 short:top-14 bottom-36 short:bottom-28 w-1/2 pointer-events-auto z-[5]"
      />

      <div className="fixed inset-0 pointer-events-none z-20 select-none">

      {/* Left Virtual Thumbstick */}
      <div
        onPointerDown={handleJoystickStart}
        onPointerMove={handleJoystickMove}
        onPointerUp={handleJoystickEnd}
        onPointerCancel={handleJoystickEnd}
        style={{
          width: `${joySize}px`,
          height: `${joySize}px`,
        }}
        className="fixed left-5 bottom-24 short:left-2 short:bottom-20 rounded-full bg-slate-950/75 border-2 border-slate-500/50 backdrop-blur-md flex items-center justify-center pointer-events-auto shadow-xl"
      >
        {!compact && (
          <div className="text-[9px] font-mono-tech text-slate-400 uppercase absolute top-2">
            MOVE
          </div>
        )}
        <div
          style={{
            transform: `translate(${knobPos.x}px, ${knobPos.y}px)`,
            width: `${knobSize}px`,
            height: `${knobSize}px`,
          }}
          className="rounded-full bg-amber-500/90 border-2 border-amber-200 shadow-lg shadow-amber-500/40"
        />
      </div>

      {/* Right Action Cluster */}
      <div
        style={{ transform: `scale(${scale * (compact ? 0.8 : 1)})`, transformOrigin: 'bottom right' }}
        className="fixed right-5 bottom-24 short:right-2 short:bottom-20 flex flex-col items-end gap-2.5 short:gap-2 pointer-events-auto"
      >
        {/* Dynamic [E] Interact Button for Doors / Bulkheads / Terminals */}
        {nearbyInteractable && (
          <button
            onClick={() => commandRef.current?.triggerInteract()}
            className="px-4 py-3 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-display font-bold text-xs tracking-wider flex items-center gap-2 shadow-lg shadow-emerald-500/30 animate-bounce cursor-pointer"
          >
            <DoorOpen className="w-5 h-5" />
            <span>{nearbyInteractable.actionLabel}</span>
          </button>
        )}

        {/* Dynamic Hold [L] Button for Doors / Bulkheads */}
        {nearbyInteractable && (nearbyInteractable.type === 'door' || nearbyInteractable.type === 'bulkhead') && (
          <button
            onPointerDown={(e) => {
              e.preventDefault();
              commandRef.current?.triggerLockHold?.(true);
            }}
            onPointerUp={() => commandRef.current?.triggerLockHold?.(false)}
            onPointerLeave={() => commandRef.current?.triggerLockHold?.(false)}
            className={`px-4 py-2 rounded-xl font-display font-bold text-xs tracking-wider flex items-center gap-2 shadow-lg cursor-pointer select-none active:scale-95 ${
              nearbyInteractable.isLocked
                ? 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-600/30'
                : 'bg-red-600 hover:bg-red-500 text-white shadow-red-600/30'
            }`}
          >
            {nearbyInteractable.isLocked ? <LockOpen className="w-4 h-4" /> : <Lock className="w-4 h-4" />}
            <span>{nearbyInteractable.isLocked ? 'HOLD: UNLOCK' : 'HOLD: LOCK'}</span>
          </button>
        )}

        {/* Remote C4 Detonator Button */}
        {c4Count > 0 && (
          <button
            onClick={() => commandRef.current?.triggerDetonateC4()}
            className="px-4 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-display font-bold text-xs tracking-wider flex items-center gap-2 shadow-lg shadow-amber-500/30 cursor-pointer"
          >
            <Radio className="w-4 h-4" />
            <span>DETONATE C4 ({c4Count})</span>
          </button>
        )}

        {/* Secondary Utility Row: Flashlight, Camera, Jump */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => commandRef.current?.triggerToggleFlashlight()}
            className={`${compact ? 'w-10 h-10' : 'w-11 h-11'} rounded-xl naval-panel flex items-center justify-center text-sky-300 active:scale-95 cursor-pointer`}
            title="Flashlight [F]"
          >
            <Flashlight className="w-5 h-5" />
          </button>

          <button
            onClick={() => commandRef.current?.triggerToggleCamera()}
            className={`${compact ? 'w-10 h-10' : 'w-11 h-11'} rounded-xl naval-panel flex items-center justify-center text-amber-300 active:scale-95 cursor-pointer`}
            title="Switch camera [V]"
          >
            <Camera className="w-5 h-5" />
          </button>

          <button
            onClick={() => commandRef.current?.triggerJump()}
            className={`${compact ? 'w-11 h-11' : 'w-12 h-12'} rounded-xl naval-panel border-slate-500/60 flex flex-col items-center justify-center text-white active:scale-95 cursor-pointer`}
            title="Jump / surface [Space]"
          >
            <ArrowUp className="w-5 h-5" />
            <span className="text-[9px] font-mono-tech">JUMP</span>
          </button>

          {/* Primary Fire / Plant TNT Button */}
          <button
            onClick={() => commandRef.current?.triggerFireWeapon()}
            className={`${compact ? 'w-14 h-14' : 'w-16 h-16'} rounded-2xl bg-red-600 active:bg-red-500 border-2 border-red-300 flex flex-col items-center justify-center text-white shadow-xl shadow-red-600/40 active:scale-95 cursor-pointer`}
          >
            <Flame className={compact ? 'w-6 h-6' : 'w-7 h-7'} />
            <span className="text-[10px] font-display font-bold tracking-wider">FIRE</span>
          </button>
        </div>
      </div>
      </div>
    </>
  );
};
