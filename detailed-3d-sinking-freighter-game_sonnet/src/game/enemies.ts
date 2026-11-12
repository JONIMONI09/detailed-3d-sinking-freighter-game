import * as THREE from "three";
import { Body, CollisionWorld } from "./physics";
import type { Door, GuardSpawn } from "./shipTypes";

const mats = {
  suit: new THREE.MeshStandardMaterial({ color: 0x2c4a73, roughness: 0.85 }),
  vest: new THREE.MeshStandardMaterial({ color: 0xe0701a, roughness: 0.7 }),
  skin: new THREE.MeshStandardMaterial({ color: 0xc99a76, roughness: 0.8 }),
  helmet: new THREE.MeshStandardMaterial({ color: 0xe8c21a, roughness: 0.5 }),
  boots: new THREE.MeshStandardMaterial({ color: 0x1b1b1b, roughness: 0.9 }),
  gun: new THREE.MeshStandardMaterial({ color: 0x151515, roughness: 0.5, metalness: 0.6 }),
};

export interface GuardCtx {
  world: CollisionWorld;
  eye: THREE.Vector3;
  px: number;
  py: number;
  pz: number;
  playerAlive: boolean;
  doors: Door[];
  diff: number;
  slide: [number, number];
  noise: number; // >0 wenn Spieler laut war
  noisePos: THREE.Vector3;
  underwater: (x: number, y: number, z: number) => boolean;
  shoot: (g: Guard, from: THREE.Vector3, hit: boolean) => void;
}

type State = "patrol" | "chase" | "search" | "dead";

export class Guard {
  group = new THREE.Group();
  body: Body;
  hp = 70;
  dead = false;
  removed = false;
  state: State = "patrol";
  yaw = Math.random() * 6;
  patrol: THREE.Vector3[];
  pi = 0;
  wait = 0;
  lastSeen = new THREE.Vector3();
  lostT = 0;
  fireT = 1;
  walk = 0;
  deathT = 0;
  flashT = 0;
  hitFlash = 0;
  armL = new THREE.Group();
  armR = new THREE.Group();
  legL = new THREE.Group();
  legR = new THREE.Group();
  head = new THREE.Group();
  torso = new THREE.Group();
  muzzle = new THREE.Mesh(new THREE.SphereGeometry(0.1, 6, 6), new THREE.MeshBasicMaterial({ color: 0xffcc66 }));
  private stuckT = 0;
  private lastPos = new THREE.Vector3();
  private avoidT = 0;
  private avoidAng = 0;
  private drown = 0;
  private aimPose = 0;
  name: string;
  private color: THREE.MeshStandardMaterial;
  private spawn: THREE.Vector3;

  constructor(s: GuardSpawn) {
    this.name = s.name;
    this.spawn = s.pos.clone();
    this.patrol = s.patrol.length ? s.patrol.map((p) => p.clone()) : [s.pos.clone()];
    this.body = { x: s.pos.x, y: s.pos.y, z: s.pos.z, vx: 0, vy: 0, vz: 0, r: 0.32, h: 1.75, onGround: false, step: 0.45 };
    this.color = mats.suit.clone();
    const add = (parent: THREE.Object3D, geo: THREE.BufferGeometry, m: THREE.Material, x: number, y: number, z: number) => {
      const mesh = new THREE.Mesh(geo, m);
      mesh.position.set(x, y, z);
      mesh.castShadow = true;
      parent.add(mesh);
      return mesh;
    };
    // Beine
    this.legL.position.set(-0.11, 0.85, 0);
    this.legR.position.set(0.11, 0.85, 0);
    for (const l of [this.legL, this.legR]) {
      add(l, new THREE.BoxGeometry(0.17, 0.7, 0.2), this.color, 0, -0.35, 0);
      add(l, new THREE.BoxGeometry(0.19, 0.16, 0.3), mats.boots, 0, -0.78, -0.04);
      this.group.add(l);
    }
    this.torso.position.set(0, 0.85, 0);
    add(this.torso, new THREE.BoxGeometry(0.46, 0.62, 0.26), this.color, 0, 0.32, 0);
    add(this.torso, new THREE.BoxGeometry(0.48, 0.3, 0.28), mats.vest, 0, 0.4, 0);
    this.group.add(this.torso);
    this.head.position.set(0, 0.62, 0);
    add(this.head, new THREE.BoxGeometry(0.22, 0.25, 0.23), mats.skin, 0, 0.14, 0);
    add(this.head, new THREE.CylinderGeometry(0.15, 0.16, 0.1, 12), mats.helmet, 0, 0.3, 0);
    add(this.head, new THREE.BoxGeometry(0.2, 0.02, 0.1), mats.helmet, 0, 0.26, -0.15);
    this.torso.add(this.head);
    this.armL.position.set(-0.3, 0.55, 0);
    this.armR.position.set(0.3, 0.55, 0);
    for (const a of [this.armL, this.armR]) {
      add(a, new THREE.BoxGeometry(0.13, 0.55, 0.14), this.color, 0, -0.26, 0);
      add(a, new THREE.BoxGeometry(0.11, 0.11, 0.11), mats.skin, 0, -0.56, 0);
      this.torso.add(a);
    }
    const gun = add(this.armR, new THREE.BoxGeometry(0.07, 0.1, 0.5), mats.gun, 0, -0.55, -0.22);
    this.muzzle.position.set(0, 0, -0.3);
    this.muzzle.visible = false;
    gun.add(this.muzzle);
    this.group.position.set(s.pos.x, s.pos.y, s.pos.z);
    this.lastPos.set(s.pos.x, s.pos.y, s.pos.z);
  }

