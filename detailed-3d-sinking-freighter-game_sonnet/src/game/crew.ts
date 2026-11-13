/**
 * Damage control crew: autonomous friendly NPC state machine,
 * integrated with 3D multi-deck navigation, anti-clipping steering,
 * door traversal, ladder climbing, and hydrodynamic ragdoll physics.
 */

import {
  Vector3Like,
  v3,
  computeAntiClippingSteering,
  DoorInteractionTracker,
  LadderClimbTracker,
  NavMesh3D,
  RaycastFn,
  startLadderClimb,
  updateDoorInteraction,
  updateLadderClimb,
} from "./navmesh3d";

import {
  ArticulatedRagdoll,
  shouldTriggerRagdoll,
  RagdollTriggerSensors,
} from "./ragdoll";

export type CrewRole =
  | "chief-engineer"
  | "boatswain"
  | "damage-control"
  | "electrician"
  | "medic";
export type CrewState =
  | "patrol"
  | "alert"
  | "moving"
  | "repairing"
  | "climbing_ladder"
  | "traversing_door"
  | "deploying_ladder"
  | "ragdoll";

export interface CrewBreach {
  id: number;
  x: number;
  y: number;
  z: number;
  /** Open area in m^2; patched down to 0. */
  area: number;
  inflowRate?: number;
  isEngineRoom?: boolean;
  kind?: "hull-breach" | "broken-window";
  /** Optional callback invoked as breach area is repaired (receives sealed delta). */
  repair?: (amount: number) => void;
}

export interface CrewMember {
  name: string;
  role: CrewRole;
  x: number;
  y: number;
  z: number;
  state: CrewState;
  targetId: number | null;
  /** Remaining patch kits; one kit seals up to PATCH_KIT_AREA m^2. */
  patchKits: number;
  /** Seconds spent in the current state. */
  stateTime: number;
  patrolIndex: number;
  vy?: number;
  onGround?: boolean;

  // Extended navigation & physics states
  ragdoll?: ArticulatedRagdoll;
  isRagdoll?: boolean;
  activeLadder?: LadderClimbTracker;
  activeDoor?: DoorInteractionTracker;
  navPath?: Vector3Like[];
  portableLadders?: number;
  deployedLadderId?: string | null;
  pumping?: boolean;
  swimming?: boolean;
  falling?: boolean;
  airTime?: number;
  stuckTime?: number;
  lastX?: number;
  lastZ?: number;
}

export interface CrewConfig {
  walkSpeed: number;
  detectRadius: number;
  reactionTime: number;
  /** m^2 of breach area sealed per second while welding. */
  repairRate: number;
  patrol: readonly { x: number; y: number; z: number }[];
}

export interface CrewWorld {
  raycast: (
    ox: number,
    oy: number,
    oz: number,
    dx: number,
    dy: number,
    dz: number,
    maxDist: number,
    filter?: (c: { tag?: string; owner?: unknown }) => boolean,
  ) => { collider: { owner?: unknown }; dist: number } | null;
  move: (
    body: CrewBody,
    dx: number,
    dy: number,
    dz: number,
  ) => void;
}

/** Body shape shared with the physical collision world (see `physics.ts`). */
export interface CrewBody {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  r: number;
  h: number;
  onGround: boolean;
  step: number;
}

export interface CrewStepContext {
  navmesh?: NavMesh3D;
  raycast?: RaycastFn;
  world?: CrewWorld;
  waterVelocity?: Vector3Like;
  waterLevelY?: number;
  blastImpulse?: number;
  vesselRollDeg?: number;
  deckFloorY?: number;
  waterLevel?: number;
}

export const PATCH_KIT_AREA = 1.5;
export const REPAIR_REACH = 1.4;
export const HIGH_BREACH_THRESHOLD_Y = 2.0;

export const DEFAULT_CREW_CONFIG: CrewConfig = {
  walkSpeed: 2.8,
  detectRadius: 120,
  reactionTime: 0.5,
  repairRate: 0.45,
  patrol: [],
};

export type CrewEvent =
  | "spotted"
  | "arrived"
  | "sealed"
  | "out-of-kits"
  | "ragdoll_triggered"
  | "ladder_mounted"
  | "ladder_dismounted"
  | "door_traversed"
  | "portable_ladder_deployed"
  | null;

export function createCrewMember(
  name: string,
  role: CrewRole,
  x: number,
  y: number,
  z: number,
  patchKits = 4,
): CrewMember & { spawnX: number; spawnY: number; spawnZ: number } {
  return {
    name,
    role,
    x,
    y,
    z,
    spawnX: x,
    spawnY: y,
    spawnZ: z,
    state: "patrol",
    targetId: null,
    patchKits,
    stateTime: 0,
    patrolIndex: 0,
    portableLadders: role === "damage-control" ? 2 : 1,
    deployedLadderId: null,
  };
}

