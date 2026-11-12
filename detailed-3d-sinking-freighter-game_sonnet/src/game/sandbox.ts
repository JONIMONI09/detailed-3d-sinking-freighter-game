/**
 * Sandbox options: god mode, noclip and the flood-rate dial.
 *
 * The flood dial is designed to feed the existing `floodSpeed` argument of
 * ShipSim.update, so it needs no change to the flooding equations.
 */

export const FLOOD_RATES: readonly number[] = [0, 0.5, 1, 3];

export interface SandboxOptions {
  godMode: boolean;
  noclip: boolean;
  /** Index into FLOOD_RATES. */
  floodRateIndex: number;
}

export function createSandboxOptions(): SandboxOptions {
  return { godMode: false, noclip: false, floodRateIndex: 2 };
}

export function floodRate(o: SandboxOptions): number {
  return FLOOD_RATES[Math.min(FLOOD_RATES.length - 1, Math.max(0, o.floodRateIndex))];
}

/** Cycles the dial 0x -> 0.5x -> 1x -> 3x -> 0x. */
export function cycleFloodRate(o: SandboxOptions): number {
  o.floodRateIndex = (o.floodRateIndex + 1) % FLOOD_RATES.length;
  return floodRate(o);
}

/** Damage after god mode: explosions, drowning and crush all become 0. */
export function effectiveDamage(o: SandboxOptions, damage: number): number {
  return o.godMode ? 0 : damage;
}

/** Oxygen after god mode: never drains while immortal. */
export function effectiveOxygenDrain(o: SandboxOptions, drain: number): number {
  return o.godMode ? 0 : drain;
}

/** The base flood speed scaled by the dial. */
export function effectiveFloodSpeed(o: SandboxOptions, base: number): number {
  return base * floodRate(o);
}
