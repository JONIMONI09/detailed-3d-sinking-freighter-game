import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';
import {
  AudioSettings,
  CameraMode,
  CompartmentId,
  ControlSettings,
  GraphicsSettings,
  InteractablePrompt,
  PlantedChargeUI,
  ShipTelemetry,
  WeaponType,
} from '../types/game';
import {
  buildCargoShip,
  BuiltCargoShip,
  ShipDoor,
} from '../game/CargoShipBuilder';
import { soundEngine } from '../audio/SoundEngine';

export interface SimulationCommandRef {
  triggerDetonateC4: () => void;
  triggerInteract: () => void;
  triggerLockHold?: (holding: boolean) => void;
  triggerToggleLock?: () => void;
  triggerFireWeapon: () => void;
  triggerJump: () => void;
  triggerToggleFlashlight: () => void;
  triggerToggleCamera: () => void;
  triggerSelectWeapon: (w: WeaponType) => void;
  triggerTeleportToDeck: (deck: 'bridge' | 'main' | 'hold' | 'engine' | 'bow') => void;
  triggerCreateTestBreach: (compartment: CompartmentId, side: 'port' | 'starboard') => void;
  triggerToggleAllBulkheads: () => void;
  triggerToggleBilgePumps: () => void;
  triggerToggleAlarm: () => void;
  triggerRepairAll: () => void;
  triggerResetShip: () => void;
  triggerInstantKeelBreach: () => void;
  setTouchMoveVector: (vx: number, vz: number) => void;
  addTouchLookDelta: (dx: number, dy: number) => void;
}

interface MaritimeViewport3DProps {
  graphics: GraphicsSettings;
  audio: AudioSettings;
  controls: ControlSettings;
  overchargedUnlocked: boolean;
  isModalOpen: boolean;
  onUpdateTelemetry: (telemetry: ShipTelemetry) => void;
  onOpenPhotoAnalyzer: () => void;
  commandRef: React.MutableRefObject<SimulationCommandRef | null>;
}

interface ActiveCharge {
  id: string;
  type: 'tnt' | 'c4';
  localPos: THREE.Vector3;
  remainingTime: number;
  lastBeepSecond: number;
  mesh: THREE.Group;
  light: THREE.PointLight;
  deckLabel: string;
}

interface ActiveProjectile {
  mesh: THREE.Mesh;
  localPos: THREE.Vector3;
  localVel: THREE.Vector3;
  age: number;
}

interface ExplosionParticle {
  mesh: THREE.Mesh;
  vel: THREE.Vector3;
  age: number;
  maxAge: number;
  scaleRate: number;
  gravity: number;
}

