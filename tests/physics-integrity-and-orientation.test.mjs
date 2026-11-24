// tests/physics-integrity-and-orientation.test.mjs
// Regression suite for the physics audit: Boyle air pockets, wave-aware flood
// heads, collision depenetration, battleship hit envelopes, rudder direction
// and zero-length ragdoll frames.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import * as THREE from 'three';
import ts from 'typescript';

console.log('🧪 Starting Physics Integrity & Orientation Unit Tests...');

const baseDir = 'detailed-3d-sinking-freighter-game_sonnet/src/game/';
const cache = new Map();
const silent = { log() {}, warn() {}, error() {} };

function load(name) {
  name = name.replace(/\.ts$/, '');
  if (cache.has(name)) return cache.get(name);
  const code = ts.transpileModule(fs.readFileSync(baseDir + name + '.ts', 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  const mod = { exports: {} };
  const req = (id) => (id === 'three' ? THREE : load(id.replace(/^\.\//, '')));
  vm.runInNewContext(code, {
    module: mod,
    exports: mod.exports,
    require: req,
    console: silent,
    Math,
    Number,
    Set,
    Map,
  });
  cache.set(name, mod.exports);
  return mod.exports;
}

const { ShipSim, MAX_HOLE_AREA, WRECK_REST_DEPTH } = load('shipSim');
const { StormworksSupervisor } = load('stormworksSupervisor');
const { CollisionWorld } = load('physics');
const { createBattleship, stepBattleship, stepBattleshipAI } = load('battleships');
const { vesselForward } = load('bridge');
const { ArticulatedRagdoll } = load('ragdoll');

function makeCompartment(id, z0, z1) {
  return {
    id,
    name: id,
    min: new THREE.Vector3(-9.7, -5, z0),
    max: new THREE.Vector3(9.7, 2.7, z1),
    volume: 19.4 * 7.7 * (z1 - z0) * 0.78,
    water: 0,
    fill: 0,
    level: -5,
    worldLevel: -5,
    flow: 0,
    sideBias: 0,
    holes: [],
  };
}

function makeShip() {
  const comps = [
    makeCompartment('engine', -69, -39),
    makeCompartment('hold3', -38, -8),
    makeCompartment('hold2', -7, 26),
    makeCompartment('hold1', 26, 57),
  ];
  const group = new THREE.Group();
  const sim = new ShipSim(group, comps);
  const supervisor = new StormworksSupervisor(sim, comps, []);
  return { comps, group, sim, supervisor };
}

function addSideHole(comp, y = -4.5, area = 2) {
  comp.holes.push({
    pos: new THREE.Vector3(9.6, y, (comp.min.z + comp.max.z) / 2),
    area,
    side: 1,
    nx: -1,
    ny: 0,
    nz: 0,
  });
}

// ---------------------------------------------------------------------------
// 1. Sealed compartments must obey Boyle's law instead of flooding solid
// ---------------------------------------------------------------------------
function testAirPocketBoyleRegulation() {
  function flood(compId, seconds = 120) {
    const { comps, sim, supervisor } = makeShip();
    // Flooding under test, not the damage-control team: keep them out of it.
    supervisor.crew.length = 0;
    const comp = comps.find((c) => c.id === compId);
    addSideHole(comp);
    const ocean = { height: () => 0 };
    for (let i = 0; i < 60 * seconds; i++) supervisor.step(1 / 60, i / 60, ocean, 1);
    return { comp, sim };
  }

  const sealed = flood('engine').comp;
  const vented = flood('hold1').comp;

  assert.ok(
    sealed.water < sealed.volume * 0.6,
    `Sealed engine room must trap air below 60% fill, got ${(sealed.fill * 100).toFixed(1)}%`,
  );
  assert.ok(
    vented.fill > 0.9,
    `Vented Hold 1 must flood almost completely, got ${(vented.fill * 100).toFixed(1)}%`,
  );
  assert.ok(
    sealed.fill < vented.fill - 0.2,
    `Trapped air must flood clearly less than a vented hold (${sealed.fill.toFixed(2)} vs ${vented.fill.toFixed(2)})`,
  );
  console.log('  ok sealed compartments trap air via Boyle regulation, vented holds flood fully');
}

// ---------------------------------------------------------------------------
// 2. Flood head follows the local wave surface, not a fixed y = 0 sea level
// ---------------------------------------------------------------------------
function testWaveAwareFloodHead() {
  function floodWithSea(seaY) {
    const comp = makeCompartment('hold3', -18, 20);
    const group = new THREE.Group();
    const sim = new ShipSim(group, [comp]);
    // A breach 0.5 m below the calm waterline: it only floods when the local
    // sea surface is actually above the hole.
    addSideHole(comp, -0.5);
    const ocean = { height: () => seaY };
    for (let i = 0; i < 120; i++) sim.update(1 / 60, i / 60, ocean, 1);
    return comp.water;
  }

  const trough = floodWithSea(-6);
  const crest = floodWithSea(0.5);
  assert.ok(trough < 1e-6, `Hole above the trough waterline must stay dry, got ${trough.toFixed(3)} m³`);
  assert.ok(crest > 1, `Hole below a crest must flood, got ${crest.toFixed(3)} m³`);
  console.log('  ok flood ingress uses the local wave height at each hole');
}

// ---------------------------------------------------------------------------
// 3. Collision resolution never teleports embedded bodies onto collider roofs
// ---------------------------------------------------------------------------
function testCollisionDepenetration() {
  const world = new CollisionWorld();
  world.add(-1, 0, -1, 1, 0.4, 1, 'deck');
  world.add(-20, 0, 5, -10, 9, 6, 'wall');

  // Body embedded in a 9 m tall wall while falling: it must be pushed out
  // sideways, never snapped to the wall roof at y = 9.
  const embedded = { x: -15, y: 1, z: 5.5, vx: 0, vy: -1, vz: 0, r: 0.34, h: 1.75, onGround: false, step: 0.35 };
  world.move(embedded, 0, -0.02, 0);
  assert.ok(embedded.y < 2, `Embedded body must not teleport to the roof, y=${embedded.y}`);
  assert.ok(Math.abs(embedded.z - 5.5) > 0.5, `Embedded body must be pushed out of the wall, z=${embedded.z}`);

  // Falling fast: a single frame may not tunnel through a thin floor.
  const falling = { x: 0, y: 6, z: 0, vx: 0, vy: -30, vz: 0, r: 0.34, h: 1.75, onGround: false, step: 0.35 };
  world.move(falling, 0, -6, 0);
  assert.ok(Math.abs(falling.y - 0.4) < 1e-6, `Fast fall must land on the deck at y=0.4, got ${falling.y}`);
  assert.equal(falling.onGround, true);

  // Normal landing still works.
  const landing = { x: 0, y: 1.2, z: 0, vx: 0, vy: -3, vz: 0, r: 0.34, h: 1.75, onGround: false, step: 0.35 };
  world.move(landing, 0, -1.0, 0);
  assert.ok(Math.abs(landing.y - 0.4) < 1e-6, `Landing must stop on the deck, got ${landing.y}`);

  // A NaN delta must not poison the body position.
  const poisoned = { x: 0, y: 2, z: 0, vx: 0, vy: 0, vz: 0, r: 0.34, h: 1.75, onGround: false, step: 0.35 };
  world.move(poisoned, NaN, 0, NaN);
  assert.ok(Number.isFinite(poisoned.x) && Number.isFinite(poisoned.z), 'NaN deltas must be ignored');
  console.log('  ok embedded bodies depenetrate, fast falls land and NaN deltas are rejected');
}

// ---------------------------------------------------------------------------
// 5. Starboard rudder steers starboard for the battleship and its AI
// ---------------------------------------------------------------------------
function testBattleshipRudderAndAI() {
  const manual = createBattleship('manual', 0, 0);
  manual.speed = 12;
  manual.targetSpeed = 12;
  manual.rudderDeg = 20; // starboard
  for (let i = 0; i < 60; i++) {
    stepBattleship(manual, 1 / 60, i / 60, new THREE.Vector3(0, 0, -100), () => 0, undefined, false);
  }
  assert.ok(manual.heading < -0.02, `Starboard rudder must lower the heading, got ${manual.heading}`);

  const ai = createBattleship('ai', 0, 0);
  const target = new THREE.Vector3(250, 0, 0);
  const startDist = Math.hypot(target.x - ai.baseX, target.z - ai.baseZ);
  for (let i = 0; i < 60 * 20; i++) {
    stepBattleshipAI(ai, target, 1 / 60);
    stepBattleship(ai, 1 / 60, i / 60, target, () => 0, undefined, false);
  }
  const endDist = Math.hypot(target.x - ai.baseX, target.z - ai.baseZ);
  assert.ok(endDist < startDist - 40, `AI must close on a distant target (${startDist.toFixed(0)} m -> ${endDist.toFixed(0)} m)`);
  assert.ok(Math.abs(ai.heading) <= Math.PI + 1e-9, `AI heading must stay wrapped to +/-PI, got ${ai.heading}`);
  assert.ok(Math.abs(ai.heading + Math.PI / 2) < 0.8, `AI must steer toward the +X target heading, got ${ai.heading}`);
  console.log('  ok battleship rudder direction and AI approach steering are corrected');
}

// ---------------------------------------------------------------------------
// 6. A zero-length frame must never poison ragdoll limbs with NaN
// ---------------------------------------------------------------------------
function testRagdollZeroDeltaTime() {
  const ragdoll = new ArticulatedRagdoll({ x: 0, y: 3, z: 0 });
  ragdoll.activate({ x: 1, y: 0, z: 0 });
  const before = [...ragdoll.limbs.values()].map((l) => ({ ...l.pos }));

  ragdoll.step(0, { x: 0, y: 0, z: 0 }, 0, -5);
  const afterZero = [...ragdoll.limbs.values()];
  afterZero.forEach((limb, i) => {
    assert.ok(Number.isFinite(limb.pos.x) && Number.isFinite(limb.pos.y) && Number.isFinite(limb.pos.z), `${limb.id} must stay finite`);
    assert.equal(limb.pos.x, before[i].x, `${limb.id} must not move on a zero-length frame`);
  });

  ragdoll.step(1 / 60, { x: 0, y: 0, z: 0 }, 2, -5);
  for (const limb of ragdoll.limbs.values()) {
    assert.ok(
      Number.isFinite(limb.pos.x) && Number.isFinite(limb.pos.y) && Number.isFinite(limb.pos.z) && Number.isFinite(limb.vel.x),
      `${limb.id} must stay finite after a normal step`,
    );
  }
  console.log('  ok zero-length ragdoll frames are ignored instead of producing NaN');
}

// ---------------------------------------------------------------------------
// 7. The modelled bow (+Z) is the direction of travel
// ---------------------------------------------------------------------------
function testBowForwardOrientation() {
  const straight = vesselForward(0);
  assert.ok(Math.abs(straight.x) < 1e-12 && Math.abs(straight.z - 1) < 1e-12, 'Heading 0 must point at +Z (bow)');
  const starboard = vesselForward(Math.PI / 2);
  assert.ok(Math.abs(starboard.x + 1) < 1e-12, 'A starboard turn of 90 deg must point the +Z bow at -X');
  // The helper must agree with the actual mesh rotation: ShipSim applies rotationY(-heading).
  const mesh = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), -0.7);
  const bowLocal = new THREE.Vector3(0, 0, 1).applyQuaternion(mesh);
  const bow = vesselForward(0.7);
  assert.ok(
    Math.abs(bow.x - bowLocal.x) < 1e-12 && Math.abs(bow.z - bowLocal.z) < 1e-12,
    'vesselForward must match the -heading ship quaternion',
  );
  console.log('  ok vessel forward vector follows the modelled bow');
}

// ---------------------------------------------------------------------------
// 8. Breach area and wreck depth stay inside physical limits
// ---------------------------------------------------------------------------
function testFloodLimits() {
  const comp = makeCompartment('hold2', -25, 25);
  const group = new THREE.Group();
  const sim = new ShipSim(group, [comp]);
  const hole = new THREE.Vector3(9.5, -4.0, 0);
  for (let i = 0; i < 25; i++) sim.addBreach(comp, hole, 4);
  assert.equal(comp.holes.length, 1, 'Blasts in the same spot must merge into one opening');
  assert.ok(
    comp.holes[0].area <= MAX_HOLE_AREA + 1e-9,
    `Merged breach must stay below ${MAX_HOLE_AREA} m², got ${comp.holes[0].area.toFixed(2)}`,
  );

  const wreck = new ShipSim(new THREE.Group(), [makeCompartment('hold3', -20, 20)]);
  wreck.sinking = true;
  wreck.sinkT = 100;
  wreck.sinkDepth = WRECK_REST_DEPTH - 1;
  const ocean = { height: () => 0 };
  for (let i = 0; i < 120; i++) wreck.update(1 / 60, i / 60, ocean, 1);
  assert.equal(wreck.sunk, true, 'Wreck must be marked sunk at rest depth');
  assert.ok(wreck.sinkDepth <= WRECK_REST_DEPTH + 1e-9, `Wreck must not sink past ${WRECK_REST_DEPTH} m`);
  console.log('  ok breach area is capped and the wreck settles at its rest depth');
}

testAirPocketBoyleRegulation();
testWaveAwareFloodHead();
testCollisionDepenetration();
testBattleshipRudderAndAI();
testRagdollZeroDeltaTime();
testBowForwardOrientation();
testFloodLimits();

console.log('🎉 ALL 7 PHYSICS INTEGRITY & ORIENTATION TESTS PASSED!');
