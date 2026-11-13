/**
 * Pure vessel hull collision helpers (oriented boxes in the XZ plane).
 * Heading convention matches the game: forward = (-sin(heading), -cos(heading)).
 */
export interface HullBox {
  x: number;
  z: number;
  heading: number;
  halfWidth: number;
  halfLength: number;
}

export interface HullContact {
  /** Penetration depth along the contact normal (metres). */
  depth: number;
  /** Unit contact normal pointing from hull A towards hull B. */
  nx: number;
  nz: number;
}

/** Hull footprints used for collision and projectile hit tests. */
export const FREIGHTER_HULL = { halfWidth: 12, halfLength: 68 } as const;
export const BATTLESHIP_HULL = { halfWidth: 6, halfLength: 29 } as const;

/** Relative masses used to share collision damage and separation. */
export const FREIGHTER_MASS = 8;
export const BATTLESHIP_MASS = 3;

function axes(b: HullBox): [number, number][] {
  const fx = -Math.sin(b.heading);
  const fz = -Math.cos(b.heading);
  return [
    [fx, fz],
    [-fz, fx],
  ];
}

function projectRadius(b: HullBox, ax: number, az: number): number {
  const fx = -Math.sin(b.heading);
  const fz = -Math.cos(b.heading);
  const rx = -fz;
  const rz = fx;
  return b.halfLength * Math.abs(fx * ax + fz * az) + b.halfWidth * Math.abs(rx * ax + rz * az);
}

/** Support radius of a hull box along a world axis (used to locate the contact point). */
export function hullRadiusAlong(b: HullBox, ax: number, az: number): number {
  return projectRadius(b, ax, az);
}

/** Separating-axis test for two oriented boxes. Returns null when they do not overlap. */
export function hullOverlap(a: HullBox, b: HullBox): HullContact | null {
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  let bestDepth = Infinity;
  let bnx = 0;
  let bnz = 0;
  for (const [ax, az] of [...axes(a), ...axes(b)]) {
    const dist = Math.abs(dx * ax + dz * az);
    const overlap = projectRadius(a, ax, az) + projectRadius(b, ax, az) - dist;
    if (overlap <= 0) return null;
    if (overlap < bestDepth) {
      bestDepth = overlap;
      const sign = dx * ax + dz * az >= 0 ? 1 : -1;
      bnx = ax * sign;
      bnz = az * sign;
    }
  }
  return { depth: bestDepth, nx: bnx, nz: bnz };
}

/** True when a world XZ point lies inside the hull box (optionally grown by a margin). */
export function pointInHull(px: number, pz: number, b: HullBox, margin = 0): boolean {
  const dx = px - b.x;
  const dz = pz - b.z;
  const fx = -Math.sin(b.heading);
  const fz = -Math.cos(b.heading);
  const along = dx * fx + dz * fz;
  const across = dx * -fz + dz * fx;
  return Math.abs(along) <= b.halfLength + margin && Math.abs(across) <= b.halfWidth + margin;
}

export interface CollisionDamage {
  dmgA: number;
  dmgB: number;
  closing: number;
}

/**
 * Collision damage from the closing speed along the contact normal.
 * The lighter vessel takes the larger share. Returns zero damage for grazing contacts.
 */
export function collisionDamage(
  velA: [number, number],
  velB: [number, number],
  contact: HullContact,
  massA: number,
  massB: number,
): CollisionDamage {
  const closing = (velA[0] - velB[0]) * contact.nx + (velA[1] - velB[1]) * contact.nz;
  if (closing <= 0.8) return { dmgA: 0, dmgB: 0, closing: Math.max(0, closing) };
  const base = closing * closing * 14;
  const total = massA + massB;
  return {
    dmgA: (base * 2 * massB) / total,
    dmgB: (base * 2 * massA) / total,
    closing,
  };
}
