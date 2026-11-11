import { useEffect, useRef, useState } from "react";
import type { Game } from "../game/game";
import type { Settings } from "../game/settings";
import { safeSetPointerCapture } from "../lib/browserGuards";

interface Props {
  game: Game | null;
  settings: Settings;
  tnt: boolean;
  detonatable: boolean;
  onPause: () => void;
}

interface BtnProps {
  label: string;
  size?: number;
  unit: number;
  op: number;
  onDown: () => void;
  onUp?: () => void;
  style?: React.CSSProperties;
  active?: boolean;
  small?: boolean;
}

function Btn({ label, size = 54, unit, op, onDown, onUp, style, active, small }: BtnProps) {
  return (
    <div
      role="button"
      onPointerDown={(e) => {
        e.stopPropagation();
        safeSetPointerCapture(e.currentTarget as HTMLElement, e.pointerId);
        onDown();
      }}
      onPointerUp={(e) => {
        e.stopPropagation();
        onUp?.();
      }}
      onPointerCancel={() => onUp?.()}
      style={{ width: size * unit, height: size * unit, fontSize: (small ? 11 : 14) * unit, opacity: op, touchAction: "none", ...style }}
      className={`absolute flex select-none items-center justify-center rounded-full border-2 text-center font-bold leading-tight text-white backdrop-blur-sm active:scale-90 ${
        active ? "border-orange-300 bg-orange-500/70" : "border-white/50 bg-slate-900/55"
      }`}
    >
      {label}
    </div>
  );
}

