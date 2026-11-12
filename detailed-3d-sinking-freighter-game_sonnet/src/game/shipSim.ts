import * as THREE from "three";
import type { Ocean } from "./ocean";
import { Compartment, FLOOR_Y, Hole, WI } from "./shipTypes";

const G = 9.81;

export class ShipSim {
  heaveBase = 0;
  sinkDepth = 0;
  pitch = 0;
  roll = 0;
  sinking = false;
  sinkT = 0;
  sinkSign = 1;
  sunk = false;
  F = 0;
  totalFlow = 0;
  tiltDeg = 0;
  waveHeave = 0;
  firstBreach = false;
  heading = 0;
  private q1 = new THREE.Quaternion();
  private q2 = new THREE.Quaternion();
  private qYaw = new THREE.Quaternion();
  private ax = new THREE.Vector3(1, 0, 0);
  private az = new THREE.Vector3(0, 0, 1);
  private ay = new THREE.Vector3(0, 1, 0);
  forceSink = false;

  constructor(
    public group: THREE.Group,
    public comps: Compartment[],
  ) {}

  worldY(x: number, y: number, z: number): number {
    const m = this.group.matrixWorld.elements;
    return m[1] * x + m[5] * y + m[9] * z + m[13];
  }

  /** lokale Wasserhöhe in Kompartiment am Punkt (x,z) */
  localLevel(c: Compartment, x: number, z: number): number {
    const m = this.group.matrixWorld.elements;
    const cx = 0,
      cz = (c.min.z + c.max.z) / 2;
    return c.level + (m[1] * (cx - x) + m[9] * (cz - z)) / Math.max(0.2, m[5]);
  }

  addBreach(c: Compartment, pos: THREE.Vector3, power: number, _oceanHeight = 0): Hole | null {
    const dS = WI - Math.abs(pos.x);
    const dB = pos.y - FLOOR_Y;
    const d = Math.min(dS, dB);
    if (pos.y > 1.0 || d > 3.4) return null;

    // Deck and upper hull explosions (pos.y > -2.0) must NEVER create an underwater exterior breach into lower compartments
    if (pos.y > -2.0) return null;

    const area = Math.max(0.6, power * (2.8 - d * 0.55));
    let hole: Hole;
    if (dS <= dB) {
      const s = Math.sign(pos.x) || 1;
      hole = { pos: new THREE.Vector3(s * (WI + 0.05), Math.min(0.2, Math.max(FLOOR_Y + 0.5, pos.y)), pos.z), area, side: s, nx: -s, ny: 0, nz: 0 };
    } else {
      hole = { pos: new THREE.Vector3(pos.x, FLOOR_Y + 0.02, pos.z), area, side: 0, nx: 0, ny: 1, nz: 0 };
    }
    const near = c.holes.find((h) => h.pos.distanceTo(hole.pos) < 2.2);
    if (near) {
      near.area += area * 0.8;
      return near;
    }
    c.holes.push(hole);
    this.firstBreach = true;
    return hole;
  }

