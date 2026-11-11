import * as THREE from 'three';
import { CompartmentId, InteractablePrompt } from '../types/game';

export interface LocalColliderBox {
  id: string;
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  minZ: number;
  maxZ: number;
  doorId?: string; // If linked to a door, disabled when door.openProgress > 0.65
  destructibleId?: string;
}

export interface StairZone {
  id: string;
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  startZ: number;
  endZ: number;
  startY: number;
  endY: number;
}

export interface ShipDoor {
  id: string;
  name: string;
  deckName: string;
  type: 'hinged' | 'bulkhead' | 'container';
  isOpen: boolean;
  openProgress: number; // 0 (closed) to 1 (open)
  locked: boolean;
  watertight?: boolean;
  health: number;
  maxHealth: number;
  pivotGroup: THREE.Group;
  handleMesh?: THREE.Object3D;
  statusLightMat?: THREE.MeshStandardMaterial;
  localPosition: THREE.Vector3;
  slideOffset?: THREE.Vector3; // For hydraulic sliding bulkhead doors
  closedLocalPos: THREE.Vector3;
  openAngle: number; // For hinged doors
  bulkheadIndex?: 0 | 1 | 2; // 0: A-B, 1: B-C, 2: C-D
}

export interface HullBreachNode {
  id: string;
  compartment: CompartmentId;
  side: 'port' | 'starboard' | 'keel';
  localPos: THREE.Vector3;
  breached: boolean;
  severity: number; // 0 to 1
  intactMesh: THREE.Mesh;
  breachGroup: THREE.Group;
  waterJetMesh: THREE.Mesh;
}

export interface ExplosiveProp {
  id: string;
  type: 'barrel' | 'crate';
  compartment: CompartmentId;
  localPos: THREE.Vector3;
  exploded: boolean;
  mesh: THREE.Group;
  colliderId: string;
}

export interface ShipTerminal {
  id: string;
  title: string;
  subtitle: string;
  actionLabel: string;
  type: InteractablePrompt['type'];
  localPos: THREE.Vector3;
}

export interface BuiltCargoShip {
  shipGroup: THREE.Group;
  foreHalfGroup: THREE.Group;
  aftHalfGroup: THREE.Group;
  colliders: LocalColliderBox[];
  stairs: StairZone[];
  doors: ShipDoor[];
  hullNodes: HullBreachNode[];
  explosiveProps: ExplosiveProp[];
  terminals: ShipTerminal[];
  compartmentWaterMeshes: Record<CompartmentId, THREE.Mesh>;
  mainDeckWaterMesh: THREE.Mesh;
  animatedParts: {
    propeller: THREE.Object3D;
    driveShaft: THREE.Object3D;
    flywheel: THREE.Object3D;
    pistons: THREE.Object3D[];
    radarMain: THREE.Object3D;
    radarAux: THREE.Object3D;
    helmWheel: THREE.Object3D;
    alarmLights: THREE.PointLight[];
    alarmBeacons: THREE.MeshStandardMaterial[];
    waterJetMaterials: THREE.MeshBasicMaterial[];
  };
}

