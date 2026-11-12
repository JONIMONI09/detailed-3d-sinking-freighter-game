/**
 * 3D visual humanoid representation for friendly Damage Control Crew NPCs.
 * Chief Engineer (yellow helmet, green suit), Boatswain (orange vest, blue suit),
 * and DC Sailor (naval uniform).
 *
 * 100% friendly, forward-aligned (-Z forward), with walk cycle animation,
 * ladder climbing pose, and oxy-acetylene torch welding spark emitters.
 */

import * as THREE from "three";
import type { CrewMember } from "./crew";

const mats = {
  skin: new THREE.MeshStandardMaterial({ color: 0xc99a76, roughness: 0.8 }),
  boots: new THREE.MeshStandardMaterial({ color: 0x1b1b1b, roughness: 0.9 }),
  // Chief Engineer: Green suit, yellow hardhat
  engineerSuit: new THREE.MeshStandardMaterial({ color: 0x2e7d32, roughness: 0.85 }),
  yellowHelmet: new THREE.MeshStandardMaterial({ color: 0xfacc15, roughness: 0.4 }),
  // Boatswain: Blue suit, high-vis orange vest
  boatswainSuit: new THREE.MeshStandardMaterial({ color: 0x1e3a8a, roughness: 0.85 }),
  orangeVest: new THREE.MeshStandardMaterial({ color: 0xf97316, roughness: 0.6 }),
  // DC Sailor: Naval uniform, white sailor cover
  sailorUniform: new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.85 }),
  whiteCap: new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.7 }),
  // Tools & Torch
  torchMetal: new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.4, metalness: 0.7 }),
  torchTip: new THREE.MeshBasicMaterial({ color: 0x38bdf8 }),
  backpack: new THREE.MeshStandardMaterial({ color: 0x374151, roughness: 0.8 }),
};

export class CrewVisual {
  group = new THREE.Group();
  legL = new THREE.Group();
  legR = new THREE.Group();
  torso = new THREE.Group();
  head = new THREE.Group();
  armL = new THREE.Group();
  armR = new THREE.Group();
  torch = new THREE.Group();
  tipWorldPos = new THREE.Vector3();

  walk = 0;
  yaw = 0;
  lastX: number;
  lastY: number;
  lastZ: number;

  constructor(public member: CrewMember) {
    this.lastX = member.x;
    this.lastY = member.y;
    this.lastZ = member.z;

    const suitMat =
      member.role === "chief-engineer"
        ? mats.engineerSuit
        : member.role === "boatswain"
          ? mats.boatswainSuit
          : mats.sailorUniform;

    const addMesh = (
      parent: THREE.Object3D,
      geo: THREE.BufferGeometry,
      mat: THREE.Material,
      x: number,
      y: number,
      z: number,
    ) => {
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(x, y, z);
      mesh.castShadow = true;
      parent.add(mesh);
      return mesh;
    };

    // --- Legs (aligned forward toward -Z) ---
    this.legL.position.set(-0.11, 0.85, 0);
    this.legR.position.set(0.11, 0.85, 0);
    for (const leg of [this.legL, this.legR]) {
      addMesh(leg, new THREE.BoxGeometry(0.17, 0.7, 0.2), suitMat, 0, -0.35, 0);
      // Boot toe points forward to -Z
      addMesh(leg, new THREE.BoxGeometry(0.19, 0.16, 0.3), mats.boots, 0, -0.78, -0.04);
      this.group.add(leg);
    }

    // --- Torso ---
    this.torso.position.set(0, 0.85, 0);
    addMesh(this.torso, new THREE.BoxGeometry(0.46, 0.62, 0.26), suitMat, 0, 0.32, 0);

    if (member.role === "boatswain") {
      // High-visibility orange safety vest
      addMesh(this.torso, new THREE.BoxGeometry(0.48, 0.32, 0.28), mats.orangeVest, 0, 0.38, 0);
    } else if (member.role === "damage-control") {
      // Damage control emergency patch kit backpack
      addMesh(this.torso, new THREE.BoxGeometry(0.36, 0.42, 0.18), mats.backpack, 0, 0.35, 0.2);
    }
    this.group.add(this.torso);

    // --- Head & Helmet ---
    this.head.position.set(0, 0.62, 0);
    addMesh(this.head, new THREE.BoxGeometry(0.22, 0.25, 0.23), mats.skin, 0, 0.14, 0);

    if (member.role === "chief-engineer") {
      // Safety yellow hardhat with front visor at z = -0.15
      addMesh(this.head, new THREE.CylinderGeometry(0.15, 0.16, 0.1, 12), mats.yellowHelmet, 0, 0.3, 0);
      addMesh(this.head, new THREE.BoxGeometry(0.2, 0.02, 0.1), mats.yellowHelmet, 0, 0.26, -0.15);
    } else if (member.role === "boatswain") {
      // White officer deck cap with front visor
      addMesh(this.head, new THREE.CylinderGeometry(0.15, 0.16, 0.09, 12), mats.whiteCap, 0, 0.3, 0);
      addMesh(this.head, new THREE.BoxGeometry(0.2, 0.02, 0.1), mats.boots, 0, 0.26, -0.15);
    } else {
      // Traditional white sailor cup cover
      addMesh(this.head, new THREE.CylinderGeometry(0.16, 0.14, 0.12, 12), mats.whiteCap, 0, 0.32, 0);
    }
    this.torso.add(this.head);

    // --- Arms ---
    this.armL.position.set(-0.3, 0.55, 0);
    this.armR.position.set(0.3, 0.55, 0);
    for (const arm of [this.armL, this.armR]) {
      addMesh(arm, new THREE.BoxGeometry(0.13, 0.55, 0.14), suitMat, 0, -0.26, 0);
      addMesh(arm, new THREE.BoxGeometry(0.11, 0.11, 0.11), mats.skin, 0, -0.56, 0);
      this.torso.add(arm);
    }

    // --- Welding Torch (held in right hand, pointed toward -Z) ---
    this.torch.position.set(0, -0.56, -0.1);
    addMesh(this.torch, new THREE.CylinderGeometry(0.02, 0.02, 0.25, 6), mats.torchMetal, 0, 0, -0.1).rotation.x = Math.PI / 2;
    addMesh(this.torch, new THREE.SphereGeometry(0.03, 6, 6), mats.torchTip, 0, 0, -0.25);
    this.armR.add(this.torch);

    this.group.position.set(member.x, member.y, member.z);
  }