  update(dt: number, t: number, ocean: Ocean, floodSpeed: number) {
    this.group.updateMatrixWorld(true);
    // --- Fluten
    let totalFlow = 0;
    let sumW = 0,
      sumZ = 0,
      sumSide = 0;
    let totV = 0,
      totW = 0;
    for (const c of this.comps) {
      let q = 0;
      let side = 0;
      for (const h of c.holes) {
        const wy = this.worldY(h.pos.x, h.pos.y, h.pos.z);
        const inside = Math.max(wy, c.worldLevel);
        const head = Math.max(0, -inside);
        const qh = 0.6 * h.area * Math.sqrt(2 * G * head) * 4 * floodSpeed;
        q += qh;
        side += h.side * qh;
      }
      c.flow = q;
      if (q > 0) {
        c.water = Math.min(c.volume, c.water + q * dt);
        c.sideBias += (Math.sign(side) * Math.min(1, Math.abs(side) / (q + 1e-6)) - c.sideBias) * Math.min(1, dt * 0.5);
      }
      const H = c.max.y - c.min.y;
      c.fill = c.water / c.volume;
      c.level = c.min.y + c.fill * H;
      const cz = (c.min.z + c.max.z) / 2;
      c.worldLevel = this.worldY(0, c.level, cz);
      totalFlow += q;
      totV += c.volume;
      totW += c.water;
      sumW += c.water;
      sumZ += c.water * cz;
      sumSide += c.water * c.sideBias;
    }
    this.totalFlow = totalFlow;
    this.F = totW / totV;
    const zc = sumW > 1 ? sumZ / sumW : 0;
    const list = sumW > 1 ? sumSide / sumW : 0;

    if (!this.sinking && (this.F > 0.3 || this.forceSink)) {
      this.sinking = true;
      this.sinkSign = zc < -5 ? -1 : 1;
    }

    // --- Ziele
    const F = this.F;
    let pitchT = Math.max(-1, Math.min(1, zc / 35)) * Math.min(F, 0.4) * 0.45;
    let rollT = -Math.max(-1, Math.min(1, list)) * Math.min(F * 0.9, 0.22);
    const heaveT = -F * 9;
    if (this.sinking) {
      this.sinkT += dt;
      pitchT += this.sinkSign * Math.min(0.95, this.sinkT * 0.013);
      rollT += -Math.max(-1, Math.min(1, list || 0.3)) * Math.min(0.2, this.sinkT * 0.004);
      const sp = Math.min(3.2, 0.15 + this.sinkT * 0.03) * Math.sqrt(floodSpeed);
      this.sinkDepth += sp * dt;
      if (this.sinkDepth > 135) this.sunk = true;
    }
    const k1 = 1 - Math.exp(-dt * 0.6);
    this.pitch += (pitchT - this.pitch) * k1;
    this.roll += (rollT - this.roll) * k1;
    this.heaveBase += (heaveT - this.heaveBase) * (1 - Math.exp(-dt * 0.5));

    // --- Wellen
    const wf = Math.max(0.05, 1 - this.sinkDepth / 12);
    const hb = ocean.height(0, 45, t),
      hs = ocean.height(0, -45, t),
      hp = ocean.height(-9, 0, t),
      hst = ocean.height(9, 0, t),
      hc = ocean.height(0, 0, t);
    const pitchW = -Math.atan2(hb - hs, 90) * 0.8 * wf;
    const rollW = Math.atan2(hst - hp, 20) * 0.8 * wf;
    this.waveHeave = hc * 0.9 * wf;

    this.group.position.y = this.heaveBase - this.sinkDepth + this.waveHeave;
    this.q1.setFromAxisAngle(this.ax, this.pitch + pitchW);
    this.q2.setFromAxisAngle(this.az, this.roll + rollW);
    this.qYaw.setFromAxisAngle(this.ay, this.heading);
    this.group.quaternion.copy(this.qYaw).multiply(this.q1).multiply(this.q2);
    this.group.updateMatrixWorld(true);
    // Neigung für Rutschen
    const m = this.group.matrixWorld.elements;
    this.tiltDeg = (Math.acos(Math.min(1, Math.max(-1, m[5]))) * 180) / Math.PI;
  }

  /** Gravitationsvektor in lokalen Koordinaten (m/s²) -> horizontale Komponenten */
  slideVector(): [number, number] {
    const m = this.group.matrixWorld.elements;
    // lokales "unten" = -(Zeile y der Rotation): world (0,-1,0) -> local = R^T * (0,-1,0) = -(m1, m5, m9)
    return [-m[1] * G, -m[9] * G];
  }

  reset() {
    this.heaveBase = 0;
    this.sinkDepth = 0;
    this.pitch = 0;
    this.roll = 0;
    this.sinking = false;
    this.sinkT = 0;
    this.sunk = false;
    this.F = 0;
    this.forceSink = false;
  }
}