/** Keeps crew strictly on the vessel deck/hull and respawns them at their ship spawn point if they clip out. */
export function enforceShipBoundsAndRespawn(m: CrewMember & { spawnX?: number; spawnY?: number; spawnZ?: number }): void {
  const sx = m.spawnX ?? 0;
  const sy = m.spawnY ?? 3.0;
  const sz = m.spawnZ ?? -36.0;
  if (!Number.isFinite(m.x) || !Number.isFinite(m.y) || !Number.isFinite(m.z) || m.y < -5.5 || Math.abs(m.x) > 10.5 || m.z < -68 || m.z > 65) {
    m.x = sx;
    m.y = sy;
    m.z = sz;
    m.targetId = null;
    m.state = "patrol";
    return;
  }
  m.x = Math.max(-9.2, Math.min(9.2, m.x));
  m.z = Math.max(-65.5, Math.min(62.0, m.z));
  m.y = Math.max(-5.2, m.y);
}

const dist = (m: CrewMember, b: { x: number; y: number; z: number }) =>
  Math.hypot(m.x - b.x, m.y - b.y, m.z - b.z);

function enter(m: CrewMember, state: CrewState) {
  m.state = state;
  m.stateTime = 0;
}

/**
 * Intelligent threat prioritization:
 * Priority = InflowRate * (isEngineRoom ? 2.5 : 1.0) / (1 + 0.1 * distance)
 */
export function calculateBreachPriority(
  m: { x: number; y: number; z: number },
  b: CrewBreach,
): number {
  const distance = Math.hypot(m.x - b.x, m.y - b.y, m.z - b.z);
  const inflow = b.inflowRate ?? (b.area * 2.0);
  const engineMultiplier = b.isEngineRoom ? 2.5 : 1.0;
  return (inflow * engineMultiplier) / (1 + 0.1 * distance);
}

export function selectBestBreach(
  m: CrewMember,
  breaches: readonly CrewBreach[],
  radius: number,
): CrewBreach | null {
  let best: CrewBreach | null = null;
  let highestPriority = -Infinity;
  for (const b of breaches) {
    if (b.area <= 0) continue;
    const d = dist(m, b);
    if (d > radius) continue;
    const priority = calculateBreachPriority(m, b);
    if (priority > highestPriority) {
      highestPriority = priority;
      best = b;
    }
  }
  return best;
}

function nearestBreach(
  m: CrewMember,
  breaches: readonly CrewBreach[],
  radius: number,
): CrewBreach | null {
  return selectBestBreach(m, breaches, radius);
}

function computeDeckWaypoint(
  m: CrewMember,
  target: { x: number; y: number; z: number },
): { x: number; z: number } {
  const dy = target.y - m.y;
  if (Math.abs(dy) <= 2.2) return { x: target.x, z: target.z };

  // Climbing up into superstructure / bridge (LV = [3.0, 6.2, 9.4, 12.6], Main Entrance at z = -44.15)
  if (dy > 2.2 && target.y >= 5.0) {
    if (m.y < 4.5 && m.z > -44.5) {
      return { x: 0, z: -45.2 };
    }
    if (m.y < 5.8) {
      return m.z < -51.6 || Math.abs(m.x - -0.88) < 1.1 ? { x: -0.88, z: -47.8 } : { x: -0.88, z: -52.4 };
    }
    if (m.y < 9.0 && target.y >= 8.5) {
      return m.z > -48.8 || Math.abs(m.x - 0.88) < 1.1 ? { x: 0.88, z: -52.4 } : { x: 0.88, z: -47.8 };
    }
    if (m.y < 12.2 && target.y >= 11.5) {
      return m.z < -51.6 || Math.abs(m.x - -0.88) < 1.1 ? { x: -0.88, z: -47.8 } : { x: -0.88, z: -52.4 };
    }
  }

  // Descending from superstructure back to main deck
  if (dy < -2.2 && m.y >= 5.2 && target.y < 4.5) {
    if (m.y >= 11.5) return { x: -0.88, z: -52.4 };
    if (m.y >= 8.5) return { x: 0.88, z: -47.8 };
    return { x: -0.88, z: -52.4 };
  }

  // Descending from main deck into Engine Room via Main Entrance, right lobby lane (x = 0.88), & aft engineHole U-stair
  if (dy < -2.2 && m.y >= 1.5 && target.y < -0.5 && target.z < -38.0) {
    if (m.z > -44.0) return { x: 0, z: -44.8 };
    if (m.z > -57.0) return Math.abs(m.x) < 1.7 && m.z > -53.0 ? { x: 0.88, z: -53.5 } : { x: 0.4, z: -57.8 };
    return { x: -0.88, z: -58.6 };
  }

  // Descending from main deck into Cargo Holds via Cargo Hold 2 Gate & holdHole (x = -9.35..-6.05, z = 18.5..25.5)
  if (dy < -2.2 && m.y >= 1.5 && target.y < -0.5 && target.z >= -38.0) {
    if (m.z < 27.0 && (m.x > -6.0 || m.x < -9.5 || m.z < 18.0)) return { x: -8.6, z: 28.2 };
    if (m.z >= 27.0) return { x: -8.6, z: 25.0 };
    return { x: -6.8, z: 19.0 };
  }

  // Navigating between lower-deck compartments through watertight bulkhead doors (z = -39, -8, 26 at x = 0)
  if (m.y < 1.2 && target.y < 1.2) {
    if ((m.z < -39.0) !== (target.z < -39.0)) return { x: 0, z: m.z < -39.0 ? -38.0 : -40.0 };
    if ((m.z < -8.0) !== (target.z < -8.0)) return { x: 0, z: m.z < -8.0 ? -7.0 : -9.0 };
    if ((m.z < 26.0) !== (target.z < 26.0)) return { x: 0, z: m.z < 26.0 ? 27.0 : 25.0 };
  }

  return { x: target.x, z: target.z };
}

