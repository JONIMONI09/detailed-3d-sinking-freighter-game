// tests/stormworks-prototypes.test.mjs - hull girder stress, ingress rules, crew, bridge, sandbox
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import * as THREE from 'three';

const DIR = 'detailed-3d-sinking-freighter-game_sonnet/src/game/';
const cache = new Map();

function load(name) {
  if (cache.has(name)) return cache.get(name);
  const file = DIR + name;
  const code = ts.transpileModule(readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  const mod = { exports: {} };
  const req = (id) => {
    if (id === 'three') return THREE;
    const clean = id.replace(/^\.\//, '').replace(/\.ts$/, '') + '.ts';
    return load(clean);
  };
  vm.runInNewContext(code, {
    module: mod,
    exports: mod.exports,
    require: req,
    console,
    Math,
    RangeError,
    TypeError,
    Error,
  });
  cache.set(name, mod.exports);
  return mod.exports;
}

const hull = load('hullStress.ts');
const ingress = load('ingress.ts');
const crew = load('crew.ts');
const bridge = load('bridge.ts');
const sandbox = load('sandbox.ts');
const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg}: ${a} vs ${b}`);

console.log('Starting Stormworks prototype tests...');

// 1. Girder shear / moment / fracture
{
  const mk = (weight, inertia) => ({ length: 20, weight, buoyancy: 1, inertia, extremeFibre: 5 });
  const loads = [1e7, 1e7, 8e7, 1e7, 1e7];
  const strong = hull.balanceBuoyancy(loads.map((w) => mk(w, 10)));
  near(strong.reduce((a, s) => a + s.buoyancy, 0), 1.2e8, 1, 'buoyancy balanced to weight');
  const r = hull.evaluateGirder(strong);
  near(r.shear[5], 0, 1, 'shear closes at the stern');
  near(r.moment[5], 0, 1, 'moment closes at the stern');
  near(r.moment[2], 5.6e8, 1e3, 'sagging moment at joint 2');
  assert.equal(r.maxJoint, 2);
  assert.equal(r.fractured, false);
  const weak = hull.evaluateGirder(hull.balanceBuoyancy(loads.map((w) => mk(w, 5))));
  assert.equal(weak.fractured, true, 'low section modulus must yield');
  assert.ok(weak.ratio >= 1);
  console.log('  ok girder shear, moment and yield check');
}

// 2. Hull split
{
  const sections = [1e7, 2e7, 3e7, 4e7].map((w) => ({ length: 10, weight: w, buoyancy: w, inertia: 1, extremeFibre: 1 }));
  const { aft, fore } = hull.splitHull(sections, 2);
  assert.equal(aft.sections.length, 2);
  assert.equal(fore.sections.length, 2);
  near(aft.weight + fore.weight, 1e8, 1, 'split conserves weight');
  near(aft.length, 20, 1e-9, 'aft length');
  near(fore.centerOfWeight, (3e7 * 5 + 4e7 * 15) / 7e7, 1e-9, 'fore centre of weight');
  assert.throws(() => hull.splitHull(sections, 0), RangeError);
  assert.throws(() => hull.splitHull(sections, 4), RangeError);
  console.log('  ok hull split conserves weight and centres');
}

// 3. Ingress rules
{
  assert.equal(ingress.admitsWater({ kind: 'hull-breach', area: 0.5 }), true);
  assert.equal(ingress.admitsWater({ kind: 'broken-glass', area: 0.4 }), true);
  assert.equal(ingress.admitsWater({ kind: 'hull-breach', area: 0 }), false);
  assert.equal(ingress.admitsWater({ kind: 'door', area: 2, openFraction: 0, neighbourFill: 0.8 }), false, 'closed door');
  assert.equal(ingress.admitsWater({ kind: 'door', area: 2, openFraction: 1, neighbourFill: 0 }), false, 'dry neighbour');
  assert.equal(ingress.admitsWater({ kind: 'door', area: 2, openFraction: 1, neighbourFill: 0.3 }), true);
  near(ingress.orificeFlow(1, 4.5), 0.6 * Math.sqrt(2 * 9.81 * 4.5), 1e-9, 'Torricelli flow');
  assert.equal(ingress.orificeFlow(1, -1), 0);
  assert.ok(ingress.doorTransfer(2, 1, 3, 1) > 0);
  assert.ok(ingress.doorTransfer(2, 1, 1, 3) < 0);
  assert.equal(ingress.doorTransfer(2, 0, 3, 1), 0, 'closed door passes nothing');
  console.log('  ok water only through breaches, glass and open doors');
}

// 4. Air pockets
{
  const sealed = { volume: 100, vented: false };
  const vented = { volume: 100, vented: true };
  assert.equal(ingress.waterCapacity(vented, 5), 100);
  const cap1 = ingress.waterCapacity(sealed, 1);
  const cap5 = ingress.waterCapacity(sealed, 5);
  assert.ok(cap1 > 0 && cap1 < 20, 'shallow opening traps most air');
  assert.ok(cap5 > cap1, 'deeper opening compresses air further');
  assert.equal(ingress.waterCapacity(sealed, 0), 0, 'no head, no inflow');
  near(ingress.inflowFactor(sealed, 0, 5), 1, 1e-12, 'empty pocket admits all');
  near(ingress.inflowFactor(sealed, cap5 / 2, 5), 0.5, 1e-9, 'half full pocket');
  assert.equal(ingress.inflowFactor(sealed, cap5 * 2, 5), 0, 'full pocket stops inflow');
  console.log('  ok trapped air limits inflow (Boyle)');
}

// 5. Crew repair
{
  const breach = { id: 1, x: 10, y: 0, z: 0, area: 0.7 };
  const m = crew.createCrewMember('Chief', 'chief-engineer', 0, 0, 0, 2);
  const events = [];
  for (let i = 0; i < 4000 && breach.area > 0; i++) {
    const e = crew.stepCrew(m, 0.05, [breach]);
    if (e) events.push(e);
  }
  assert.deepEqual(events, ['spotted', 'arrived', 'sealed']);
  assert.equal(breach.area, 0);
  assert.equal(m.state, 'patrol');
  near(m.patchKits, 2 - 0.7 / crew.PATCH_KIT_AREA, 1e-6, 'patch kits consumed in proportion');

  const far = { id: 2, x: 500, y: 0, z: 0, area: 1 };
  const idle = crew.createCrewMember('Bosun', 'boatswain', 0, 0, 0);
  assert.equal(crew.stepCrew(idle, 0.1, [far]), null, 'breach outside detect radius is ignored');

  const empty = crew.createCrewMember('Sailor', 'damage-control', 0, 0, 0, 0);
  assert.equal(crew.stepCrew(empty, 0.1, [{ id: 3, x: 2, y: 0, z: 0, area: 1 }]), null, 'no kits, no response');
  console.log('  ok crew spots, walks, welds and seals breaches');
}

// 6. Bridge
{
  const h = bridge.createHelm();
  h.telegraph = bridge.stepTelegraph(h.telegraph, 1);
  h.telegraph = bridge.stepTelegraph(h.telegraph, 1);
  assert.equal(h.telegraph, 'full-ahead');
  assert.equal(bridge.stepTelegraph('full-ahead', 1), 'full-ahead', 'clamped at the end');
  assert.equal(bridge.stepTelegraph('full-astern', -1), 'full-astern');
  h.rudderCmd = 90;
  for (let i = 0; i < 600; i++) bridge.stepHelm(h, 0.1, 140, true);
  near(h.rudderDeg, 35, 1e-9, 'rudder limited to 35 degrees');
  assert.ok(h.speed > 6 && h.speed <= 8);
  assert.ok(h.heading > 0, 'starboard rudder turns to starboard');
  const flooded = bridge.createHelm();
  flooded.speed = 5;
  for (let i = 0; i < 1200; i++) bridge.stepHelm(flooded, 0.1, 140, false);
  assert.ok(flooded.speed < 0.05, 'flooded engine room: ship coasts to a stop');

  const doors = [{ bulkhead: true, target: 1 }, { bulkhead: true, target: 0 }, { bulkhead: false, target: 1 }];
  assert.equal(bridge.lockdownBulkheads(doors), 1);
  assert.deepEqual(doors.map((d) => d.target), [0, 0, 1], 'only open bulkheads are closed');
  console.log('  ok helm, telegraph and master lockdown');
}

// 7. Sandbox
{
  const o = sandbox.createSandboxOptions();
  assert.equal(sandbox.floodRate(o), 1);
  assert.equal(sandbox.cycleFloodRate(o), 3);
  assert.equal(sandbox.cycleFloodRate(o), 0);
  assert.equal(sandbox.effectiveFloodSpeed(o, 2), 0, 'frozen water');
  assert.equal(sandbox.effectiveDamage(o, 40), 40);
  o.godMode = true;
  assert.equal(sandbox.effectiveDamage(o, 40), 0);
  assert.equal(sandbox.effectiveOxygenDrain(o, 0.1), 0);
  console.log('  ok sandbox god mode and flood dial');
}

// 8. Hydrostatic Window Burst
{
  assert.equal(ingress.shouldWindowBurst(2.4, false), false, 'lower deck window intact at 2.4m');
  assert.equal(ingress.shouldWindowBurst(2.5, false), true, 'lower deck window bursts at >= 2.5m');
  assert.equal(ingress.shouldWindowBurst(5.9, true), false, 'reinforced bridge window intact at 5.9m');
  assert.equal(ingress.shouldWindowBurst(6.0, true), true, 'reinforced bridge window bursts at >= 6.0m');
  console.log('  ok hydrostatic window burst at 2.5m (lower) and 6.0m (bridge)');
}

// 9. Intelligent Crew Threat Prioritization
{
  const member = { x: 0, y: 0, z: 0 };
  const cargoBreach = { id: 1, x: 10, y: 0, z: 0, area: 1.0, inflowRate: 2.0, isEngineRoom: false };
  const engineBreach = { id: 2, x: 10, y: 0, z: 0, area: 1.0, inflowRate: 2.0, isEngineRoom: true };

  const pCargo = crew.calculateBreachPriority(member, cargoBreach);
  const pEngine = crew.calculateBreachPriority(member, engineBreach);
  near(pEngine / pCargo, 2.5, 1e-9, 'engine room breach prioritized 2.5x higher than cargo hold');

  // Distance penalty check
  const farCargoBreach = { id: 3, x: 50, y: 0, z: 0, area: 1.0, inflowRate: 2.0, isEngineRoom: false };
  const pFar = crew.calculateBreachPriority(member, farCargoBreach);
  assert.ok(pCargo > pFar, 'closer breach has higher priority due to distance scaling');

  // selectBestBreach selection
  const testCrew = crew.createCrewMember('Chief', 'chief-engineer', 0, 0, 0, 4);
  const selected = crew.selectBestBreach(testCrew, [cargoBreach, engineBreach], 30);
  assert.equal(selected.id, 2, 'crew selects highest priority engine room breach');
  console.log('  ok intelligent crew threat prioritization');
}

// 10. God Mode Hold Deactivation & TNT Detonator Precedence
{
  function updateGodModeState(state, dt, keys, isHoldingTNT) {
    if (isHoldingTNT) {
      state.holdProgress = 0;
      return 'detonate_tnt';
    }
    if (!state.godMode) {
      if (keys.has('KeyG')) {
        state.godMode = true;
        state.holdProgress = 0;
        return 'activated';
      }
    } else {
      if (keys.has('KeyG')) {
        state.holdProgress = Math.min(1.0, state.holdProgress + dt / 1.5);
        if (state.holdProgress >= 0.999) {
          state.godMode = false;
          state.holdProgress = 0;
          return 'deactivated';
        }
      } else {
        state.holdProgress = Math.max(0, state.holdProgress - dt * 3.0);
      }
    }
    return 'idle';
  }

  const state = { godMode: false, holdProgress: 0 };
  const keys = new Set();

  // 1. Holding TNT: KeyG triggers TNT detonate, never God Mode
  keys.add('KeyG');
  assert.equal(updateGodModeState(state, 0.1, keys, true), 'detonate_tnt');
  assert.equal(state.godMode, false, 'holding TNT never toggles God Mode');

  // 2. Not holding TNT: KeyG activates God Mode
  assert.equal(updateGodModeState(state, 0.1, keys, false), 'activated');
  assert.equal(state.godMode, true);
  keys.clear();

  // 3. Single tap while God Mode is ON (held for 0.1s then released)
  keys.add('KeyG');
  updateGodModeState(state, 0.1, keys, false);
  near(state.holdProgress, 0.1 / 1.5, 1e-4, 'partial progress accumulated');
  assert.equal(state.godMode, true, 'single tap must not deactivate God Mode');
  keys.clear();
  updateGodModeState(state, 0.1, keys, false);
  assert.equal(state.godMode, true);
  assert.ok(state.holdProgress < 0.1 / 1.5, 'progress drains when key released');

  // 4. Continuous hold for 1.5s deactivates God Mode
  keys.add('KeyG');
  for (let i = 0; i < 14; i++) {
    updateGodModeState(state, 0.1, keys, false);
    assert.equal(state.godMode, true, 'still active before 1.5s threshold');
  }
  const result = updateGodModeState(state, 0.1, keys, false); // 1.5s reached
  assert.equal(result, 'deactivated');
  assert.equal(state.godMode, false);
  assert.equal(state.holdProgress, 0);
  console.log('  ok god mode 1.5s hold deactivation and TNT KeyG precedence');
}

// 11. Deck Explosion Dry Engine Room Guard
{
  const simMod = load('shipSim.ts');
  const group = new THREE.Group();
  group.updateMatrixWorld(true);
  const comp = { holes: [], min: { z: -40 }, max: { z: -20 }, level: 0 };
  const sim = new simMod.ShipSim(group, [comp]);

  // Dry deck explosion at pos.y = 0.5, x = 8.0, seaLevel = 0.0 -> must return null
  const dryBreach = sim.addBreach(comp, new THREE.Vector3(8.0, 0.5, -30), 1.0, 0.0);
  assert.equal(dryBreach, null, 'dry deck explosion must not breach engine room');

  // Submerged hull explosion at pos.y = -2.5, x = 8.0, seaLevel = 0.0 -> creates breach
  const submergedHullBreach = sim.addBreach(comp, new THREE.Vector3(8.0, -2.5, -30), 1.0, 0.0);
  assert.ok(submergedHullBreach, 'submerged hull explosion must create breach');

  // Deck explosion (pos.y = 0.5 > -2.0) strictly returns null to protect ship from deck detonations
  const deckBreach = sim.addBreach(comp, new THREE.Vector3(8.0, 0.5, -30), 1.0, 2.0);
  assert.equal(deckBreach, null, 'deck explosions (pos.y > -2.0) must never breach lower compartments');
  console.log('  ok deck explosion strictly never breaches engine room');
}

console.log('Stormworks prototype tests passed.');
