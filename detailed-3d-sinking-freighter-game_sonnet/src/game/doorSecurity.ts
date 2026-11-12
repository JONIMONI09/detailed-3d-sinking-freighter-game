/**
 * Door security layer: safety checks, confirmation flow and terminal logging
 * for every door and watertight bulkhead on the ship.
 *
 * This module is intentionally free of any rendering or physics code. It only
 * READS compartment fill levels; it never writes to the flooding simulation
 * (shipSim.ts) or the collision world (physics.ts).
 */

export type KeyColor = "red" | "blue";

export type LogLevel = "info" | "ok" | "warn" | "alert";

export interface TerminalEntry {
  id: number;
  /** Simulation time in seconds when the line was written. */
  time: number;
  level: LogLevel;
  /** Short subsystem tag shown in front of the line, e.g. "DOOR" or "SEC". */
  source: string;
  text: string;
}

/** Bounded, append-only log shown in the in-game terminal panel. */
export class TerminalLog {
  private entries: TerminalEntry[] = [];
  private nextId = 1;

  constructor(
    private readonly capacity = 64,
    private readonly sink?: (entry: TerminalEntry) => void,
  ) {}

  push(time: number, level: LogLevel, source: string, text: string): TerminalEntry {
    const entry: TerminalEntry = { id: this.nextId++, time, level, source, text };
    this.entries.push(entry);
    if (this.entries.length > this.capacity) this.entries.shift();
    this.sink?.(entry);
    return entry;
  }

  /** The newest `count` entries, oldest first. */
  recent(count: number): TerminalEntry[] {
    return this.entries.slice(Math.max(0, this.entries.length - count));
  }

  get size(): number {
    return this.entries.length;
  }

  clear(): void {
    this.entries = [];
  }
}

/** Structural view of a Door; keeps this module independent of three.js. */
export interface SecuredDoor {
  readonly name: string;
  readonly axis: "x" | "z";
  readonly fixed: number;
  readonly y0: number;
  readonly h: number;
  readonly bulkhead: boolean;
  readonly locked: KeyColor | null;
  /** 1 while the door is commanded open, 0 while commanded closed. */
  readonly target: number;
}

/** Structural view of a Compartment (axis-aligned box in ship space). */
export interface SecuredCompartment {
  readonly name: string;
  readonly min: { readonly z: number; readonly y: number };
  readonly max: { readonly z: number; readonly y: number };
  readonly fill: number;
}

export interface SecurityContext {
  readonly now: number;
  readonly hasKey: Readonly<Record<KeyColor, boolean>>;
  readonly sandbox: boolean;
  readonly sinking: boolean;
  readonly compartments: readonly SecuredCompartment[];
}

export type DoorAction = "proceed" | "deny" | "confirm";

export interface DoorDecision {
  action: DoorAction;
  level: LogLevel;
  /** Text for the terminal and the interaction prompt. */
  message: string;
}

export interface BulkheadSides {
  aft: SecuredCompartment | null;
  fore: SecuredCompartment | null;
}

/** Fill difference across a bulkhead above which opening it is hazardous. */
export const PRESSURE_DIFFERENTIAL = 0.15;
/** Fill level of either side above which opening is hazardous on its own. */
export const FLOODED_FILL = 0.35;
/** Seconds the player has to repeat the interaction to confirm an override. */
export const CONFIRM_WINDOW = 3;

const SIDE_TOLERANCE = 0.6;

/** Finds the compartments directly aft and fore of a transverse door. */
export function bulkheadSides(door: SecuredDoor, compartments: readonly SecuredCompartment[]): BulkheadSides {
  const sides: BulkheadSides = { aft: null, fore: null };
  if (door.axis !== "x") return sides;
  const yMid = door.y0 + door.h / 2;
  for (const c of compartments) {
    if (yMid < c.min.y || yMid > c.max.y) continue;
    if (c.max.z <= door.fixed + SIDE_TOLERANCE && c.max.z >= door.fixed - SIDE_TOLERANCE * 2) {
      if (!sides.aft || c.max.z > sides.aft.max.z) sides.aft = c;
    } else if (c.min.z >= door.fixed - SIDE_TOLERANCE && c.min.z <= door.fixed + SIDE_TOLERANCE * 2) {
      if (!sides.fore || c.min.z < sides.fore.min.z) sides.fore = c;
    }
  }
  return sides;
}

/** Human readable "Aft ⇄ Fore" location label for log lines. */
export function doorLocation(door: SecuredDoor, compartments: readonly SecuredCompartment[]): string {
  const { aft, fore } = bulkheadSides(door, compartments);
  if (aft && fore) return `${aft.name} <-> ${fore.name}`;
  return aft?.name ?? fore?.name ?? "deck";
}

const pct = (v: number) => `${Math.round(v * 100)}%`;

/**
 * Pure safety assessment for a player trying to operate a door.
 * Does not mutate anything.
 */
