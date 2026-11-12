/**
 * Physical water ingress rules: water may only enter through real openings,
 * and sealed compartments trap an air pocket that resists inflow (Boyle).
 *
 * Pure functions. They are prototypes for the flooding model and are not wired
 * into shipSim.ts, whose equations must stay unchanged.
 */

export const WATER_DENSITY = 1025;
export const ATMOSPHERE_PA = 101325;
/** Adiabatic index of air, used for fast compression of a trapped pocket. */
export const AIR_GAMMA = 1.4;
const G = 9.81;

export type OpeningKind = "hull-breach" | "broken-glass" | "door";

export interface Opening {
  kind: OpeningKind;
  /** Free flow area in m^2 when fully open. */
  area: number;
  /** Door opening fraction 0..1; ignored for other kinds. */
  openFraction?: number;
  /** Fill ratio of the neighbouring compartment on the other side (doors only). */
  neighbourFill?: number;
}

/** Discharge coefficient for sharp-edged orifices. */
export const DISCHARGE_COEFF = 0.6;

/**
 * Strict ingress rule: a hull breach and a broken window always admit sea
 * water; a door only admits water if it is open and the neighbouring
 * compartment already holds some. Everything else admits nothing.
 */
export function admitsWater(o: Opening): boolean {
  if (o.area <= 0) return false;
  if (o.kind === "door") return (o.openFraction ?? 0) > 0.05 && (o.neighbourFill ?? 0) > 0;
  return true;
}

/** Torricelli flow Q = Cd * A * sqrt(2 g h) in m^3/s for a head h in metres. */
export function orificeFlow(area: number, head: number): number {
  if (area <= 0 || head <= 0) return 0;
  return DISCHARGE_COEFF * area * Math.sqrt(2 * G * head);
}

/**
 * Water exchange through an open door between two compartments.
 * Positive result flows from compartment A into B. Head is the water level
 * difference in metres.
 */
export function doorTransfer(area: number, openFraction: number, levelA: number, levelB: number): number {
  const open = Math.min(1, Math.max(0, openFraction));
  const dh = levelA - levelB;
  const q = orificeFlow(area * open, Math.abs(dh));
  return dh >= 0 ? q : -q;
}

export interface AirPocket {
  /** Air volume in m^3 at atmospheric pressure when no water has entered. */
  volume: number;
  /** True if the compartment can vent to the outside (open vent, broken glass above water). */
  vented: boolean;
}

/** Air volume from P * V^gamma = const for the given absolute pressure. */
export function compressedAirVolume(volumeAtAtm: number, pressurePa: number): number {
  return volumeAtAtm * Math.pow(ATMOSPHERE_PA / Math.max(pressurePa, 1), 1 / AIR_GAMMA);
}

/** Absolute hydrostatic pressure outside the opening at a depth in metres. */
export function externalPressure(depth: number): number {
  return ATMOSPHERE_PA + WATER_DENSITY * G * Math.max(0, depth);
}

/**
 * Maximum water volume a compartment can take before the trapped air
 * pressure balances the outside hydrostatic pressure at the opening depth.
 */
export function waterCapacity(pocket: AirPocket, openingDepth: number): number {
  if (pocket.vented) return pocket.volume;
  const remainingAir = compressedAirVolume(pocket.volume, externalPressure(openingDepth));
  return Math.max(0, pocket.volume - remainingAir);
}

/** Fraction 0..1 of inflow still allowed given the water already inside. */
export function inflowFactor(pocket: AirPocket, water: number, openingDepth: number): number {
  const cap = waterCapacity(pocket, openingDepth);
  if (cap <= 0) return 0;
  return Math.min(1, Math.max(0, 1 - water / cap));
}

/** Hydrostatic depth thresholds for window glass failure under water head pressure. */
export const LOWER_DECK_WINDOW_BURST_DEPTH = 2.5; // metres
export const BRIDGE_WINDOW_BURST_DEPTH = 6.0; // metres (reinforced marine safety glass)

/**
 * Evaluates whether glass pane bursts under water head pressure.
 * @param headImmersionDepth Depth of water surface above the window center in metres.
 * @param isReinforcedBridge Whether this is a heavy reinforced bridge window.
 */
export function shouldWindowBurst(headImmersionDepth: number, isReinforcedBridge = false): boolean {
  const threshold = isReinforcedBridge ? BRIDGE_WINDOW_BURST_DEPTH : LOWER_DECK_WINDOW_BURST_DEPTH;
  return headImmersionDepth >= threshold;
}

