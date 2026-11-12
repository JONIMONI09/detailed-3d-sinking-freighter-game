/**
 * Bridge wheelhouse station: helm, engine telegraph and master bulkhead
 * lockdown. Pure state model; the game feeds input and applies the result.
 */

export type TelegraphOrder = "full-astern" | "half-astern" | "stop" | "half-ahead" | "full-ahead";

export const TELEGRAPH_ORDERS: readonly TelegraphOrder[] = ["full-astern", "half-astern", "stop", "half-ahead", "full-ahead"];

/** Target ship speed in m/s for each order (positive = ahead). */
export const TELEGRAPH_SPEED: Readonly<Record<TelegraphOrder, number>> = {
  "full-astern": -3,
  "half-astern": -1.5,
  stop: 0,
  "half-ahead": 4,
  "full-ahead": 8,
};

export const MAX_RUDDER_DEG = 35;
const RUDDER_RATE_DEG = 6;
const SPEED_RESPONSE = 0.12;

export interface HelmState {
  telegraph: TelegraphOrder;
  /** Rudder angle in degrees, positive to starboard. */
  rudderDeg: number;
  /** Commanded rudder angle in degrees. */
  rudderCmd: number;
  /** Ship speed through the water in m/s. */
  speed: number;
  /** Heading in radians, 0 = bow toward +Z, positive turns to starboard. */
  heading: number;
}

export function createHelm(): HelmState {
  return { telegraph: "stop", rudderDeg: 0, rudderCmd: 0, speed: 0, heading: 0 };
}

/** Moves the telegraph lever by one detent, clamped at both ends. */
export function stepTelegraph(order: TelegraphOrder, direction: 1 | -1): TelegraphOrder {
  const i = TELEGRAPH_ORDERS.indexOf(order) + direction;
  return TELEGRAPH_ORDERS[Math.min(TELEGRAPH_ORDERS.length - 1, Math.max(0, i))];
}

/**
 * Advances the helm. `engineAvailable` is false when the engine room is
 * flooded; the screw then provides no thrust and the ship coasts down.
 * Turn rate follows a simple kinematic model: yaw rate = v / L * tan(rudder).
 */
export function stepHelm(h: HelmState, dt: number, shipLength: number, engineAvailable: boolean): void {
  const cmd = Math.min(MAX_RUDDER_DEG, Math.max(-MAX_RUDDER_DEG, h.rudderCmd));
  const dr = cmd - h.rudderDeg;
  const maxStep = RUDDER_RATE_DEG * dt;
  h.rudderDeg += Math.abs(dr) <= maxStep ? dr : Math.sign(dr) * maxStep;
  const target = engineAvailable ? (TELEGRAPH_SPEED[h.telegraph] ?? 0) : 0;
  h.speed += (target - h.speed) * (1 - Math.exp(-SPEED_RESPONSE * dt));
  h.heading += (h.speed / shipLength) * Math.tan((h.rudderDeg * Math.PI) / 180) * dt;
}

export interface LockableDoor {
  readonly bulkhead: boolean;
  /** 1 = commanded open, 0 = commanded closed. */
  target: number;
}

/** Master lockdown: commands every open watertight bulkhead closed. Returns how many it closed. */
export function lockdownBulkheads(doors: readonly LockableDoor[]): number {
  let closed = 0;
  for (const d of doors) {
    if (d.bulkhead && d.target === 1) {
      d.target = 0;
      closed++;
    }
  }
  return closed;
}