export default function TouchControls({ game, settings, tnt, detonatable, onPause }: Props) {
  const left = settings.leftHanded;
  const sc = settings.touchScale;
  const op = settings.touchOpacity;
  const joyRef = useRef<HTMLDivElement>(null);
  const [knob, setKnob] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const joyId = useRef<number | null>(null);
  const lookId = useRef<number | null>(null);
  const lookLast = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const [vp, setVp] = useState({ w: window.innerWidth, h: window.innerHeight });

  useEffect(() => {
    const f = () => setVp({ w: window.innerWidth, h: window.innerHeight });
    window.addEventListener("resize", f);
    window.addEventListener("orientationchange", f);
    return () => {
      window.removeEventListener("resize", f);
      window.removeEventListener("orientationchange", f);
    };
  }, []);

  useEffect(() => {
    return () => {
      game?.input.setMove(0, 0);
    };
  }, [game]);

  const unit = Math.max(0.65, Math.min(1.2, Math.min(vp.w, vp.h) / 520)) * sc;
  const R = 62 * unit;
  const btn = (n: number) => n * unit;

  const joyDown = (e: React.PointerEvent) => {
    if (joyId.current !== null) return;
    joyId.current = e.pointerId;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    joyMove(e);
  };
  const joyMove = (e: React.PointerEvent) => {
    if (joyId.current !== e.pointerId) return;
    const r = joyRef.current!.getBoundingClientRect();
    const cx = r.left + r.width / 2,
      cy = r.top + r.height / 2;
    let dx = e.clientX - cx,
      dy = e.clientY - cy;
    const l = Math.hypot(dx, dy);
    const max = R;
    if (l > max) {
      dx = (dx / l) * max;
      dy = (dy / l) * max;
    }
    setKnob({ x: dx, y: dy });
    const nx = dx / max,
      ny = dy / max;
    const dead = 0.12;
    const mag = Math.hypot(nx, ny);
    const k = mag < dead ? 0 : (mag - dead) / (1 - dead) / (mag || 1);
    game?.input.setMove(nx * k, -ny * k);
    game?.input.setHeld("sprint", mag > 0.92 && ny < -0.7);
  };
  const joyUp = (e: React.PointerEvent) => {
    if (joyId.current !== e.pointerId) return;
    joyId.current = null;
    setKnob({ x: 0, y: 0 });
    game?.input.setMove(0, 0);
    game?.input.setHeld("sprint", false);
  };

  const lookDown = (e: React.PointerEvent) => {
    if (lookId.current !== null) return;
    lookId.current = e.pointerId;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    lookLast.current = { x: e.clientX, y: e.clientY };
  };
  const lookMove = (e: React.PointerEvent) => {
    if (lookId.current !== e.pointerId) return;
    const dx = e.clientX - lookLast.current.x,
      dy = e.clientY - lookLast.current.y;
    lookLast.current = { x: e.clientX, y: e.clientY };
    game?.input.addTouchLook(dx, dy);
  };
  const lookUp = (e: React.PointerEvent) => {
    if (lookId.current === e.pointerId) lookId.current = null;
  };

  const side = left ? "right" : "left";
  const other = left ? "left" : "right";
  const m = 14;

  return (
    <div className="pointer-events-none fixed inset-0 z-30 select-none" style={{ touchAction: "none" }}>
      {/* Look-Fläche */}
      <div
        className="pointer-events-auto absolute top-0 bottom-0"
        style={{ [other]: 0, width: "55%", touchAction: "none" } as React.CSSProperties}
        onPointerDown={lookDown}
        onPointerMove={lookMove}
        onPointerUp={lookUp}
        onPointerCancel={lookUp}
      />
      {/* Joystick */}
      <div
        ref={joyRef}
        className="pointer-events-auto absolute rounded-full border-2 border-white/40 bg-slate-900/40"
        style={{ [side]: m + 6, bottom: m + 10, width: R * 2, height: R * 2, opacity: op, touchAction: "none" } as React.CSSProperties}
        onPointerDown={joyDown}
        onPointerMove={joyMove}
        onPointerUp={joyUp}
        onPointerCancel={joyUp}
      >
        <div
          className="absolute rounded-full border-2 border-white/70 bg-white/30"
          style={{ width: R * 0.9, height: R * 0.9, left: R - (R * 0.9) / 2 + knob.x, top: R - (R * 0.9) / 2 + knob.y }}
        />
      </div>
      <div className="pointer-events-auto">
        {/* Rechte Seite: Feuer etc. */}
        {(() => {
          const g = btn(10);
          const fire = btn(86),
            jump = btn(58),
            use = btn(62),
            wpn = btn(54);
          const r0 = 10,
            b0 = 14;
          const P = (right: number, bottom: number) => ({ [other]: right, bottom } as React.CSSProperties);
          const rowB = b0 + fire + g;
          return (
            <>
              <Btn unit={unit} op={op} label="FIRE" size={86} onDown={() => game?.input.setHeld("fire", true)} onUp={() => game?.input.setHeld("fire", false)} style={P(r0, b0 + 10)} active />
              <Btn unit={unit} op={op} label="JUMP" size={58} onDown={() => game?.input.press("jump")} style={P(r0 + fire + g, b0)} small />
              <Btn unit={unit} op={op} label="CROUCH" size={48} onDown={() => game?.input.setHeld("crouch", !game.input.held.has("crouch"))} style={P(r0 + fire + g + jump + g, b0)} small />
              <Btn unit={unit} op={op} label="USE" size={62} onDown={() => game?.input.press("interact")} style={P(r0 + 4, rowB + 10)} small />
              <Btn unit={unit} op={op} label="RELOAD" size={54} onDown={() => game?.input.press("reload")} style={P(r0 + 4 + use + g, rowB + 6)} small />
              <Btn unit={unit} op={op} label="WEAPON ⟳" size={54} onDown={() => game?.input.press("next")} style={P(r0 + 6, rowB + 10 + use + g)} small />
              {tnt && <Btn unit={unit} op={op} label="DROP" size={50} onDown={() => game?.input.press("alt")} style={P(r0 + 6 + wpn + g, rowB + 10 + use + g + 2)} small />}
            </>
          );
        })()}
        {(detonatable || tnt) && (
          <Btn unit={unit} op={op} label="DETONATE" size={56} onDown={() => game?.input.press("detonate")} active={detonatable} style={{ [side]: m + 6, bottom: m + R * 2 + 30 } as React.CSSProperties} small />
        )}
        <Btn unit={unit} op={op} label="LIGHT" size={44} onDown={() => game?.input.press("flash")} style={{ [side]: m + 6 + btn(66), bottom: m + R * 2 + 30 } as React.CSSProperties} small />
        <Btn unit={unit} op={op} label="II" size={40} onDown={onPause} style={{ right: m, top: m + 4 } as React.CSSProperties} />
      </div>
    </div>
  );
}
