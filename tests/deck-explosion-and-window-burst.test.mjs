// tests/deck-explosion-and-window-burst.test.mjs - Unit tests for deck explosion dry safety, hydrostatic window bursting, God mode hold deactivation, and intelligent crew dispatch
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import * as THREE from 'three';
import ts from 'typescript';

console.log('🧪 Starting Deck Explosion, Window Burst & Intelligent Crew Dispatch Unit Tests...');

const baseDir = 'detailed-3d-sinking-freighter-game_sonnet/src/game/';
const cache = new Map();

function load(name) {
  if (cache.has(name)) return cache.get(name);
  const path = baseDir + name + (name.endsWith('.ts') ? '' : '.ts');
  const code = ts.transpileModule(fs.readFileSync(path, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  const mod = { exports: {} };
  const customReq = (id) => {
    if (id === 'three') return THREE;
    const cleanId = id.replace(/^\.\//, '');
    return load(cleanId);
  };
  vm.runInNewContext(code, {
    module: mod,
    exports: mod.exports,
    require: customReq,
    console,
    Math,
    RangeError,
    TypeError,
    Error,
  });
  cache.set(name, mod.exports);
  return mod.exports;
}

const { ShipSim } = load('shipSim');
const ingress = load('ingress');
const crew = load('crew');
const sandbox = load('sandbox');
const supervisorMod = load('stormworksSupervisor');
const StormworksSupervisor = supervisorMod.StormworksSupervisor;

// ============================================================================
// 1. Deck Explosion Dry Hull Safety Test
// ============================================================================
function testDeckExplosionDoesNotBreachDryEngineRoom() {
  const group = new THREE.Group();
  const engineComp = {
    id: 'engine',
    name: 'Engine Room',
    holes: [],
    level: 0,
    min: { x: -9.7, y: -5.0, z: -30 },
    max: { x: 9.7, y: 2.7, z: -5 },
  };
  const sim = new ShipSim(group, [engineComp]);

  // Scenario 1: Vessel floating normally with dry upper deck (deck at worldY = +1.7m, sea level = 0.0m)
  group.position.set(0, 1.5, 0);
  group.updateMatrixWorld(true);

  // Deck explosion at local pos.y = 0.2 (which is >= -0.2)
  const deckBlast = new THREE.Vector3(8.0, 0.2, -15);
  const dryHole = sim.addBreach(engineComp, deckBlast, 1.0, 0.0);

  assert.equal(
    dryHole,
    null,
    'Open-air deck explosion on dry deck must return null and NOT breach engine room',
  );
  assert.equal(
    engineComp.holes.length,
    0,
    'Engine room must have 0 holes after dry deck explosion',
  );

  // Scenario 2: Vessel swamped/listing so the deck coordinate is submerged below ocean surface (worldY = -0.8m < 0.0m)
  group.position.set(0, -1.0, 0);
  group.updateMatrixWorld(true);

  const submergedHole = sim.addBreach(engineComp, deckBlast, 1.0, 0.0);
  assert.notEqual(
    submergedHole,
    null,
    'Submerged deck explosion (worldY < oceanHeight) must create a hull breach',
  );
  assert.equal(
    engineComp.holes.length,
    1,
    'Engine room must record a breach when deck coordinate is submerged',
  );
  assert.ok(submergedHole.area > 0, 'Breach area must be positive');

  // Scenario 3: Detonation on lower hull plating at another frame (pos.y = -1.5 < -0.2, z = -22)
  group.position.set(0, 1.5, 0);
  group.updateMatrixWorld(true);

  const lowerHullBlast = new THREE.Vector3(8.0, -1.5, -22);
  const lowerHole = sim.addBreach(engineComp, lowerHullBlast, 1.0, 0.0);

  assert.notEqual(
    lowerHole,
    null,
    'Underwater side shell blast (pos.y < -0.2) must create an exterior breach',
  );
  assert.equal(
    engineComp.holes.length,
    2,
    'Engine room must have 2 holes now (1 submerged deck + 1 lower hull)',
  );

  console.log('  ok deck explosion does not breach dry engine room, but breaches when submerged');
}

// ============================================================================
// 2. Hydrostatic Window Burst & Torricelli Ingress Test
// ============================================================================
function testWindowHydrostaticBurst() {
  // Verify physical depth thresholds
  assert.equal(ingress.LOWER_DECK_WINDOW_BURST_DEPTH, 2.5, 'Lower deck burst threshold must be 2.5m');
  assert.equal(ingress.BRIDGE_WINDOW_BURST_DEPTH, 6.0, 'Reinforced bridge burst threshold must be 6.0m');

  // Lower deck window tests:
  // Intact at 2.4m head
  assert.equal(
    ingress.shouldWindowBurst(2.4, false),
    false,
    'Lower deck window must remain intact at 2.4m depth',
  );
  // Bursts at 2.5m head
  assert.equal(
    ingress.shouldWindowBurst(2.5, false),
    true,
    'Lower deck window must burst at 2.5m depth',
  );
  // Bursts at 3.5m head
  assert.equal(
    ingress.shouldWindowBurst(3.5, false),
    true,
    'Lower deck window must burst at 3.5m depth',
  );

  // Reinforced bridge window tests:
  // Intact at 2.5m head (reinforced glass withstands lower deck burst threshold)
  assert.equal(
    ingress.shouldWindowBurst(2.5, true),
    false,
    'Reinforced bridge window must withstand 2.5m depth without bursting',
  );
  // Intact at 5.9m head
  assert.equal(
    ingress.shouldWindowBurst(5.9, true),
    false,
    'Reinforced bridge window must withstand 5.9m depth without bursting',
  );
  // Bursts at 6.0m head
  assert.equal(
    ingress.shouldWindowBurst(6.0, true),
    true,
    'Reinforced bridge window must burst at 6.0m depth',
  );
  // Bursts at 8.0m head
  assert.equal(
    ingress.shouldWindowBurst(8.0, true),
    true,
    'Reinforced bridge window must burst at 8.0m depth',
  );

  // Ingress opening flow verification
  const intactPane = { kind: 'broken-glass', area: 0 };
  assert.equal(ingress.admitsWater(intactPane), false, 'Intact glass (0 area) must not admit water');

  const burstPane = { kind: 'broken-glass', area: 0.45 };
  assert.equal(ingress.admitsWater(burstPane), true, 'Burst glass must admit sea water');

  // Torricelli flow velocity & volumetric flow rate at 2.5m depth
  const flow = ingress.orificeFlow(0.45, 2.5);
  // Expected: 0.6 * 0.45 * sqrt(2 * 9.81 * 2.5) = 0.27 * 7.00357 = ~1.891 m^3/s
  assert.ok(
    Math.abs(flow - 1.8909) < 0.02,
    `Torricelli orifice flow must be approx 1.891 m^3/s (got ${flow})`,
  );

  console.log('  ok window hydrostatic burst thresholds (2.5m / 6.0m) and Torricelli ingress verified');
}

// ============================================================================
// 3. God Mode 1.5s Hold Deactivation & TNT Detonate Key Conflict Test
// ============================================================================
function testGodModeHoldDeactivationAndTntConflict() {
  class GameInputHarness {
    constructor() {
      this.keys = new Set();
      this.queue = new Set();
      this.curWeapon = 'shotgun';
      this.tntPlaced = 0;
      this.supervisor = new StormworksSupervisor(
        { worldY: (x, y, z) => y, sunk: false, forceSink: false },
        [],
      );
      this.godModeHoldProgress = 0;
      this.detonations = 0;
    }

    pressKey(code, action) {
      this.keys.add(code);
      if (action) this.queue.add(action);
      if (code === 'KeyG') this.queue.add('godmode');
    }

    releaseKey(code) {
      this.keys.delete(code);
    }

    step(dt) {
      const isHoldingTNT = this.curWeapon === 'tnt' || this.tntPlaced > 0;

      if (this.queue.has('detonate')) {
        this.queue.delete('detonate');
        this.detonations++;
      }

      if (!isHoldingTNT) {
        if (!this.supervisor.isGodMode()) {
          if (this.queue.has('godmode')) {
            this.queue.delete('godmode');
            this.supervisor.toggleGodMode();
            this.godModeHoldProgress = 0;
          }
        } else {
          this.queue.delete('godmode'); // single tap consumed without toggling OFF
          if (this.keys.has('KeyG')) {
            this.godModeHoldProgress = Math.min(1.0, this.godModeHoldProgress + dt / 1.5);
            if (this.godModeHoldProgress >= 1.0) {
              this.supervisor.toggleGodMode();
              this.godModeHoldProgress = 0;
            }
          } else {
            this.godModeHoldProgress = Math.max(0, this.godModeHoldProgress - dt * 3.0);
          }
        }
      } else {
        this.queue.delete('godmode');
        this.godModeHoldProgress = 0;
      }
    }
  }

  const harness = new GameInputHarness();

  // Step 3A: Holding TNT conflict - KeyG must detonate TNT, never toggle God Mode
  harness.curWeapon = 'tnt';
  harness.pressKey('KeyG', 'detonate');
  harness.step(0.016);
  assert.equal(harness.detonations, 1, 'KeyG with TNT must trigger detonation');
  assert.equal(harness.supervisor.isGodMode(), false, 'KeyG with TNT must not enable God Mode');
  harness.releaseKey('KeyG');

  // Step 3B: Single tap to activate when God Mode is OFF and not holding TNT
  harness.curWeapon = 'shotgun';
  harness.pressKey('KeyG', 'detonate');
  harness.step(0.016);
  harness.releaseKey('KeyG');
  assert.equal(harness.supervisor.isGodMode(), true, 'Single tap of KeyG must turn God Mode ON');
  assert.equal(harness.godModeHoldProgress, 0, 'Progress must be 0 after initial activation');

  // Step 3C: Single tap does NOT turn God Mode OFF
  harness.pressKey('KeyG', 'detonate');
  harness.step(0.016);
  harness.releaseKey('KeyG');
  harness.step(0.016);
  assert.equal(harness.supervisor.isGodMode(), true, 'Single tap must NOT deactivate God Mode');

  // Step 3D: Partial hold (< 1.5s) advances progress but leaves God Mode ON
  harness.pressKey('KeyG', 'detonate');
  // Hold for 0.6 seconds (40% progress)
  harness.step(0.6);
  assert.ok(
    Math.abs(harness.godModeHoldProgress - 0.4) < 0.01,
    `Hold progress must be 0.4 at 0.6s (got ${harness.godModeHoldProgress})`,
  );
  assert.equal(harness.supervisor.isGodMode(), true, 'God Mode must remain ON during hold');

  // Releasing KeyG decays progress
  harness.releaseKey('KeyG');
  harness.step(0.15); // decays by 0.15 * 3.0 = 0.45 -> reaches 0
  assert.equal(harness.godModeHoldProgress, 0, 'Progress must decay back to 0 on release');
  assert.equal(harness.supervisor.isGodMode(), true, 'God Mode must remain ON after aborted hold');

  // Step 3E: Continuous 1.5s hold turns God Mode OFF
  harness.pressKey('KeyG', 'detonate');
  harness.step(0.5);
  harness.step(0.5);
  harness.step(0.5); // total 1.5s
  assert.equal(harness.supervisor.isGodMode(), false, 'Holding KeyG for 1.5s must turn God Mode OFF');
  assert.equal(harness.godModeHoldProgress, 0, 'Progress must reset to 0 after deactivation');

  console.log('  ok God Mode 1.5s hold deactivation and KeyG conflict resolution verified');
}

// ============================================================================
// 4. Intelligent Crew Priority Dispatch & Repair Test
// ============================================================================
function testIntelligentCrewPriorityDispatch() {
  const crewMember = { x: 0, y: 0, z: 0 };

  // Check 4A: Distance attenuation
  const closeBreach = {
    id: 1,
    x: 0,
    y: 0,
    z: 2,
    area: 1.0,
    inflowRate: 10.0,
    isEngineRoom: false,
  };
  const farBreach = {
    id: 2,
    x: 0,
    y: 0,
    z: 20,
    area: 1.0,
    inflowRate: 10.0,
    isEngineRoom: false,
  };

  const pClose = crew.calculateBreachPriority(crewMember, closeBreach);
  const pFar = crew.calculateBreachPriority(crewMember, farBreach);

  // Close: 10 / (1 + 0.1 * 2) = 10 / 1.2 = ~8.333
  // Far: 10 / (1 + 0.1 * 20) = 10 / 3.0 = ~3.333
  assert.ok(pClose > pFar, `Close breach priority (${pClose}) must exceed far breach (${pFar})`);
  assert.ok(Math.abs(pClose - 8.333) < 0.05, `Close priority approx 8.333 (got ${pClose})`);
  assert.ok(Math.abs(pFar - 3.333) < 0.05, `Far priority approx 3.333 (got ${pFar})`);

  // Check 4B: Engine Room 2.5x criticality multiplier
  // Cargo Hold breach with HIGHER flow (5.0 m^3/s) vs Engine Room with LOWER flow (3.0 m^3/s) at same distance (10m)
  const cargoBreach = {
    id: 3,
    x: 0,
    y: 0,
    z: 10,
    area: 1.0,
    inflowRate: 5.0,
    isEngineRoom: false,
  };
  const engineBreach = {
    id: 4,
    x: 0,
    y: 0,
    z: 10,
    area: 1.0,
    inflowRate: 3.0,
    isEngineRoom: true,
  };

  const pCargo = crew.calculateBreachPriority(crewMember, cargoBreach);
  const pEngine = crew.calculateBreachPriority(crewMember, engineBreach);

  // Cargo: 5.0 * 1.0 / (1 + 1.0) = 2.5
  // Engine: 3.0 * 2.5 / (1 + 1.0) = 7.5 / 2.0 = 3.75
  assert.ok(
    pEngine > pCargo,
    `Engine room breach priority (${pEngine}) must beat higher-flow cargo breach (${pCargo}) due to 2.5x multiplier`,
  );

  // Check 4C: selectBestBreach selects the highest-priority target
  const member = crew.createCrewMember('Chief Miller', 'chief-engineer', 0, 0, 0);
  const best = crew.selectBestBreach(member, [cargoBreach, engineBreach, farBreach], 50);
  assert.notEqual(best, null, 'Crew must select a target');
  assert.equal(best.id, engineBreach.id, 'Crew must prioritize the engine room breach');

  // Check 4D: Shattered window repair dispatch
  const windowBreach = {
    id: 5,
    x: 0,
    y: 0,
    z: 3,
    area: 0.45,
    inflowRate: 1.89,
    isEngineRoom: false,
    kind: 'broken-window',
  };
  const bestWindow = crew.selectBestBreach(member, [windowBreach], 50);
  assert.equal(bestWindow.id, 5, 'Crew must target broken window breach');

  // Step crew repair state machine: welding repairs breach down to 0
  member.targetId = windowBreach.id;
  member.state = 'repairing';
  member.patchKits = 3;
  member.x = windowBreach.x;
  member.y = windowBreach.y;
  member.z = windowBreach.z;

  const cfg = { ...crew.DEFAULT_CREW_CONFIG, repairRate: 0.5 };
  const event = crew.stepCrew(member, 1.0, [windowBreach], cfg); // 1s repair seals 0.5 m^2

  assert.equal(windowBreach.area, 0, 'Breach area must be sealed to 0');
  assert.equal(event, 'sealed', 'Crew event must be "sealed"');
  // Fractional kit consumption: 0.45 m^2 sealed / 1.5 m^2 per kit = 0.3 kits consumed (3.0 - 0.3 = 2.7)
  assert.ok(
    Math.abs(member.patchKits - 2.7) < 1e-4,
    `Crew must consume 0.3 patch kits proportionally (got ${member.patchKits})`,
  );
  assert.equal(member.state, 'patrol', 'Crew must return to patrol after sealing breach');

  console.log('  ok intelligent crew priority dispatch (2.5x engine room factor, distance attenuation, window repair) verified');
}

// ============================================================================
// Execution
// ============================================================================
testDeckExplosionDoesNotBreachDryEngineRoom();
testWindowHydrostaticBurst();
testGodModeHoldDeactivationAndTntConflict();
testIntelligentCrewPriorityDispatch();

console.log('🎉 ALL 4 DECK EXPLOSION, WINDOW BURST & CREW DISPATCH UNIT TESTS PASSED!');