  update(dt: number, onSpark?: (pos: THREE.Vector3) => void) {
    const dx = this.member.x - this.lastX;
    const dz = this.member.z - this.lastZ;
    const spd = Math.hypot(dx, dz) / Math.max(0.001, dt);

    if (spd > 0.15) {
      // Turn to face direction of forward motion (-Z is forward)
      this.yaw = Math.atan2(dx, -dz);
    }
    this.group.rotation.y = this.yaw;

    // Walking animation
    if (this.member.state === "moving" || this.member.state === "patrol") {
      this.walk += dt * (spd * 3.5 + 0.001);
      const sw = Math.sin(this.walk) * Math.min(1, spd / 1.8) * 0.65;
      this.legL.rotation.x = sw;
      this.legR.rotation.x = -sw;
      this.armL.rotation.x = -sw * 0.7;
      this.armR.rotation.x = sw * 0.7;
      this.armL.rotation.z = 0;
      this.armR.rotation.z = 0;
      this.torso.position.y = 0.85 + Math.abs(Math.sin(this.walk)) * 0.03 * Math.min(1, spd / 1.5);
    } else if (this.member.state === "repairing") {
      // Welding repair pose: both hands raised forward toward -Z
      this.legL.rotation.x = 0;
      this.legR.rotation.x = 0;
      this.armL.rotation.x = 1.25;
      this.armR.rotation.x = 1.4;
      this.armL.rotation.z = 0.2;
      this.armR.rotation.z = -0.2;
      this.torso.position.y = 0.85;

      // Emit welding torch sparks
      if (onSpark && Math.random() < dt * 28) {
        this.torch.getWorldPosition(this.tipWorldPos);
        onSpark(this.tipWorldPos);
      }
    } else if (this.member.state === "climbing_ladder") {
      // Kinematic ladder climbing pose
      this.walk += dt * 4.0;
      const sw = Math.sin(this.walk) * 0.5;
      this.legL.rotation.x = sw;
      this.legR.rotation.x = -sw;
      this.armL.rotation.x = 1.3 + -sw * 0.4;
      this.armR.rotation.x = 1.3 + sw * 0.4;
    } else {
      // Idle / alert
      this.legL.rotation.x = 0;
      this.legR.rotation.x = 0;
      this.armL.rotation.x = 0;
      this.armR.rotation.x = 0;
      this.armL.rotation.z = 0;
      this.armR.rotation.z = 0;
      this.torso.position.y = 0.85;
    }

    this.group.position.set(this.member.x, this.member.y, this.member.z);
    this.lastX = this.member.x;
    this.lastY = this.member.y;
    this.lastZ = this.member.z;
  }
}