export const MaritimeViewport3D: React.FC<MaritimeViewport3DProps> = ({
  graphics,
  audio,
  controls,
  overchargedUnlocked,
  isModalOpen,
  onUpdateTelemetry,
  onOpenPhotoAnalyzer,
  commandRef,
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);

  // Latest reactive props stored in refs for zero-rebind access inside 60fps requestAnimationFrame
  const graphicsRef = useRef<GraphicsSettings>(graphics);
  const audioRef = useRef<AudioSettings>(audio);
  const controlsRef = useRef<ControlSettings>(controls);
  const overchargedRef = useRef<boolean>(overchargedUnlocked);
  const isModalOpenRef = useRef<boolean>(isModalOpen);

  useEffect(() => {
    graphicsRef.current = graphics;
  }, [graphics]);

  useEffect(() => {
    audioRef.current = audio;
    soundEngine.updateSettings(audio);
  }, [audio]);

  useEffect(() => {
    controlsRef.current = controls;
  }, [controls]);

  useEffect(() => {
    overchargedRef.current = overchargedUnlocked;
  }, [overchargedUnlocked]);

  useEffect(() => {
    isModalOpenRef.current = isModalOpen;
    if (isModalOpen && document.pointerLockElement) {
      document.exitPointerLock();
    }
  }, [isModalOpen]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // =========================================================================
    // 1. INITIALIZE THREE.JS SCENE, CAMERA & RENDERER
    // =========================================================================
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0f172a);
    scene.fog = new THREE.FogExp2(0x0f172a, 0.0045);

    const camera = new THREE.PerspectiveCamera(
      graphicsRef.current.fov,
      container.clientWidth / Math.max(1, container.clientHeight),
      0.15,
      650
    );

    const renderer = new THREE.WebGLRenderer({
      antialias: graphicsRef.current.antiAliasing,
      powerPreference: 'high-performance',
    });
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.setPixelRatio(
      Math.min(window.devicePixelRatio || 1, 2) * graphicsRef.current.resolutionScale
    );
    renderer.shadowMap.enabled = graphicsRef.current.shadowQuality !== 'off';
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.1;

    container.innerHTML = '';
    container.appendChild(renderer.domElement);

    // WebGL Context Loss Safeguard
    const handleContextLost = (e: Event) => {
      e.preventDefault();
      console.warn('[WebGL] Context Lost intercepted safely.');
    };
    renderer.domElement.addEventListener('webglcontextlost', handleContextLost, false);

    // =========================================================================
    // 2. LIGHTING, SKY DOME & WEATHER SYSTEM
    // =========================================================================
    const ambientLight = new THREE.HemisphereLight(0xbae6fd, 0x0f172a, 0.85);
    scene.add(ambientLight);

    const dirLight = new THREE.DirectionalLight(0xffedd5, 2.2);
    dirLight.position.set(85, 110, -70);
    dirLight.castShadow = true;
    dirLight.shadow.camera.near = 10;
    dirLight.shadow.camera.far = 280;
    const d = 65;
    dirLight.shadow.camera.left = -d;
    dirLight.shadow.camera.right = d;
    dirLight.shadow.camera.top = d;
    dirLight.shadow.camera.bottom = -d;
    dirLight.shadow.mapSize.set(1024, 1024);
    dirLight.shadow.bias = -0.0005;
    scene.add(dirLight);

    // Player Tactical Flashlight attached to Camera
    const flashlight = new THREE.SpotLight(0xf8fafc, 0, 42, Math.PI / 5.5, 0.45, 1.2);
    flashlight.position.set(0.2, -0.1, 0);
    flashlight.target.position.set(0, -0.1, -10);
    camera.add(flashlight);
    camera.add(flashlight.target);
    scene.add(camera);

    // =========================================================================
    // 3. DYNAMIC GERSTNER WAVE OCEAN SURFACE
    // =========================================================================
    const oceanSegments = graphicsRef.current.waterQuality === 'low' ? 48 : 96;
    const oceanGeom = new THREE.PlaneGeometry(520, 520, oceanSegments, oceanSegments);
    oceanGeom.rotateX(-Math.PI / 2);
    const oceanBasePos = Float32Array.from(
      (oceanGeom.attributes.position as THREE.BufferAttribute).array
    );

    const oceanMat = new THREE.MeshPhysicalMaterial({
      color: 0x0369a1,
      emissive: 0x082f49,
      emissiveIntensity: 0.35,
      roughness: 0.18,
      metalness: 0.15,
      transmission: 0.25,
      transparent: true,
      opacity: 0.92,
      flatShading: false,
    });
    const oceanMesh = new THREE.Mesh(oceanGeom, oceanMat);
    oceanMesh.receiveShadow = true;
    scene.add(oceanMesh);

    // Deep Abyssal Seafloor Plane below
    const seaFloor = new THREE.Mesh(
      new THREE.PlaneGeometry(600, 600),
      new THREE.MeshBasicMaterial({ color: 0x020617 })
    );
    seaFloor.rotation.x = -Math.PI / 2;
    seaFloor.position.y = -38;
    scene.add(seaFloor);

    // =========================================================================
    // 4. BUILD THE 3D CARGO SHIP & COLLISION DEBUG WIREFRAMES
    // =========================================================================
    const ship: BuiltCargoShip = buildCargoShip();
    scene.add(ship.shipGroup);

    const debugGroup = new THREE.Group();
    debugGroup.visible = false;
    ship.shipGroup.add(debugGroup);

    const rebuildDebugWireframes = () => {
      while (debugGroup.children.length > 0) {
        debugGroup.remove(debugGroup.children[0]);
      }
      const wireMatSolid = new THREE.MeshBasicMaterial({
        color: 0x10b981,
        wireframe: true,
      });
      const wireMatDoor = new THREE.MeshBasicMaterial({
        color: 0xf59e0b,
        wireframe: true,
      });
      ship.colliders.forEach((col) => {
        const sx = col.maxX - col.minX;
        const sy = col.maxY - col.minY;
        const sz = col.maxZ - col.minZ;
        const m = new THREE.Mesh(
          new THREE.BoxGeometry(sx, sy, sz),
          col.doorId ? wireMatDoor : wireMatSolid
        );
        m.position.set(
          (col.minX + col.maxX) / 2,
          (col.minY + col.maxY) / 2,
          (col.minZ + col.maxZ) / 2
        );
        debugGroup.add(m);
      });
    };
    rebuildDebugWireframes();

    // =========================================================================
    // 5. FIRST-PERSON 3D ANIMATED WEAPON / TOOL VIEWMODELS IN PLAYER HAND
    // =========================================================================
    const weaponRoot = new THREE.Group();
    weaponRoot.position.set(0.34, -0.28, -0.52);
    camera.add(weaponRoot);

    const weaponMeshes: Record<WeaponType, THREE.Group> = {
      tnt: new THREE.Group(),
      c4: new THREE.Group(),
      rpg: new THREE.Group(),
      shotgun: new THREE.Group(),
      welder: new THREE.Group(),
    };

    // [1] TNT Dynamite Bundle Viewmodel
    const tntMat = new THREE.MeshStandardMaterial({ color: 0xdc2626, roughness: 0.5 });
    const tapeMat = new THREE.MeshStandardMaterial({ color: 0x111827, roughness: 0.7 });
    const ledMat = new THREE.MeshBasicMaterial({ color: 0xff0000 });
    for (let i = -1; i <= 1; i++) {
      const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.032, 0.032, 0.28, 10), tntMat);
      stick.rotation.x = Math.PI / 2;
      stick.position.set(i * 0.055, 0, 0);
      weaponMeshes.tnt.add(stick);
    }
    const tape = new THREE.Mesh(new THREE.BoxGeometry(0.19, 0.08, 0.06), tapeMat);
    const timerBox = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.045, 0.08), ledMat);
    timerBox.position.set(0, 0.045, 0);
    weaponMeshes.tnt.add(tape, timerBox);
    weaponRoot.add(weaponMeshes.tnt);

    // [2] C4 Remote Charge + Detonator Clacker Viewmodel
    const c4Mat = new THREE.MeshStandardMaterial({ color: 0x65a30d, roughness: 0.55 });
    const c4Block = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.09, 0.24), c4Mat);
    const clacker = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.14, 0.05), tapeMat);
    clacker.position.set(-0.16, 0.03, 0.05);
    const clackerAntenna = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.12), ledMat);
    clackerAntenna.position.set(-0.16, 0.12, 0.05);
    weaponMeshes.c4.add(c4Block, clacker, clackerAntenna);
    weaponRoot.add(weaponMeshes.c4);

    // [3] M32 Marine Grenade/Rocket Launcher Viewmodel
    const gunMetal = new THREE.MeshStandardMaterial({
      color: 0x1e293b,
      roughness: 0.35,
      metalness: 0.8,
    });
    const barrelOrange = new THREE.MeshStandardMaterial({
      color: 0xea580c,
      roughness: 0.4,
      metalness: 0.6,
    });
    const rpgTube = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, 0.62, 14), gunMetal);
    rpgTube.rotation.x = Math.PI / 2;
    const rpgDrum = new THREE.Mesh(new THREE.CylinderGeometry(0.095, 0.095, 0.18, 12), barrelOrange);
    rpgDrum.rotation.x = Math.PI / 2;
    rpgDrum.position.set(0, -0.02, 0.06);
    weaponMeshes.rpg.add(rpgTube, rpgDrum);
    weaponRoot.add(weaponMeshes.rpg);

    // [4] MK-18 Tactical Breacher Shotgun Viewmodel
    const sgBody = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.08, 0.54), gunMetal);
    const sgBarrel = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.58, 10), gunMetal);
    sgBarrel.rotation.x = Math.PI / 2;
    sgBarrel.position.set(0, 0.03, -0.05);
    weaponMeshes.shotgun.add(sgBody, sgBarrel);
    weaponRoot.add(weaponMeshes.shotgun);

    // [5] Plasma Hull Welder & Repair Torch Viewmodel
    const weldMat = new THREE.MeshStandardMaterial({ color: 0x059669, roughness: 0.4, metalness: 0.5 });
    const tipGlowMat = new THREE.MeshBasicMaterial({ color: 0x38bdf8 });
    const weldBody = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.12, 0.34), weldMat);
    const weldNozzle = new THREE.Mesh(new THREE.ConeGeometry(0.028, 0.14, 10), tipGlowMat);
    weldNozzle.rotation.x = -Math.PI / 2;
    weldNozzle.position.set(0, 0.02, -0.22);
    weaponMeshes.welder.add(weldBody, weldNozzle);
    weaponRoot.add(weaponMeshes.welder);

    const setActiveWeaponVisual = (w: WeaponType) => {
      (Object.keys(weaponMeshes) as WeaponType[]).forEach((k) => {
        weaponMeshes[k].visible = k === w;
      });
    };
    setActiveWeaponVisual('tnt');

    // =========================================================================
    // 6. SIMULATION STATE & PLAYER PHYSICS STATE (IN SHIP-LOCAL SPACE!)
    // =========================================================================
    let activeWeapon: WeaponType = 'tnt';
    let cameraMode: CameraMode = 'fpv';
    let flashlightOn = false;

    // Player starts on Main Deck at Z = +17.5m looking forward toward the Midship Access Door & Containers!
    const playerLocalPos = new THREE.Vector3(0, 2.22, 17.5);
    const playerLocalVel = new THREE.Vector3(0, 0, 0);
    let playerYaw = 0; // 0 looks toward -Z (Bow)
    let playerPitch = -0.05;
    let playerGrounded = true;
    let playerCrouching = false;
    let weaponRecoil = 0;
    let walkBobTimer = 0;
    let cameraShakeIntensity = 0;

    // Orbit Camera spherical coords
    let orbitYaw = 0.65;
    let orbitPitch = 0.35;
    let orbitDistance = 68;

    // Ship Hydrodynamic & Compartment Flooding State
    const compFlood: Record<CompartmentId, number> = {
      bow: 0,
      midFwd: 0,
      midAft: 0,
      stern: 0,
    };
    const compIntegrity: Record<CompartmentId, number> = {
      bow: 100,
      midFwd: 100,
      midAft: 100,
      stern: 100,
    };
    let portDamageWeight = 0;
    let stbdDamageWeight = 0;
    let currentPitchRad = 0;
    let currentRollRad = 0;
    let currentSinkDepth = 0;
    let mainDeckFlood = 0; // % flooding on the main deck corridors (0 to 100)
    let isHoldingKeyL = false;
    let hasToggledLockThisHold = false;
    let doorLockHoldProgress = 0;
    let bendingStressPercent = 0;
    let bilgePumpsOn = false;
    let generalAlarmOn = false;
    let engineRunning = true;
    let shipBrokenInHalf = false;
    let totalExplosions = 0;
    let lastEventMessage = 'MS POSEIDON VII ready. All doors & bulkheads operable with [E] (no clipping!).';

    const activeCharges: ActiveCharge[] = [];
    const activeProjectiles: ActiveProjectile[] = [];
    const explosionParticles: ExplosionParticle[] = [];
    let nearbyInteractable: InteractablePrompt | null = null;
    let nearbyDoorRef: ShipDoor | null = null;
    let nearbyTerminalId: string | null = null;

    // Input Tracking
    const keys: Record<string, boolean> = {};
    const touchMove = { x: 0, z: 0 };

    // =========================================================================
    // 7. EXPLOSION, BREACH & DEMOLITION ENGINE
    // =========================================================================
    const spawnExplosionParticles = (worldPos: THREE.Vector3, scale = 1.0) => {
      const density = graphicsRef.current.particleDensity;
      const count = Math.max(8, Math.floor(26 * density * scale));

      for (let i = 0; i < count; i++) {
        const isFire = i < count * 0.55;
        const size = (isFire ? 0.45 : 0.25) * scale * (0.6 + Math.random() * 0.8);
        const geom = isFire
          ? new THREE.SphereGeometry(size, 6, 6)
          : new THREE.BoxGeometry(size, size, size);
        const color = isFire
          ? Math.random() > 0.4
            ? 0xf97316
            : 0xfef08a
          : 0x334155;
        const mat = new THREE.MeshBasicMaterial({
          color,
          transparent: true,
          opacity: 0.95,
        });
        const mesh = new THREE.Mesh(geom, mat);
        mesh.position.copy(worldPos);
        scene.add(mesh);

        const speed = (4 + Math.random() * 14) * scale;
        const theta = Math.random() * Math.PI * 2;
        const phi = Math.random() * Math.PI * 0.75;
        const vel = new THREE.Vector3(
          Math.sin(phi) * Math.cos(theta) * speed,
          Math.cos(phi) * speed + 3,
          Math.sin(phi) * Math.sin(theta) * speed
        );

        explosionParticles.push({
          mesh,
          vel,
          age: 0,
          maxAge: 0.55 + Math.random() * 0.85,
          scaleRate: isFire ? 2.4 : 0.2,
          gravity: isFire ? -2.0 : 18.0,
        });
      }
    };

    const getCompartmentAtZ = (z: number): CompartmentId => {
      if (z < -16) return 'bow';
      if (z < 3) return 'midFwd';
      if (z < 22) return 'midAft';
      return 'stern';
    };

    const getDeckNameAtPos = (pos: THREE.Vector3): string => {
      if (pos.y < 1.2) {
        const comp = getCompartmentAtZ(pos.z);
        if (comp === 'bow') return 'Lower Deck // Section A (Bow Cargo Hold)';
        if (comp === 'midFwd') return 'Lower Deck // Section B (Main Cargo Hold)';
        if (comp === 'midAft') return 'Lower Deck // Section C (Engine Room)';
        return 'Lower Deck // Section D (Stern Shaft Tunnel)';
      }
      if (pos.y < 5.2) {
        if (pos.z < -20) return 'Main Deck // Foredeck (Bow)';
        if (pos.z < 18) return 'Main Deck // Container Cargo Deck';
        return 'Main Deck // Stern Superstructure';
      }
      if (pos.y < 9.2) return 'Mannschaftsdeck (+6m // Quartiere & Rettungsboote)';
      return 'Bridge (+10m // Navigation & Bulkhead Control)';
    };

    const triggerDetonationAtLocalPos = (
      localPos: THREE.Vector3,
      powerRadius = 6.5,
      sourceName = 'TNT-Sprengladung'
    ) => {
      const effectiveRadius = overchargedRef.current ? powerRadius * 1.75 : powerRadius;
      const worldPos = localPos.clone();
      ship.shipGroup.localToWorld(worldPos);

      totalExplosions += 1;
      soundEngine.playExplosion(overchargedRef.current ? 1.35 : 1.0, worldPos.y < 0);
      spawnExplosionParticles(worldPos, overchargedRef.current ? 1.5 : 1.0);

      // Camera Shake scaled by distance
      const distToPlayer = playerLocalPos.distanceTo(localPos);
      if (graphicsRef.current.cameraShake) {
        cameraShakeIntensity = Math.min(
          1.4,
          cameraShakeIntensity + Math.max(0.15, (18 - distToPlayer) / 14)
        );
      }

      // 1. Realistic Hull Breach Check (Stormworks Contact Physics)
      // Explosions on upper decks (Main Deck y >= 0.8m, Bridge, Crew Deck) are absorbed by thick armored steel deck plates!
      // Only underwater/bilge explosions (y < 0.8m) or direct outer-plating strikes breach hull nodes.
      let newBreaches = 0;
      const isUnderKeelOrBilge = localPos.y < 0.8;
      const isDirectHullContact = Math.abs(localPos.x) > 7.5 && localPos.y < 2.0;

      if (isUnderKeelOrBilge || isDirectHullContact) {
        ship.hullNodes.forEach((node) => {
          const d = node.localPos.distanceTo(localPos);
          // Only breach nodes within direct contact range (3.8m standard, 5.2m overcharged)
          const contactRadius = overchargedRef.current ? 5.2 : 3.8;
          if (d <= contactRadius) {
            if (!node.breached) newBreaches++;
            node.breached = true;
            node.severity = Math.min(1.0, node.severity + (overchargedRef.current ? 0.85 : 0.45));
            node.intactMesh.visible = false;
            node.breachGroup.visible = true;

            compIntegrity[node.compartment] = Math.max(
              0,
              compIntegrity[node.compartment] - (overchargedRef.current ? 25 : 14)
            );
            if (node.side === 'port') portDamageWeight += 0.35;
            if (node.side === 'starboard') stbdDamageWeight += 0.35;
          }
        });
      }

      // 2. Check Doors within blast radius -> Blast open unlocked doors, or direct point-blank breach on locked doors
      ship.doors.forEach((door) => {
        const d = door.localPosition.distanceTo(localPos);
        if (door.locked) {
          // Watertight locked doors only break under direct point-blank blast (d < 1.8m)
          if (d < (overchargedRef.current ? 2.8 : 1.8)) {
            door.locked = false;
            door.isOpen = true;
            door.health = 0;
            if (door.statusLightMat) {
              door.statusLightMat.color.setHex(0x10b981);
              door.statusLightMat.emissive.setHex(0x10b981);
            }
          }
        } else if (d <= effectiveRadius * 0.95) {
          door.isOpen = true;
          door.health = 0;
        }
      });

      // 3. Chain-react nearby Red Explosive Fuel Barrels!
      ship.explosiveProps.forEach((prop) => {
        if (!prop.exploded && prop.localPos.distanceTo(localPos) <= effectiveRadius * 1.1) {
          prop.exploded = true;
          prop.mesh.visible = false;
          setTimeout(() => {
            triggerDetonationAtLocalPos(prop.localPos, 7.5, 'Treibstofffass-Kettenreaktion');
          }, 160);
        }
      });

      // 4. Check Engine Block damage in Compartment C (Engine relocated to Z = 17.5m)
      if (localPos.distanceTo(new THREE.Vector3(0, -0.7, 17.5)) < effectiveRadius) {
        engineRunning = false;
      }

      if (newBreaches > 0) {
        generalAlarmOn = true;
        lastEventMessage = `RUMPFBRUCH DURCH ${sourceName.toUpperCase()}! Wassereinbruch in ${getDeckNameAtPos(localPos)}!`;
      } else {
        lastEventMessage = `${sourceName} detoniert in ${getDeckNameAtPos(localPos)}!`;
      }
    };

    // =========================================================================
    // 8. WEAPON FIRING, TNT PLANTING, C4 DETONATION & PLASMA WELDING
    // =========================================================================
    const raycaster = new THREE.Raycaster();

    const getAimHitLocalPos = (maxDist = 6.0): THREE.Vector3 => {
      raycaster.setFromCamera(new THREE.Vector2(0, 0), camera);
      const intersects = raycaster.intersectObjects(ship.shipGroup.children, true);
      for (const hit of intersects) {
        if (hit.distance <= maxDist && hit.distance > 0.3) {
          const localPt = hit.point.clone();
          ship.shipGroup.worldToLocal(localPt);
          return localPt;
        }
      }
      // Fallback: 2.2 meters in front of player in ship local coords
      const forward = new THREE.Vector3(
        -Math.sin(playerYaw) * Math.cos(playerPitch),
        Math.sin(playerPitch),
        -Math.cos(playerYaw) * Math.cos(playerPitch)
      ).normalize();
      return playerLocalPos
        .clone()
        .add(new THREE.Vector3(0, 0.8, 0))
        .addScaledVector(forward, 2.0);
    };

    const plantExplosiveCharge = (type: 'tnt' | 'c4') => {
      if (type === 'c4' && activeCharges.filter((c) => c.type === 'c4').length >= 15) {
        lastEventMessage = 'Maximum 15 C4 charges placed! Press [G] or right-click to detonate!';
        return;
      }

      soundEngine.playPlantCharge();
      weaponRecoil = 0.18;
      const plantPos = getAimHitLocalPos(5.5);

      const chargeGroup = new THREE.Group();
      chargeGroup.position.copy(plantPos);

      const packMesh = new THREE.Mesh(
        new THREE.BoxGeometry(0.36, 0.22, 0.48),
        new THREE.MeshStandardMaterial({
          color: type === 'tnt' ? 0xdc2626 : 0x65a30d,
          roughness: 0.4,
        })
      );
      const beaconMesh = new THREE.Mesh(
        new THREE.SphereGeometry(0.08, 8, 8),
        new THREE.MeshBasicMaterial({ color: type === 'tnt' ? 0xff0000 : 0xf59e0b })
      );
      beaconMesh.position.y = 0.14;
      chargeGroup.add(packMesh, beaconMesh);

      const ptLight = new THREE.PointLight(type === 'tnt' ? 0xef4444 : 0xf59e0b, 3, 5);
      ptLight.position.y = 0.25;
      chargeGroup.add(ptLight);

      ship.shipGroup.add(chargeGroup);

      activeCharges.push({
        id: `charge_${Date.now()}_${Math.random()}`,
        type,
        localPos: plantPos,
        remainingTime: type === 'tnt' ? 5.0 : 9999,
        lastBeepSecond: 5,
        mesh: chargeGroup,
        light: ptLight,
        deckLabel: getDeckNameAtPos(plantPos).split('//')[0].trim(),
      });

      lastEventMessage =
        type === 'tnt'
          ? 'TNT-Ladung scharf! Detonation in 5.0 Sekunden!'
          : 'C4 charge placed! Detonate with [G] or right-click!';
    };

    const detonateAllC4 = () => {
      const c4List = activeCharges.filter((c) => c.type === 'c4');
      if (c4List.length === 0) {
        soundEngine.playC4Clacker();
        lastEventMessage = 'Keine aktiven C4-Ladungen platziert. Mit Linksklick C4 anbringen!';
        return;
      }

      soundEngine.playC4Clacker();
      weaponRecoil = 0.22;

      c4List.forEach((charge, idx) => {
        const indexInActive = activeCharges.indexOf(charge);
        if (indexInActive !== -1) activeCharges.splice(indexInActive, 1);

        setTimeout(() => {
          ship.shipGroup.remove(charge.mesh);
          triggerDetonationAtLocalPos(charge.localPos, 7.2, `C4 Remote Detonation #${idx + 1}`);
        }, idx * 130);
      });
    };

    const fireCurrentWeapon = () => {
      soundEngine.init();

      if (activeWeapon === 'tnt') {
        plantExplosiveCharge('tnt');
        return;
      }
      if (activeWeapon === 'c4') {
        plantExplosiveCharge('c4');
        return;
      }

      if (activeWeapon === 'rpg') {
        soundEngine.playWeaponFire('rpg');
        weaponRecoil = 0.35;
        const startPos = playerLocalPos.clone().add(new THREE.Vector3(0, 1.15, 0));
        const forward = new THREE.Vector3(
          -Math.sin(playerYaw) * Math.cos(playerPitch),
          Math.sin(playerPitch),
          -Math.cos(playerYaw) * Math.cos(playerPitch)
        ).normalize();

        const projMesh = new THREE.Mesh(
          new THREE.SphereGeometry(0.16, 8, 8),
          new THREE.MeshBasicMaterial({ color: 0xf97316 })
        );
        projMesh.position.copy(startPos);
        ship.shipGroup.add(projMesh);

        activeProjectiles.push({
          mesh: projMesh,
          localPos: startPos,
          localVel: forward.multiplyScalar(36),
          age: 0,
        });
        return;
      }

      if (activeWeapon === 'shotgun') {
        soundEngine.playWeaponFire('shotgun');
        weaponRecoil = 0.28;
        const hitLocal = getAimHitLocalPos(28.0);
        const hitWorld = hitLocal.clone();
        ship.shipGroup.localToWorld(hitWorld);
        spawnExplosionParticles(hitWorld, 0.32);

        // Check if shotgun hit a locked/closed door -> breach the lock!
        ship.doors.forEach((door) => {
          if (door.localPosition.distanceTo(hitLocal) < 2.2) {
            door.locked = false;
            door.isOpen = !door.isOpen;
            soundEngine.playDoorSound(door.type === 'bulkhead' ? 'bulkhead' : 'hinged', door.isOpen);
            lastEventMessage = `Schrotflinte hat ${door.name} aufgesprengt!`;
          }
        });

        // Check if shotgun hit an explosive barrel!
        ship.explosiveProps.forEach((prop) => {
          if (!prop.exploded && prop.localPos.distanceTo(hitLocal) < 1.8) {
            prop.exploded = true;
            prop.mesh.visible = false;
            triggerDetonationAtLocalPos(prop.localPos, 7.5, 'Durchschossenes Treibstofffass');
          }
        });
        return;
      }

      if (activeWeapon === 'welder') {
        soundEngine.playWeaponFire('welder');
        weaponRecoil = 0.06;
        const hitLocal = getAimHitLocalPos(5.0);
        const hitWorld = hitLocal.clone();
        ship.shipGroup.localToWorld(hitWorld);
        spawnExplosionParticles(hitWorld, 0.18);

        // Repair breached hull nodes nearby!
        let repairedAny = false;
        ship.hullNodes.forEach((node) => {
          if (node.breached && node.localPos.distanceTo(playerLocalPos) < 6.0) {
            node.severity = Math.max(0, node.severity - 0.35);
            compIntegrity[node.compartment] = Math.min(100, compIntegrity[node.compartment] + 15);
            if (node.severity <= 0.02) {
              node.breached = false;
              node.severity = 0;
              node.intactMesh.visible = true;
              node.breachGroup.visible = false;
            }
            repairedAny = true;
          }
        });

        // Also unlock jammed/locked doors with plasma cutter
        ship.doors.forEach((door) => {
          if (door.locked && door.localPosition.distanceTo(playerLocalPos) < 3.8) {
            door.locked = false;
            door.isOpen = true;
            repairedAny = true;
            lastEventMessage = `Plasma-Brenner hat Schloss von "${door.name}" durchtrennt!`;
          }
        });

        if (repairedAny) {
          lastEventMessage = 'Hull leak sealed with the plasma welder! Water ingress reduced!';
        } else {
          lastEventMessage = 'Welder active — move close to a hull leak on the lower deck to seal it!';
        }
      }
    };

    const completeDoorLockToggle = (door: ShipDoor) => {
      soundEngine.init();
      if (door.locked || door.watertight) {
        door.locked = false;
        door.watertight = false;
        if (door.statusLightMat) {
          const unlockedCol = door.type === 'bulkhead' ? 0xf59e0b : 0x10b981;
          door.statusLightMat.color.setHex(unlockedCol);
          door.statusLightMat.emissive.setHex(unlockedCol);
        }
        soundEngine.playDoorSound('hinged', true);
        lastEventMessage = `${door.name} ENTRIEGELT & FREIGEGEBEN!`;
      } else {
        door.isOpen = false;
        door.locked = true;
        door.watertight = true;
        if (door.statusLightMat) {
          door.statusLightMat.color.setHex(0xef4444);
          door.statusLightMat.emissive.setHex(0xef4444);
        }
        soundEngine.playDoorSound('locked', false);
        lastEventMessage = `${door.name} WASSERDICHT VERRIEGELT!`;
      }
    };

    // =========================================================================
    // 9. INTERACTION HANDLER ([E] FOR DOORS, BULKHEADS & SHIP TERMINALS)
    // =========================================================================
    const triggerInteractAction = () => {
      soundEngine.init();

      if (nearbyDoorRef) {
        const door = nearbyDoorRef;
        if (door.locked || door.watertight) {
          soundEngine.playDoorSound('locked', false);
          lastEventMessage = `"${door.name}" is WATERTIGHT LOCKED! Hold [L] to unlock.`;
          return;
        }

        door.isOpen = !door.isOpen;
        soundEngine.playDoorSound(
          door.type === 'bulkhead' ? 'bulkhead' : 'hinged',
          door.isOpen
        );
        lastEventMessage = `${door.name} ${door.isOpen ? 'OPEN' : 'CLOSED'}.`;
        return;
      }

      if (nearbyTerminalId) {
        soundEngine.playUiClick();
        if (nearbyTerminalId === 'term_photo_txt_analyzer') {
          onOpenPhotoAnalyzer();
          return;
        }
        if (nearbyTerminalId === 'term_bridge_bulkheads') {
          const bulkheads = ship.doors.filter((d) => d.type === 'bulkhead');
          const anyOpen = bulkheads.some((d) => d.isOpen);
          bulkheads.forEach((d) => {
            d.isOpen = !anyOpen;
          });
          soundEngine.playDoorSound('bulkhead', !anyOpen);
          lastEventMessage = !anyOpen
            ? 'CENTRAL: All 3 watertight bulkheads on the lower deck OPENED!'
            : 'CENTRAL: All 3 watertight bulkheads on the lower deck LOCKED!';
          return;
        }
        if (nearbyTerminalId === 'term_bridge_alarm') {
          generalAlarmOn = !generalAlarmOn;
          if (generalAlarmOn) soundEngine.playAlarmKlaxon();
          lastEventMessage = generalAlarmOn
            ? 'GENERALALARM AKTIVIert! Alle Stationen in Bereitschaft!'
            : 'Generalalarm abgeschaltet.';
          return;
        }
        if (nearbyTerminalId === 'term_engine_bilge') {
          bilgePumpsOn = !bilgePumpsOn;
          lastEventMessage = bilgePumpsOn
            ? 'HIGH-CAPACITY BILGE PUMPS ACTIVE! Seawater is being pumped out!'
            : 'Lenzpumpen deaktiviert.';
          return;
        }
        if (nearbyTerminalId === 'term_armory_crate') {
          lastEventMessage = 'Ammunition depot: all TNT, C4 & grenade launcher ammo fully restocked!';
          soundEngine.playPlantCharge();
          return;
        }
        if (nearbyTerminalId === 'term_lifeboat_launch') {
          cameraMode = cameraMode === 'fpv' ? 'orbit' : 'fpv';
          lastEventMessage =
            cameraMode === 'orbit'
              ? 'Exterior camera (lifeboat view) activated!'
              : 'Back to the first-person deck view.';
          return;
        }
      }
    };

    // =========================================================================
    // 10. EXPOSE IMPERATIVE COMMANDS FOR UI & TOUCH CONTROLS
    // =========================================================================
    const resetEntireShip = () => {
      compFlood.bow = 0;
      compFlood.midFwd = 0;
      compFlood.midAft = 0;
      compFlood.stern = 0;
      mainDeckFlood = 0;
      doorLockHoldProgress = 0;
      bendingStressPercent = 0;
      if (ship.mainDeckWaterMesh) ship.mainDeckWaterMesh.visible = false;
      compIntegrity.bow = 100;
      compIntegrity.midFwd = 100;
      compIntegrity.midAft = 100;
      compIntegrity.stern = 100;
      portDamageWeight = 0;
      stbdDamageWeight = 0;
      currentPitchRad = 0;
      currentRollRad = 0;
      currentSinkDepth = 0;
      bilgePumpsOn = false;
      generalAlarmOn = false;
      engineRunning = true;
      shipBrokenInHalf = false;

      ship.hullNodes.forEach((node) => {
        node.breached = false;
        node.severity = 0;
        node.intactMesh.visible = true;
        node.breachGroup.visible = false;
      });

      ship.explosiveProps.forEach((prop) => {
        prop.exploded = false;
        prop.mesh.visible = true;
      });

      ship.doors.forEach((door) => {
        door.isOpen = false;
        door.openProgress = 0;
        door.locked = door.id === 'door_captain_cabin';
        door.health = door.maxHealth;
      });

      while (activeCharges.length > 0) {
        const c = activeCharges.pop()!;
        ship.shipGroup.remove(c.mesh);
      }

      playerLocalPos.set(0, 2.22, 17.5);
      playerLocalVel.set(0, 0, 0);
      playerYaw = 0;
      playerPitch = -0.05;
      lastEventMessage = 'MS POSEIDON VII fully restored & refitted!';
    };

    commandRef.current = {
      triggerDetonateC4: detonateAllC4,
      triggerInteract: triggerInteractAction,
      triggerLockHold: (holding: boolean) => {
        isHoldingKeyL = holding;
        if (!holding) {
          hasToggledLockThisHold = false;
          doorLockHoldProgress = 0;
        }
      },
      triggerToggleLock: () => {
        if (nearbyDoorRef) {
          completeDoorLockToggle(nearbyDoorRef);
        }
      },
      triggerFireWeapon: fireCurrentWeapon,
      triggerJump: () => {
        if (playerGrounded) {
          playerLocalVel.y = 7.4;
          playerGrounded = false;
        } else if (playerLocalPos.y - currentSinkDepth < 0.5) {
          // Swim upwards when underwater
          playerLocalVel.y = 5.5;
        }
      },
      triggerToggleFlashlight: () => {
        flashlightOn = !flashlightOn;
        flashlight.intensity = flashlightOn ? 18 : 0;
        soundEngine.playUiClick();
      },
      triggerToggleCamera: () => {
        cameraMode = cameraMode === 'fpv' ? 'orbit' : 'fpv';
        soundEngine.playUiClick();
      },
      triggerSelectWeapon: (w: WeaponType) => {
        activeWeapon = w;
        setActiveWeaponVisual(w);
        soundEngine.playUiClick();
      },
      triggerTeleportToDeck: (deck) => {
        soundEngine.playUiClick();
        playerLocalVel.set(0, 0, 0);
        if (deck === 'bridge') {
          playerLocalPos.set(0, 10.25, 24.5);
          playerYaw = 0;
          lastEventMessage = 'Position: Bridge (+10m) – bulkhead control & photo-.TXT computer.';
        } else if (deck === 'main') {
          playerLocalPos.set(0, 2.25, 17.5);
          playerYaw = 0;
          lastEventMessage = 'Position: Main Deck (+2m) – container bay & stairwells.';
        } else if (deck === 'hold') {
          playerLocalPos.set(0, -2.15, -8.0);
          playerYaw = 0;
          lastEventMessage = 'Position: Lower Cargo Hold (Section B, -2.2m) – bulkheads & hull walls.';
        } else if (deck === 'engine') {
          playerLocalPos.set(0, -2.15, 7.5);
          playerYaw = Math.PI;
          lastEventMessage = 'Position: Main Engine Room (Section C, -2.2m) – 12-cylinder diesel & bilge pumps.';
        } else if (deck === 'bow') {
          playerLocalPos.set(0, 2.25, -34.0);
          playerYaw = Math.PI;
          lastEventMessage = 'Position: Vorschiff / Bug (+2m).';
        }
      },
      triggerCreateTestBreach: (compartment, side) => {
        const targetNode = ship.hullNodes.find(
          (n) => n.compartment === compartment && n.side === side && !n.breached
        ) || ship.hullNodes.find((n) => n.compartment === compartment);
        if (targetNode) {
          triggerDetonationAtLocalPos(
            targetNode.localPos,
            7.5,
            `Gezielte Rumpfsprengung (${compartment.toUpperCase()})`
          );
        }
      },
      triggerToggleAllBulkheads: () => {
        const bulkheads = ship.doors.filter((d) => d.type === 'bulkhead');
        const anyOpen = bulkheads.some((d) => d.isOpen);
        bulkheads.forEach((d) => {
          d.isOpen = !anyOpen;
        });
        soundEngine.playDoorSound('bulkhead', !anyOpen);
        lastEventMessage = !anyOpen
          ? 'All 3 watertight bulkheads on the lower deck OPENED!'
          : 'All 3 watertight bulkheads on the lower deck CLOSED!';
      },
      triggerToggleBilgePumps: () => {
        bilgePumpsOn = !bilgePumpsOn;
        soundEngine.playUiClick();
        lastEventMessage = bilgePumpsOn
          ? 'Bilge pumps ACTIVATED – water is being pumped out of the compartments!'
          : 'Lenzpumpen ausgeschaltet.';
      },
      triggerToggleAlarm: () => {
        generalAlarmOn = !generalAlarmOn;
        if (generalAlarmOn) soundEngine.playAlarmKlaxon();
      },
      triggerRepairAll: () => {
        soundEngine.playPlantCharge();
        ship.hullNodes.forEach((node) => {
          node.breached = false;
          node.severity = 0;
          node.intactMesh.visible = true;
          node.breachGroup.visible = false;
        });
        compIntegrity.bow = 100;
        compIntegrity.midFwd = 100;
        compIntegrity.midAft = 100;
        compIntegrity.stern = 100;
        portDamageWeight = 0;
        stbdDamageWeight = 0;
        bilgePumpsOn = true;
        engineRunning = true;
        shipBrokenInHalf = false;
        lastEventMessage = 'Emergency repair crew: all hull leaks sealed & bilge pumps at 100%!';
      },
      triggerResetShip: resetEntireShip,
      triggerInstantKeelBreach: () => {
        // Opens bulkheads and triggers massive twin explosions in Section B & C
        ship.doors.filter((d) => d.type === 'bulkhead').forEach((d) => (d.isOpen = true));
        triggerDetonationAtLocalPos(new THREE.Vector3(-8.8, -1.2, -3.0), 10.0, 'Kielbrecher-Ladung B');
        setTimeout(() => {
          triggerDetonationAtLocalPos(new THREE.Vector3(8.8, -1.2, 11.0), 10.0, 'Kielbrecher-Ladung C');
        }, 220);
      },
      setTouchMoveVector: (vx, vz) => {
        touchMove.x = vx;
        touchMove.z = vz;
      },
      addTouchLookDelta: (dx, dy) => {
        const sens = 0.0042 * controlsRef.current.mouseSensitivity;
        const inv = controlsRef.current.invertY ? -1 : 1;
        if (cameraMode === 'orbit') {
          orbitYaw -= dx * sens;
          orbitPitch = Math.max(0.08, Math.min(1.42, orbitPitch + dy * sens * inv));
        } else {
          playerYaw -= dx * sens;
          playerPitch = Math.max(-1.42, Math.min(1.42, playerPitch - dy * sens * inv));
        }
      },
    };

    // =========================================================================
    // 11. KEYBOARD & MOUSE EVENT LISTENERS
    // =========================================================================
    const onKeyDown = (e: KeyboardEvent) => {
      if (isModalOpenRef.current) return;
      const code = e.code;
      keys[code] = true;

      if (code === 'Digit1') {
        activeWeapon = 'tnt';
        setActiveWeaponVisual('tnt');
        soundEngine.playUiClick();
      } else if (code === 'Digit2') {
        activeWeapon = 'c4';
        setActiveWeaponVisual('c4');
        soundEngine.playUiClick();
      } else if (code === 'Digit3') {
        activeWeapon = 'rpg';
        setActiveWeaponVisual('rpg');
        soundEngine.playUiClick();
      } else if (code === 'Digit4') {
        activeWeapon = 'shotgun';
        setActiveWeaponVisual('shotgun');
        soundEngine.playUiClick();
      } else if (code === 'Digit5') {
        activeWeapon = 'welder';
        setActiveWeaponVisual('welder');
        soundEngine.playUiClick();
      } else if (code === 'KeyE') {
        triggerInteractAction();
      } else if (code === 'KeyL') {
        if (!isHoldingKeyL) {
          isHoldingKeyL = true;
          hasToggledLockThisHold = false;
        }
      } else if (code === 'KeyG') {
        detonateAllC4();
      } else if (code === 'KeyB') {
        // Bridge Master Bulkhead Lockdown
        const anyUnlocked = ship.doors.some((d) => d.type === 'bulkhead' && !d.locked);
        const shouldLock = anyUnlocked;
        ship.doors.forEach((d) => {
          if (d.type === 'bulkhead') {
            d.locked = shouldLock;
            if (shouldLock) {
              d.isOpen = false;
            }
            if (d.statusLightMat) {
              const hex = shouldLock ? 0xef4444 : (d.isOpen ? 0x10b981 : 0xf59e0b);
              d.statusLightMat.color.setHex(hex);
              d.statusLightMat.emissive.setHex(hex);
            }
          }
        });
        soundEngine.playAlarmKlaxon();
        soundEngine.playDoorSound('bulkhead', false);
        lastEventMessage = shouldLock
          ? '🚨 BRIDGE LOCKDOWN ENGAGED // all watertight bulkheads hermetically sealed!'
          : '🔓 BRIDGE LOCKDOWN RELEASED // bulkheads unlocked';
      } else if (code === 'KeyF') {
        flashlightOn = !flashlightOn;
        flashlight.intensity = flashlightOn ? 18 : 0;
        soundEngine.playUiClick();
      } else if (code === 'KeyV') {
        cameraMode = cameraMode === 'fpv' ? 'orbit' : 'fpv';
        soundEngine.playUiClick();
      } else if (code === 'KeyC') {
        playerCrouching = !playerCrouching;
      } else if (code === 'Space') {
        if (playerGrounded) {
          playerLocalVel.y = 7.4;
          playerGrounded = false;
        }
      }
    };

    const onKeyUp = (e: KeyboardEvent) => {
      keys[e.code] = false;
      if (e.code === 'KeyL') {
        isHoldingKeyL = false;
        hasToggledLockThisHold = false;
        doorLockHoldProgress = 0;
      }
    };

    let isDraggingOrbit = false;
    const onMouseDown = (e: MouseEvent) => {
      if (isModalOpenRef.current) return;
      if (e.target !== renderer.domElement) return;
      soundEngine.init();

      if (cameraMode === 'orbit') {
        isDraggingOrbit = true;
        return;
      }

      if (document.pointerLockElement !== renderer.domElement) {
        try {
          const req = renderer.domElement.requestPointerLock() as unknown as Promise<void>;
          if (req && typeof req.catch === 'function') {
            req.catch(() => {});
          }
        } catch {}
        return;
      }

      if (e.button === 0) {
        fireCurrentWeapon();
      } else if (e.button === 2) {
        detonateAllC4();
      }
    };

    const onMouseUp = () => {
      isDraggingOrbit = false;
    };

    const onMouseMove = (e: MouseEvent) => {
      if (isModalOpenRef.current) return;
      const sens = 0.0022 * controlsRef.current.mouseSensitivity;
      const inv = controlsRef.current.invertY ? -1 : 1;

      if (cameraMode === 'orbit' && isDraggingOrbit) {
        orbitYaw -= e.movementX * sens * 1.4;
        orbitPitch = Math.max(0.08, Math.min(1.42, orbitPitch + e.movementY * sens * 1.4 * inv));
        return;
      }

      if (document.pointerLockElement === renderer.domElement) {
        playerYaw -= e.movementX * sens;
        playerPitch = Math.max(-1.45, Math.min(1.45, playerPitch - e.movementY * sens * inv));
      }
    };

    const onWheel = (e: WheelEvent) => {
      if (cameraMode === 'orbit') {
        orbitDistance = Math.max(18, Math.min(140, orbitDistance + e.deltaY * 0.04));
      }
    };

    const onContextMenu = (e: MouseEvent) => {
      if (e.target === renderer.domElement) e.preventDefault();
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('mouseup', onMouseUp);
    window.addEventListener('mousemove', onMouseMove);
    renderer.domElement.addEventListener('mousedown', onMouseDown);
    renderer.domElement.addEventListener('wheel', onWheel, { passive: true });
    renderer.domElement.addEventListener('contextmenu', onContextMenu);

    const onResize = () => {
      if (!container) return;
      const w = container.clientWidth;
      const h = Math.max(1, container.clientHeight);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    window.addEventListener('resize', onResize);

    // =========================================================================
    // 12. STRICT SHIP-LOCAL NO-CLIP COLLISION SOLVER
    // Resolves player capsule against all walls, floors, ceilings, containers & CLOSED DOORS!
    // =========================================================================
    const playerRadius = 0.42;

    const resolvePlayerNoClip = (dt: number) => {
      const eyeHeight = playerCrouching ? 1.05 : 1.65;
      const playerHeight = eyeHeight + 0.15;

      // Apply horizontal velocity in small substeps to prevent high-speed tunneling (100% No-Clip)
      const subSteps = 3;
      const stepDt = dt / subSteps;

      for (let step = 0; step < subSteps; step++) {
        playerLocalPos.x += playerLocalVel.x * stepDt;
        playerLocalPos.z += playerLocalVel.z * stepDt;
        playerLocalPos.y += playerLocalVel.y * stepDt;

        // 1. Check Staircases first for smooth ramp traversal
        let onStair = false;
        for (const st of ship.stairs) {
          if (
            playerLocalPos.x >= st.minX &&
            playerLocalPos.x <= st.maxX &&
            playerLocalPos.z >= st.minZ &&
            playerLocalPos.z <= st.maxZ
          ) {
            const span = st.endZ - st.startZ;
            const rawT = span !== 0 ? (playerLocalPos.z - st.startZ) / span : 0;
            const t = Math.max(0, Math.min(1, rawT));
            const targetY = st.startY + t * (st.endY - st.startY);

            if (Math.abs(playerLocalPos.y - targetY) < 1.35 && playerLocalVel.y <= 0.5) {
              playerLocalPos.y = targetY;
              playerLocalVel.y = 0;
              playerGrounded = true;
              onStair = true;
              break;
            }
          }
        }

        // 2. Test against all Ship LocalColliderBoxes (Walls, Decks, Containers & Closed Doors)
        let supportedFloorY: number | null = onStair ? playerLocalPos.y : null;

        for (const box of ship.colliders) {
          // If collider belongs to a door that is OPEN (> 65%), allow passage through doorway!
          if (box.doorId) {
            const door = ship.doors.find((d) => d.id === box.doorId);
            if (door && door.openProgress > 0.65) continue;
          }
          // If collider belongs to an exploded barrel, skip it
          if (box.destructibleId) {
            const prop = ship.explosiveProps.find((p) => p.id === box.destructibleId);
            if (prop && prop.exploded) continue;
          }

          const pMinY = playerLocalPos.y;
          const pMaxY = playerLocalPos.y + playerHeight;

          // Check X/Z overlap first for floor/ceiling support
          const inXZ =
            playerLocalPos.x + playerRadius * 0.85 > box.minX &&
            playerLocalPos.x - playerRadius * 0.85 < box.maxX &&
            playerLocalPos.z + playerRadius * 0.85 > box.minZ &&
            playerLocalPos.z - playerRadius * 0.85 < box.maxZ;

          if (inXZ) {
            // Landing on top of deck/floor slab (skip overriding when actively walking on a staircase)
            if (
              !onStair &&
              pMinY >= box.maxY - 0.48 &&
              pMinY <= box.maxY + 0.16 &&
              playerLocalVel.y <= 0
            ) {
              if (supportedFloorY === null || box.maxY > supportedFloorY) {
                supportedFloorY = box.maxY;
              }
              continue;
            }

            // Hitting head on ceiling slab
            if (pMaxY > box.minY && pMinY < box.minY && playerLocalVel.y > 0) {
              playerLocalPos.y = box.minY - playerHeight - 0.01;
              playerLocalVel.y = 0;
              continue;
            }
          }

          // Horizontal Wall / Closed Door / Bulkhead / Container Collision
          // Only test walls that vertically intersect the player's body (with 0.35m step-up clearance at feet)
          if (pMaxY > box.minY + 0.15 && pMinY + 0.35 < box.maxY) {
            const closestX = Math.max(box.minX, Math.min(playerLocalPos.x, box.maxX));
            const closestZ = Math.max(box.minZ, Math.min(playerLocalPos.z, box.maxZ));

            const dx = playerLocalPos.x - closestX;
            const dz = playerLocalPos.z - closestZ;
            const distSq = dx * dx + dz * dz;

            if (distSq < playerRadius * playerRadius) {
              if (distSq > 0.00001) {
                const dist = Math.sqrt(distSq);
                const overlap = playerRadius - dist;
                playerLocalPos.x += (dx / dist) * overlap;
                playerLocalPos.z += (dz / dist) * overlap;
              } else {
                // Player center is inside the box: push out along shortest axis
                const penLeft = Math.abs(playerLocalPos.x - box.minX);
                const penRight = Math.abs(box.maxX - playerLocalPos.x);
                const penFront = Math.abs(playerLocalPos.z - box.minZ);
                const penBack = Math.abs(box.maxZ - playerLocalPos.z);
                const minPen = Math.min(penLeft, penRight, penFront, penBack);

                if (minPen === penLeft) playerLocalPos.x = box.minX - playerRadius;
                else if (minPen === penRight) playerLocalPos.x = box.maxX + playerRadius;
                else if (minPen === penFront) playerLocalPos.z = box.minZ - playerRadius;
                else playerLocalPos.z = box.maxZ + playerRadius;
              }
            }
          }
        }

        if (supportedFloorY !== null) {
          playerLocalPos.y = supportedFloorY;
          playerLocalVel.y = 0;
          playerGrounded = true;
        } else if (!onStair) {
          playerGrounded = false;
        }
      }

      // Prevent falling below ocean floor if player jumps overboard into the sea
      const worldPlayerPos = playerLocalPos.clone();
      ship.shipGroup.localToWorld(worldPlayerPos);
      if (worldPlayerPos.y < -14.0) {
        playerLocalPos.y += -14.0 - worldPlayerPos.y;
        playerLocalVel.y = 0;
        playerGrounded = true;
      }
    };

    // =========================================================================
    // 13. MAIN 60FPS SIMULATION & RENDER LOOP
    // =========================================================================
    let animFrameId = 0;
    let lastTime = performance.now();
    let fpsSmooth = 60;
    let lastTelemetryPush = 0;
    let lastAppliedPreset = '';

    const animate = (nowMs: number) => {
      animFrameId = requestAnimationFrame(animate);

      const rawDt = (nowMs - lastTime) / 1000;
      lastTime = nowMs;
      const dt = Math.min(0.05, Math.max(0.001, rawDt));
      const nowSec = nowMs / 1000;

      const currentFps = 1 / Math.max(0.0001, rawDt);
      fpsSmooth = fpsSmooth * 0.92 + currentFps * 0.08;

      // Sync dynamic Graphics Settings changes
      const g = graphicsRef.current;
      debugGroup.visible = g.showCollisionDebug;
      if (camera.fov !== g.fov) {
        camera.fov = g.fov;
        camera.updateProjectionMatrix();
      }
      const presetKey = `${g.resolutionScale}_${g.shadowQuality}_${g.weather}`;
      if (presetKey !== lastAppliedPreset) {
        lastAppliedPreset = presetKey;
        renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2) * g.resolutionScale);
        renderer.shadowMap.enabled = g.shadowQuality !== 'off';

        if (g.weather === 'day') {
          scene.background = new THREE.Color(0x38bdf8);
          scene.fog = new THREE.FogExp2(0x7dd3fc, 0.0025);
          dirLight.color.setHex(0xffffff);
          dirLight.intensity = 2.6;
          ambientLight.intensity = 1.1;
        } else if (g.weather === 'sunset') {
          scene.background = new THREE.Color(0x1e1b4b);
          scene.fog = new THREE.FogExp2(0x31102f, 0.0042);
          dirLight.color.setHex(0xf97316);
          dirLight.intensity = 2.3;
          ambientLight.intensity = 0.85;
        } else if (g.weather === 'storm') {
          scene.background = new THREE.Color(0x090d16);
          scene.fog = new THREE.FogExp2(0x090d16, 0.0085);
          dirLight.color.setHex(0x64748b);
          dirLight.intensity = 0.9;
          ambientLight.intensity = 0.45;
        } else if (g.weather === 'fog') {
          scene.background = new THREE.Color(0x334155);
          scene.fog = new THREE.FogExp2(0x334155, 0.015);
          dirLight.color.setHex(0xcbd5e1);
          dirLight.intensity = 1.2;
          ambientLight.intensity = 0.75;
        }
      }

      // -----------------------------------------------------------------------
      // A. ANIMATE GERSTNER OCEAN WAVES
      // -----------------------------------------------------------------------
      if (g.waterQuality !== 'low' || Math.floor(nowMs / 16) % 2 === 0) {
        const posAttr = oceanGeom.attributes.position as THREE.BufferAttribute;
        const arr = posAttr.array as Float32Array;
        const waveAmp = g.weather === 'storm' ? 1.45 : 0.65;
        for (let i = 0; i < arr.length; i += 3) {
          const ox = oceanBasePos[i];
          const oz = oceanBasePos[i + 2];
          const w1 = Math.sin(ox * 0.045 + nowSec * 1.4) * 0.55;
          const w2 = Math.cos(oz * 0.035 + nowSec * 1.1) * 0.45;
          const w3 = Math.sin((ox + oz) * 0.025 - nowSec * 0.9) * 0.35;
          arr[i + 1] = (w1 + w2 + w3) * waveAmp;
        }
        posAttr.needsUpdate = true;
        if (g.waterQuality === 'ultra' || g.waterQuality === 'high') {
          oceanGeom.computeVertexNormals();
        }
      }

      // -----------------------------------------------------------------------
      // B. UPDATE TIMED TNT CHARGES & RPG PROJECTILES
      // -----------------------------------------------------------------------
      for (let i = activeCharges.length - 1; i >= 0; i--) {
        const ch = activeCharges[i];
        if (ch.type === 'tnt') {
          ch.remainingTime -= dt;
          const secCeil = Math.ceil(ch.remainingTime);
          if (secCeil < ch.lastBeepSecond && secCeil >= 0) {
            ch.lastBeepSecond = secCeil;
            soundEngine.playTntBeep(ch.remainingTime < 1.8);
          }
          // Blink LED faster as detonation approaches
          ch.light.intensity = Math.sin(nowSec * (ch.remainingTime < 1.5 ? 28 : 10)) > 0 ? 5 : 0.4;

          if (ch.remainingTime <= 0) {
            activeCharges.splice(i, 1);
            ship.shipGroup.remove(ch.mesh);
            triggerDetonationAtLocalPos(ch.localPos, 7.5, 'Zeit-TNT (5s)');
          }
        }
      }

      for (let i = activeProjectiles.length - 1; i >= 0; i--) {
        const proj = activeProjectiles[i];
        proj.age += dt;
        proj.localVel.y -= 4.5 * dt; // Slight projectile drop
        proj.localPos.addScaledVector(proj.localVel, dt);
        proj.mesh.position.copy(proj.localPos);

        // Check collision with ship bounds or max age
        const hitDeckOrWall =
          proj.localPos.y <= -2.1 ||
          Math.abs(proj.localPos.x) >= 9.2 ||
          proj.localPos.z <= -39.0 ||
          proj.localPos.z >= 35.0 ||
          proj.age > 2.2;

        if (hitDeckOrWall) {
          ship.shipGroup.remove(proj.mesh);
          activeProjectiles.splice(i, 1);
          triggerDetonationAtLocalPos(proj.localPos, 6.2, 'M32 Hohlladungs-Granate');
        }
      }

      // Update Explosion & Debris Particles
      for (let i = explosionParticles.length - 1; i >= 0; i--) {
        const p = explosionParticles[i];
        p.age += dt;
        if (p.age >= p.maxAge) {
          scene.remove(p.mesh);
          explosionParticles.splice(i, 1);
          continue;
        }
        p.vel.y -= p.gravity * dt;
        p.mesh.position.addScaledVector(p.vel, dt);
        const s = 1 + p.age * p.scaleRate;
        p.mesh.scale.set(s, s, s);
        const mat = p.mesh.material as THREE.MeshBasicMaterial;
        mat.opacity = Math.max(0, 1 - p.age / p.maxAge);
      }

      // -----------------------------------------------------------------------
      // C. ANIMATE DOORS & HYDRAULIC BULKHEADS
      // -----------------------------------------------------------------------
      let openDoorsCount = 0;
      ship.doors.forEach((door) => {
        if (door.isOpen) openDoorsCount++;
        const target = door.isOpen ? 1 : 0;
        const speed = door.type === 'bulkhead' ? 1.4 : 3.2;
        if (Math.abs(door.openProgress - target) > 0.001) {
          door.openProgress += Math.sign(target - door.openProgress) * Math.min(
            Math.abs(target - door.openProgress),
            speed * dt
          );
        } else {
          door.openProgress = target;
        }

        if (door.type === 'bulkhead' && door.slideOffset) {
          door.pivotGroup.position
            .copy(door.closedLocalPos)
            .addScaledVector(door.slideOffset, door.openProgress);
        } else {
          door.pivotGroup.rotation.y = door.openProgress * door.openAngle;
          if (door.handleMesh) {
            door.handleMesh.rotation.z = door.openProgress * Math.PI * 1.5;
          }
        }
      });

      // -----------------------------------------------------------------------
      // D. MULTI-COMPARTMENT FLOODING & HYDRODYNAMIC SINKING PHYSICS (TORRICELLI & FLOATING SANDBOX MODEL)
      // -----------------------------------------------------------------------
      let activeBreachCount = 0;
      let totalIngressRate = 0;

      ship.hullNodes.forEach((node) => {
        if (node.breached) {
          activeBreachCount++;
          // Hydrostatic pressure head: depth of breach below ocean surface (y = 0.0m)
          const worldNodePos = node.localPos.clone();
          ship.shipGroup.localToWorld(worldNodePos);
          const head = Math.max(0, 0.2 - worldNodePos.y);

          if (head > 0) {
            // Torricelli Orifice Inflow: v = sqrt(2 * g * head)
            const torricelliVelocity = Math.sqrt(2 * 9.81 * head);
            const flowRate = node.severity * 1.6 * torricelliVelocity; // % flood per second
            compFlood[node.compartment] = Math.min(100, compFlood[node.compartment] + flowRate * dt);
            totalIngressRate += flowRate * 3.2;

            // Animate foaming water jet scale
            const pulse = 0.88 + Math.sin(nowSec * 16 + node.localPos.z) * 0.16;
            node.waterJetMesh.scale.set(pulse * Math.min(2.2, torricelliVelocity / 2.5), 1, pulse);
          }
        }
      });

      // Progressive Water Equalization between Adjacent Compartments via Bulkhead Doors!
      const bulkheadPairs: [CompartmentId, CompartmentId, 0 | 1 | 2][] = [
        ['bow', 'midFwd', 0],
        ['midFwd', 'midAft', 1],
        ['midAft', 'stern', 2],
      ];
      const bulkheadStates: [boolean, boolean, boolean] = [false, false, false];

      bulkheadPairs.forEach(([c1, c2, idx]) => {
        const bDoor = ship.doors.find((d) => d.bulkheadIndex === idx);
        const isOpen = bDoor ? bDoor.openProgress > 0.35 : false;
        const isDogged = bDoor ? Boolean(bDoor.locked || bDoor.watertight) : false;
        bulkheadStates[idx] = isOpen;

        const diff = compFlood[c1] - compFlood[c2];
        // If door is locked / dogged shut: 0% water transfer (100% watertight barrier)!
        // If closed but unlocked: 0.005 (minor gasket seepage)
        // If open: 0.38 (rapid hydrostatic rush between compartments)
        const transferCoeff = isDogged && !isOpen ? 0.0 : (isOpen ? 0.38 : 0.005);
        if (Math.abs(diff) > 0.5) {
          const flow = diff * transferCoeff * dt;
          compFlood[c1] = Math.max(0, Math.min(100, compFlood[c1] - flow));
          compFlood[c2] = Math.max(0, Math.min(100, compFlood[c2] + flow));
        }
      });

      // Bilge Pumps (Lenzpumpen) drain flooded compartments against head
      if (bilgePumpsOn && engineRunning) {
        (['bow', 'midFwd', 'midAft', 'stern'] as CompartmentId[]).forEach((cid) => {
          compFlood[cid] = Math.max(0, compFlood[cid] - 3.4 * dt);
        });
        if (mainDeckFlood > 0) {
          mainDeckFlood = Math.max(0, mainDeckFlood - 5.0 * dt);
        }
      }

      // Update 3D Rising Floodwater Plane Meshes inside each compartment
      (['bow', 'midFwd', 'midAft', 'stern'] as CompartmentId[]).forEach((cid) => {
        const f = compFlood[cid];
        const wMesh = ship.compartmentWaterMeshes[cid];
        if (f > 0.5) {
          wMesh.visible = true;
          // Rises from y = -4.25m up to y = 1.85m (full lower hold)
          wMesh.position.y = -4.25 + (f / 100) * 6.1;
        } else {
          wMesh.visible = false;
        }
      });

      // Hydrostatic Overspill through Stairwells onto Main Deck!
      // When any hold fills above 72% (reaching stair landing threshold y = 1.6m), water spills onto Main Deck
      const maxHoldFlood = Math.max(compFlood.bow, compFlood.midFwd, compFlood.midAft, compFlood.stern);
      if (maxHoldFlood > 72) {
        const spillRate = (maxHoldFlood - 72) * 0.45;
        mainDeckFlood = Math.min(100, mainDeckFlood + spillRate * dt);
      }
      // Ocean downflooding when deck edge submerges
      if (currentSinkDepth > 3.6 || Math.abs(currentRollRad) > 0.32) {
        const oceanSpill = (currentSinkDepth > 3.6 ? (currentSinkDepth - 3.6) * 3.8 : 1.2);
        mainDeckFlood = Math.min(100, mainDeckFlood + oceanSpill * dt);
      }

      if (ship.mainDeckWaterMesh) {
        if (mainDeckFlood > 0.8) {
          ship.mainDeckWaterMesh.visible = true;
          ship.mainDeckWaterMesh.position.y = 1.5 + (mainDeckFlood / 100) * 1.4;
        } else {
          ship.mainDeckWaterMesh.visible = false;
        }
      }

      const totalFloodPercent =
        (compFlood.bow * 1.1 +
          compFlood.midFwd * 1.3 +
          compFlood.midAft * 1.3 +
          compFlood.stern * 1.0 +
          mainDeckFlood * 0.8) /
        5.5;

      const avgHullIntegrity =
        (compIntegrity.bow +
          compIntegrity.midFwd +
          compIntegrity.midAft +
          compIntegrity.stern) /
        4;

      // Floating Sandbox Beam Bending Moment:
      // Sagging moment = Midsection heavy while bow/stern buoyant
      // Hogging moment = Bow/stern heavy while midsection buoyant
      const loadFore = compFlood.bow * 1.4 + compFlood.midFwd * 0.9;
      const loadAft = compFlood.stern * 1.4 + compFlood.midAft * 0.9;
      const loadMid = (compFlood.midFwd + compFlood.midAft) * 1.35;
      const bendingMomentStress = Math.min(100, Math.abs(loadMid - (loadFore + loadAft) * 0.6) * 1.12);
      bendingStressPercent = Math.round(bendingMomentStress);

      // Keel break triggers when physical bending moment exceeds hull structural yield strength!
      if (
        !shipBrokenInHalf &&
        ((bendingMomentStress > 78 && avgHullIntegrity < 38) ||
         (compFlood.midFwd > 85 && compFlood.midAft > 85 && avgHullIntegrity < 25) ||
         (totalFloodPercent > 90 && avgHullIntegrity < 20))
      ) {
        shipBrokenInHalf = true;
        soundEngine.playExplosion(1.4, false);
        soundEngine.playHullGroan();
        lastEventMessage =
          'STRUKTURELLER KIELBRUCH! Der Rumpf der MS POSEIDON VII bricht mittschiffs unter dem extremen Biegemoment!';
      }

      // Compute Ship Pitch (Trim), Roll (List / Krängung) & Sink Depth
      const waveMult = g.weather === 'storm' ? 2.2 : 1.0;
      const wavePitch = Math.sin(nowSec * 0.85) * 0.018 * waveMult;
      const waveRoll = Math.cos(nowSec * 0.72) * 0.028 * waveMult;

      // Trim: Bow flooding pitches nose down (-X rotation in Three.js where -Z is forward)
      const trimDiff = (compFlood.bow * 1.15 + compFlood.midFwd * 0.45 - (compFlood.stern * 1.15 + compFlood.midAft * 0.45)) / 100;
      const targetPitchRad = -trimDiff * 0.48 + wavePitch;

      // List (Krängung): Port vs Starboard damage + Free Surface Slosh at high flooding
      const sideBias = Math.max(-1, Math.min(1, (stbdDamageWeight - portDamageWeight) * 0.45));
      const freeSurfaceList =
        totalFloodPercent > 35
          ? (sideBias !== 0 ? Math.sign(sideBias) : 1) * ((totalFloodPercent - 35) / 65) * 0.38
          : 0;
      const targetRollRad = sideBias * 0.34 + freeSurfaceList + waveRoll;

      // Sink Depth: 0m at 0% flood, down to 22m submerged at 100% flood
      const targetSinkDepth =
        (totalFloodPercent / 100) * 15.5 +
        (totalFloodPercent > 82 ? ((totalFloodPercent - 82) / 18) * 9.5 : 0);

      currentPitchRad += (targetPitchRad - currentPitchRad) * Math.min(1, dt * 1.4);
      currentRollRad += (targetRollRad - currentRollRad) * Math.min(1, dt * 1.2);
      currentSinkDepth += (targetSinkDepth - currentSinkDepth) * Math.min(1, dt * 0.9);

      ship.shipGroup.position.y = -currentSinkDepth + Math.sin(nowSec * 1.1) * 0.18 * waveMult;
      ship.shipGroup.rotation.x = currentPitchRad;
      ship.shipGroup.rotation.z = -currentRollRad;
      ship.shipGroup.updateMatrixWorld(true);

      // -----------------------------------------------------------------------
      // E. ANIMATE SHIP MACHINERY (DIESEL PISTONS, PROPELLER, RADARS, ALARMS)
      // -----------------------------------------------------------------------
      const anim = ship.animatedParts;
      if (engineRunning && currentSinkDepth < 14) {
        const rpmSpeed = 11.0;
        anim.propeller.rotation.z += rpmSpeed * dt;
        anim.driveShaft.rotation.y += rpmSpeed * dt;
        anim.flywheel.rotation.y += rpmSpeed * dt;
        anim.pistons.forEach((p, idx) => {
          p.position.y = 0.85 + Math.sin(nowSec * 16 + idx * 1.05) * 0.24;
        });
      }
      anim.radarMain.rotation.y += 1.8 * dt;
      anim.radarAux.rotation.y -= 2.6 * dt;
      anim.helmWheel.rotation.z = Math.sin(nowSec * 0.6) * 0.35;

      // Emergency Klaxon Beacons pulse red when General Alarm is active
      const alarmPulse = generalAlarmOn ? (Math.sin(nowSec * 10) > 0 ? 2.8 : 0.2) : 0.8;
      anim.alarmBeacons.forEach((mat) => {
        mat.color.setHex(generalAlarmOn ? 0xef4444 : 0xd97706);
        mat.emissive.setHex(generalAlarmOn ? 0xef4444 : 0xd97706);
        mat.emissiveIntensity = alarmPulse;
      });

      // -----------------------------------------------------------------------
      // F. PLAYER MOVEMENT, GRAVITY, SWIMMING & NO-CLIP COLLISION
      // -----------------------------------------------------------------------
      const moveForward =
        (keys['KeyW'] || keys['ArrowUp'] ? 1 : 0) -
        (keys['KeyS'] || keys['ArrowDown'] ? 1 : 0) -
        touchMove.z;
      const moveStrafe =
        (keys['KeyD'] || keys['ArrowRight'] ? 1 : 0) -
        (keys['KeyA'] || keys['ArrowLeft'] ? 1 : 0) +
        touchMove.x;

      const isSprinting = Boolean(keys['ShiftLeft'] || keys['ShiftRight']);
      const moveSpeed = playerCrouching ? 3.4 : isSprinting ? 8.8 : 5.6;

      const forwardVec = new THREE.Vector3(-Math.sin(playerYaw), 0, -Math.cos(playerYaw));
      const rightVec = new THREE.Vector3(Math.cos(playerYaw), 0, -Math.sin(playerYaw));

      const desiredVel = new THREE.Vector3()
        .addScaledVector(forwardVec, moveForward)
        .addScaledVector(rightVec, moveStrafe);
      if (desiredVel.lengthSq() > 1) desiredVel.normalize();
      desiredVel.multiplyScalar(moveSpeed);

      // Add subtle gravitational deck-tilt pull when ship is listing strongly (> 16 degrees)
      if (Math.abs(currentRollRad) > 0.28 && playerGrounded) {
        desiredVel.x += Math.sin(currentRollRad) * 1.4;
      }

      playerLocalVel.x = desiredVel.x;
      playerLocalVel.z = desiredVel.z;

      // Check if player is currently underwater (either in flooded lower compartment or ocean)
      const compHere = getCompartmentAtZ(playerLocalPos.z);
      const localWaterY =
        playerLocalPos.y < 1.5 && compFlood[compHere] > 5
          ? -2.2 + (compFlood[compHere] / 100) * 4.0
          : -999;

      const worldEyeTest = playerLocalPos
        .clone()
        .add(new THREE.Vector3(0, playerCrouching ? 1.05 : 1.65, 0));
      ship.shipGroup.localToWorld(worldEyeTest);

      const isPlayerUnderwater =
        worldEyeTest.y < 0.0 || playerLocalPos.y + 1.2 < localWaterY;

      if (worldEyeTest.y < -0.2) {
        // Underwater buoyancy / swimming controls
        playerLocalVel.y *= 0.9;
        playerLocalVel.y -= 2.5 * dt;
        if (keys['Space']) playerLocalVel.y = 4.8;
      } else {
        // Standard gravity
        playerLocalVel.y -= 21.0 * dt;
      }

      resolvePlayerNoClip(dt);

      // Footstep Sound Trigger
      const horizSpeed = Math.hypot(playerLocalVel.x, playerLocalVel.z);
      if (horizSpeed > 0.8 && playerGrounded) {
        walkBobTimer += dt * horizSpeed * 1.8;
        const inFloodedHold = playerLocalPos.y < 1.2 && compFlood[compHere] > 12;
        soundEngine.playFootstep(inFloodedHold ? 'water' : 'steel');
      }

      // -----------------------------------------------------------------------
      // G. UPDATE CAMERA (1ST PERSON DECK WALKER OR 3RD PERSON ORBIT)
      // -----------------------------------------------------------------------
      if (cameraShakeIntensity > 0.001) {
        cameraShakeIntensity = Math.max(0, cameraShakeIntensity - dt * 1.8);
      }
      const shakeX = (Math.random() - 0.5) * cameraShakeIntensity * 0.25;
      const shakeY = (Math.random() - 0.5) * cameraShakeIntensity * 0.25;

      if (cameraMode === 'fpv') {
        weaponRoot.visible = true;
        const eyeOffset = (playerCrouching ? 1.05 : 1.65) + Math.sin(walkBobTimer) * 0.035;
        const localCamPos = playerLocalPos
          .clone()
          .add(new THREE.Vector3(shakeX, eyeOffset + shakeY, 0));
        const worldCamPos = localCamPos.clone();
        ship.shipGroup.localToWorld(worldCamPos);
        camera.position.copy(worldCamPos);

        // Orient camera with Ship's tilting frame + Player Yaw & Pitch
        const shipQuat = new THREE.Quaternion();
        ship.shipGroup.getWorldQuaternion(shipQuat);
        const lookEuler = new THREE.Euler(playerPitch, playerYaw, 0, 'YXZ');
        const localQuat = new THREE.Quaternion().setFromEuler(lookEuler);
        camera.quaternion.copy(shipQuat).multiply(localQuat);

        // Animate 1st Person Weapon Viewmodel Bob & Recoil
        weaponRecoil = Math.max(0, weaponRecoil - dt * 1.6);
        weaponRoot.position.set(
          0.34 + Math.cos(walkBobTimer * 0.5) * 0.012,
          -0.28 + Math.abs(Math.sin(walkBobTimer)) * 0.016 - weaponRecoil * 0.08,
          -0.52 + weaponRecoil * 0.18
        );
        weaponRoot.rotation.x = weaponRecoil * 0.45;
      } else {
        weaponRoot.visible = false;
        const shipCenter = ship.shipGroup.position.clone().add(new THREE.Vector3(0, 4, 0));
        camera.position.set(
          shipCenter.x + Math.sin(orbitYaw) * Math.cos(orbitPitch) * orbitDistance,
          Math.max(1.5, shipCenter.y + Math.sin(orbitPitch) * orbitDistance),
          shipCenter.z + Math.cos(orbitYaw) * Math.cos(orbitPitch) * orbitDistance
        );
        camera.lookAt(shipCenter);
      }

      // -----------------------------------------------------------------------
      // H. DETECT NEARBY INTERACTABLE DOORS, BULKHEADS & TERMINALS
      // -----------------------------------------------------------------------
      nearbyDoorRef = null;
      nearbyTerminalId = null;
      nearbyInteractable = null;

      let bestDist = 3.45;
      const playerEyeLocal = playerLocalPos.clone().add(new THREE.Vector3(0, 1.2, 0));

      for (const door of ship.doors) {
        const d = door.localPosition.distanceTo(playerEyeLocal);
        if (d < bestDist) {
          bestDist = d;
          nearbyDoorRef = door;
          nearbyTerminalId = null;
        }
      }

      if (nearbyDoorRef) {
        const door = nearbyDoorRef;
        const isDoorLocked = Boolean(door.locked || door.watertight);

        // Process holding [L] for watertight locking/unlocking
        if ((isHoldingKeyL || keys['KeyL']) && !hasToggledLockThisHold) {
          const holdDuration = 0.85;
          doorLockHoldProgress = Math.min(1.0, doorLockHoldProgress + dt / holdDuration);

          if (door.handleMesh) {
            door.handleMesh.rotation.z += dt * 10.0;
          }

          if (doorLockHoldProgress >= 1.0) {
            completeDoorLockToggle(door);
            hasToggledLockThisHold = true;
            doorLockHoldProgress = 0;
          }
        } else if (!isHoldingKeyL && !keys['KeyL']) {
          doorLockHoldProgress = Math.max(0, doorLockHoldProgress - dt * 3.0);
          hasToggledLockThisHold = false;
        }

        const isHoldingLock = doorLockHoldProgress > 0;
        nearbyInteractable = {
          id: door.id,
          title: door.name,
          subtitle: isDoorLocked
            ? 'WATERTIGHT LOCKED // hold [L] to unlock'
            : `${door.deckName} // [E] open/close · hold [L]: watertight lock`,
          actionLabel: isDoorLocked
            ? 'LOCKED'
            : door.isOpen
            ? '[E] CLOSE DOOR'
            : '[E] OPEN DOOR',
          lockActionLabel: isDoorLocked
            ? '[L] HOLD: UNLOCK'
            : '[L] HOLD: WATERTIGHT LOCK',
          type: door.type === 'bulkhead' ? 'bulkhead' : 'door',
          isLocked: isDoorLocked,
          isOpen: door.isOpen,
          watertight: isDoorLocked,
          isLocking: isHoldingLock,
          lockProgress: Number(doorLockHoldProgress.toFixed(2)),
        };
      } else {
        doorLockHoldProgress = 0;
        if (!isHoldingKeyL && !keys['KeyL']) {
          hasToggledLockThisHold = false;
        }
      }

      for (const term of ship.terminals) {
        const d = term.localPos.distanceTo(playerEyeLocal);
        if (d < bestDist) {
          bestDist = d;
          nearbyDoorRef = null;
          nearbyTerminalId = term.id;
          nearbyInteractable = {
            id: term.id,
            title: term.title,
            subtitle: term.subtitle,
            actionLabel: term.actionLabel,
            type: term.type,
          };
        }
      }

      // -----------------------------------------------------------------------
      // I. UPDATE CONTINUOUS WEB AUDIO AMBIENCE & TELEMETRY HUD
      // -----------------------------------------------------------------------
      const engDist = playerLocalPos.distanceTo(new THREE.Vector3(0, -1, 17.5));
      soundEngine.updateContinuousAmbience({
        breachCount: activeBreachCount,
        engineRoomProximity: Math.max(0, 1 - engDist / 24),
        engineRunning,
        underwater: isPlayerUnderwater,
        alarmActive: generalAlarmOn,
        rollDeg: THREE.MathUtils.radToDeg(currentRollRad),
        nowSeconds: nowSec,
      });

      if (nowMs - lastTelemetryPush > 85) {
        lastTelemetryPush = nowMs;

        const pitchDeg = Number(THREE.MathUtils.radToDeg(currentPitchRad).toFixed(1));
        const rollDeg = Number(THREE.MathUtils.radToDeg(currentRollRad).toFixed(1));

        let shipStatus: ShipTelemetry['shipStatus'] = 'NOMINAL';
        if (currentSinkDepth > 18 || totalFloodPercent > 94) shipStatus = 'SUNK';
        else if (shipBrokenInHalf) shipStatus = 'KEEL BREAK';
        else if (totalFloodPercent > 55) shipStatus = 'SINKING FAST';
        else if (Math.abs(rollDeg) > 14 || Math.abs(pitchDeg) > 12)
          shipStatus = 'CRITICAL LIST';
        else if (activeBreachCount > 0 || totalFloodPercent > 4) shipStatus = 'FLOODING';

        onUpdateTelemetry({
          fps: Math.round(fpsSmooth),
          frameTimeMs: Number((rawDt * 1000).toFixed(1)),
          totalFloodPercent: Number(totalFloodPercent.toFixed(1)),
          sinkDepthMeters: Number(currentSinkDepth.toFixed(2)),
          pitchDeg,
          rollDeg,
          hullIntegrity: Math.round(avgHullIntegrity),
          activeBreaches: activeBreachCount,
          waterIngressRate: Number(totalIngressRate.toFixed(1)),
          bilgePumpsOn,
          generalAlarmOn,
          engineRunning,
          shipBrokenInHalf,
          shipStatus,
          playerDeckName: getDeckNameAtPos(playerLocalPos),
          playerLocalPos: {
            x: Number(playerLocalPos.x.toFixed(1)),
            y: Number(playerLocalPos.y.toFixed(1)),
            z: Number(playerLocalPos.z.toFixed(1)),
          },
          playerUnderwater: isPlayerUnderwater,
          flashlightOn,
          cameraMode,
          activeWeapon,
          nearbyInteractable,
          plantedCharges: activeCharges.map((c) => ({
            id: c.id,
            type: c.type,
            remainingTime: Number(c.remainingTime.toFixed(1)),
            deckLabel: c.deckLabel,
          })) as PlantedChargeUI[],
          c4Count: activeCharges.filter((c) => c.type === 'c4').length,
          totalExplosions,
          doorsCount: { open: openDoorsCount, total: ship.doors.length },
          doorLockHoldProgress: Number(doorLockHoldProgress.toFixed(2)),
          bendingStressPercent: Number(bendingStressPercent.toFixed(1)),
          compartments: {
            bow: {
              id: 'bow',
              name: 'Section A // Bow Cargo Hold',
              shortCode: 'SEK-A (BUG)',
              floodPercent: Math.round(compFlood.bow),
              breachCount: ship.hullNodes.filter((n) => n.compartment === 'bow' && n.breached).length,
              hullIntegrity: Math.round(compIntegrity.bow),
              waterLevelLocalY: Number((-2.2 + (compFlood.bow / 100) * 4.0).toFixed(1)),
            },
            midFwd: {
              id: 'midFwd',
              name: 'Section B // Midship Cargo Hold',
              shortCode: 'SEK-B (FRACHT)',
              floodPercent: Math.round(compFlood.midFwd),
              breachCount: ship.hullNodes.filter((n) => n.compartment === 'midFwd' && n.breached).length,
              hullIntegrity: Math.round(compIntegrity.midFwd),
              waterLevelLocalY: Number((-2.2 + (compFlood.midFwd / 100) * 4.0).toFixed(1)),
            },
            midAft: {
              id: 'midAft',
              name: 'Section C // Main Engine Room',
              shortCode: 'SEK-C (MOTOR)',
              floodPercent: Math.round(compFlood.midAft),
              breachCount: ship.hullNodes.filter((n) => n.compartment === 'midAft' && n.breached).length,
              hullIntegrity: Math.round(compIntegrity.midAft),
              waterLevelLocalY: Number((-2.2 + (compFlood.midAft / 100) * 4.0).toFixed(1)),
            },
            stern: {
              id: 'stern',
              name: 'Section D // Stern & Shaft Tunnel',
              shortCode: 'SEK-D (HECK)',
              floodPercent: Math.round(compFlood.stern),
              breachCount: ship.hullNodes.filter((n) => n.compartment === 'stern' && n.breached).length,
              hullIntegrity: Math.round(compIntegrity.stern),
              waterLevelLocalY: Number((-2.2 + (compFlood.stern / 100) * 4.0).toFixed(1)),
            },
          },
          bulkheadDoorsOpen: bulkheadStates,
          overchargedAmmoUnlocked: overchargedRef.current,
          lastEventMessage,
        });
      }

      renderer.render(scene, camera);
    };

    animFrameId = requestAnimationFrame(animate);

    return () => {
      cancelAnimationFrame(animFrameId);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('mouseup', onMouseUp);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('resize', onResize);
      renderer.domElement.removeEventListener('mousedown', onMouseDown);
      renderer.domElement.removeEventListener('wheel', onWheel);
      renderer.domElement.removeEventListener('contextmenu', onContextMenu);
      renderer.domElement.removeEventListener('webglcontextlost', handleContextLost);
      renderer.dispose();
    };
  }, []);

  return (
    <div
      ref={containerRef}
      className="fixed inset-0 w-full h-full z-0 cursor-crosshair"
      title="Click for 3D mouse control (WASD = move, E = doors/bulkheads, left click = TNT/fire, G/right-click = detonate C4)"
    />
  );
};
