/**
 * StormworksSupervisor: Additive architectural supervisor wrapping ShipSim.
 *
 * Coordinates:
 * - Hull structural bending & shear stress calculations (Euler-Bernoulli, 355 MPa yield).
 * - Sealed compartment Boyle's law air pockets & ingress regulation.
 * - Wheelhouse navigation: Helm wheel, engine telegraph, rudder kinematic turning.
 * - Master bulkhead emergency lockdown.
 * - Sandbox suite: God Mode (immortality), Free-flight Noclip, and Flood Dial (0x/0.5x/1x/3x).
 * - Autonomous Damage Control crew NPCs with 5-ray anti-clipping steering and ladder climbing.
 * - Hydrodynamic ragdoll physics.
 */

import { ShipSim } from "./shipSim";
import { Compartment, Door } from "./shipTypes";
import {
  balanceBuoyancy,
  evaluateGirder,
  GirderResult,
  GirderSection,
  STEEL_YIELD_PA,
} from "./hullStress";
import {
  AirPocket,
  inflowFactor,
} from "./ingress";
import {
  createHelm,
  HelmState,
  lockdownBulkheads as lockdownDoors,
  stepHelm,
} from "./bridge";
import {
  createSandboxOptions,
  cycleFloodRate as cycleFlood,
  effectiveDamage,
  effectiveFloodSpeed,
  effectiveOxygenDrain,
  floodRate,
  SandboxOptions,
} from "./sandbox";
import {
  createCrewMember,
  CrewBreach,
  CrewMember,
  stepCrew,
} from "./crew";
import { NavMesh3D, RaycastFn, v3 } from "./navmesh3d";
import { Ocean } from "./ocean";

export class StormworksSupervisor {
  helm: HelmState;
  sandbox: SandboxOptions;
  crew: CrewMember[] = [];
  navmesh: NavMesh3D;
  airPockets = new Map<string, AirPocket>();
  lastGirderResult: GirderResult | null = null;
  keelFractured = false;
  fractureJoint = -1;
  activeWaterVelocity = v3(0, 0, 0);
  engineDestroyed = false;

  destroyEngine(): void {
    this.engineDestroyed = true;
  }

  isEngineDestroyed(): boolean {
    return this.engineDestroyed;
  }

  constructor(
    public sim: ShipSim,
    public compartments: Compartment[],
    public doors: Door[],
  ) {
    this.helm = createHelm();
    this.sandbox = createSandboxOptions();
    this.navmesh = new NavMesh3D();

    // Initialize pneumatic air pockets for all compartments (sealed unless vented)
    for (const c of compartments) {
      this.airPockets.set(c.id, {
        volume: c.volume,
        vented: c.id === "hold1", // forward hold has open deck hatch vents
      });
    }

    // Initialize standard 3-man Damage Control team on clear walkable DECK_Y lanes
    this.crew.push(
      createCrewMember("Chief Engineer", "chief-engineer", 9.2, 0.1, -34.0, 4),
      createCrewMember("Boatswain", "boatswain", -9.2, 0.1, 4.0, 3),
      createCrewMember("DC Sailor", "damage-control", 2.5, 0.1, 44.0, 5),
    );
  }

