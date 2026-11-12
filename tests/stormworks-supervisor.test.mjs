// tests/stormworks-supervisor.test.mjs - Stormworks supervisor, hull fracture, master lockdown & sandbox
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

console.log('Starting Stormworks Supervisor & Integration Unit Tests...');

const baseDir = 'detailed-3d-sinking-freighter-game_sonnet/src/game/';
const cache = new Map();

function load(name) {
  if (cache.has(name)) return cache.get(name);
  const path = baseDir + name + '.ts';
  const code = ts.transpileModule(readFileSync(path, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 }
  }).outputText;
  const mod = { exports: {} };
  const customReq = (id) => {
    const cleanId = id.replace(/^\.\//, '');
    return load(cleanId);
  };
  vm.runInNewContext(code, { module: mod, exports: mod.exports, require: customReq, console, Math });
  cache.set(name, mod.exports);
  return mod.exports;
}

const supervisorMod = load('stormworksSupervisor');
const StormworksSupervisor = supervisorMod.StormworksSupervisor;

function createMockSim() {
  return {
    worldY: (x, y, z) => y,
    update: () => {},
    sunk: false,
    roll: 0,
    pitch: 0,
    totalFlow: 0,
    forceSink: false,
  };
}

function createMockCompartments() {
  return [
    {
      id: 'engine',
      name: 'Engine Room',
      volume: 1200,
      water: 0,
      fill: 0,
      flow: 0,
      worldLevel: -4.0,
      min: { x: -8, y: -6, z: -50 },
      max: { x: 8, y: 4, z: -25 },
      holes: [],
    },
    {
      id: 'hold3',
      name: 'Cargo Hold 3',
      volume: 1500,
      water: 0,
      fill: 0,
      flow: 0,
      worldLevel: -4.0,
      min: { x: -8, y: -6, z: -25 },
      max: { x: 8, y: 4, z: 0 },
      holes: [],
    },
    {
      id: 'hold2',
      name: 'Cargo Hold 2',
      volume: 1500,
      water: 0,
      fill: 0,
      flow: 0,
      worldLevel: -4.0,
      min: { x: -8, y: -6, z: 0 },
      max: { x: 8, y: 4, z: 25 },
      holes: [],
    },
    {
      id: 'hold1',
      name: 'Cargo Hold 1',
      volume: 1200,
      water: 0,
      fill: 0,
      flow: 0,
      worldLevel: -4.0,
      min: { x: -8, y: -6, z: 25 },
      max: { x: 8, y: 4, z: 50 },
      holes: [],
    },
  ];
}

function createMockDoors() {
  return [
    { id: 'door_engine', bulkhead: true, target: 1, open: 1 },
    { id: 'door_hold3', bulkhead: true, target: 1, open: 0.8 },
    { id: 'door_crew_quarters', bulkhead: false, target: 1, open: 1 },
    { id: 'door_hold1', bulkhead: true, target: 0, open: 0 },
  ];
}

// 1. Full Supervisor Update Loop & Euler-Bernoulli Hull Fracture at >= 355 MPa
function testSupervisorHullStressAndFracture() {
  const sim = createMockSim();
  const compartments = createMockCompartments();
  const doors = createMockDoors();

  const supervisor = new StormworksSupervisor(sim, compartments, doors);
  assert.equal(supervisor.keelFractured, false, 'Initial vessel hull must be intact');

  // Normal calm conditions: compute stress
  const intactGirder = supervisor.calculateHullGirderStress();
  assert.equal(intactGirder.fractured, false, 'Balanced vessel must not fracture');
  assert.ok(intactGirder.ratio < 1.0, 'Stress ratio must be below yield limit');

  // Catastrophic mid-hold flooding: Hold 3 flooded with 120,000 tons of seawater
  compartments[1].water = 120000;
  const mockOcean = { sample: () => 0 };

  // Step supervisor
  supervisor.step(0.1, 1.0, mockOcean, 1.0);

  assert.equal(supervisor.keelFractured, true, 'Keel must yield under 120,000 ton mid-hold flood');
  assert.ok(supervisor.fractureJoint >= 0, 'Fracture joint must be identified');
  assert.equal(sim.forceSink, true, 'Catastrophic fracture must trigger forceSink');

  console.log('  ok supervisor update loop and hull girder fracture at >= 355 MPa');
}

