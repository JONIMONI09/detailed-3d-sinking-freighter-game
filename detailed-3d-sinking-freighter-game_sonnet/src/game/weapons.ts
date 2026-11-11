import * as THREE from "three";

export type WeaponId = "pistol" | "shotgun" | "rifle" | "tnt";

export interface WeaponDef {
  id: WeaponId;
  name: string;
  auto: boolean;
  rpm: number;
  mag: number;
  damage: number;
  pellets: number;
  spread: number;
  range: number;
  recoil: number;
  reload: number;
}

export const WEAPONS: Record<WeaponId, WeaponDef> = {
  pistol: { id: "pistol", name: "Pistole", auto: false, rpm: 380, mag: 12, damage: 24, pellets: 1, spread: 0.008, range: 120, recoil: 0.7, reload: 1.3 },
  shotgun: { id: "shotgun", name: "Schrotflinte", auto: false, rpm: 75, mag: 6, damage: 11, pellets: 9, spread: 0.06, range: 40, recoil: 1.6, reload: 0.55 },
  rifle: { id: "rifle", name: "Sturmgewehr", auto: true, rpm: 620, mag: 30, damage: 18, pellets: 1, spread: 0.014, range: 200, recoil: 0.5, reload: 2.0 },
  tnt: { id: "tnt", name: "TNT", auto: false, rpm: 70, mag: 1, damage: 0, pellets: 0, spread: 0, range: 0, recoil: 0, reload: 0 },
};

const skin = new THREE.MeshStandardMaterial({ color: 0xd9a77f, roughness: 0.8 });
const sleeve = new THREE.MeshStandardMaterial({ color: 0x2a3a52, roughness: 0.9 });
const metal = new THREE.MeshStandardMaterial({ color: 0x2b2d31, roughness: 0.4, metalness: 0.8 });
const metalLight = new THREE.MeshStandardMaterial({ color: 0x8c9096, roughness: 0.35, metalness: 0.9 });
const wood = new THREE.MeshStandardMaterial({ color: 0x6b4426, roughness: 0.7 });
const poly = new THREE.MeshStandardMaterial({ color: 0x1a1c1f, roughness: 0.6, metalness: 0.2 });
const red = new THREE.MeshStandardMaterial({ color: 0xb02a22, roughness: 0.6 });
const tape = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.8 });

function box(g: THREE.Group, m: THREE.Material, sx: number, sy: number, sz: number, x: number, y: number, z: number, rx = 0) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), m);
  mesh.position.set(x, y, z);
  mesh.rotation.x = rx;
  g.add(mesh);
  return mesh;
}
function cyl(g: THREE.Group, m: THREE.Material, r: number, len: number, x: number, y: number, z: number, axis: "z" | "y" = "z") {
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, 10), m);
  if (axis === "z") mesh.rotation.x = Math.PI / 2;
  mesh.position.set(x, y, z);
  g.add(mesh);
  return mesh;
}
function arm(g: THREE.Group, x: number, y: number, z: number, rotY = 0, rotX = 0) {
  const a = new THREE.Group();
  box(a, sleeve, 0.07, 0.07, 0.4, 0, 0, 0.25);
  box(a, skin, 0.075, 0.075, 0.1, 0, 0, -0.02);
  a.position.set(x, y, z);
  a.rotation.y = rotY;
  a.rotation.x = rotX;
  g.add(a);
  return a;
}

export class ViewModel {
  root = new THREE.Group();
  groups = {} as Record<WeaponId, THREE.Group>;
  muzzle = {} as Record<WeaponId, THREE.Object3D>;
  pump = new THREE.Object3D();
  current: WeaponId = "pistol";
  pending: WeaponId | null = null;
  switchT = 1;
  recoil = 0;
  reloadP = -1;
  reloadDur = 1;
  flashT = 0;
  bobT = 0;
  bobAmt = 0;
  sway = new THREE.Vector2();
  pumpT = 0;
  flash: THREE.Mesh;
  throwT = 0;

