import * as THREE from "three";
import type { Collider, CollisionWorld } from "./physics";

export const DECK_Y = 3.0;
export const FLOOR_Y = -5.0;
export const CEIL_Y = 2.7;
export const WI = 9.7; // Innenhalbbreite der Laderäume
export const HULL_HW = 11;
export const Z_STERN = -70;
export const Z_BOW = 70;

export function hullHalfWidth(z: number): number {
  if (z < Z_STERN || z > Z_BOW) return 0;
  if (z < 52) return HULL_HW;
  const t = (z - 52) / 18;
  return HULL_HW * Math.pow(Math.max(1 - t * t, 0), 0.55);
}

export type KeyColor = "red" | "blue";

export interface BodyLike {
  x: number;
  y: number;
  z: number;
  r: number;
  h: number;
}

export type DoorEvent = "open" | "close" | "locked" | "unlock";

export class Door {
  name: string;
  kind: "swing" | "slide";
  axis: "x" | "z";
  pivot = new THREE.Group();
  leaf: THREE.Mesh;
  open = 0;
  target = 0;
  locked: KeyColor | null;
  collider: Collider;
  center = new THREE.Vector3();
  w: number;
  h: number;
  fixed: number;
  c: number;
  y0: number;
  heavy: boolean;
  speed: number;
  sign = 1;
  leafDir: number;
  slideDir: number;
  moving = false;
  onEvent?: (e: DoorEvent, d: Door) => void;

  constructor(
    world: CollisionWorld,
    mat: THREE.Material,
    opts: { name: string; axis: "x" | "z"; fixed: number; c: number; w: number; y0: number; h: number; hinge?: 1 | -1; kind?: "swing" | "slide"; locked?: KeyColor | null; heavy?: boolean },
  ) {
    this.name = opts.name;
    this.axis = opts.axis;
    this.kind = opts.kind ?? "swing";
    this.fixed = opts.fixed;
    this.c = opts.c;
    this.w = opts.w;
    this.h = opts.h;
    this.y0 = opts.y0;
    this.locked = opts.locked ?? null;
    this.heavy = !!opts.heavy;
    this.speed = this.kind === "slide" ? 0.75 : 1.8;
    const hinge = opts.hinge ?? -1;
    this.leafDir = -hinge; // Richtung vom Scharnier zur gegenüberliegenden Zarge
    this.slideDir = hinge === -1 ? 1 : -1;
    const lw = opts.w - 0.03;
    const th = this.kind === "slide" ? 0.12 : 0.07;
    const geo = new THREE.BoxGeometry(opts.axis === "x" ? lw : th, opts.h - 0.03, opts.axis === "x" ? th : lw);
    this.leaf = new THREE.Mesh(geo, mat);
    this.leaf.castShadow = true;
    this.leaf.receiveShadow = true;
    const half = lw / 2;
    if (this.kind === "swing") {
      const hx = opts.c + hinge * (opts.w / 2);
      if (opts.axis === "x") {
        this.pivot.position.set(hx, opts.y0, opts.fixed);
        this.leaf.position.set(this.leafDir * (half + 0.015), (opts.h - 0.03) / 2 + 0.02, 0);
      } else {
        this.pivot.position.set(opts.fixed, opts.y0, hx);
        this.leaf.position.set(0, (opts.h - 0.03) / 2 + 0.02, this.leafDir * (half + 0.015));
      }
    } else {
      if (opts.axis === "x") this.pivot.position.set(opts.c, opts.y0, opts.fixed + 0.22);
      else this.pivot.position.set(opts.fixed + 0.22, opts.y0, opts.c);
      this.leaf.position.set(0, (opts.h - 0.03) / 2 + 0.02, 0);
    }
    this.pivot.add(this.leaf);
    // Handle
    const hm = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, 0.06), new THREE.MeshStandardMaterial({ color: 0xcccccc, metalness: 0.9, roughness: 0.3 }));
    this.leaf.add(hm);
    if (this.kind === "swing") {
      const off = -this.leafDir * (half - 0.12);
      if (opts.axis === "x") hm.position.set(off, 0, 0.06);
      else hm.position.set(0.06, 0, off);
    }
    if (this.locked) {
      const lm = new THREE.Mesh(
        new THREE.BoxGeometry(0.1, 0.1, 0.03),
        new THREE.MeshBasicMaterial({ color: this.locked === "red" ? 0xff2a2a : 0x2a7bff }),
      );
      lm.name = "lockLight";
      this.leaf.add(lm);
      if (opts.axis === "x") lm.position.set(-this.leafDir * (half - 0.28), 0.2, 0.05);
      else {
        lm.rotation.y = Math.PI / 2;
        lm.position.set(0.05, 0.2, -this.leafDir * (half - 0.28));
      }
      const lm2 = lm.clone();
      lm2.position.z = -lm.position.z;
      lm2.position.x = -lm.position.x;
      this.leaf.add(lm2);
    }
    // Zentrum + Kollisionsbox
    const hh = opts.y0 + opts.h / 2;
    if (opts.axis === "x") {
      this.center.set(opts.c, hh, opts.fixed);
      this.collider = world.add(opts.c - opts.w / 2, opts.y0, opts.fixed - 0.07, opts.c + opts.w / 2, opts.y0 + opts.h, opts.fixed + 0.07, "door", this);
    } else {
      this.center.set(opts.fixed, hh, opts.c);
      this.collider = world.add(opts.fixed - 0.07, opts.y0, opts.c - opts.w / 2, opts.fixed + 0.07, opts.y0 + opts.h, opts.c + opts.w / 2, "door", this);
    }
    this.apply();
  }

  /** side: sign of the player's position relative to the wall plane */
  toggle(playerX: number, playerZ: number): boolean {
    if (this.target === 0) {
      const side = this.axis === "x" ? Math.sign(playerZ - this.fixed) || 1 : Math.sign(playerX - this.fixed) || 1;
      if (this.kind === "swing") {
        this.sign = this.axis === "x" ? this.leafDir * side : -this.leafDir * side;
      }
      this.target = 1;
      this.onEvent?.("open", this);
    } else {
      this.target = 0;
      this.onEvent?.("close", this);
    }
    return this.target === 1;
  }

  forceOpen(side = 1) {
    if (this.target === 1) return;
    if (this.kind === "swing") this.sign = this.axis === "x" ? this.leafDir * side : -this.leafDir * side;
    this.target = 1;
    this.onEvent?.("open", this);
  }

  private blocked(bodies: BodyLike[]): boolean {
    const hw = this.w / 2 + 0.25;
    for (const b of bodies) {
      if (b.y + b.h < this.y0 || b.y > this.y0 + this.h) continue;
      let ax: number, az: number;
      if (this.axis === "x") {
        ax = Math.abs(b.x - this.c) - b.r;
        az = Math.abs(b.z - this.fixed) - b.r;
        if (ax < hw - 0.25 + 0.0 && az < 0.55) return true;
      } else {
        ax = Math.abs(b.x - this.fixed) - b.r;
        az = Math.abs(b.z - this.c) - b.r;
        if (az < hw - 0.25 + 0.0 && ax < 0.55) return true;
      }
    }
    return false;
  }

  update(dt: number, bodies: BodyLike[]) {
    const prev = this.open;
    if (this.target === 1 && this.open < 1) {
      this.open = Math.min(1, this.open + dt * this.speed);
    } else if (this.target === 0 && this.open > 0) {
      const next = Math.max(0, this.open - dt * this.speed);
      // nicht auf Spieler/Wachen zuschlagen
      if (next < 0.45 && prev >= 0.45 && this.blocked(bodies)) {
        this.open = prev;
      } else if (this.open < 0.45 && this.blocked(bodies) && !this.collider.enabled) {
        this.open = 0.45;
      } else this.open = next;
    }
    this.moving = prev !== this.open;
    this.collider.enabled = this.open < 0.4;
    if (this.moving) this.apply();
  }

  apply() {
    const e = this.open * this.open * (3 - 2 * this.open);
    if (this.kind === "swing") {
      this.pivot.rotation.y = this.sign * e * 1.75;
    } else {
      const d = e * (this.w - 0.12) * this.slideDir;
      if (this.axis === "x") this.leaf.position.x = d;
      else this.leaf.position.z = d;
    }
  }

  unlock() {
    this.locked = null;
    const l = this.leaf.children.filter((c) => c.name === "lockLight");
    l.forEach((c) => ((c as THREE.Mesh).material = new THREE.MeshBasicMaterial({ color: 0x2aff6a })));
    this.onEvent?.("unlock", this);
  }
}