// 2. Master Bulkhead Lockdown Command
function testMasterBulkheadLockdown() {
  const sim = createMockSim();
  const compartments = createMockCompartments();
  const doors = createMockDoors();

  const supervisor = new StormworksSupervisor(sim, compartments, doors);

  const closedCount = supervisor.lockdownBulkheads();
  assert.equal(closedCount, 2, 'Must close exactly the two open watertight bulkheads');
  assert.equal(doors[0].target, 0, 'Engine bulkhead target must be set to 0');
  assert.equal(doors[1].target, 0, 'Hold 3 bulkhead target must be set to 0');
  assert.equal(doors[2].target, 1, 'Non-bulkhead crew door target must remain untouched');
  assert.equal(doors[3].target, 0, 'Already closed bulkhead must remain target 0');

  console.log('  ok master bulkhead lockdown closes all watertight doors simultaneously');
}

// 3. Sandbox Controls: God Mode, Noclip, and Flood Dial
function testSandboxControls() {
  const sim = createMockSim();
  const compartments = createMockCompartments();
  const doors = createMockDoors();

  const supervisor = new StormworksSupervisor(sim, compartments, doors);

  // Initial sandbox defaults
  assert.equal(supervisor.isGodMode(), false);
  assert.equal(supervisor.isNoclip(), false);
  assert.equal(supervisor.getFloodRate(), 1);
  assert.equal(supervisor.filterDamage(60), 60);
  assert.equal(supervisor.filterOxygenDrain(0.2), 0.2);

  // Toggle God Mode
  const godActive = supervisor.toggleGodMode();
  assert.equal(godActive, true);
  assert.equal(supervisor.isGodMode(), true);
  assert.equal(supervisor.filterDamage(60), 0, 'God mode must nullify all damage');
  assert.equal(supervisor.filterOxygenDrain(0.2), 0, 'God mode must prevent oxygen drain / drowning');

  // Cycle Flood Dial: 1x -> 3x -> 0x (frozen water) -> 0.5x -> 1x
  const rate3x = supervisor.cycleFloodRate();
  assert.equal(rate3x, 3);
  assert.equal(supervisor.getFloodRate(), 3);

  const rateFrozen = supervisor.cycleFloodRate();
  assert.equal(rateFrozen, 0);
  assert.equal(supervisor.getFloodRate(), 0, '0x flood rate completely halts water ingress');

  // Toggle Noclip
  const noclipActive = supervisor.toggleNoclip();
  assert.equal(noclipActive, true);
  assert.equal(supervisor.isNoclip(), true);

  console.log('  ok sandbox controls: god mode, flood dial multiplier and noclip toggle');
}

// 4. Crew AI and Ragdoll Stepping within Supervisor Loop
function testCrewAndRagdollSupervisorIntegration() {
  const sim = createMockSim();
  const compartments = createMockCompartments();
  const doors = createMockDoors();

  // Create a breach in Hold 2 within engineer reach
  const hole = {
    pos: { x: 0, y: -5.0, z: 10.0 },
    area: 0.5,
    normal: { x: 0, y: 0, z: 1 },
    compartmentIndex: 2,
  };
  compartments[2].holes.push(hole);

  const supervisor = new StormworksSupervisor(sim, compartments, doors);
  assert.equal(supervisor.crew.length, 3, 'Must deploy standard 3-man damage control team');

  const mockOcean = { sample: () => 0 };

  // Step supervisor loop for 200 iterations (10s)
  for (let i = 0; i < 200 && hole.area > 0.01; i++) {
    supervisor.step(0.05, i * 0.05, mockOcean, 1.0);
  }

  // Verify breach was repaired by crew member (filtered out or area <= 0.01)
  assert.ok(compartments[2].holes.length === 0 || hole.area <= 0.01, 'Autonomous damage control crew must patch breach');

  // Test ragdoll activation on high water velocity or blast impulse
  const blastImpulse = 300; // >= 250 N*s triggers ragdoll
  supervisor.step(0.05, 11.0, mockOcean, 1.0, undefined, blastImpulse);

  // Check crew state: high impulse triggers ragdoll state
  const dcSailor = supervisor.crew.find(c => c.name === 'DC Sailor');
  assert.ok(dcSailor, 'Must find DC Sailor crew member');
  assert.equal(dcSailor.state, 'ragdoll', 'Blast impulse >= 250 Ns must transition crew to ragdoll');

  console.log('  ok crew damage control and ragdoll dynamics stepped inside supervisor loop');
}

testSupervisorHullStressAndFracture();
testMasterBulkheadLockdown();
testSandboxControls();
testCrewAndRagdollSupervisorIntegration();

console.log('Stormworks supervisor unit tests passed.');
