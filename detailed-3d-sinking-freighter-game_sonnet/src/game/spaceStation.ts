import * as THREE from "three";
import { CollisionWorld, Collider } from "./physics";
import { Door } from "./shipTypes";
import { createCrewMember, CrewBreach, CrewMember, stepCrew } from "./crew";
import { CrewVisual } from "./crewVisual";
import { v3 } from "./navmesh3d";

export const STATION_BASE_Y = 260;

export interface StationModuleState {
  id: string;
  name: string;
  group: THREE.Group;
  colliders: Collider[];
  minZ: number;
  maxZ: number;
  minX: number;
  maxX: number;
  /** Atmospheric pressure in kPa (101.3 kPa nominal, 0.0 kPa hard vacuum). */
  pressureKpa: number;
  /** Structural hull integrity (0..100%). At 0%, the module detaches and drifts into space! */
  structuralHp: number;
  detached: boolean;
  driftVel: THREE.Vector3;
  driftRot: THREE.Vector3;
  breaches: { id: number; pos: THREE.Vector3; area: number; mesh: THREE.Mesh }[];
}

export interface DestructibleSolarWing {
  id: string;
  name: string;
  group: THREE.Group;
  pos: THREE.Vector3;
  hp: number;
  detached: boolean;
  driftVel: THREE.Vector3;
  driftRot: THREE.Vector3;
}

export class OrbitalSpaceStationSim {
  root = new THREE.Group();
  earthMesh!: THREE.Mesh;
  atmosphereMesh!: THREE.Mesh;
  starPoints!: THREE.Points;

  modules: StationModuleState[] = [];
  solarWings: DestructibleSolarWing[] = [];
  doors: Door[] = [];
  crew: CrewMember[] = [];
  crewVisuals: CrewVisual[] = [];

  active = false;
  stationAlarm = false;
  private nextBreachId = 500;

  constructor(
    scene: THREE.Scene,
    private world: CollisionWorld,
  ) {
    this.root.position.set(0, STATION_BASE_Y, 0);
    this.root.visible = false;
    scene.add(this.root);
    this.buildOrbitalEnvironment();
    this.buildStationComplex();
    this.spawnStationCrew();
  }

  private buildOrbitalEnvironment(): void {
    // Rotating 3D Planet Earth beneath the orbital station
    const earthCanvas = document.createElement("canvas");
    earthCanvas.width = 512;
    earthCanvas.height = 256;
    const ctx = earthCanvas.getContext("2d")!;
    const grad = ctx.createLinearGradient(0, 0, 0, 256);
    grad.addColorStop(0, "#0b2545");
    grad.addColorStop(0.5, "#093170");
    grad.addColorStop(1, "#081c38");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 512, 256);