  get eyePos(): THREE.Vector3 {
    return new THREE.Vector3(this.body.x, this.body.y + 1.55, this.body.z);
  }

  damage(amount: number, head: boolean, fromX?: number, fromZ?: number): boolean {
    if (this.dead) return false;
    this.hp -= head ? amount * 2.2 : amount;
    this.hitFlash = 0.15;
    if (this.state === "patrol" || this.state === "search") {
      this.state = "chase";
      if (fromX !== undefined && fromZ !== undefined) this.lastSeen.set(fromX, this.body.y, fromZ);
    }
    if (this.hp <= 0) {
      this.die();
      return true;
    }
    return false;
  }

  die() {
    this.dead = true;
    this.state = "dead";
    this.deathT = 0;
    this.muzzle.visible = false;
  }

  alert(x: number, y: number, z: number) {
    if (this.dead) return;
    if (this.state !== "chase") {
      this.state = "search";
      this.lastSeen.set(x, y, z);
      this.lostT = 0;
    }
  }

  private moveTo(dt: number, tx: number, tz: number, speed: number, ctx: GuardCtx) {
    let dx = tx - this.body.x,
      dz = tz - this.body.z;
    const d = Math.hypot(dx, dz);
    if (d < 0.05) return d;
    dx /= d;
    dz /= d;
    if (this.avoidT > 0) {
      this.avoidT -= dt;
      const c = Math.cos(this.avoidAng),
        s = Math.sin(this.avoidAng);
      const nx = dx * c - dz * s,
        nz = dx * s + dz * c;
      dx = nx;
      dz = nz;
    }
    const target = Math.atan2(-dx, -dz);
    let da = target - this.yaw;
    while (da > Math.PI) da -= Math.PI * 2;
    while (da < -Math.PI) da += Math.PI * 2;
    this.yaw += da * Math.min(1, dt * 8);
    // Türen öffnen
    const ray = ctx.world.raycast(this.body.x, this.body.y + 1.0, this.body.z, dx, 0, dz, 1.3, (c) => c.tag === "door");
    if (ray && ray.collider.owner) {
      const door = ray.collider.owner as Door;
      if (!door.locked && door.target === 0) door.forceOpen(Math.sign(this.body.z - door.fixed) || 1);
    }
    const sp = Math.min(speed, d / Math.max(dt, 0.001));
    this.body.vx = dx * sp;
    this.body.vz = dz * sp;
    return d;
  }

