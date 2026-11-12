import * as THREE from "three";

export interface BattleshipTurret {
  group: THREE.Group;
  barrels: THREE.Mesh;
  cooldown: number;
}

export interface Battleship {
  id: string;
  group: THREE.Group;
  turrets: BattleshipTurret[];
  hp: number;
  maxHp: number;
  armorAbsorption: number;
  sunk: boolean;
  sinkDepth: number;
  roll: number;
  baseX: number;
  baseZ: number;
  heading: number;
  speed: number;
  targetSpeed: number;
  rudderDeg: number;
  deckBounds: { minX: number; maxX: number; minZ: number; maxZ: number; deckY: number };
}

/** Builds a walkable 3D Battleship with twin-barrel rotating turrets and bridge superstructure. */
export function createBattleship(id: string, x: number, z: number): Battleship {
  const group = new THREE.Group();
  group.position.set(x, 0, z);

  const hullMat = new THREE.MeshStandardMaterial({ color: 0x3b444f, roughness: 0.6, metalness: 0.45 });
  const deckMat = new THREE.MeshStandardMaterial({ color: 0x5c5346, roughness: 0.85, metalness: 0.1 });
  const superMat = new THREE.MeshStandardMaterial({ color: 0x64707d, roughness: 0.55, metalness: 0.35 });
  const turretMat = new THREE.MeshStandardMaterial({ color: 0x2d343d, roughness: 0.5, metalness: 0.6 });

  // Main armored hull (walkable length 56m, beam 11m)
  const hull = new THREE.Mesh(new THREE.BoxGeometry(11, 5.5, 56), hullMat);
  hull.position.set(0, -0.5, 0);
  hull.castShadow = true;
  hull.receiveShadow = true;
  group.add(hull);

  // Walkable wooden/steel main deck
  const deck = new THREE.Mesh(new THREE.BoxGeometry(10.6, 0.3, 55), deckMat);
  deck.position.set(0, 2.35, 0);
  deck.receiveShadow = true;
  group.add(deck);

  // Bridge & superstructure
  const bridge = new THREE.Mesh(new THREE.BoxGeometry(6.2, 5.0, 12), superMat);
  bridge.position.set(0, 4.9, -4);
  bridge.castShadow = true;
  group.add(bridge);

  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.4, 7.5, 8), turretMat);
  mast.position.set(0, 10.5, -4);
  group.add(mast);

  const funnel = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.3, 4.2, 12), turretMat);
  funnel.position.set(0, 6.2, 4.5);
  group.add(funnel);

  // Twin-barrel rotating turrets (Fore & Aft)
  const turrets: BattleshipTurret[] = [];
  for (const tz of [-18, 17]) {
    const tGroup = new THREE.Group();
    tGroup.position.set(0, 2.8, tz);

    const base = new THREE.Mesh(new THREE.BoxGeometry(3.4, 1.4, 4.0), turretMat);
    base.castShadow = true;
    tGroup.add(base);

    const barrels = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.45, 5.2), turretMat);
    barrels.position.set(0, 0.15, -3.2);
    tGroup.add(barrels);

    group.add(tGroup);
    turrets.push({ group: tGroup, barrels, cooldown: 2.5 + Math.random() * 2.0 });
  }

  return {
    id,
    group,
    turrets,
    hp: 1000,
    maxHp: 1000,
    armorAbsorption: 0.3, // 30% battleship armor belt from ship fighter
    sunk: false,
    sinkDepth: 0,
    roll: 0,
    baseX: x,
    baseZ: z,
    heading: 0,
    speed: 0,
    targetSpeed: 0,
    rudderDeg: 0,
    deckBounds: { minX: -5.3, maxX: 5.3, minZ: -27.5, maxZ: 27.5, deckY: 2.5 },
  };
}

/** Updates battleship wave motion, turret tracking, and sinking kinematics. */
export function stepBattleship(
  bs: Battleship,
  dt: number,
  time: number,
  targetWorldPos: THREE.Vector3,
  waveHeight: (x: number, z: number, t: number) => number,
  onTurretFire?: (muzzleWorld: THREE.Vector3, dir: THREE.Vector3) => void,
  autoFire = true,
): void {
  if (bs.sunk) {
    bs.sinkDepth = Math.min(18, bs.sinkDepth + dt * 1.4);
    bs.roll = Math.min(0.75, bs.roll + dt * 0.12);
    bs.group.position.y = -bs.sinkDepth;
    bs.group.rotation.z = bs.roll;
    return;
  }

  // Propulsion & rudder steering
  bs.speed += (bs.targetSpeed - bs.speed) * Math.min(1, dt * 0.9);
  if (Math.abs(bs.speed) > 0.05 && Math.abs(bs.rudderDeg) > 0.1) {
    bs.heading += (bs.rudderDeg * Math.PI / 180) * (bs.speed / 12) * 0.45 * dt;
  }
  const fx = -Math.sin(bs.heading);
  const fz = -Math.cos(bs.heading);
  bs.baseX += fx * bs.speed * dt;
  bs.baseZ += fz * bs.speed * dt;
  bs.group.position.x = bs.baseX;
  bs.group.position.z = bs.baseZ;
  bs.group.rotation.y = bs.heading;

  const h = waveHeight(bs.baseX, bs.baseZ, time);
  bs.group.position.y = h * 0.7;
  bs.group.rotation.z = Math.sin(time * 0.8 + bs.baseX) * 0.025;
  bs.group.rotation.x = Math.cos(time * 0.6 + bs.baseZ) * 0.015;

  for (const t of bs.turrets) {
    const wp = new THREE.Vector3();
    t.group.getWorldPosition(wp);
    const dx = targetWorldPos.x - wp.x;
    const dz = targetWorldPos.z - wp.z;
    const desiredYaw = Math.atan2(-dx, -dz) - bs.heading;
    let diff = desiredYaw - t.group.rotation.y;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    t.group.rotation.y += diff * Math.min(1, dt * 3.5);

    t.cooldown -= dt;
    if (autoFire && t.cooldown <= 0) {
      t.cooldown = 4.5 + Math.random() * 2.5;
      if (onTurretFire) {
        const dir = new THREE.Vector3(dx, targetWorldPos.y - wp.y, dz).normalize();
        onTurretFire(wp.clone().addScaledVector(dir, 4.0), dir);
      }
    }
  }
}

/** Fires an immediate salvo from all turrets of a battleship. */
export function fireBattleshipSalvo(
  bs: Battleship,
  targetWorldPos: THREE.Vector3,
  onTurretFire: (muzzleWorld: THREE.Vector3, dir: THREE.Vector3) => void,
): void {
  if (bs.sunk) return;
  for (const t of bs.turrets) {
    const wp = new THREE.Vector3();
    t.group.getWorldPosition(wp);
    const dir = new THREE.Vector3(
      targetWorldPos.x - wp.x,
      targetWorldPos.y - wp.y,
      targetWorldPos.z - wp.z,
    ).normalize();
    onTurretFire(wp.clone().addScaledVector(dir, 4.0), dir);
    t.cooldown = 3.0;
  }
}

/** Applies damage to a battleship with 30% armor belt absorption. */
export function damageBattleship(bs: Battleship, rawDamage: number): boolean {
  if (bs.sunk || rawDamage <= 0) return false;
  const effective = rawDamage * (1 - bs.armorAbsorption);
  bs.hp = Math.max(0, bs.hp - effective);
  if (bs.hp <= 0) {
    bs.sunk = true;
    return true;
  }
  return false;
}