  constructor(glow: THREE.Texture) {
    // Pistole
    {
      const g = new THREE.Group();
      box(g, metal, 0.05, 0.06, 0.24, 0, 0.035, -0.08);
      box(g, poly, 0.046, 0.04, 0.2, 0, -0.005, -0.06);
      box(g, poly, 0.04, 0.12, 0.06, 0, -0.07, 0.04, 0.2);
      box(g, metalLight, 0.01, 0.015, 0.012, 0, 0.073, -0.18);
      box(g, metalLight, 0.02, 0.015, 0.012, 0, 0.073, 0.02);
      cyl(g, metalLight, 0.012, 0.05, 0, 0.035, -0.22);
      arm(g, 0.01, -0.12, 0.2, 0, -0.15);
      const hand = arm(g, -0.09, -0.1, 0.18, -0.45, -0.15);
      hand.scale.z = 0.9;
      const m = new THREE.Object3D();
      m.position.set(0, 0.035, -0.26);
      g.add(m);
      this.muzzle.pistol = m;
      this.groups.pistol = g;
    }
    // Schrotflinte
    {
      const g = new THREE.Group();
      cyl(g, metal, 0.02, 0.8, 0, 0.04, -0.25);
      cyl(g, metal, 0.017, 0.6, 0, -0.005, -0.15);
      box(g, poly, 0.06, 0.08, 0.22, 0, 0.02, 0.12);
      box(g, wood, 0.05, 0.09, 0.28, 0, -0.01, 0.34, 0.1);
      const p = new THREE.Group();
      box(p, wood, 0.065, 0.055, 0.2, 0, -0.02, 0);
      p.position.set(0, 0, -0.18);
      g.add(p);
      this.pump = p;
      arm(g, 0.02, -0.12, 0.3, 0, -0.2);
      arm(g, -0.02, -0.1, 0.05, -0.1, -0.1);
      const m = new THREE.Object3D();
      m.position.set(0, 0.04, -0.68);
      g.add(m);
      this.muzzle.shotgun = m;
      this.groups.shotgun = g;
    }
    // Sturmgewehr
    {
      const g = new THREE.Group();
      box(g, poly, 0.06, 0.08, 0.42, 0, 0.02, 0.05);
      box(g, metal, 0.05, 0.06, 0.3, 0, 0.03, -0.3);
      cyl(g, metalLight, 0.011, 0.32, 0, 0.035, -0.62);
      box(g, poly, 0.05, 0.18, 0.07, 0, -0.1, 0.0, 0.25);
      box(g, poly, 0.045, 0.1, 0.06, 0, -0.07, 0.17, 0.2);
      box(g, poly, 0.045, 0.1, 0.22, 0, -0.01, 0.38, 0.12);
      cyl(g, metal, 0.022, 0.14, 0, 0.1, 0.0);
      box(g, metalLight, 0.01, 0.025, 0.012, 0, 0.075, -0.75);
      arm(g, 0.01, -0.11, 0.26, 0, -0.2);
      arm(g, -0.05, -0.09, -0.12, -0.35, -0.1);
      const m = new THREE.Object3D();
      m.position.set(0, 0.035, -0.8);
      g.add(m);
      this.muzzle.rifle = m;
      this.groups.rifle = g;
    }
    // TNT
    {
      const g = new THREE.Group();
      for (let i = 0; i < 3; i++) cyl(g, red, 0.032, 0.22, (i - 1) * 0.062, 0, 0, "y");
      box(g, tape, 0.2, 0.025, 0.07, 0, 0.03, 0);
      box(g, tape, 0.2, 0.025, 0.07, 0, -0.05, 0);
      cyl(g, tape, 0.004, 0.12, 0, 0.17, 0, "y");
      const sp = new THREE.Mesh(new THREE.SphereGeometry(0.014, 6, 6), new THREE.MeshBasicMaterial({ color: 0xffaa33 }));
      sp.position.set(0, 0.23, 0);
      sp.name = "fuseSpark";
      g.add(sp);
      g.position.set(0.0, 0.0, 0);
      arm(g, 0.05, -0.12, 0.18, 0.1, -0.15);
      // Zünder in linker Hand
      const det = new THREE.Group();
      box(det, poly, 0.07, 0.04, 0.12, 0, 0, 0);
      box(det, red, 0.03, 0.02, 0.03, 0, 0.03, -0.02);
      cyl(det, metalLight, 0.003, 0.08, 0.02, 0.06, 0.03, "y");
      det.position.set(-0.28, -0.14, 0.0);
      det.rotation.x = 0.4;
      det.name = "detonator";
      g.add(det);
      arm(g, -0.3, -0.2, 0.2, 0.25, -0.1);
      const m = new THREE.Object3D();
      m.position.set(0, 0.2, 0);
      g.add(m);
      this.muzzle.tnt = m;
      this.groups.tnt = g;
    }
    const base: Record<WeaponId, [number, number, number]> = {
      pistol: [0.17, -0.17, -0.38],
      shotgun: [0.17, -0.17, -0.38],
      rifle: [0.16, -0.17, -0.34],
      tnt: [0.14, -0.1, -0.4],
    };
    (Object.keys(this.groups) as WeaponId[]).forEach((id) => {
      const g = this.groups[id];
      g.userData.base = base[id];
      g.visible = false;
      this.root.add(g);
    });
    const fm = new THREE.MeshBasicMaterial({ map: glow, color: 0xffcc66, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
    this.flash = new THREE.Mesh(new THREE.PlaneGeometry(0.35, 0.35), fm);
    this.flash.visible = false;
    this.root.add(this.flash);
    this.select("pistol", true);
  }

  select(id: WeaponId, instant = false) {
    this.current = id;
    (Object.keys(this.groups) as WeaponId[]).forEach((k) => (this.groups[k].visible = k === id));
    this.switchT = instant ? 1 : 0;
    this.reloadP = -1;
    this.throwT = 0;
  }

  fireKick(amount: number) {
    this.recoil = Math.min(1.5, this.recoil + amount);
    this.flashT = 0.05;
    if (this.current === "shotgun") this.pumpT = 0.0001;
  }

  startReload(dur: number) {
    this.reloadP = 0;
    this.reloadDur = dur;
  }
  cancelReload() {
    this.reloadP = -1;
  }

  update(dt: number, mv: { speed: number; onGround: boolean; lookDX: number; lookDY: number; reloading: boolean }, detonatorGlow = false) {
    const g = this.groups[this.current];
    const b = g.userData.base as [number, number, number];
    this.switchT = Math.min(1, this.switchT + dt * 3.2);
    this.recoil = Math.max(0, this.recoil - dt * 9);
    this.flashT = Math.max(0, this.flashT - dt);
    this.bobT += dt * (2 + mv.speed * 1.5);
    this.bobAmt += ((mv.onGround ? Math.min(1, mv.speed / 4) : 0.1) - this.bobAmt) * Math.min(1, dt * 8);
    this.sway.x += (-mv.lookDX * 0.0004 - this.sway.x) * Math.min(1, dt * 10);
    this.sway.y += (mv.lookDY * 0.0004 - this.sway.y) * Math.min(1, dt * 10);
    this.sway.x = Math.max(-0.05, Math.min(0.05, this.sway.x));
    this.sway.y = Math.max(-0.05, Math.min(0.05, this.sway.y));
    const t = this.bobT;
    const ease = 1 - Math.pow(1 - this.switchT, 3);
    let px = b[0] + Math.sin(t) * 0.012 * this.bobAmt + this.sway.x;
    let py = b[1] + Math.abs(Math.cos(t)) * 0.012 * this.bobAmt + Math.sin(t * 0.5) * 0.002 - (1 - ease) * 0.45 + this.sway.y;
    let pz = b[2] + this.recoil * 0.07;
    let rx = this.recoil * 0.12;
    let rz = 0;
    let ry = 0;
    if (this.reloadP >= 0) {
      this.reloadP += dt / this.reloadDur;
      const p = Math.min(1, this.reloadP);
      const dip = Math.sin(p * Math.PI);
      if (this.current === "shotgun") {
        py -= dip * 0.05;
        rx += dip * 0.5;
      } else {
        py -= dip * 0.18;
        rx -= dip * 0.5;
        rz += dip * 0.5;
        px -= dip * 0.05;
      }
      if (this.reloadP >= 1) this.reloadP = -1;
    }
    if (this.current === "tnt") {
      if (this.throwT > 0) {
        this.throwT = Math.max(0, this.throwT - dt * 3.5);
        const q = this.throwT;
        py += Math.sin(q * Math.PI) * 0.1;
        pz -= Math.sin((1 - q) * Math.PI) * 0.2;
        rx -= Math.sin(q * Math.PI) * 0.8;
      }
      const sp = g.getObjectByName("fuseSpark");
      if (sp) sp.visible = Math.sin(performance.now() * 0.05) > -0.3;
      const det = g.getObjectByName("detonator");
      if (det) det.scale.setScalar(detonatorGlow ? 1.0 + Math.sin(performance.now() * 0.02) * 0.05 : 1);
    }
    if (mv.speed > 5.5 && mv.onGround) {
      // Sprint-Pose
      rx += 0.25;
      ry += 0.25;
      px -= 0.03;
    }
    g.position.set(px, py, pz);
    g.rotation.set(rx, ry, rz);
    if (this.pumpT > 0) {
      this.pumpT += dt;
      const p = this.pumpT / 0.7;
      const d = p < 0.25 ? 0 : p < 0.6 ? Math.sin(((p - 0.25) / 0.35) * Math.PI) * 0.14 : 0;
      this.pump.position.z = -0.18 + d;
      if (p >= 1) {
        this.pumpT = 0;
        this.pump.position.z = -0.18;
      }
    }
    // Mündungsfeuer
    this.flash.visible = this.flashT > 0 && this.current !== "tnt";
    if (this.flash.visible) {
      const m = this.muzzle[this.current];
      const wp = new THREE.Vector3();
      m.getWorldPosition(wp);
      this.root.worldToLocal(wp);
      this.flash.position.copy(wp);
      this.flash.rotation.z = Math.random() * 6;
      const s = 0.6 + Math.random() * 0.8;
      this.flash.scale.set(s, s, s);
    }
  }
}