  update(dt: number, ctx: GuardCtx) {
    if (this.removed) return;
    const b = this.body;
    if (this.dead) {
      this.deathT += dt;
      const p = Math.min(1, this.deathT / 0.6);
      this.group.rotation.x = -p * Math.PI / 2;
      this.group.position.y = b.y + p * 0.18;
      this.armL.rotation.x = -p;
      this.armR.rotation.x = -p * 0.5;
      if (this.deathT > 30) {
        this.removed = true;
        this.group.visible = false;
      }
      // Leiche rutscht nicht
      return;
    }
    // Wahrnehmung
    const eye = this.eyePos;
    const dx = ctx.px - b.x,
      dz = ctx.pz - b.z,
      dy = ctx.py - b.y;
    const dist = Math.hypot(dx, dy, dz);
    let sees = false;
    if (ctx.playerAlive && dist < (this.state === "chase" ? 45 : 26)) {
      const fx = -Math.sin(this.yaw),
        fz = -Math.cos(this.yaw);
      const dot = (fx * dx + fz * dz) / (Math.hypot(dx, dz) + 1e-6);
      if (dot > 0.3 || dist < 6 || this.state === "chase") {
        if (ctx.world.lineClear(eye.x, eye.y, eye.z, ctx.eye.x, ctx.eye.y, ctx.eye.z)) sees = true;
      }
    }
    if (ctx.noise > 0 && ctx.noisePos.distanceTo(eye) < 30 * ctx.noise) {
      this.alert(ctx.noisePos.x, ctx.noisePos.y, ctx.noisePos.z);
    }
    if (sees) {
      this.state = "chase";
      this.lastSeen.set(ctx.px, ctx.py, ctx.pz);
      this.lostT = 0;
    } else if (this.state === "chase") {
      this.lostT += dt;
      if (this.lostT > 5) {
        this.state = "search";
        this.lostT = 0;
      }
    } else if (this.state === "search") {
      this.lostT += dt;
      if (this.lostT > 8) {
        this.state = "patrol";
        this.lostT = 0;
      }
    }

    b.vx = 0;
    b.vz = 0;
    let moving = false;
    let aiming = false;
    this.flashT = Math.max(0, this.flashT - dt);
    this.muzzle.visible = this.flashT > 0;
    if (this.state === "patrol") {
      const t = this.patrol[this.pi];
      if (this.wait > 0) this.wait -= dt;
      else {
        const d = this.moveTo(dt, t.x, t.z, 1.5, ctx);
        moving = true;
        if (d < 0.5) {
          this.pi = (this.pi + 1) % this.patrol.length;
          this.wait = 1 + Math.random() * 2;
          moving = false;
        }
      }
    } else if (this.state === "search") {
      const d = this.moveTo(dt, this.lastSeen.x, this.lastSeen.z, 2.8, ctx);
      moving = d > 0.6;
    } else if (this.state === "chase") {
      aiming = sees;
      const want = dist > 11 || !sees;
      if (want) {
        this.moveTo(dt, this.lastSeen.x, this.lastSeen.z, 3.6, ctx);
        moving = true;
      } else {
        // zum Spieler drehen & seitlich ausweichen
        const target = Math.atan2(-dx, -dz);
        let da = target - this.yaw;
        while (da > Math.PI) da -= Math.PI * 2;
        while (da < -Math.PI) da += Math.PI * 2;
        this.yaw += da * Math.min(1, dt * 10);
        if (dist < 5) {
          const ax = dx / dist,
            az = dz / dist;
          b.vx = -ax * 2;
          b.vz = -az * 2;
          moving = true;
        }
      }
      if (sees && dist < 32) {
        this.fireT -= dt;
        if (this.fireT <= 0) {
          this.fireT = (0.7 + Math.random() * 0.7) / Math.max(0.6, ctx.diff);
          const chance = Math.max(0.12, Math.min(0.75, (0.85 - dist * 0.03) * ctx.diff));
          this.flashT = 0.06;
          this.muzzle.visible = true;
          ctx.shoot(this, eye, Math.random() < chance);
        }
      }
    }
    this.aimPose += ((aiming ? 1 : 0) - this.aimPose) * Math.min(1, dt * 10);

    // Hängenbleiben erkennen
    this.stuckT += dt;
    if (this.stuckT > 0.6) {
      const moved = Math.hypot(b.x - this.lastPos.x, b.z - this.lastPos.z);
      if (moving && moved < 0.25 && this.avoidT <= 0) {
        this.avoidT = 0.9;
        this.avoidAng = (Math.random() < 0.5 ? -1 : 1) * (0.9 + Math.random() * 0.8);
      }
      this.lastPos.set(b.x, b.y, b.z);
      this.stuckT = 0;
    }

    // Physik
    b.vy -= 9.8 * dt;
    if (b.vy < -30) b.vy = -30;
    const steps = 2;
    const sdt = dt / steps;
    for (let i = 0; i < steps; i++) {
      b.vx += ctx.slide[0] * 0.6 * sdt * (Math.hypot(ctx.slide[0], ctx.slide[1]) > 1.2 ? 1 : 0);
      b.vz += ctx.slide[1] * 0.6 * sdt * (Math.hypot(ctx.slide[0], ctx.slide[1]) > 1.2 ? 1 : 0);
      ctx.world.move(b, b.vx * sdt, b.vy * sdt, b.vz * sdt);
    }
    // Ertrinken
    if (ctx.underwater(b.x, b.y + 1.5, b.z)) {
      this.drown += dt;
      if (this.drown > 7) this.die();
    } else this.drown = Math.max(0, this.drown - dt);
    if (b.y < -30) this.die();

    // Animation
    const spd = Math.hypot(b.vx, b.vz);
    this.walk += dt * (spd * 3.0 + 0.0001);
    const sw = Math.sin(this.walk) * Math.min(1, spd / 1.5) * 0.7;
    this.legL.rotation.x = sw;
    this.legR.rotation.x = -sw;
    this.armL.rotation.x = -sw * 0.7 * (1 - this.aimPose) + this.aimPose * 1.35;
    this.armR.rotation.x = sw * 0.7 * (1 - this.aimPose) + this.aimPose * 1.45;
    this.armL.rotation.z = this.aimPose * 0.35;
    this.torso.position.y = 0.85 + Math.abs(Math.sin(this.walk)) * 0.03 * Math.min(1, spd / 1.5);
    this.group.position.set(b.x, b.y, b.z);
    this.group.rotation.set(0, this.yaw, 0);
    this.hitFlash = Math.max(0, this.hitFlash - dt);
    this.color.emissive.setRGB(this.hitFlash > 0 ? 0.7 : 0, 0, 0);
  }

  dispose() {
    this.color.dispose();
  }

  get spawnPos() {
    return this.spawn;
  }
}