  /**
   * Main supervisor step: updates physics, structural stresses,
   * damage control crew, and navigation telemetry.
   */
  step(
    dt: number,
    time: number,
    ocean: Ocean,
    baseFloodSpeed: number,
    raycast?: RaycastFn,
    blastImpulse = 0,
    world?: import("./crew").CrewWorld,
  ): void {
    // 1. Modulate flood speed with sandbox dial
    const currentFloodRate = effectiveFloodSpeed(this.sandbox, baseFloodSpeed);

    // 2. Trapped air pocket ingress regulation (Boyle's law)
    for (const c of this.compartments) {
      const pocket = this.airPockets.get(c.id);
      if (pocket && !pocket.vented) {
        const avgHoleDepth = c.holes.length > 0
          ? c.holes.reduce((sum, h) => sum + Math.max(0, -this.sim.worldY(h.pos.x, h.pos.y, h.pos.z)), 0) / c.holes.length
          : 3.0;

        const factor = inflowFactor(pocket, c.water, avgHoleDepth);
        c.flow *= factor;
      }
    }

    // 3. Step ShipSim physics
    this.sim.update(dt, time, ocean, currentFloodRate);

    // 4. Euler-Bernoulli Longitudinal Girder Stress & Keel Fracture Evaluation
    const girder = this.calculateHullGirderStress();
    this.lastGirderResult = girder;
    if (girder.fractured && !this.keelFractured) {
      this.keelFractured = true;
      this.fractureJoint = girder.maxJoint;
      this.sim.forceSink = true;
    }

    // 5. Wheelhouse Navigation & Rudder Dynamics
    const engineRoom = this.compartments[0];
    if (engineRoom && engineRoom.fill > 0.4) {
      this.engineDestroyed = true;
    }
    const engineAvailable = !this.sim.sunk && !this.engineDestroyed && (engineRoom ? engineRoom.fill <= 0.4 : true);
    stepHelm(this.helm, dt, 140, engineAvailable);
    this.sim.heading = this.helm.heading;

    // 6. Gather active hull breaches for crew repairs
    const breaches: CrewBreach[] = [];
    let breachId = 1;
    for (const c of this.compartments) {
      const isEngine = c.id === "engine";
      for (const h of c.holes) {
        const wy = this.sim.worldY(h.pos.x, h.pos.y, h.pos.z);
        const head = Math.max(0.5, -wy);
        const qh = 0.6 * h.area * Math.sqrt(2 * 9.81 * head);
        breaches.push({
          id: breachId++,
          x: h.pos.x,
          y: h.pos.y,
          z: h.pos.z,
          area: h.area,
          inflowRate: qh,
          isEngineRoom: isEngine,
        });
      }
    }

    // Estimate water velocity rushing through lowest breach
    if (breaches.length > 0 && this.sim.totalFlow > 0.5) {
      this.activeWaterVelocity = v3(0, 0, Math.min(8.0, 1.5 + this.sim.totalFlow * 0.3));
    } else {
      this.activeWaterVelocity = v3(0, 0, 0);
    }

    // 7. Step Autonomous Damage Control Crew NPCs & Ragdoll Physics
    const vesselRollDeg = (this.sim.roll * 180) / Math.PI;
    const lowestCompartmentWaterY = this.compartments.reduce((minY, c) => Math.min(minY, c.worldLevel), 0);

    for (const member of this.crew) {
      const ev = stepCrew(member, dt, breaches, undefined, {
        navmesh: this.navmesh,
        raycast,
        world,
        waterVelocity: this.activeWaterVelocity,
        waterLevelY: lowestCompartmentWaterY,
        blastImpulse,
        vesselRollDeg,
        deckFloorY: -5.0,
      });
      if (ev) {
        console.log(`[NORDWIND/CREW] ${member.name} (${member.role}) -> ${ev} at (${member.x.toFixed(1)}, ${member.y.toFixed(1)}, ${member.z.toFixed(1)}) [kits=${member.patchKits}, breaches=${breaches.length}]`);
      }

      // Synchronize repaired breach areas back to hole geometry
      for (const b of breaches) {
        for (const c of this.compartments) {
          for (const h of c.holes) {
            if (Math.hypot(h.pos.x - b.x, h.pos.y - b.y, h.pos.z - b.z) < 0.1) {
              h.area = b.area;
            }
          }
          // Remove fully patched holes
          c.holes = c.holes.filter((h) => h.area > 0.01);
        }
      }
    }
  }

  /**
   * Computes longitudinal weight distribution, buoyant support,
   * shear force V(z), bending moment M(z), and peak fiber stress.
   */
  calculateHullGirderStress(): GirderResult {
    // 4 Longitudinal sections (Engine Room, Hold 3, Hold 2, Hold 1)
    const baseSteelMassPerMeter = 14000; // kg/m
    const g = 9.81;

    const sections: GirderSection[] = this.compartments.map((c) => {
      const length = c.max.z - c.min.z;
      const steelWeight = length * baseSteelMassPerMeter * g;
      const waterWeight = c.water * 1025 * g;
      const totalWeight = steelWeight + waterWeight;

      // Approximate displaced volume buoyancy
      const submergedH = Math.max(0, Math.min(c.max.y - c.min.y, -this.sim.worldY(0, c.min.y, (c.min.z + c.max.z) / 2)));
      const displacedVolume = (c.max.x - c.min.x) * length * submergedH * 0.85;
      const buoyancy = displacedVolume * 1025 * g;

      return {
        length,
        weight: totalWeight,
        buoyancy,
        inertia: 12.5, // m^4
        extremeFibre: 5.5, // m from neutral axis to keel plate
      };
    });

    const balanced = balanceBuoyancy(sections);
    return evaluateGirder(balanced, STEEL_YIELD_PA);
  }

  // --- Sandbox Controls ---

  toggleGodMode(): boolean {
    this.sandbox.godMode = !this.sandbox.godMode;
    return this.sandbox.godMode;
  }

  toggleNoclip(): boolean {
    this.sandbox.noclip = !this.sandbox.noclip;
    return this.sandbox.noclip;
  }

  cycleFloodRate(): number {
    return cycleFlood(this.sandbox);
  }

  getFloodRate(): number {
    return floodRate(this.sandbox);
  }

  isGodMode(): boolean {
    return this.sandbox.godMode;
  }

  isNoclip(): boolean {
    return this.sandbox.noclip;
  }

  filterDamage(amount: number): number {
    return effectiveDamage(this.sandbox, amount);
  }

  filterOxygenDrain(drain: number): number {
    return effectiveOxygenDrain(this.sandbox, drain);
  }

  // --- Master Bulkhead Lockdown ---

  lockdownBulkheads(): number {
    return lockdownDoors(this.doors);
  }
}