function walkToward(
  m: CrewMember,
  tx: number,
  tz: number,
  step: number,
  raycast?: RaycastFn,
  world?: CrewWorld,
  dt = 0.016,
  waterLevel = -Infinity,
  swimTargetY?: number,
) {
  const dx = tx - m.x,
    dz = tz - m.z;
  const d = Math.hypot(dx, dz);
  if (d <= 1e-6 && waterLevel <= m.y + 0.55) return;

  const nx = d > 1e-6 ? dx / d : 0;
  const nz = d > 1e-6 ? dz / d : 0;

  // Enemy-AI style automatic door opening when approaching closed unlocked doors
  if (world && d > 1e-6) {
    const doorRay = world.raycast(m.x, m.y + 1.0, m.z, nx, 0, nz, 1.8, (c) => c.tag === "door");
    if (doorRay && doorRay.collider?.owner) {
      const door = doorRay.collider.owner as { locked?: boolean; key?: string; target: number; fixed: number; forceOpen: (dir: number) => void };
      // Damage control crew carry master keys for keycard doors and can open unlocked watertight doors
      if (door.target === 0 && (!door.locked || door.key)) {
        door.forceOpen(Math.sign(m.z - door.fixed) || 1);
      }
    }
  }

  let desiredStep: Vector3Like = v3(nx * step, 0, nz * step);

  // Apply 5-ray anti-clipping steering if raycast function is provided
  if (raycast && d > 1e-6) {
    const steering = computeAntiClippingSteering(
      v3(m.x, m.y, m.z),
      desiredStep,
      raycast,
      0.5,
    );
    desiredStep = steering.vel;
  }

  const inWater = waterLevel > m.y + 0.55;
  m.swimming = inWater;

  if (world) {
    let vy = m.vy ?? 0;
    if (inWater) {
      const desiredY = Math.min(waterLevel - 0.65, swimTargetY ?? (waterLevel - 0.85));
      vy = Math.max(-2.2, Math.min(2.2, (desiredY - m.y) * 2.5));
      m.falling = false;
      m.airTime = 0;
    } else {
      vy = Math.max(-20, vy - 18 * dt);
    }
    const body: CrewBody = {
      x: m.x,
      y: m.y,
      z: m.z,
      vx: 0,
      vy,
      vz: 0,
      r: 0.34,
      h: 1.75,
      onGround: m.onGround ?? false,
      step: 0.48,
    };
    world.move(body, desiredStep.x, body.vy * dt, desiredStep.z);
    m.x = body.x;
    m.y = body.y;
    m.z = body.z;
    m.vy = body.onGround ? 0 : body.vy;
    m.onGround = body.onGround;
    if (!inWater && !body.onGround) {
      m.airTime = (m.airTime ?? 0) + dt;
      if (m.airTime > 0.35 || m.vy < -4.5) m.falling = true;
    } else {
      m.airTime = 0;
      m.falling = false;
    }
  } else {
    m.x += desiredStep.x;
    m.y += desiredStep.y;
    m.z += desiredStep.z;
  }
}

