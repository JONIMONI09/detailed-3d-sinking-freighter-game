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
import { findNextGridWaypoint, NavBox } from "./navgrid";
import { findNextShipGraphWaypoint, isInStairwellBand, isOnNarrowCatwalk } from "./shipNavGraph";

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
  exteriorBypass?: number;
  navWaypoint?: { x: number; z: number } | null;
  navTimer?: number;
  waitingForDoor?: boolean;
  slideSign?: number;
  slideTimer?: number;
  patrol?: readonly { x: number; y: number; z: number }[];
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
  boxes?: readonly (NavBox & { owner?: unknown })[];
  raycast: (
    ox: number,
    oy: number,
    oz: number,
    dx: number,
    dy: number,
    dz: number,
    maxDist: number,
    filter?: (c: { tag?: string; owner?: unknown }) => boolean,
  ) => { collider: { owner?: unknown }; dist: number; nx?: number; ny?: number; nz?: number } | null;
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
  peers?: readonly CrewMember[];
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
    m.vy = 0;
    m.falling = false;
    m.airTime = 0;
    m.targetId = null;
    m.state = "patrol";
    return;
  }
  m.x = Math.max(-9.2, Math.min(9.2, m.x));
  m.z = Math.max(-65.5, Math.min(62.0, m.z));
  m.y = Math.max(-5.2, m.y);
  // If hovering above main deck outside superstructure (which only spans z = -65.85..-44.15, |x| <= 9.0), re-align onto main deck
  if (m.y > 4.2 && (m.z > -44.0 || Math.abs(m.x) > 8.9) && !m.swimming) {
    m.y = 3.05;
    m.vy = 0;
    m.falling = false;
    m.airTime = 0;
  }
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
): { x: number; z: number; onStair: boolean } {
  // Exterior catwalk bypass when an interior route/doorway is blocked
  if ((m.exteriorBypass ?? 0) > 0 && m.y >= 2.7 && m.y < 5.2 && Math.abs(target.y - m.y) <= 2.4) {
    const sideX = m.x >= 0 ? 9.45 : -9.45;
    const insideSuper = Math.abs(m.x) < 8.9 && m.z <= -44.0 && m.z >= -66.0;
    if (insideSuper) {
      if (Math.abs(m.x) < 2.2 && m.z > -49.5) return { x: 0.88, z: -43.0, onStair: false };
      if (Math.abs(m.z - -47.0) > 1.0) return { x: m.x >= 0 ? 3.0 : -3.0, z: -47.0, onStair: false };
      return { x: sideX, z: -47.0, onStair: false };
    }
    if (Math.abs(m.z - target.z) > 2.2 && Math.abs(m.x) < 9.0) return { x: sideX, z: m.z, onStair: false };
    if (Math.abs(m.z - target.z) > 2.2) return { x: sideX, z: target.z, onStair: false };
    return { x: target.x, z: target.z, onStair: false };
  }

  const wp = findNextShipGraphWaypoint(m.x, m.y, m.z, target.x, target.y, target.z);
  return { x: wp.x, z: wp.z, onStair: wp.onStair };
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
  onStair = false,
) {
  const stairMode = onStair || isInStairwellBand(m.x, m.y, m.z);
  let steerX = tx;
  let steerZ = tz;
  if (world?.boxes && !stairMode) {
    m.navTimer = (m.navTimer ?? 0) - dt;
    const wpClose = m.navWaypoint ? Math.hypot(m.navWaypoint.x - m.x, m.navWaypoint.z - m.z) < 0.55 : true;
    if (m.navTimer <= 0 || wpClose || !m.navWaypoint) {
      const next = findNextGridWaypoint(world.boxes, m.x, m.y, m.z, tx, tz);
      m.navWaypoint = next ?? { x: tx, z: tz };
      m.navTimer = 0.25;
    }
    steerX = m.navWaypoint.x;
    steerZ = m.navWaypoint.z;
  } else if (stairMode) {
    m.navWaypoint = null;
  }

  const dx = steerX - m.x,
    dz = steerZ - m.z;
  const d = Math.hypot(dx, dz);
  if (d <= 1e-6 && waterLevel <= m.y + 0.55) return;

  const nx = d > 1e-6 ? dx / d : 0;
  const nz = d > 1e-6 ? dz / d : 0;

  // Proactive omnidirectional door opening on the current deck
  let doorAhead = false;
  let waitingForDoor = false;
  if (world?.boxes) {
    for (const box of world.boxes) {
      if (box.tag !== "door" || !box.owner) continue;
      if (m.y < box.minY - 0.6 || m.y > box.maxY + 0.4) continue;
      const cx = (box.minX + box.maxX) * 0.5;
      const cz = (box.minZ + box.maxZ) * 0.5;
      const distToDoor = Math.hypot(cx - m.x, cz - m.z);
      if (distToDoor > 2.3) continue;
      const dot = distToDoor > 1e-4 ? ((cx - m.x) * nx + (cz - m.z) * nz) / distToDoor : 1;
      if (dot < -0.15) continue;
      doorAhead = true;
      const door = box.owner as {
        axis?: "x" | "z";
        locked?: boolean;
        key?: string;
        target: number;
        open?: number;
        fixed: number;
        forceOpen: (dir: number) => void;
      };
      if (door.target === 0 && (!door.locked || door.key)) {
        const side = door.axis === "z" ? Math.sign(m.x - door.fixed) : Math.sign(m.z - door.fixed);
        door.forceOpen(side || 1);
      }
      if (distToDoor < 1.35 && door.target === 1 && door.open !== undefined && door.open < 0.65) {
        waitingForDoor = true;
      }
    }
  } else if (world && d > 1e-6) {
    const doorRay = world.raycast(m.x, m.y + 1.0, m.z, nx, 0, nz, 2.4, (c) => c.tag === "door");
    if (doorRay && doorRay.collider?.owner) {
      doorAhead = true;
      const door = doorRay.collider.owner as {
        axis?: "x" | "z";
        locked?: boolean;
        key?: string;
        target: number;
        open?: number;
        fixed: number;
        forceOpen: (dir: number) => void;
      };
      if (door.target === 0 && (!door.locked || door.key)) {
        const side = door.axis === "z" ? Math.sign(m.x - door.fixed) : Math.sign(m.z - door.fixed);
        door.forceOpen(side || 1);
      }
      if (doorRay.dist < 1.35 && door.target === 1 && door.open !== undefined && door.open < 0.65) {
        waitingForDoor = true;
      }
    }
  }
  m.waitingForDoor = waitingForDoor;

  let desiredStep: Vector3Like = waitingForDoor ? v3(0, 0, 0) : v3(nx * step, 0, nz * step);

  if ((m.slideTimer ?? 0) > 0) m.slideTimer = Math.max(0, (m.slideTimer ?? 0) - dt);

  // Smooth tangential barrier sliding + anti-oscillation memory (disabled on stairs so steps aren't treated as walls)
  if (!waitingForDoor && !stairMode && d > 1e-6) {
    const barrierHit = world?.raycast(m.x, m.y + 0.75, m.z, nx, 0, nz, 0.85, (c) => c.tag !== "door" && c.tag !== "stair");
    if (barrierHit && (barrierHit.nx !== undefined || barrierHit.nz !== undefined)) {
      const hnx = barrierHit.nx ?? 0;
      const hnz = barrierHit.nz ?? 0;
      // Tangent along the barrier surface
      let txDir = nx - (nx * hnx + nz * hnz) * hnx;
      let tzDir = nz - (nx * hnx + nz * hnz) * hnz;
      const tLen = Math.hypot(txDir, tzDir);
      if (tLen < 0.2) {
        // Head-on hit: commit to one lateral slide direction for 0.6s so bot never oscillates in thin corridors
        if ((m.slideTimer ?? 0) <= 0 || !m.slideSign) {
          const leftDir = v3(-nz, 0, nx);
          const rightDir = v3(nz, 0, -nx);
          const lHit = world?.raycast(m.x, m.y + 0.75, m.z, leftDir.x, 0, leftDir.z, 1.8, (c) => c.tag !== "door");
          const rHit = world?.raycast(m.x, m.y + 0.75, m.z, rightDir.x, 0, rightDir.z, 1.8, (c) => c.tag !== "door");
          m.slideSign = (lHit ? lHit.dist : 1.8) >= (rHit ? rHit.dist : 1.8) ? 1 : -1;
          m.slideTimer = 0.6;
        }
        txDir = -nz * m.slideSign;
        tzDir = nx * m.slideSign;
      } else {
        txDir /= tLen;
        tzDir /= tLen;
      }
      // Blend tangent with a slight push away from the wall normal so character clears doorframes cleanly
      const bx = txDir + hnx * 0.25;
      const bz = tzDir + hnz * 0.25;
      const bLen = Math.hypot(bx, bz) || 1;
      desiredStep = v3((bx / bLen) * step, 0, (bz / bLen) * step);
    } else if (raycast && !doorAhead) {
      const centerHit = raycast(v3(m.x, m.y + 0.9, m.z), v3(nx, 0, nz), 0.9);
      if (centerHit.hit) {
        if ((m.slideTimer ?? 0) <= 0 || !m.slideSign) {
          const leftDir = v3(-nz, 0, nx);
          const rightDir = v3(nz, 0, -nx);
          const leftHit = raycast(v3(m.x, m.y + 0.9, m.z), leftDir, 2.0);
          const rightHit = raycast(v3(m.x, m.y + 0.9, m.z), rightDir, 2.0);
          m.slideSign = (leftHit.hit ? leftHit.distance : 2.0) >= (rightHit.hit ? rightHit.distance : 2.0) ? 1 : -1;
          m.slideTimer = 0.6;
        }
        desiredStep = v3(-nz * m.slideSign * step, 0, nx * m.slideSign * step);
      } else {
        const steering = computeAntiClippingSteering(
          v3(m.x, m.y, m.z),
          desiredStep,
          raycast,
          0.42,
        );
        desiredStep = steering.vel;
      }
    }
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
      r: 0.2,
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

  // 0. Peer-to-peer separation & stationary gravity settle so bots never overlap or hover
  if (ctx?.world && m.state !== "climbing_ladder" && m.state !== "ragdoll") {
    if (ctx.peers && !isOnNarrowCatwalk(m.x, m.y, m.z) && !isInStairwellBand(m.x, m.y, m.z)) {
      for (const other of ctx.peers) {
        if (other === m || Math.abs(other.y - m.y) > 1.8) continue;
        const dx = m.x - other.x;
        const dz = m.z - other.z;
        const d = Math.hypot(dx, dz);
        if (d < 0.48) {
          const push = Math.min(0.06, (0.48 - d) * 0.25 + 0.01);
          const nx = d > 1e-3 ? dx / d : (m.name < other.name ? -1 : 1);
          const nz = d > 1e-3 ? dz / d : 0;
          const sepBody: CrewBody = { x: m.x, y: m.y, z: m.z, vx: 0, vy: 0, vz: 0, r: 0.2, h: 1.75, onGround: m.onGround ?? false, step: 0.48 };
          ctx.world.move(sepBody, nx * push, 0, nz * push);
          m.x = sepBody.x;
          m.z = sepBody.z;
        }
      }
    }
    if (!m.onGround && m.state !== "moving") {
      const vy = Math.max(-20, (m.vy ?? 0) - 18 * dt);
      const gravBody: CrewBody = { x: m.x, y: m.y, z: m.z, vx: 0, vy, vz: 0, r: 0.2, h: 1.75, onGround: false, step: 0.48 };
      ctx.world.move(gravBody, 0, vy * dt, 0);
      m.y = gravBody.y;
      m.vy = gravBody.onGround ? 0 : vy;
      m.onGround = gravBody.onGround;
      if (gravBody.onGround) {
        m.falling = false;
        m.airTime = 0;
      } else if (!m.swimming) {
        m.airTime = (m.airTime ?? 0) + dt;
        if (m.airTime > 0.35 || vy < -4.5) m.falling = true;
      }
    }
    // Anti-loop fall protection: if falling/airborne for > 2.8s without landing or swimming, respawn cleanly at valid ship station
    if (!m.onGround && !m.swimming && (m.airTime ?? 0) > 2.8) {
      const mWithSpawn = m as CrewMember & { spawnX?: number; spawnY?: number; spawnZ?: number };
      m.x = mWithSpawn.spawnX ?? 0;
      m.y = mWithSpawn.spawnY ?? 3.0;
      m.z = mWithSpawn.spawnZ ?? -36.0;
      m.vy = 0;
      m.airTime = 0;
      m.falling = false;
      m.onGround = true;
      m.targetId = null;
      enter(m, "patrol");
      return null;
    }
  }

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
      const patrol = m.patrol && m.patrol.length > 0 ? m.patrol : cfg.patrol;
      if (patrol.length > 0) {
        const patrolTarget = patrol[m.patrolIndex % patrol.length];
        const wp = ctx?.world ? computeDeckWaypoint(m, patrolTarget) : { x: patrolTarget.x, z: patrolTarget.z, onStair: false };
        const prevPX = m.lastX ?? m.x;
        const prevPZ = m.lastZ ?? m.z;
        walkToward(m, wp.x, wp.z, cfg.walkSpeed * 0.65 * dt, ctx?.raycast, ctx?.world, dt, ctx?.waterLevel ?? -Infinity, undefined, wp.onStair);
        const pMoved = Math.hypot(m.x - prevPX, m.z - prevPZ);
        m.lastX = m.x;
        m.lastZ = m.z;
        if (Math.hypot(m.x - patrolTarget.x, m.z - patrolTarget.z) < 0.9) {
          m.patrolIndex = (m.patrolIndex + 1) % patrol.length;
          m.stuckTime = 0;
          m.navWaypoint = null;
        } else if (ctx?.world && !m.waitingForDoor && pMoved < 0.15 * dt) {
          m.stuckTime = (m.stuckTime ?? 0) + dt;
          if (m.stuckTime > 0.45) m.navWaypoint = null;
          if (m.stuckTime > 0.9) {
            m.patrolIndex = (m.patrolIndex + 1) % patrol.length;
            m.stuckTime = 0;
          }
        } else {
          m.stuckTime = 0;
        }
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

      if ((m.exteriorBypass ?? 0) > 0) m.exteriorBypass = Math.max(0, (m.exteriorBypass ?? 0) - dt);
      const wp = ctx?.world ? computeDeckWaypoint(m, target) : { x: target.x, z: target.z, onStair: false };
      const prevX = m.lastX ?? m.x;
      const prevZ = m.lastZ ?? m.z;
      walkToward(m, wp.x, wp.z, cfg.walkSpeed * dt, ctx?.raycast, ctx?.world, dt, ctx?.waterLevel ?? -Infinity, target.y, wp.onStair);
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
      } else if (ctx?.world && !m.waitingForDoor && moved < 0.2 * dt) {
        // Escalate from A* replan (0.35s) -> exterior catwalk bypass (0.75s) -> clean obstacle vault (1.45s)
        m.stuckTime = (m.stuckTime ?? 0) + dt;
        if (m.stuckTime > 0.35) m.navWaypoint = null;
        if (m.stuckTime > 0.75 && (m.exteriorBypass ?? 0) <= 0 && m.y >= 2.7 && m.y < 5.2) {
          m.exteriorBypass = 6.0;
        }
        if (m.stuckTime > 1.45) {
          const ndx = wp.x - m.x;
          const ndz = wp.z - m.z;
          const nd = Math.hypot(ndx, ndz);
          if (nd > 1e-4) {
            const stepLen = Math.min(1.6, nd);
            m.x += (ndx / nd) * stepLen;
            m.z += (ndz / nd) * stepLen;
          }
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