// Procedural Canvas Texture Helpers
function createSteelPlateTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#243040';
  ctx.fillRect(0, 0, 256, 256);

  ctx.strokeStyle = '#18212D';
  ctx.lineWidth = 3;
  ctx.strokeRect(4, 4, 248, 248);
  ctx.beginPath();
  ctx.moveTo(0, 128);
  ctx.lineTo(256, 128);
  ctx.moveTo(128, 0);
  ctx.lineTo(128, 256);
  ctx.stroke();

  // Rivets
  ctx.fillStyle = '#3B4A5E';
  for (let x = 16; x < 256; x += 32) {
    for (let y = 16; y < 256; y += 32) {
      ctx.beginPath();
      ctx.arc(x, y, 2.2, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(8, 16);
  return tex;
}

function createHazardStripeTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#F59E0B';
  ctx.fillRect(0, 0, 128, 128);
  ctx.fillStyle = '#111827';
  for (let i = -128; i < 256; i += 32) {
    ctx.beginPath();
    ctx.moveTo(i, 0);
    ctx.lineTo(i + 16, 0);
    ctx.lineTo(i - 16 + 128, 128);
    ctx.lineTo(i - 32 + 128, 128);
    ctx.closePath();
    ctx.fill();
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

function createContainerTexture(baseColor: string, label: string): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 128;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = baseColor;
  ctx.fillRect(0, 0, 256, 128);

  // Corrugation vertical ribs
  for (let x = 0; x < 256; x += 12) {
    ctx.fillStyle = 'rgba(0,0,0,0.18)';
    ctx.fillRect(x, 0, 5, 128);
    ctx.fillStyle = 'rgba(255,255,255,0.08)';
    ctx.fillRect(x + 5, 0, 3, 128);
  }

  // Frame border
  ctx.strokeStyle = 'rgba(0,0,0,0.4)';
  ctx.lineWidth = 8;
  ctx.strokeRect(0, 0, 256, 128);

  // Stencil text
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  ctx.font = 'bold 20px monospace';
  ctx.fillText(label, 22, 42);
  ctx.font = '12px monospace';
  ctx.fillText('ISO 45G1 // HEAVY CARGO', 22, 62);

  return new THREE.CanvasTexture(canvas);
}

export function buildCargoShip(): BuiltCargoShip {
  const shipGroup = new THREE.Group();
  shipGroup.name = 'MS_POSEIDON_VII';

  const foreHalfGroup = new THREE.Group();
  const aftHalfGroup = new THREE.Group();
  shipGroup.add(foreHalfGroup);
  shipGroup.add(aftHalfGroup);

  const colliders: LocalColliderBox[] = [];
  const stairs: StairZone[] = [];
  const doors: ShipDoor[] = [];
  const hullNodes: HullBreachNode[] = [];
  const explosiveProps: ExplosiveProp[] = [];
  const terminals: ShipTerminal[] = [];
  const alarmLights: THREE.PointLight[] = [];
  const alarmBeacons: THREE.MeshStandardMaterial[] = [];
  const waterJetMaterials: THREE.MeshBasicMaterial[] = [];
  const pistons: THREE.Object3D[] = [];

  const steelTex = createSteelPlateTexture();
  const hazardTex = createHazardStripeTexture();

  // Shared Materials
  const lowerHullMat = new THREE.MeshStandardMaterial({
    color: 0x7f1d1d,
    roughness: 0.75,
    metalness: 0.35,
  });
  const upperHullMat = new THREE.MeshStandardMaterial({
    color: 0x1e293b,
    roughness: 0.6,
    metalness: 0.5,
  });
  const deckSteelMat = new THREE.MeshStandardMaterial({
    map: steelTex,
    color: 0x334155,
    roughness: 0.7,
    metalness: 0.45,
  });
  const interiorWallMat = new THREE.MeshStandardMaterial({
    color: 0x263244,
    roughness: 0.65,
    metalness: 0.4,
  });
  const superstructureMat = new THREE.MeshStandardMaterial({
    color: 0xe2e8f0,
    roughness: 0.5,
    metalness: 0.25,
  });
  const hazardMat = new THREE.MeshStandardMaterial({
    map: hazardTex,
    roughness: 0.5,
    metalness: 0.3,
  });
  const brassMat = new THREE.MeshStandardMaterial({
    color: 0xd97706,
    roughness: 0.3,
    metalness: 0.85,
  });
  const darkMetalMat = new THREE.MeshStandardMaterial({
    color: 0x0f172a,
    roughness: 0.5,
    metalness: 0.75,
  });
  const engineGreenMat = new THREE.MeshStandardMaterial({
    color: 0x065f46,
    roughness: 0.45,
    metalness: 0.6,
  });
  const glassMat = new THREE.MeshPhysicalMaterial({
    color: 0x7dd3fc,
    transparent: true,
    opacity: 0.32,
    roughness: 0.1,
    metalness: 0.1,
  });

  // Helper to add both visual mesh & solid collision box
  const addWallBox = (
    id: string,
    cx: number,
    cy: number,
    cz: number,
    sx: number,
    sy: number,
    sz: number,
    mat: THREE.Material,
    addCollider = true,
    parent: THREE.Group = shipGroup
  ): THREE.Mesh => {
    const geom = new THREE.BoxGeometry(sx, sy, sz);
    const mesh = new THREE.Mesh(geom, mat);
    mesh.position.set(cx, cy, cz);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    parent.add(mesh);

    if (addCollider) {
      colliders.push({
        id,
        minX: cx - sx / 2,
        maxX: cx + sx / 2,
        minY: cy - sy / 2,
        maxY: cy + sy / 2,
        minZ: cz - sz / 2,
        maxZ: cz + sz / 2,
      });
    }
    return mesh;
  };

  // ============================================================================
  // 1. SHIP KEEL, LOWER DECK FLOOR (y = -2.2m) & OUTER HULL SHELL
  // Ship spans Z = -46m (Bow) to Z = +42m (Stern), Width X = -10m to +10m
  // ============================================================================

  // Solid Keel & Bottom Hull Base (y = -5.2m to -2.2m)
  addWallBox('keel_base', 0, -3.7, -2, 19.6, 3.0, 76, lowerHullMat, true);

  // Tapered Bow Wedge (Visual + Colliders at Z = -40 to -52)
  const bowGeom = new THREE.ConeGeometry(11.5, 16, 4);
  bowGeom.rotateX(-Math.PI / 2);
  bowGeom.rotateZ(Math.PI / 4);
  const bowMesh = new THREE.Mesh(bowGeom, upperHullMat);
  bowMesh.position.set(0, 0.2, -46);
  bowMesh.scale.set(0.95, 0.72, 1.1);
  shipGroup.add(bowMesh);

  // Bulbous Bow underwater
  const bulbGeom = new THREE.SphereGeometry(2.8, 16, 12);
  bulbGeom.scale(0.85, 0.85, 2.2);
  const bulbMesh = new THREE.Mesh(bulbGeom, lowerHullMat);
  bulbMesh.position.set(0, -3.5, -49);
  shipGroup.add(bulbMesh);

  // Bow Boundary Collider so player cannot walk off the pointed bow without jumping
  colliders.push({
    id: 'bow_front_stop',
    minX: -10,
    maxX: 10,
    minY: -3,
    maxY: 5.5,
    minZ: -44.5,
    maxZ: -41.5,
  });

  // Lower Deck Walkable Floor is the top of 'keel_base' at y = -2.2m!
  // Outer Hull Port & Starboard Walls (from y = -2.2m up to y = +2.0m Main Deck)
  // Left (Port: x = -9.6m) & Right (Starboard: x = +9.6m)
  addWallBox('hull_port_wall', -9.6, -0.1, -2, 0.8, 4.4, 76, upperHullMat, true);
  addWallBox('hull_stbd_wall', 9.6, -0.1, -2, 0.8, 4.4, 76, upperHullMat, true);
  // Lower Hull Red Anti-fouling Skirt strip on outside
  addWallBox('skirt_port', -10.05, -2.6, -2, 0.15, 3.2, 76, lowerHullMat, false);
  addWallBox('skirt_stbd', 10.05, -2.6, -2, 0.15, 3.2, 76, lowerHullMat, false);

  // Forward & Aft End Bulkheads of Lower Deck (Z = -39m and Z = +35m)
  addWallBox('hull_fwd_bulkhead', 0, -0.1, -39.5, 19.6, 4.4, 1.0, interiorWallMat, true);
  addWallBox('hull_aft_bulkhead', 0, -0.1, 35.5, 19.6, 4.4, 1.0, interiorWallMat, true);

  // ============================================================================
  // 2. MAIN DECK FLOOR (y = +2.0m) WITH STAIRWELL OPENINGS!
  // Stairwell 1 (Forward): X in [-2.2, +2.2], Z in [-29, -22]
  // Stairwell 2 (Mid-Aft): X in [-2.2, +2.2], Z in [+7, +14]
  // ============================================================================
  // Port & Starboard Main Deck Slabs (X = -9.5 to -2.2, and X = +2.2 to +9.5)
  addWallBox('main_deck_port', -5.85, 2.0, -2, 7.3, 0.4, 76, deckSteelMat, true);
  addWallBox('main_deck_stbd', 5.85, 2.0, -2, 7.3, 0.4, 76, deckSteelMat, true);

  // Center Main Deck Slabs (leaving openings at Z=[-29,-22] and Z=[+7,+14])
  addWallBox('main_deck_center_bow', 0, 2.0, -35.0, 4.4, 0.4, 12.0, deckSteelMat, true);
  addWallBox('main_deck_center_mid', 0, 2.0, -7.5, 4.4, 0.4, 29.0, deckSteelMat, true);
  addWallBox('main_deck_center_aft', 0, 2.0, 25.0, 4.4, 0.4, 22.0, deckSteelMat, true);

  // Build Stairwell 1 (Forward: descends from Z = -22 at Y = +2.0m down to Z = -28.5 at Y = -2.2m)
  stairs.push({
    id: 'stair_fwd_hold',
    minX: -2.0,
    maxX: 2.0,
    minZ: -29.0,
    maxZ: -21.8,
    startZ: -22.0,
    endZ: -28.5,
    startY: 2.2,
    endY: -2.2,
  });
  for (let i = 0; i < 14; i++) {
    const t = i / 13;
    const stepZ = -22.2 - t * 6.3;
    const stepY = 2.0 - t * 4.2;
    addWallBox(`step_fwd_${i}`, 0, stepY, stepZ, 3.6, 0.2, 0.5, hazardMat, false);
  }

  // Build Stairwell 2 (Mid-Aft: descends from Z = +13.8 at Y = +2.0m down to Z = +7.2 at Y = -2.2m)
  stairs.push({
    id: 'stair_mid_hold',
    minX: -2.0,
    maxX: 2.0,
    minZ: 7.0,
    maxZ: 14.2,
    startZ: 13.8,
    endZ: 7.2,
    startY: 2.2,
    endY: -2.2,
  });
  for (let i = 0; i < 14; i++) {
    const t = i / 13;
    const stepZ = 13.6 - t * 6.4;
    const stepY = 2.0 - t * 4.2;
    addWallBox(`step_mid_${i}`, 0, stepY, stepZ, 3.6, 0.2, 0.5, hazardMat, false);
  }

  // ============================================================================
  // 3. HELPER TO CREATE INTERACTIVE HINGED & HYDRAULIC BULKHEAD DOORS
  // ============================================================================
  const createHingedDoor = (params: {
    id: string;
    name: string;
    deckName: string;
    doorCenterX: number;
    doorBottomY: number;
    doorCenterZ: number;
    width: number;
    height: number;
    facingAxis: 'z' | 'x'; // 'z' means door plane is along X (player walks along Z)
    openAngle?: number;
    locked?: boolean;
    isContainer?: boolean;
  }): ShipDoor => {
    const {
      id,
      name,
      deckName,
      doorCenterX,
      doorBottomY,
      doorCenterZ,
      width,
      height,
      facingAxis,
      openAngle = Math.PI * 0.58,
      locked = false,
      isContainer = false,
    } = params;

    const pivotGroup = new THREE.Group();
    const halfW = width / 2;

    if (facingAxis === 'z') {
      pivotGroup.position.set(doorCenterX - halfW, doorBottomY + height / 2, doorCenterZ);
    } else {
      pivotGroup.position.set(doorCenterX, doorBottomY + height / 2, doorCenterZ - halfW);
    }
    shipGroup.add(pivotGroup);

    const doorPanelMat = new THREE.MeshStandardMaterial({
      color: isContainer ? 0x991b1b : locked ? 0x7c2d12 : 0x475569,
      roughness: 0.45,
      metalness: 0.7,
    });

    const panelGeom =
      facingAxis === 'z'
        ? new THREE.BoxGeometry(width, height, 0.18)
        : new THREE.BoxGeometry(0.18, height, width);

    const panelMesh = new THREE.Mesh(panelGeom, doorPanelMat);
    if (facingAxis === 'z') {
      panelMesh.position.set(halfW, 0, 0);
    } else {
      panelMesh.position.set(0, 0, halfW);
    }
    panelMesh.castShadow = true;
    pivotGroup.add(panelMesh);

    // Porthole window on ship doors
    if (!isContainer) {
      const frameGeom = new THREE.TorusGeometry(0.28, 0.04, 8, 16);
      if (facingAxis === 'x') frameGeom.rotateY(Math.PI / 2);
      const frameMesh = new THREE.Mesh(frameGeom, brassMat);
      frameMesh.position.copy(panelMesh.position).add(new THREE.Vector3(0, 0.38, 0));
      pivotGroup.add(frameMesh);
    }

    // Naval Watertight Latching Wheel (Handrad)
    const wheelGroup = new THREE.Group();
    const wheelRing = new THREE.Mesh(new THREE.TorusGeometry(0.22, 0.03, 8, 16), brassMat);
    if (facingAxis === 'x') wheelRing.rotateY(Math.PI / 2);
    wheelGroup.add(wheelRing);
    if (facingAxis === 'z') {
      wheelGroup.position.set(width * 0.78, -0.1, 0);
    } else {
      wheelGroup.position.set(0, -0.1, width * 0.78);
    }
    pivotGroup.add(wheelGroup);

    // Status Indicator Light above door
    const lightMat = new THREE.MeshStandardMaterial({
      color: locked ? 0xef4444 : 0x10b981,
      emissive: locked ? 0xef4444 : 0x10b981,
      emissiveIntensity: 1.5,
    });
    const statusBulb = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.12, 0.28), lightMat);
    statusBulb.position.set(doorCenterX, doorBottomY + height + 0.16, doorCenterZ);
    shipGroup.add(statusBulb);

    // Register solid Door Collider (blocks player when closed -> KEIN NO-CLIP!)
    const pad = 0.28;
    if (facingAxis === 'z') {
      colliders.push({
        id: `collider_${id}`,
        doorId: id,
        minX: doorCenterX - halfW,
        maxX: doorCenterX + halfW,
        minY: doorBottomY,
        maxY: doorBottomY + height,
        minZ: doorCenterZ - pad,
        maxZ: doorCenterZ + pad,
      });
    } else {
      colliders.push({
        id: `collider_${id}`,
        doorId: id,
        minX: doorCenterX - pad,
        maxX: doorCenterX + pad,
        minY: doorBottomY,
        maxY: doorBottomY + height,
        minZ: doorCenterZ - halfW,
        maxZ: doorCenterZ + halfW,
      });
    }

    const doorObj: ShipDoor = {
      id,
      name,
      deckName,
      type: isContainer ? 'container' : 'hinged',
      isOpen: false,
      openProgress: 0,
      locked,
      watertight: locked,
      health: 100,
      maxHealth: 100,
      pivotGroup,
      handleMesh: wheelGroup,
      statusLightMat: lightMat,
      localPosition: new THREE.Vector3(doorCenterX, doorBottomY + height * 0.5, doorCenterZ),
      closedLocalPos: pivotGroup.position.clone(),
      openAngle,
    };
    doors.push(doorObj);
    return doorObj;
  };

  // ============================================================================
  // 4. LOWER DECK 4 WATERTIGHT COMPARTMENTS & 3 HYDRAULIC BULKHEAD DOORS
  // Compartment A (Bow): Z = -39 to -16
  // Compartment B (Mid-Fwd): Z = -16 to +3
  // Compartment C (Engine Room): Z = +3 to +22
  // Compartment D (Stern Shaft): Z = +22 to +35
  // ============================================================================
  const bulkheadZPositions: { z: number; id: string; name: string; index: 0 | 1 | 2 }[] = [
    { z: -16.0, id: 'bulkhead_ab', name: 'Wasserschott A/B (Bug ➔ Frachtraum)', index: 0 },
    { z: 3.0, id: 'bulkhead_bc', name: 'Wasserschott B/C (Frachtraum ➔ Maschinenraum)', index: 1 },
    { z: 22.0, id: 'bulkhead_cd', name: 'Wasserschott C/D (Maschinenraum ➔ Wellentunnel)', index: 2 },
  ];

  bulkheadZPositions.forEach(({ z, id, name, index }) => {
    // Left & Right Bulkhead Walls leaving a 2.6m wide doorway in the center (X in [-1.3, +1.3])
    addWallBox(`${id}_wall_port`, -5.45, -0.1, z, 8.3, 4.2, 0.55, interiorWallMat, true);
    addWallBox(`${id}_wall_stbd`, 5.45, -0.1, z, 8.3, 4.2, 0.55, interiorWallMat, true);
    // Header lintel above bulkhead doorway (Y = +0.7 to +2.0)
    addWallBox(`${id}_lintel`, 0, 1.35, z, 2.6, 1.3, 0.6, hazardMat, true);

    // Sliding Hydraulic Heavy Steel Door Panel
    const pivotGroup = new THREE.Group();
    pivotGroup.position.set(0, -0.75, z);
    shipGroup.add(pivotGroup);

    const doorMesh = new THREE.Mesh(new THREE.BoxGeometry(2.7, 2.9, 0.32), hazardMat);
    doorMesh.castShadow = true;
    pivotGroup.add(doorMesh);

    const lightMat = new THREE.MeshStandardMaterial({
      color: 0xf59e0b,
      emissive: 0xf59e0b,
      emissiveIntensity: 1.8,
    });
    const indicator = new THREE.Mesh(new THREE.SphereGeometry(0.16, 12, 12), lightMat);
    indicator.position.set(0, 1.65, z + 0.35);
    shipGroup.add(indicator);

    colliders.push({
      id: `collider_${id}`,
      doorId: id,
      minX: -1.35,
      maxX: 1.35,
      minY: -2.2,
      maxY: 0.75,
      minZ: z - 0.35,
      maxZ: z + 0.35,
    });

    doors.push({
      id,
      name,
      deckName: 'Unterdeck (Schotten-Korridor)',
      type: 'bulkhead',
      isOpen: false,
      openProgress: 0,
      locked: false,
      watertight: false,
      health: 150,
      maxHealth: 150,
      pivotGroup,
      statusLightMat: lightMat,
      localPosition: new THREE.Vector3(0, -0.75, z),
      closedLocalPos: new THREE.Vector3(0, -0.75, z),
      slideOffset: new THREE.Vector3(2.65, 0, 0), // Slides sideways into starboard bulkhead pocket
      openAngle: 0,
      bulkheadIndex: index,
    });
  });

  // ============================================================================
  // 5. DECKHOUSES ON MAIN DECK COVERING THE TWO STAIRWELLS (WITH WORKING DOORS!)
  // ============================================================================
  // Forward Deckhouse around Stairwell 1 (X in [-2.6, +2.6], Z in [-29.5, -20.5], Y = 2.0 to 5.2)
  addWallBox('fwd_house_port', -2.5, 3.6, -25.0, 0.35, 3.2, 9.0, superstructureMat, true);
  addWallBox('fwd_house_stbd', 2.5, 3.6, -25.0, 0.35, 3.2, 9.0, superstructureMat, true);
  addWallBox('fwd_house_back', 0, 3.6, -29.4, 5.3, 3.2, 0.35, superstructureMat, true);
  addWallBox('fwd_house_roof', 0, 5.2, -25.0, 5.4, 0.3, 9.2, deckSteelMat, true);
  // Front wall with doorway at Z = -20.6 (Doorway X in [-0.9, +0.9])
  addWallBox('fwd_house_front_l', -1.75, 3.6, -20.6, 1.7, 3.2, 0.35, superstructureMat, true);
  addWallBox('fwd_house_front_r', 1.75, 3.6, -20.6, 1.7, 3.2, 0.35, superstructureMat, true);
  addWallBox('fwd_house_front_top', 0, 4.85, -20.6, 1.8, 0.7, 0.35, superstructureMat, true);

  createHingedDoor({
    id: 'door_fwd_deckhouse',
    name: 'Bug-Niedergangstür (Zum Unterdeck Sektion A)',
    deckName: 'Hauptdeck (Bug)',
    doorCenterX: 0,
    doorBottomY: 2.2,
    doorCenterZ: -20.6,
    width: 1.8,
    height: 2.3,
    facingAxis: 'z',
  });

  // Midship Access House around Stairwell 2 (X in [-2.6, +2.6], Z in [+6.5, +15.5], Y = 2.0 to 5.2)
  addWallBox('mid_house_port', -2.5, 3.6, 11.0, 0.35, 3.2, 9.0, superstructureMat, true);
  addWallBox('mid_house_stbd', 2.5, 3.6, 11.0, 0.35, 3.2, 9.0, superstructureMat, true);
  addWallBox('mid_house_front', 0, 3.6, 6.6, 5.3, 3.2, 0.35, superstructureMat, true);
  addWallBox('mid_house_roof', 0, 5.2, 11.0, 5.4, 0.3, 9.2, deckSteelMat, true);
  // Entrance on Aft side of Midship House at Z = +15.4
  addWallBox('mid_house_back_l', -1.75, 3.6, 15.4, 1.7, 3.2, 0.35, superstructureMat, true);
  addWallBox('mid_house_back_r', 1.75, 3.6, 15.4, 1.7, 3.2, 0.35, superstructureMat, true);
  addWallBox('mid_house_back_top', 0, 4.85, 15.4, 1.8, 0.7, 0.35, superstructureMat, true);

  createHingedDoor({
    id: 'door_mid_deckhouse',
    name: 'Maschinenraum-Niedergang (Zum Unterdeck Sektion B/C)',
    deckName: 'Hauptdeck (Mittschiffs)',
    doorCenterX: 0,
    doorBottomY: 2.2,
    doorCenterZ: 15.4,
    width: 1.8,
    height: 2.3,
    facingAxis: 'z',
  });

  // ============================================================================
  // 6. AFT MULTI-DECK SUPERSTRUCTURE (CREW DECK Y=6.0m & NAVIGATION BRIDGE Y=10.0m)
  // Superstructure spans Z = +19.0m to +34.0m, X = -7.0m to +7.0m
  // ============================================================================
  // Ground Level Lobby on Main Deck (Y = 2.0m to 6.0m, Z = +19m to +34m)
  addWallBox('super_l1_port', -6.8, 4.0, 26.5, 0.4, 4.0, 15.0, superstructureMat, true);
  addWallBox('super_l1_stbd', 6.8, 4.0, 26.5, 0.4, 4.0, 15.0, superstructureMat, true);
  addWallBox('super_l1_aft', 0, 4.0, 33.8, 14.0, 4.0, 0.4, superstructureMat, true);
  // Front wall at Z = +19.2 with central entrance doorway (X in [-1.0, +1.0])
  addWallBox('super_l1_front_l', -3.9, 4.0, 19.2, 5.8, 4.0, 0.4, superstructureMat, true);
  addWallBox('super_l1_front_r', 3.9, 4.0, 19.2, 5.8, 4.0, 0.4, superstructureMat, true);
  addWallBox('super_l1_front_top', 0, 5.3, 19.2, 2.0, 1.4, 0.4, superstructureMat, true);

  createHingedDoor({
    id: 'door_super_main',
    name: 'Aufbauten-Haupteingang (Waffenkammer & Lobby)',
    deckName: 'Hauptdeck (Heck-Aufbauten)',
    doorCenterX: 0,
    doorBottomY: 2.2,
    doorCenterZ: 19.2,
    width: 2.0,
    height: 2.4,
    facingAxis: 'z',
  });

  // Crew Deck Floor Slabs (Y = +6.0m) with stairwell cutouts at X = ±8.2, Z = 18.4..25.2 so stairs have full headroom!
  addWallBox('crew_deck_center', 0, 6.0, 26.5, 14.0, 0.4, 16.0, deckSteelMat, true);
  addWallBox('crew_deck_wing_port', -8.2, 6.0, 30.0, 2.4, 0.4, 9.2, deckSteelMat, true);
  addWallBox('crew_deck_wing_stbd', 8.2, 6.0, 30.0, 2.4, 0.4, 9.2, deckSteelMat, true);

  // Exterior Stairs from Main Deck (Y=2.2m, Z=18.4m) up to Crew Deck Landing (Y=6.2m, Z=25.4m) on Port (X=-8.2m) & Starboard (X=+8.2m)
  ['port', 'stbd'].forEach((side) => {
    const sx = side === 'port' ? -8.2 : 8.2;
    stairs.push({
      id: `stair_to_crew_${side}`,
      minX: sx - 1.15,
      maxX: sx + 1.15,
      minZ: 18.0,
      maxZ: 25.8,
      startZ: 18.4,
      endZ: 25.4,
      startY: 2.2,
      endY: 6.2,
    });
    for (let i = 0; i < 14; i++) {
      const t = i / 13;
      addWallBox(
        `step_crew_${side}_${i}`,
        sx,
        2.2 + t * 3.8,
        18.6 + t * 6.6,
        1.8,
        0.18,
        0.48,
        hazardMat,
        false
      );
    }
  });

  // Crew Deck Interior Cabin (Y = 6.2m to 10.0m, X in [-6.4, +6.4], Z in [20.0, 33.0])
  addWallBox('crew_front_wall', 0, 8.1, 20.2, 12.8, 3.8, 0.4, superstructureMat, true);
  addWallBox('crew_aft_wall', 0, 8.1, 32.8, 12.8, 3.8, 0.4, superstructureMat, true);
  // Port & Starboard Crew Walls with Entrance Doors at Z = +28.5 (Door width 1.6m: Z in [27.7, 29.3])
  addWallBox('crew_port_fwd', -6.2, 8.1, 23.85, 0.4, 3.8, 7.7, superstructureMat, true);
  addWallBox('crew_port_aft', -6.2, 8.1, 31.15, 0.4, 3.8, 3.7, superstructureMat, true);
  addWallBox('crew_port_top', -6.2, 9.4, 28.5, 0.4, 1.2, 1.6, superstructureMat, true);

  addWallBox('crew_stbd_fwd', 6.2, 8.1, 23.85, 0.4, 3.8, 7.7, superstructureMat, true);
  addWallBox('crew_stbd_aft', 6.2, 8.1, 31.15, 0.4, 3.8, 3.7, superstructureMat, true);
  addWallBox('crew_stbd_top', 6.2, 9.4, 28.5, 0.4, 1.2, 1.6, superstructureMat, true);

  createHingedDoor({
    id: 'door_crew_port',
    name: 'Mannschaftsmesse Backbord-Tür',
    deckName: 'Mannschaftsdeck (+6m)',
    doorCenterX: -6.2,
    doorBottomY: 6.2,
    doorCenterZ: 28.5,
    width: 1.6,
    height: 2.4,
    facingAxis: 'x',
  });

  createHingedDoor({
    id: 'door_crew_stbd',
    name: 'Mannschaftsmesse Steuerbord-Tür',
    deckName: 'Mannschaftsdeck (+6m)',
    doorCenterX: 6.2,
    doorBottomY: 6.2,
    doorCenterZ: 28.5,
    width: 1.6,
    height: 2.4,
    facingAxis: 'x',
  });

  // Interior Captain's Cabin Partition inside Crew Deck (at Z = 24.5, with locked door at X = 0)
  addWallBox('capt_wall_l', -3.5, 8.1, 24.5, 5.0, 3.8, 0.3, interiorWallMat, true);
  addWallBox('capt_wall_r', 3.5, 8.1, 24.5, 5.0, 3.8, 0.3, interiorWallMat, true);
  addWallBox('capt_wall_top', 0, 9.4, 24.5, 2.0, 1.2, 0.3, interiorWallMat, true);

  createHingedDoor({
    id: 'door_captain_cabin',
    name: 'Kapitänskabine (Tresor & Spezial-C4 Lager)',
    deckName: 'Mannschaftsdeck (Innen)',
    doorCenterX: 0,
    doorBottomY: 6.2,
    doorCenterZ: 24.5,
    width: 2.0,
    height: 2.4,
    facingAxis: 'z',
    locked: true, // Starts locked! Player can unlock with [E] override or breach with TNT/Shotgun/Welder!
  });

  // ============================================================================
  // 7. NAVIGATION BRIDGE / KOMMANDOBRÜCKE (Y = +10.0m)
  // ============================================================================
  addWallBox('bridge_deck_center', 0, 10.0, 25.0, 13.2, 0.4, 11.5, deckSteelMat, true);
  addWallBox('bridge_wing_port', -7.8, 10.0, 23.4, 2.8, 0.4, 7.2, deckSteelMat, true);
  addWallBox('bridge_wing_stbd', 7.8, 10.0, 23.4, 2.8, 0.4, 7.2, deckSteelMat, true);

  // Exterior Stairs from Crew Deck (Y=6.2m, Z=33.2m) up to Bridge Wing Landing (Y=10.2m, Z=26.8m) on Port & Starboard
  ['port', 'stbd'].forEach((side) => {
    const sx = side === 'port' ? -7.8 : 7.8;
    stairs.push({
      id: `stair_to_bridge_${side}`,
      minX: sx - 1.15,
      maxX: sx + 1.15,
      minZ: 26.6,
      maxZ: 33.8,
      startZ: 33.4,
      endZ: 26.8,
      startY: 6.2,
      endY: 10.2,
    });
    for (let i = 0; i < 14; i++) {
      const t = i / 13;
      addWallBox(
        `step_bridge_${side}_${i}`,
        sx,
        6.2 + t * 3.8,
        33.2 - t * 6.0,
        1.6,
        0.18,
        0.46,
        hazardMat,
        false
      );
    }
  });

  // Bridge Wheelhouse Structure (X in [-6.0, +6.0], Z in [20.0, 29.5], Y = 10.2 to 13.6)
  // Lower Front Console Wall + Panoramic Glass Windows looking over the entire cargo deck!
  addWallBox('bridge_front_low', 0, 10.9, 20.2, 12.0, 1.4, 0.35, superstructureMat, true);
  addWallBox('bridge_front_glass', 0, 12.3, 20.2, 11.8, 1.4, 0.12, glassMat, false);
  addWallBox('bridge_aft_wall', 0, 11.9, 29.5, 12.0, 3.4, 0.35, superstructureMat, true);
  addWallBox('bridge_roof_slab', 0, 13.7, 24.8, 13.2, 0.35, 10.5, deckSteelMat, true);

  // Bridge Side Walls with Port & Starboard Wing Doors at Z = +25.0 (width 1.6m: Z in [24.2, 25.8])
  addWallBox('bridge_port_fwd', -5.8, 11.9, 22.1, 0.35, 3.4, 4.2, superstructureMat, true);
  addWallBox('bridge_port_aft', -5.8, 11.9, 27.65, 0.35, 3.4, 3.7, superstructureMat, true);
  addWallBox('bridge_port_top', -5.8, 13.1, 25.0, 0.35, 1.0, 1.6, superstructureMat, true);

  addWallBox('bridge_stbd_fwd', 5.8, 11.9, 22.1, 0.35, 3.4, 4.2, superstructureMat, true);
  addWallBox('bridge_stbd_aft', 5.8, 11.9, 27.65, 0.35, 3.4, 3.7, superstructureMat, true);
  addWallBox('bridge_stbd_top', 5.8, 13.1, 25.0, 0.35, 1.0, 1.6, superstructureMat, true);

  createHingedDoor({
    id: 'door_bridge_port',
    name: 'Kommandobrücke Backbord-Schott',
    deckName: 'Kommandobrücke (+10m)',
    doorCenterX: -5.8,
    doorBottomY: 10.2,
    doorCenterZ: 25.0,
    width: 1.6,
    height: 2.4,
    facingAxis: 'x',
  });

  createHingedDoor({
    id: 'door_bridge_stbd',
    name: 'Kommandobrücke Steuerbord-Schott',
    deckName: 'Kommandobrücke (+10m)',
    doorCenterX: 5.8,
    doorBottomY: 10.2,
    doorCenterZ: 25.0,
    width: 1.6,
    height: 2.4,
    facingAxis: 'x',
  });

  // ============================================================================
  // 8. CARGO CONTAINERS ON MAIN DECK (INCLUDING WALK-IN OPENABLE CONTAINER!)
  // ============================================================================
  const containerSpecs = [
    { x: -5.6, y: 3.45, z: -12.0, w: 3.2, h: 2.5, l: 9.0, color: '#991B1B', label: 'POSEIDON-RED-01' },
    { x: -5.6, y: 5.95, z: -12.0, w: 3.2, h: 2.5, l: 9.0, color: '#1D4ED8', label: 'OCEANIC-BLU-42' },
    { x: 5.6, y: 3.45, z: -12.0, w: 3.2, h: 2.5, l: 9.0, color: '#047857', label: 'NORDIC-GRN-19' },
    { x: 5.6, y: 5.95, z: -12.0, w: 3.2, h: 2.5, l: 9.0, color: '#B45309', label: 'HAZMAT-AMB-88' },
    { x: -5.6, y: 3.45, z: 0.0, w: 3.2, h: 2.5, l: 8.5, color: '#1E40AF', label: 'ATLANTIC-07' },
    { x: 5.6, y: 3.45, z: 0.0, w: 3.2, h: 2.5, l: 8.5, color: '#7F1D1D', label: 'CARGO-LINE-99' },
  ];

  containerSpecs.forEach((c, idx) => {
    const tex = createContainerTexture(c.color, c.label);
    const mat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.6, metalness: 0.35 });
    addWallBox(`container_${idx}`, c.x, c.y, c.z, c.w, c.h, c.l, mat, true);
  });

  // Walk-in Special Hazmat Container in Center Main Deck (X in [-1.6, +1.6], Z in [-10.0, -3.0], Y = 2.2 to 4.8)
  const specialTex = createContainerTexture('#B91C1C', 'GEHEIM-FRACHT #07');
  const specialMat = new THREE.MeshStandardMaterial({ map: specialTex, roughness: 0.55, metalness: 0.4 });
  addWallBox('spec_cont_l', -1.5, 3.5, -6.5, 0.2, 2.6, 7.0, specialMat, true);
  addWallBox('spec_cont_r', 1.5, 3.5, -6.5, 0.2, 2.6, 7.0, specialMat, true);
  addWallBox('spec_cont_back', 0, 3.5, -9.9, 3.2, 2.6, 0.2, specialMat, true);
  addWallBox('spec_cont_roof', 0, 4.8, -6.5, 3.2, 0.2, 7.0, specialMat, true);

  createHingedDoor({
    id: 'door_secret_container',
    name: 'Gefahrgut-Container #07 Tor (Sprengstoff-Depot)',
    deckName: 'Hauptdeck (Frachtsektion)',
    doorCenterX: 0,
    doorBottomY: 2.2,
    doorCenterZ: -3.0,
    width: 2.6,
    height: 2.4,
    facingAxis: 'z',
    isContainer: true,
  });

  // ============================================================================
  // 9. PERIMETER SAFETY RAILINGS (VERHINDERT UNBEABSICHTIGTES HERUNTERFALLEN)
  // ============================================================================
  addWallBox('rail_main_port', -9.4, 2.7, -2, 0.25, 1.1, 74, darkMetalMat, true);
  addWallBox('rail_main_stbd', 9.4, 2.7, -2, 0.25, 1.1, 74, darkMetalMat, true);
  addWallBox('rail_main_bow', 0, 2.7, -39.2, 19.0, 1.1, 0.3, darkMetalMat, true);
  addWallBox('rail_main_stern', 0, 2.7, 35.2, 19.0, 1.1, 0.3, darkMetalMat, true);

  // ============================================================================
  // 10. ANIMATED 12-CYLINDER MARINE DIESEL ENGINE, PROPELLER, RADARS & HELM
  // ============================================================================
  // Engine Block in Compartment C moved aft to Z = 17.5m (leaving Z = 7.0m to 14.2m completely open for Stairwell 2 landing!)
  const engineBlock = addWallBox('diesel_engine_core', 0, -0.7, 17.5, 3.2, 2.6, 6.2, engineGreenMat, true);
  void engineBlock;

  // 6 Animated Reciprocating Pistons along the top of the Engine Block (Z = 15.0m to 19.8m)
  for (let i = 0; i < 6; i++) {
    const pGroup = new THREE.Group();
    pGroup.position.set(0, 0.9, 15.0 + i * 0.95);
    const cylHead = new THREE.Mesh(new THREE.CylinderGeometry(0.38, 0.38, 0.9, 12), brassMat);
    const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 1.2, 8), darkMetalMat);
    rod.position.y = -0.5;
    pGroup.add(cylHead);
    pGroup.add(rod);
    shipGroup.add(pGroup);
    pistons.push(pGroup);
  }

  // Spinning Engine Flywheel moved aft to Z = 20.8m
  const flywheel = new THREE.Mesh(new THREE.CylinderGeometry(1.35, 1.35, 0.4, 20), brassMat);
  flywheel.rotation.x = Math.PI / 2;
  flywheel.position.set(0, -0.8, 20.8);
  shipGroup.add(flywheel);

  // Spinning Drive Shaft running through Compartment D (Z = 21.0m to +37.5m)
  const driveShaft = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.32, 16.5, 12), darkMetalMat);
  driveShaft.rotation.x = Math.PI / 2;
  driveShaft.position.set(0, -1.6, 29.2);
  shipGroup.add(driveShaft);

  // Giant 4-Blade Bronze Ship Propeller at Stern (Z = +37.8m, Y = -3.2m)
  const propeller = new THREE.Group();
  propeller.position.set(0, -3.2, 37.8);
  const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.5, 1.4, 16), brassMat);
  hub.rotation.x = Math.PI / 2;
  propeller.add(hub);
  for (let b = 0; b < 4; b++) {
    const blade = new THREE.Mesh(new THREE.BoxGeometry(0.18, 2.3, 0.85), brassMat);
    const angle = (b * Math.PI) / 2;
    blade.position.set(Math.cos(angle) * 1.1, Math.sin(angle) * 1.1, 0);
    blade.rotation.z = angle;
    blade.rotation.y = 0.35;
    propeller.add(blade);
  }
  shipGroup.add(propeller);

  // Rudder behind Propeller
  addWallBox('stern_rudder', 0, -3.0, 39.4, 0.35, 3.6, 2.2, lowerHullMat, false);

  // Bridge Consoles & Steering Wheel (Helm) at Y = 10.2m, Z = 21.2m
  addWallBox('bridge_console_main', 0, 10.8, 21.1, 7.6, 1.2, 1.1, darkMetalMat, true);

  const helmWheel = new THREE.Group();
  helmWheel.position.set(0, 11.55, 21.75);
  const helmRing = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.045, 10, 20), brassMat);
  helmWheel.add(helmRing);
  for (let s = 0; s < 6; s++) {
    const spoke = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.95, 6), brassMat);
    spoke.rotation.z = (s * Math.PI) / 3;
    helmWheel.add(spoke);
  }
  shipGroup.add(helmWheel);

  // Radar Mast & Rotating Radar Scanners on Bridge Roof (Y = +14.0m to +19.5m)
  addWallBox('radar_mast_tower', 0, 16.5, 25.5, 1.2, 5.5, 1.2, superstructureMat, false);
  const radarMain = new THREE.Mesh(new THREE.BoxGeometry(4.2, 0.35, 0.45), superstructureMat);
  radarMain.position.set(0, 19.4, 25.5);
  shipGroup.add(radarMain);

  const radarAux = new THREE.Mesh(new THREE.BoxGeometry(2.8, 0.28, 0.35), hazardMat);
  radarAux.position.set(0, 17.8, 24.6);
  shipGroup.add(radarAux);

  // Smokestack Funnel behind Bridge (Z = +31.0m, Y = 13.5m to 18.0m)
  const funnel = new THREE.Mesh(new THREE.CylinderGeometry(1.4, 1.8, 4.8, 16), lowerHullMat);
  funnel.position.set(0, 15.8, 31.0);
  shipGroup.add(funnel);

  // Port & Starboard Orange Enclosed Lifeboats on Crew Deck Davits (Y = +6.8m)
  [-8.6, 8.6].forEach((lx, idx) => {
    const boatMat = new THREE.MeshStandardMaterial({ color: 0xea580c, roughness: 0.35 });
    addWallBox(`lifeboat_${idx}`, lx, 6.9, 22.0, 1.6, 1.3, 4.4, boatMat, true);
  });

  // ============================================================================
  // 11. DESTRUCTIBLE HULL BREACH PLATES & INGRESS WATER JETS (16 ZONES)
  // ============================================================================
  const hullZoneConfigs: { comp: CompartmentId; z: number }[] = [
    { comp: 'bow', z: -32.0 },
    { comp: 'bow', z: -23.0 },
    { comp: 'midFwd', z: -11.0 },
    { comp: 'midFwd', z: -3.0 },
    { comp: 'midAft', z: 8.5 },
    { comp: 'midAft', z: 16.5 },
    { comp: 'stern', z: 26.0 },
    { comp: 'stern', z: 31.5 },
  ];

  hullZoneConfigs.forEach(({ comp, z }, idx) => {
    (['port', 'starboard'] as const).forEach((side) => {
      const x = side === 'port' ? -9.15 : 9.15;
      const id = `hull_node_${comp}_${side}_${idx}`;

      // Intact Weakpoint Plate inside the Lower Deck hull wall
      const plateMat = new THREE.MeshStandardMaterial({
        color: 0x3b495e,
        roughness: 0.6,
        metalness: 0.5,
      });
      const intactMesh = new THREE.Mesh(new THREE.BoxGeometry(0.3, 2.4, 3.6), plateMat);
      intactMesh.position.set(x, -0.7, z);
      shipGroup.add(intactMesh);

      // Jagged Breach Group (hidden until blasted open!)
      const breachGroup = new THREE.Group();
      breachGroup.position.set(x, -0.7, z);
      breachGroup.visible = false;

      // Dark torn hull cavity + glowing red-hot jagged steel edges
      const holeMat = new THREE.MeshBasicMaterial({ color: 0x020617 });
      const holeMesh = new THREE.Mesh(new THREE.BoxGeometry(0.45, 1.9, 2.8), holeMat);
      breachGroup.add(holeMesh);

      // Foaming Seawater Jet pouring inside the compartment!
      const jetMat = new THREE.MeshBasicMaterial({
        color: 0x38bdf8,
        transparent: true,
        opacity: 0.72,
      });
      waterJetMaterials.push(jetMat);
      const jetGeom = new THREE.ConeGeometry(1.1, 3.8, 10, 1, true);
      jetGeom.rotateZ(side === 'port' ? -Math.PI / 2.4 : Math.PI / 2.4);
      const waterJetMesh = new THREE.Mesh(jetGeom, jetMat);
      waterJetMesh.position.set(side === 'port' ? 1.5 : -1.5, -0.3, 0);
      breachGroup.add(waterJetMesh);

      shipGroup.add(breachGroup);

      hullNodes.push({
        id,
        compartment: comp,
        side,
        localPos: new THREE.Vector3(x, -0.7, z),
        breached: false,
        severity: 0,
        intactMesh,
        breachGroup,
        waterJetMesh,
      });
    });
  });

  // ============================================================================
  // 12. EXPLOSIVE RED FUEL BARRELS & DESTRUCTIBLE CARGO CRATES
  // ============================================================================
  const barrelPositions: { x: number; y: number; z: number; comp: CompartmentId }[] = [
    { x: -6.5, y: -1.5, z: -31.0, comp: 'bow' },
    { x: 6.5, y: -1.5, z: -24.0, comp: 'bow' },
    { x: -6.8, y: -1.5, z: -9.0, comp: 'midFwd' },
    { x: 6.8, y: -1.5, z: -2.0, comp: 'midFwd' },
    { x: -6.2, y: -1.5, z: 12.0, comp: 'midAft' },
    { x: 6.2, y: -1.5, z: 17.5, comp: 'midAft' },
    { x: -4.5, y: -1.5, z: 28.0, comp: 'stern' },
    { x: 0.0, y: 2.9, z: -7.5, comp: 'midFwd' }, // Inside the secret walk-in container on Main Deck!
    { x: -4.0, y: 2.9, z: -33.0, comp: 'bow' }, // On Bow Main Deck
  ];

  const barrelRedMat = new THREE.MeshStandardMaterial({
    color: 0xdc2626,
    roughness: 0.4,
    metalness: 0.5,
  });

  barrelPositions.forEach((bp, idx) => {
    const id = `explosive_barrel_${idx}`;
    const colliderId = `col_${id}`;
    const group = new THREE.Group();
    group.position.set(bp.x, bp.y, bp.z);

    const drum = new THREE.Mesh(new THREE.CylinderGeometry(0.48, 0.48, 1.35, 14), barrelRedMat);
    drum.castShadow = true;
    const stripe = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 0.3, 14), hazardMat);
    group.add(drum);
    group.add(stripe);
    shipGroup.add(group);

    colliders.push({
      id: colliderId,
      destructibleId: id,
      minX: bp.x - 0.55,
      maxX: bp.x + 0.55,
      minY: bp.y - 0.7,
      maxY: bp.y + 0.7,
      minZ: bp.z - 0.55,
      maxZ: bp.z + 0.55,
    });

    explosiveProps.push({
      id,
      type: 'barrel',
      compartment: bp.comp,
      localPos: new THREE.Vector3(bp.x, bp.y, bp.z),
      exploded: false,
      mesh: group,
      colliderId,
    });
  });

  // ============================================================================
  // 13. INTERIOR RISING FLOODWATER PLANES FOR EACH OF THE 4 COMPARTMENTS
  // ============================================================================
  const createFloodMesh = (minZ: number, maxZ: number): THREE.Mesh => {
    const length = maxZ - minZ;
    const centerZ = (minZ + maxZ) / 2;
    const geom = new THREE.BoxGeometry(18.2, 4.2, length - 0.4);
    const mat = new THREE.MeshPhysicalMaterial({
      color: 0x0284c7,
      transparent: true,
      opacity: 0.62,
      roughness: 0.15,
      metalness: 0.1,
    });
    const mesh = new THREE.Mesh(geom, mat);
    mesh.position.set(0, -4.35, centerZ); // Starts hidden below the lower deck floor (-2.2m)
    mesh.visible = false;
    shipGroup.add(mesh);
    return mesh;
  };

  const compartmentWaterMeshes: Record<CompartmentId, THREE.Mesh> = {
    bow: createFloodMesh(-39.0, -16.0),
    midFwd: createFloodMesh(-16.0, 3.0),
    midAft: createFloodMesh(3.0, 22.0),
    stern: createFloodMesh(22.0, 35.0),
  };

  // Main Deck Overspill Water Mesh (Y = 2.0m to 4.2m)
  const mainDeckWaterGeom = new THREE.BoxGeometry(18.0, 2.2, 62.0);
  const mainDeckWaterMat = new THREE.MeshPhysicalMaterial({
    color: 0x0284c7,
    transparent: true,
    opacity: 0.65,
    roughness: 0.12,
    metalness: 0.08,
  });
  const mainDeckWaterMesh = new THREE.Mesh(mainDeckWaterGeom, mainDeckWaterMat);
  mainDeckWaterMesh.position.set(0, 0.9, -8.0); // Hidden just under the main deck floor slab
  mainDeckWaterMesh.visible = false;
  shipGroup.add(mainDeckWaterMesh);

  // ============================================================================
  // 14. EMERGENCY LIGHTING & INTERACTIVE TERMINALS (BRIDGE, ENGINE ROOM, ARMORY)
  // ============================================================================
  const lightZones = [-28, -8, 12, 28];
  lightZones.forEach((z) => {
    const beaconMat = new THREE.MeshStandardMaterial({
      color: 0xd97706,
      emissive: 0xd97706,
      emissiveIntensity: 1.2,
    });
    alarmBeacons.push(beaconMat);
    const fixture = new THREE.Mesh(new THREE.SphereGeometry(0.22, 10, 10), beaconMat);
    fixture.position.set(0, 1.65, z);
    shipGroup.add(fixture);

    const ptLight = new THREE.PointLight(0xffedd5, 6, 18);
    ptLight.position.set(0, 1.3, z);
    shipGroup.add(ptLight);
    alarmLights.push(ptLight);
  });

  // Bridge Warm Instrument Light
  const bridgeLight = new THREE.PointLight(0x38bdf8, 8, 16);
  bridgeLight.position.set(0, 12.8, 23.5);
  shipGroup.add(bridgeLight);

  // Interactive Ship Terminals
  terminals.push(
    {
      id: 'term_photo_txt_analyzer',
      title: 'Blackbox Forensik-Computer (.JPG ➔ .TXT)',
      subtitle: 'Kommandobrücke // Geheimfoto in .txt umbenennen & Schwachstellen auslesen',
      actionLabel: '[E] FOTO ➔ .TXT ANALYSATOR ÖFFNEN',
      type: 'analyzer',
      localPos: new THREE.Vector3(-2.4, 11.4, 21.2),
    },
    {
      id: 'term_bridge_bulkheads',
      title: 'Zentrale Schotten-Steuerung (Master Control)',
      subtitle: 'Kommandobrücke // Alle 3 hydraulischen Wasserschutz-Türen im Unterdeck umschalten',
      actionLabel: '[E] ALLE WASSERSCHOTTEN ÖFFNEN / SCHLIESSEN',
      type: 'terminal',
      localPos: new THREE.Vector3(2.4, 11.4, 21.2),
    },
    {
      id: 'term_bridge_alarm',
      title: 'Schiffs-Hauptalarm & Notsirene',
      subtitle: 'Kommandobrücke // Akustischer Generalalarm & Rundumleuchten',
      actionLabel: '[E] GENERALALARM EIN / AUS',
      type: 'alarm',
      localPos: new THREE.Vector3(0, 11.4, 21.2),
    },
    {
      id: 'term_engine_bilge',
      title: 'Hochleistungs-Lenzpumpen & Diesel-Konsole',
      subtitle: 'Maschinenraum (Sektion C) // Pumpt eingedrungenes Seewasser aus den Abteilungen',
      actionLabel: '[E] LENZPUMPEN AKTIVIEREN / DEAKTIVIEREN',
      type: 'bilge',
      localPos: new THREE.Vector3(-3.2, -0.9, 13.5),
    },
    {
      id: 'term_armory_crate',
      title: 'Sprengstoff- & Munitions-Depot',
      subtitle: 'Aufbauten-Lobby // Rüstet Spezial-TNT, C4-Ladungen & Granatwerfer auf',
      actionLabel: '[E] VOLLE SPRENGKRAFT & MUNITION AUFLADEN',
      type: 'ammo',
      localPos: new THREE.Vector3(0, 3.0, 23.0),
    },
    {
      id: 'term_lifeboat_launch',
      title: 'Rettungsboot-Davit Steuerung (Backbord)',
      subtitle: 'Mannschaftsdeck (+6m) // Notfall-Evakuierungspunkt bei Schiffsuntergang',
      actionLabel: '[E] RETTUNGSBOOT-AUSSICHTSPUNKT',
      type: 'lifeboat',
      localPos: new THREE.Vector3(-8.0, 6.9, 22.0),
    }
  );

  // Visual Meshes for Terminals
  terminals.forEach((term) => {
    const screenMat = new THREE.MeshStandardMaterial({
      color: term.type === 'analyzer' ? 0xf59e0b : term.type === 'bilge' ? 0x10b981 : 0x38bdf8,
      emissive: term.type === 'analyzer' ? 0xf59e0b : term.type === 'bilge' ? 0x10b981 : 0x38bdf8,
      emissiveIntensity: 1.4,
    });
    const kiosk = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.7, 0.45), screenMat);
    kiosk.position.copy(term.localPos);
    shipGroup.add(kiosk);
  });

  return {
    shipGroup,
    foreHalfGroup,
    aftHalfGroup,
    colliders,
    stairs,
    doors,
    hullNodes,
    explosiveProps,
    terminals,
    compartmentWaterMeshes,
    mainDeckWaterMesh,
    animatedParts: {
      propeller,
      driveShaft,
      flywheel,
      pistons,
      radarMain,
      radarAux,
      helmWheel,
      alarmLights,
      alarmBeacons,
      waterJetMaterials,
    },
  };
}