/** Advances one crew member by dt seconds; mutates the member and the breach it repairs. */
export function stepCrew(
  m: CrewMember,
  dt: number,
  breaches: readonly CrewBreach[],
  cfg: CrewConfig = DEFAULT_CREW_CONFIG,
  ctx?: CrewStepContext,
): CrewEvent {
  m.stateTime += dt;
  enforceShipBoundsAndRespawn(m);

  // 1. Dynamic Ragdoll Evaluation (use floor-clamped ragdoll even when CollisionWorld is active)
  const floorY = ctx?.deckFloorY ?? (m.y >= 2.4 ? 3.0 : 0.1);
  if (ctx) {
    const sensors: RagdollTriggerSensors = {
      waterVelocity: ctx.waterVelocity || v3(0, 0, 0),
      blastImpulse: ctx.blastImpulse || 0,
      vesselRollDeg: ctx.vesselRollDeg || 0,
    };
    const triggered = shouldTriggerRagdoll(sensors);
    if (triggered && m.state !== "ragdoll") {
      m.ragdoll = new ArticulatedRagdoll(v3(m.x, m.y, m.z));
      m.ragdoll.activate(ctx.waterVelocity || v3(0, 0, 0));
      m.isRagdoll = true;
      enter(m, "ragdoll");
      return "ragdoll_triggered";
    }
  }

  // 2. Active Ragdoll State Processing
  if (m.state === "ragdoll" && m.ragdoll && m.ragdoll.active) {
    m.ragdoll.step(
      dt,
      ctx?.waterVelocity ?? v3(0, 0, 0),
      ctx?.waterLevelY ?? -999,
      floorY,
    );
    // Track position to pelvis center of mass, keeping within ship deck bounds
    const pelvis = m.ragdoll.limbs.get("pelvis");
    if (pelvis) {
      m.x = Math.max(-10.5, Math.min(10.5, pelvis.pos.x));
      m.y = Math.max(floorY, pelvis.pos.y);
      m.z = Math.max(-56, Math.min(56, pelvis.pos.z));
    }

    // Recover reliably so fallen crew always stand back up (settled or max 5.0s)
    const pelvisSpeed = Math.hypot(pelvis?.vel.x ?? 0, pelvis?.vel.y ?? 0, pelvis?.vel.z ?? 0);
    if ((m.stateTime >= 2.5 && pelvisSpeed < 0.6) || m.stateTime >= 5.0) {
      m.isRagdoll = false;
      m.ragdoll.active = false;
      m.y = floorY;
      enter(m, "patrol");
    }
    return null;
  }

  // 3. Vertical Ladder Navigation Processing
  if (m.state === "climbing_ladder" && m.activeLadder) {
    const update = updateLadderClimb(m.activeLadder, dt);
    m.y = update.currentY;

    if (update.finished) {
      m.activeLadder = undefined;
      enter(m, "moving");
      return "ladder_dismounted";
    }
    return null;
  }

  // 4. Portal Door Traversal Processing
  if (m.state === "traversing_door" && m.activeDoor) {
    const res = updateDoorInteraction(m.activeDoor, v3(m.x, m.y, m.z), dt);
    if (res.canMove && res.targetPos) {
      walkToward(m, res.targetPos.x, res.targetPos.z, cfg.walkSpeed * dt, ctx?.raycast, ctx?.world, dt);
    }
    if (res.state === "complete") {
      m.activeDoor = undefined;
      enter(m, "moving");
      return "door_traversed";
    }
    return null;
  }

  // 5. Standard Finite State Machine with Waypoint & Repair Logic
  const target =
    m.targetId === null
      ? null
      : (breaches.find((b) => b.id === m.targetId && b.area > 0) ?? null);

  switch (m.state) {
    case "patrol": {
      const found = m.patchKits > 0 ? nearestBreach(m, breaches, cfg.detectRadius) : null;
      if (found) {
        m.targetId = found.id;
        enter(m, "alert");
        return "spotted";
      }
      if (cfg.patrol.length > 0) {
        const wp = cfg.patrol[m.patrolIndex % cfg.patrol.length];
        walkToward(m, wp.x, wp.z, cfg.walkSpeed * 0.5 * dt, ctx?.raycast, ctx?.world, dt, ctx?.waterLevel ?? -Infinity);
        if (dist(m, wp) < 0.5) m.patrolIndex = (m.patrolIndex + 1) % cfg.patrol.length;
      }
      return null;
    }

    case "alert": {
      if (!target) {
        m.targetId = null;
        enter(m, "patrol");
      } else if (m.stateTime >= cfg.reactionTime) {
        enter(m, "moving");
      }
      return null;
    }

    case "moving": {
      if (!target) {
        m.targetId = null;
        enter(m, "patrol");
        return null;
      }

      // Check for High Breach Requiring Portable Ladder (strictly inside lower holds/engine room, never outer walls)
      const verticalDiff = target.y - m.y;
      const horizontalDist = Math.hypot(target.x - m.x, target.z - m.z);

      if (verticalDiff >= HIGH_BREACH_THRESHOLD_Y && target.y <= 3.2 && m.y < 2.0 && horizontalDist < 2.5 && (m.portableLadders ?? 0) > 0 && !m.deployedLadderId) {
        enter(m, "deploying_ladder");
        return null;
      }

      const wp = ctx?.world ? computeDeckWaypoint(m, target) : { x: target.x, z: target.z };
      const prevX = m.lastX ?? m.x;
      const prevZ = m.lastZ ?? m.z;
      walkToward(m, wp.x, wp.z, cfg.walkSpeed * dt, ctx?.raycast, ctx?.world, dt, ctx?.waterLevel ?? -Infinity, target.y);
      const moved = Math.hypot(m.x - prevX, m.z - prevZ);
      m.lastX = m.x;
      m.lastZ = m.z;

      // Allow crew to jump/drop down into lower compartments when responding to below-deck explosions
      if (ctx?.world && m.y >= 1.5 && target.y < -0.5) {
        const nearHoldShaft = Math.hypot(m.x - -7.7, m.z - 22.0) < 3.6;
        const nearEngineShaft = Math.hypot(m.x - 0, m.z - -61.3) < 3.6;
        if ((nearHoldShaft || nearEngineShaft) && m.onGround && m.y >= 2.5) {
          m.vy = 4.2;
          m.onGround = false;
          m.falling = true;
        }
        if (moved < 0.15 * dt) {
          m.stuckTime = (m.stuckTime ?? 0) + dt;
          if (m.stuckTime > 2.2) {
            // Jump down directly into the target lower hold so crew is never blocked upstairs
            m.x = Math.max(-9.0, Math.min(9.0, target.x * 0.6));
            m.z = Math.max(-67.0, Math.min(54.0, target.z));
            m.y = 1.8;
            m.vy = -3.0;
            m.onGround = false;
            m.falling = true;
            m.stuckTime = 0;
          }
        } else {
          m.stuckTime = 0;
        }
      } else {
        m.stuckTime = 0;
      }

      if (dist(m, target) <= REPAIR_REACH || (horizontalDist <= REPAIR_REACH + 0.8 && Math.abs(target.y - m.y) <= 2.2)) {
        enter(m, "repairing");
        return "arrived";
      }
      return null;
    }

    case "deploying_ladder": {
      if (!target) {
        enter(m, "patrol");
        return null;
      }
      if (m.stateTime >= 1.0) {
        const ladderId = `portable_ladder_${target.id}_${Date.now()}`;
        const base = v3(target.x, m.y, target.z);
        const top = v3(target.x, target.y, target.z);

        if (ctx?.navmesh) {
          ctx.navmesh.deployPortableLadder(ladderId, base, top, 0);
        }

        m.deployedLadderId = ladderId;
        m.portableLadders = Math.max(0, (m.portableLadders ?? 1) - 1);

        const ladderLink = {
          id: ladderId,
          bottom: base,
          top: top,
          facingYaw: 0,
          kind: "portable" as const,
          climbSpeed: 1.1,
        };
        m.activeLadder = startLadderClimb(ladderLink, "up");
        enter(m, "climbing_ladder");
        return "portable_ladder_deployed";
      }
      return null;
    }

    case "repairing": {
      if (!target) {
        m.targetId = null;
        enter(m, "patrol");
        return null;
      }
      if (m.patchKits <= 0) {
        m.targetId = null;
        enter(m, "patrol");
        return "out-of-kits";
      }
      const before = target.area;
      target.area = Math.max(0, target.area - cfg.repairRate * dt);
      const sealedDelta = before - target.area;
      if (sealedDelta > 0) target.repair?.(sealedDelta);
      // A kit is consumed in proportion to the area it sealed
      m.patchKits = Math.max(0, m.patchKits - sealedDelta / PATCH_KIT_AREA);
      if (target.area <= 1e-3) {
        target.area = 0;
        m.targetId = null;
        enter(m, "patrol");
        return "sealed";
      }
      return null;
    }

    default:
      return null;
  }
}