export interface GlassPane {
  mesh: THREE.Mesh;
  collider: Collider;
  broken: boolean;
  pos: THREE.Vector3;
  w: number;
  h: number;
  axis: "x" | "z";
}

export type PickupType = "key_red" | "key_blue" | "ammo_pistol" | "ammo_shotgun" | "ammo_rifle" | "medkit" | "tnt" | "weapon_shotgun" | "weapon_rifle" | "armor";

export interface Pickup {
  type: PickupType;
  mesh: THREE.Object3D;
  pos: THREE.Vector3;
  taken: boolean;
  amount: number;
  label: string;
  phase: number;
}

export interface Barrel {
  mesh: THREE.Mesh;
  collider: Collider;
  hp: number;
  dead: boolean;
  pos: THREE.Vector3;
  explosive: boolean;
  fuse: number; // >0 = zündet bald
}

export interface Crate {
  mesh: THREE.Mesh;
  collider: Collider;
  hp: number;
  dead: boolean;
  pos: THREE.Vector3;
  loot?: PickupType;
}

export interface Hole {
  pos: THREE.Vector3; // lokal
  area: number;
  side: number; // +1 steuerbord, -1 backbord, 0 Boden
  nx: number;
  ny: number;
  nz: number;
}

export interface Compartment {
  id: string;
  name: string;
  min: THREE.Vector3;
  max: THREE.Vector3;
  volume: number;
  water: number;
  holes: Hole[];
  planes: THREE.Plane[];
  waterMesh: THREE.Mesh;
  fill: number;
  level: number; // lokale Höhe am Zentrum
  worldLevel: number;
  sideBias: number;
  flow: number;
}

export interface Marker {
  id: string;
  name: string;
  pos: THREE.Vector3;
  radius: number;
  mesh: THREE.Object3D;
  armed: boolean;
}

export interface Lifeboat {
  group: THREE.Group;
  zone: THREE.Vector3;
  side: number;
  launched: boolean;
  lowerParts: THREE.Object3D[];
}

export interface Lamp {
  pos: THREE.Vector3;
  zone: number; // Kompartiment-Index oder -1
}

export interface GuardSpawn {
  pos: THREE.Vector3;
  patrol: THREE.Vector3[];
  name: string;
}