export function assessDoor(door: SecuredDoor, ctx: SecurityContext): DoorDecision {
  if (door.locked) {
    if (!ctx.hasKey[door.locked]) {
      return { action: "deny", level: "warn", message: `${door.name}: ACCESS DENIED - ${door.locked} access card required` };
    }
    return { action: "proceed", level: "ok", message: `${door.name}: ${door.locked} card accepted` };
  }
  if (!door.bulkhead) return { action: "proceed", level: "info", message: `${door.name}: operated` };
  // Closing a watertight bulkhead is always the safe direction.
  if (door.target === 1) return { action: "proceed", level: "ok", message: `${door.name}: sealing watertight` };
  if (ctx.sandbox) return { action: "proceed", level: "info", message: `${door.name}: sandbox override, safety interlock off` };

  const { aft, fore } = bulkheadSides(door, ctx.compartments);
  const aftFill = aft?.fill ?? 0;
  const foreFill = fore?.fill ?? 0;
  const differential = Math.abs(aftFill - foreFill);
  const wetter = aftFill >= foreFill ? aft : fore;
  const worst = Math.max(aftFill, foreFill);
  if (wetter && differential >= PRESSURE_DIFFERENTIAL) {
    return {
      action: "confirm",
      level: "alert",
      message: `${door.name}: PRESSURE DIFFERENTIAL ${pct(differential)} - ${wetter.name} is ${pct(wetter.fill)} flooded. Opening will release water`,
    };
  }
  if (wetter && worst >= FLOODED_FILL) {
    return {
      action: "confirm",
      level: "alert",
      message: `${door.name}: ${wetter.name} is ${pct(wetter.fill)} flooded. Opening breaches the last watertight barrier`,
    };
  }
  if (ctx.sinking) {
    return { action: "proceed", level: "warn", message: `${door.name}: opened while ship is sinking` };
  }
  return { action: "proceed", level: "info", message: `${door.name}: operated` };
}

interface PendingConfirm {
  door: string;
  expires: number;
}

/**
 * Stateful controller: runs `assessDoor`, tracks the two-step confirmation for
 * hazardous bulkhead operations and writes every outcome to the terminal log.
 */
export class DoorSecurity {
  private pending: PendingConfirm | null = null;

  constructor(
    readonly log: TerminalLog,
    private readonly confirmWindow = CONFIRM_WINDOW,
  ) {}

  /** True if `door` is waiting for the player to repeat the interaction. */
  isAwaitingConfirm(door: SecuredDoor, now: number): boolean {
    return !!this.pending && this.pending.door === door.name && this.pending.expires > now;
  }

  /**
   * Handles one player interaction with a door.
   * Returns `proceed` only when the door may actually be operated.
   */
  request(door: SecuredDoor, ctx: SecurityContext): DoorDecision {
    const where = doorLocation(door, ctx.compartments);
    const verdict = assessDoor(door, ctx);
    const awaiting = this.isAwaitingConfirm(door, ctx.now);
    if (verdict.action === "confirm") {
      if (awaiting) {
        this.pending = null;
        const decision: DoorDecision = { action: "proceed", level: "warn", message: `${door.name}: OVERRIDE CONFIRMED by operator` };
        this.log.push(ctx.now, "warn", "SEC", `${decision.message} [${where}]`);
        return decision;
      }
      this.pending = { door: door.name, expires: ctx.now + this.confirmWindow };
      this.log.push(ctx.now, verdict.level, "SEC", `${verdict.message} [${where}]`);
      return {
        action: "confirm",
        level: verdict.level,
        message: `${verdict.message}. Press E again within ${this.confirmWindow}s to confirm`,
      };
    }
    this.pending = null;
    this.log.push(ctx.now, verdict.level, "SEC", `${verdict.message} [${where}]`);
    return verdict;
  }

  /** Records a door state change (player, guard or unlock) in the terminal. */
  recordEvent(door: SecuredDoor, event: "open" | "close" | "locked" | "unlock", ctx: SecurityContext): void {
    const where = doorLocation(door, ctx.compartments);
    const verb = event === "open" ? "OPEN" : event === "close" ? "CLOSED" : event === "unlock" ? "UNLOCKED" : "LOCKED";
    const level: LogLevel = event === "locked" ? "warn" : event === "unlock" ? "ok" : "info";
    this.log.push(ctx.now, level, "DOOR", `${door.name} ${verb} [${where}]`);
  }

  /** Text for the interaction prompt while the player looks at a door. */
  prompt(door: SecuredDoor, ctx: SecurityContext): { text: string; kind: "normal" | "locked" | "confirm" } {
    if (door.locked) {
      return {
        text: `${door.name} - locked (${door.locked} access card required)`,
        kind: "locked",
      };
    }
    if (this.isAwaitingConfirm(door, ctx.now)) {
      return { text: `CONFIRM: open ${door.name} despite flooding? Press E again`, kind: "confirm" };
    }
    const verdict = assessDoor(door, ctx);
    if (verdict.action === "confirm") {
      return { text: `Open ${door.name} - WARNING: flooded side, safety interlock`, kind: "confirm" };
    }
    return { text: door.target === 1 ? `Close ${door.name}` : `Open ${door.name}`, kind: "normal" };
  }
}