    // Continents & cloud bands
    ctx.fillStyle = "#1b4332";
    for (let i = 0; i < 18; i++) {
      ctx.beginPath();
      ctx.arc((i * 73) % 512, 40 + ((i * 41) % 175), 18 + (i % 4) * 9, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = "rgba(255, 255, 255, 0.28)";
    for (let i = 0; i < 28; i++) {
      ctx.fillRect((i * 57) % 512, (i * 29) % 256, 65, 6);
    }

    const earthTex = new THREE.CanvasTexture(earthCanvas);
    this.earthMesh = new THREE.Mesh(
      new THREE.SphereGeometry(220, 36, 28),
      new THREE.MeshStandardMaterial({ map: earthTex, roughness: 0.75, metalness: 0.1 }),
    );
    this.earthMesh.position.set(0, -285, 60);
    this.root.add(this.earthMesh);

    this.atmosphereMesh = new THREE.Mesh(
      new THREE.SphereGeometry(226, 32, 24),
      new THREE.MeshBasicMaterial({
        color: 0x38bdf8,
        transparent: true,
        opacity: 0.16,
        side: THREE.BackSide,
      }),
    );
    this.atmosphereMesh.position.copy(this.earthMesh.position);
    this.root.add(this.atmosphereMesh);

    // Deep Space Starfield
    const starPositions = new Float32Array(1200 * 3);
    for (let i = 0; i < 1200; i++) {
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      const r = 450 + Math.random() * 250;
      starPositions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      starPositions[i * 3 + 1] = Math.abs(r * Math.cos(phi)) - 60;
      starPositions[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta);
    }
    const starGeo = new THREE.BufferGeometry();
    starGeo.setAttribute("position", new THREE.BufferAttribute(starPositions, 3));
    this.starPoints = new THREE.Points(
      starGeo,
      new THREE.PointsMaterial({ color: 0xffffff, size: 1.6 }),
    );
    this.root.add(this.starPoints);
  }

  private buildStationComplex(): void {
    const tiWhite = new THREE.MeshStandardMaterial({ color: 0xe2e8f0, roughness: 0.4, metalness: 0.45 });
    const tiDark = new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.5, metalness: 0.65 });
    const floorMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.7, metalness: 0.35 });
    const goldFoil = new THREE.MeshStandardMaterial({ color: 0xd97706, roughness: 0.3, metalness: 0.85 });
    const solarBlue = new THREE.MeshStandardMaterial({ color: 0x1d4ed8, roughness: 0.25, metalness: 0.8 });
    const glassDomeMat = new THREE.MeshStandardMaterial({
      color: 0x7dd3fc,
      transparent: true,
      opacity: 0.32,
      roughness: 0.05,
      metalness: 0.2,
      side: THREE.DoubleSide,
    });
    const airlockMat = new THREE.MeshStandardMaterial({ color: 0x0284c7, roughness: 0.45, metalness: 0.6 });

    // Define 5 longitudinal interconnected pressurized modules along Z (-60m to +60m)
    const moduleSpecs = [
      { id: "mod_reactor", name: "Fusion Reactor Core", z0: -60, z1: -36, w: 12 },
      { id: "mod_hab", name: "Habitation Ring & Medbay", z0: -36, z1: -12, w: 16 },
      { id: "mod_command", name: "Central Command Cupola", z0: -12, z1: 12, w: 16 },
      { id: "mod_science", name: "Hydroponics & Science Lab", z0: 12, z1: 36, w: 14 },
      { id: "mod_docking", name: "Orbital Docking Bay", z0: 36, z1: 60, w: 14 },
    ];

    const yFloor = STATION_BASE_Y;
    const h = 4.2;

    for (let i = 0; i < moduleSpecs.length; i++) {
      const spec = moduleSpecs[i];
      const modGroup = new THREE.Group();
      this.root.add(modGroup);
      const colliders: Collider[] = [];

      const len = spec.z1 - spec.z0;
      const cz = (spec.z0 + spec.z1) / 2;
      const hw = spec.w / 2;

      // Floor & Ceiling
      const floorMesh = new THREE.Mesh(new THREE.BoxGeometry(spec.w, 0.3, len), floorMat);
      floorMesh.position.set(0, 0, cz);
      modGroup.add(floorMesh);
      colliders.push(
        this.world.add(-hw, yFloor - 0.15, spec.z0, hw, yFloor + 0.15, spec.z1, "station_floor"),
      );

      const ceilMesh = new THREE.Mesh(new THREE.BoxGeometry(spec.w, 0.3, len), tiWhite);
      ceilMesh.position.set(0, h, cz);
      modGroup.add(ceilMesh);
      colliders.push(
        this.world.add(-hw, yFloor + h - 0.15, spec.z0, hw, yFloor + h + 0.15, spec.z1, "station_ceil"),
      );

      // Port & Starboard Pressurized Hull Walls + Observation Windows
      for (const side of [-1, 1]) {
        const wallMesh = new THREE.Mesh(new THREE.BoxGeometry(0.35, h, len), tiWhite);
        wallMesh.position.set(side * hw, h / 2, cz);
        modGroup.add(wallMesh);
        colliders.push(
          this.world.add(
            side * hw - 0.2,
            yFloor,
            spec.z0,
            side * hw + 0.2,
            yFloor + h,
            spec.z1,
            "station_wall",
          ),
        );

        // Panoramic Viewport Strip
        const viewport = new THREE.Mesh(new THREE.BoxGeometry(0.42, 1.4, len * 0.55), glassDomeMat);
        viewport.position.set(side * hw, h * 0.55, cz);
        modGroup.add(viewport);
      }

      // Gold MLI thermal insulation bands around docking joints
      const ring = new THREE.Mesh(new THREE.BoxGeometry(spec.w + 0.8, h + 0.6, 1.2), goldFoil);
      ring.position.set(0, h / 2, spec.z0);
      modGroup.add(ring);

      // Module-specific interior details
      if (spec.id === "mod_reactor") {
        const core = new THREE.Mesh(new THREE.CylinderGeometry(1.8, 1.8, 3.6, 16), goldFoil);
        core.position.set(0, 1.9, cz);
        modGroup.add(core);
      } else if (spec.id === "mod_command") {
        // Glass Observation Cupola Dome overhead
        const cupola = new THREE.Mesh(new THREE.SphereGeometry(4.2, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2), glassDomeMat);
        cupola.position.set(0, h, cz);
        modGroup.add(cupola);

        // Command Bridge Console (Orbital Death Ray & Observation)
        const consoleMesh = new THREE.Mesh(new THREE.BoxGeometry(3.2, 1.1, 1.2), tiDark);
        consoleMesh.position.set(0, 0.65, cz + 3);
        modGroup.add(consoleMesh);
        const screenMesh = new THREE.Mesh(
          new THREE.BoxGeometry(2.6, 0.45, 0.1),
          new THREE.MeshBasicMaterial({ color: 0x22d3ee }),
        );
        screenMesh.position.set(0, 1.25, cz + 2.55);
        screenMesh.rotation.x = -0.45;
        modGroup.add(screenMesh);
      }

      // Transverse Airlock Bulkhead Wall at z1 (with Stormworks Airlock Door)
      if (i < moduleSpecs.length - 1) {
        const doorW = 2.2;
        const leftW = hw - doorW / 2;

        const leftWall = new THREE.Mesh(new THREE.BoxGeometry(leftW, h, 0.35), tiDark);
        leftWall.position.set(-(doorW / 2 + leftW / 2), h / 2, spec.z1);
        modGroup.add(leftWall);
        colliders.push(
          this.world.add(-hw, yFloor, spec.z1 - 0.2, -doorW / 2, yFloor + h, spec.z1 + 0.2, "station_bulkhead"),
        );

        const rightWall = new THREE.Mesh(new THREE.BoxGeometry(leftW, h, 0.35), tiDark);
        rightWall.position.set(doorW / 2 + leftW / 2, h / 2, spec.z1);
        modGroup.add(rightWall);
        colliders.push(
          this.world.add(doorW / 2, yFloor, spec.z1 - 0.2, hw, yFloor + h, spec.z1 + 0.2, "station_bulkhead"),
        );

        // Alternate between Sliding Electro-Hydraulic Blast Doors and Hinged Airlock Hatches
        const doorKind = i % 2 === 0 ? "slide" : "swing";
        const doorKey = i === 0 ? "red" : i === 2 ? "blue" : undefined;
        const frameMat = new THREE.MeshBasicMaterial({ color: doorKey === "red" ? 0xef4444 : doorKey === "blue" ? 0x3b82f6 : 0x22d3ee });
        const frameTop = new THREE.Mesh(new THREE.BoxGeometry(doorW + 0.3, 0.12, 0.42), frameMat);
        frameTop.position.set(0, 2.56, spec.z1);
        modGroup.add(frameTop);

        const airlockDoor = new Door(this.world, airlockMat, {
          name: `Airlock ${i + 1} (${spec.name.split(" ")[0]})`,
          axis: "x",
          fixed: spec.z1,
          c: 0,
          w: doorW,
          y0: yFloor,
          h: 2.5,
          kind: doorKind,
          key: doorKey,
          heavy: true,
          bulkhead: true,
        });
        // Position visual pivot relative to root (which is at STATION_BASE_Y)
        airlockDoor.pivot.position.y -= STATION_BASE_Y;
        this.root.add(airlockDoor.pivot);
        this.doors.push(airlockDoor);
      }

      this.modules.push({
        id: spec.id,
        name: spec.name,
        group: modGroup,
        colliders,
        minZ: spec.z0,
        maxZ: spec.z1,
        minX: -hw,
        maxX: hw,
        pressureKpa: 101.3,
        structuralHp: 100,
        detached: false,
        driftVel: new THREE.Vector3(),
        driftRot: new THREE.Vector3(),
        breaches: [],
      });
    }

    // End-cap bulkheads at z = -60 and z = +60
    for (const endZ of [-60, 60]) {
      const cap = new THREE.Mesh(new THREE.BoxGeometry(14, h, 0.5), tiDark);
      cap.position.set(0, h / 2, endZ);
      this.root.add(cap);
      this.world.add(-7, yFloor, endZ - 0.25, 7, yFloor + h, endZ + 0.25, "station_endcap");
    }

    // 4 Giant Destructible Photovoltaic Solar Array Wings
    const wingCoords: [string, string, number, number][] = [
      ["solar_p1", "Port Solar Wing Alpha", -26, -24],
      ["solar_s1", "Starboard Solar Wing Alpha", 26, -24],
      ["solar_p2", "Port Solar Wing Beta", -26, 24],
      ["solar_s2", "Starboard Solar Wing Beta", 26, 24],
    ];

    for (const [id, name, sx, sz] of wingCoords) {
      const wGroup = new THREE.Group();
      wGroup.position.set(sx, 2.2, sz);

      const truss = new THREE.Mesh(new THREE.BoxGeometry(36, 0.4, 0.6), goldFoil);
      wGroup.add(truss);

      const panel1 = new THREE.Mesh(new THREE.BoxGeometry(34, 0.12, 5.5), solarBlue);
      panel1.position.set(0, 0, -3.5);
      wGroup.add(panel1);

      const panel2 = new THREE.Mesh(new THREE.BoxGeometry(34, 0.12, 5.5), solarBlue);
      panel2.position.set(0, 0, 3.5);
      wGroup.add(panel2);

      this.root.add(wGroup);
      this.solarWings.push({
        id,
        name,
        group: wGroup,
        pos: new THREE.Vector3(sx, STATION_BASE_Y + 2.2, sz),
        hp: 100,
        detached: false,
        driftVel: new THREE.Vector3(),
        driftRot: new THREE.Vector3(),
      });
    }
  }

  private spawnStationCrew(): void {
    const specs: [string, "chief-engineer" | "boatswain" | "damage-control" | "electrician" | "medic", number, number][] = [
      ["Cmdr. Vance", "boatswain", -2.5, 0],
      ["Chief Eng. Torres", "chief-engineer", 2.0, -45],
      ["Dr. Lin (Medbay)", "medic", -3.2, -24],
      ["Sci. Officer Kael", "electrician", 2.5, 22],
      ["DC Specialist Orlov", "damage-control", -2.0, -18],
      ["DC Specialist Sato", "damage-control", 2.2, 16],
      ["Reactor Tech 1", "electrician", -1.8, -50],
      ["Reactor Tech 2", "chief-engineer", 1.8, -40],
      ["Airlock Marshal", "boatswain", 0, 44],
      ["Hydroponics Bio-1", "medic", -3.0, 28],
      ["Orbital Sec Alpha", "damage-control", 3.0, -4],
      ["Orbital Sec Bravo", "damage-control", -3.0, 40],
    ];

    this.crew = specs.map(([name, role, x, z]) =>
      createCrewMember(name, role, x, 0.15, z, 5),
    );
    this.crewVisuals = this.crew.map((m) => {
      const cv = new CrewVisual(m);
      this.root.add(cv.group);
      return cv;
    });
  }

  /**
   * Applies an explosion at world coordinates (wx, wy, wz) to the Space Station.
   * Punches vacuum hull breaches, triggers Explosive Decompression, or detaches entire modules/solar wings!
   */
  applyBlast(wx: number, wy: number, wz: number, power: number): string[] {
    const events: string[] = [];
    const localY = wy - STATION_BASE_Y;
    if (Math.abs(localY) > 35) return events;

    // Check Solar Wings for detachment
    for (const wing of this.solarWings) {
      if (wing.detached) continue;
      const d = Math.hypot(wx - wing.pos.x, wy - wing.pos.y, wz - wing.pos.z);
      if (d < 18) {
        wing.hp = Math.max(0, wing.hp - power * 65);
        if (wing.hp <= 0) {
          wing.detached = true;
          wing.driftVel.set(Math.sign(wing.pos.x) * 4.5, 1.2, (Math.random() - 0.5) * 2);
          wing.driftRot.set(0.25, 0.15, 0.35);
          events.push(`🛰️ ${wing.name} blown off and drifting into orbit!`);
        }
      }
    }

    // Check Pressurized Modules for Hull Breaches & Structural Detachment
    for (const mod of this.modules) {
      if (mod.detached) continue;
      if (wz >= mod.minZ - 3 && wz <= mod.maxZ + 3 && Math.abs(wx) <= mod.maxX + 4) {
        mod.structuralHp = Math.max(0, mod.structuralHp - power * 28);
        const breachArea = Math.max(0.8, power * 1.6);

        const breachMesh = new THREE.Mesh(
          new THREE.SphereGeometry(Math.min(1.4, 0.45 + breachArea * 0.25), 10, 10),
          new THREE.MeshBasicMaterial({ color: 0xff3300 }),
        );
        const bx = Math.max(mod.minX + 0.2, Math.min(mod.maxX - 0.2, wx));
        const by = Math.max(0.4, Math.min(3.8, localY));
        breachMesh.position.set(bx, by, wz);
        mod.group.add(breachMesh);

        mod.breaches.push({
          id: this.nextBreachId++,
          pos: new THREE.Vector3(bx, by, wz),
          area: breachArea,
          mesh: breachMesh,
        });
        this.stationAlarm = true;
        events.push(`⚠️ HULL BREACH in ${mod.name}! Explosive decompression initiated!`);

        if (mod.structuralHp <= 0) {
          this.detachModule(mod);
          events.push(`💥 CRITICAL: ${mod.name} docking ring severed — module detaching into space!`);
        }
      }
    }

    return events;
  }

  /**
   * Detaches a station module, disabling its interior walk colliders and sending it tumbling into space.
   */
  detachModule(mod: StationModuleState): void {
    if (mod.detached) return;
    mod.detached = true;
    mod.pressureKpa = 0;
    for (const c of mod.colliders) {
      c.enabled = false;
    }
    mod.driftVel.set((Math.random() - 0.5) * 3.5, -1.8, Math.sign((mod.minZ + mod.maxZ) / 2) * 3.2);
    mod.driftRot.set(0.12, 0.08, 0.18);
  }

  /**
   * Detonates all modules and solar wings simultaneously (triggered by Bridge Self-Destruct).
   */
  triggerCatastrophicSelfDestruct(): void {
    this.stationAlarm = true;
    for (const m of this.modules) {
      m.structuralHp = 0;
      this.detachModule(m);
    }
    for (const w of this.solarWings) {
      w.hp = 0;
      w.detached = true;
      w.driftVel.set(Math.sign(w.pos.x) * 8, 3, (Math.random() - 0.5) * 6);
      w.driftRot.set(0.5, 0.4, 0.6);
    }
  }

  /**
   * Steps Orbital Space Station decompression physics, progressive airlock flow,
   * drifting detached modules, and the 12 autonomous 3D station crew members.
   */
  step(
    dt: number,
    time: number,
    _lockdownActive: boolean,
    _onLockdownRequest?: (crewName: string, modName: string, reason: string) => void,
  ): void {
    if (!this.active) return;
    // Rotate Planet Earth slowly below
    this.earthMesh.rotation.y = time * 0.015;

    // 1. Step Module Atmospheric Pressure & Explosive Decompression
    for (const mod of this.modules) {
      if (mod.detached) {
        mod.group.position.addScaledVector(mod.driftVel, dt);
        mod.group.rotation.x += mod.driftRot.x * dt;
        mod.group.rotation.y += mod.driftRot.y * dt;
        mod.group.rotation.z += mod.driftRot.z * dt;
        continue;
      }

      const totalBreachArea = mod.breaches.reduce((s, b) => s + b.area, 0);
      if (totalBreachArea > 0.01) {
        // Decompression rate proportional to breach area and remaining pressure
        const ventRate = totalBreachArea * (mod.pressureKpa / 101.3) * 14.5;
        mod.pressureKpa = Math.max(0, mod.pressureKpa - ventRate * dt);
      } else if (mod.pressureKpa < 101.3) {
        // Life support O2/N2 repressurization once breaches are welded shut
        mod.pressureKpa = Math.min(101.3, mod.pressureKpa + dt * 9.5);
      }
    }

    // 2. Progressive Decompression across Open Airlock Bulkhead Doors
    for (let i = 0; i < this.modules.length - 1; i++) {
      const mA = this.modules[i];
      const mB = this.modules[i + 1];
      const door = this.doors[i];
      if (!door) continue;

      if (mA.detached && !mB.detached && door.open > 0.05) {
        mB.pressureKpa = Math.max(0, mB.pressureKpa - door.open * 28 * dt);
      } else if (mB.detached && !mA.detached && door.open > 0.05) {
        mA.pressureKpa = Math.max(0, mA.pressureKpa - door.open * 28 * dt);
      } else if (door.open > 0.04) {
        const diff = mA.pressureKpa - mB.pressureKpa;
        if (Math.abs(diff) > 0.2) {
          const transfer = diff * door.open * 2.5 * dt;
          mA.pressureKpa -= transfer;
          mB.pressureKpa += transfer;
        }
      }
    }

    // Step drifting detached solar wings
    for (const w of this.solarWings) {
      if (w.detached) {
        w.group.position.addScaledVector(w.driftVel, dt);
        w.group.rotation.x += w.driftRot.x * dt;
        w.group.rotation.z += w.driftRot.z * dt;
      }
    }

    // 3. Step Airlock Doors & 12 Autonomous 3D Station Crew Members
    const crewBodies = this.crew.map((c) => ({ x: c.x, y: c.y + STATION_BASE_Y, z: c.z, r: 0.34, h: 1.75 }));
    for (const d of this.doors) {
      d.update(dt, crewBodies);
    }

    const allBreaches: CrewBreach[] = [];
    for (const mod of this.modules) {
      if (mod.detached) continue;
      for (const b of mod.breaches) {
        allBreaches.push({
          id: b.id,
          x: b.pos.x,
          y: 0.15,
          z: b.pos.z,
          area: b.area,
        });
      }
    }

    const doorHandles = this.doors.map((d) => ({
      name: d.name,
      axis: d.axis,
      fixed: d.fixed,
      c: d.c,
      w: d.w,
      y0: 0,
      h: d.h,
      open: d.open,
      target: d.target,
      bulkhead: d.bulkhead,
      locked: d.locked,
    }));

    const compInfos = this.modules.map((m) => ({
      id: m.id,
      name: m.name,
      minZ: m.minZ,
      maxZ: m.maxZ,
      fill: Math.max(0, (101.3 - m.pressureKpa) / 101.3),
      flow: m.breaches.reduce((s, b) => s + b.area, 0) * 2.5,
    }));

    for (let idx = 0; idx < this.crew.length; idx++) {
      const member = this.crew[idx];
      const hostMod = this.modules.find((m) => member.z >= m.minZ && member.z <= m.maxZ);
      const depressurized = hostMod ? hostMod.pressureKpa < 45 : false;
      const suctionVel = depressurized ? v3(0, 0.8, 3.6) : v3(0, 0, 0);

      stepCrew(
        member,
        dt,
        allBreaches,
        {
          walkSpeed: 2.2,
          detectRadius: 45,
          reactionTime: 0.6,
          repairRate: 0.45,
          patrol: [
            { x: -2.5 + (idx % 3) * 2.2, y: 0.15, z: -42 + (idx % 5) * 20 },
            { x: 2.5 - (idx % 3) * 2.2, y: 0.15, z: 38 - (idx % 5) * 18 },
          ],
        },
        {
          waterVelocity: suctionVel,
          waterLevelY: -999,
          blastImpulse: 0,
          vesselRollDeg: 0,
          deckFloorY: 0.15,
        },
      );
    }

    // Sync repaired breaches back to modules
    for (const mod of this.modules) {
      for (let bi = mod.breaches.length - 1; bi >= 0; bi--) {
        const b = mod.breaches[bi];
        const matching = allBreaches.find((ab) => ab.id === b.id);
        if (matching) {
          b.area = matching.area;
          if (b.area <= 0.02) {
            mod.group.remove(b.mesh);
            mod.breaches.splice(bi, 1);
          }
        }
      }
    }

    for (const cv of this.crewVisuals) cv.update(dt);
  }
}
