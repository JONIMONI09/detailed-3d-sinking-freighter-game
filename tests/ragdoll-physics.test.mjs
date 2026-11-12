// tests/ragdoll-physics.test.mjs - Rapier3D ragdoll trigger thresholds, buoyancy & drag, joint limit clamping
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

console.log('Starting Ragdoll Physics & Hydrodynamic Reaction Unit Tests...');

const NAVMESH_PATH = 'detailed-3d-sinking-freighter-game_sonnet/src/game/navmesh3d.ts';
const RAGDOLL_PATH = 'detailed-3d-sinking-freighter-game_sonnet/src/game/ragdoll.ts';

function loadTs(path, customRequire) {
  const code = ts.transpileModule(readFileSync(path, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  const mod = { exports: {} };
  const req = customRequire || ((id) => require(id));
  vm.runInNewContext(code, { module: mod, exports: mod.exports, require: req, console, Math });
  return mod.exports;
}

const navmeshModule = loadTs(NAVMESH_PATH);
const ragdollModule = loadTs(RAGDOLL_PATH, (id) => id === './navmesh3d' ? navmeshModule : require(id));

// 1. Ragdoll Trigger Conditions (Water Jet >= 4.5 m/s, Blast >= 250 Ns, Roll >= 35 deg)
function testRagdollTriggerConditions() {
  const checkTrigger = ragdollModule.shouldTriggerRagdoll;

  // Calm conditions -> no ragdoll
  assert.equal(checkTrigger({ waterVelocity: 1.2, blastImpulse: 50, vesselRollDeg: 5 }), false);

  // High-pressure Torricelli water breach jet (>= 4.5 m/s) -> ragdoll triggered!
  assert.equal(checkTrigger({ waterVelocity: 4.5 }), true, 'Water velocity 4.5 m/s must trigger ragdoll');
  assert.equal(checkTrigger({ waterVelocity: 6.8 }), true, 'Water velocity 6.8 m/s must trigger ragdoll');
  assert.equal(checkTrigger({ waterVelocity: 4.4 }), false, 'Sub-threshold velocity must not trigger ragdoll');

  // TNT explosion shockwave impulse (>= 250 N*s) -> ragdoll triggered!
  assert.equal(checkTrigger({ blastImpulse: 250 }), true, 'Blast impulse 250 Ns must trigger ragdoll');
  assert.equal(checkTrigger({ blastImpulse: 400 }), true, 'Blast impulse 400 Ns must trigger ragdoll');
  assert.equal(checkTrigger({ blastImpulse: 240 }), false, 'Sub-threshold blast must not trigger ragdoll');

  // Severe vessel capsizing roll (>= 35 degrees) -> crew loses footing, ragdoll triggered!
  assert.equal(checkTrigger({ vesselRollDeg: 35.0 }), true, 'Vessel roll 35 deg must trigger ragdoll');
  assert.equal(checkTrigger({ vesselRollDeg: -42.0 }), true, 'Port roll -42 deg must trigger ragdoll');
  assert.equal(checkTrigger({ vesselRollDeg: 34.5 }), false, 'Sub-threshold roll must not trigger ragdoll');

  console.log('  ok ragdoll trigger: water jet >= 4.5 m/s, blast >= 250 Ns, roll >= 35 deg');
}

// 2. Hydrodynamic Per-Limb Buoyancy and Current Drag Force
function testHydrodynamicBuoyancyAndDrag() {
  const computeHydro = ragdollModule.computeLimbHydrodynamics;
  const RHO_WATER = ragdollModule.RHO_WATER || 1025;
  const GRAVITY = ragdollModule.GRAVITY || 9.81;

  // Test limb: chest (mass 14kg, volume 0.015 m^3 -> buoyant force = 1025 * 0.015 * 9.81 = 150.8 N > 14 * 9.81 = 137.3 N => floats!)
  const chestLimb = {
    id: 'chest',
    pos: { x: 0, y: 0.5, z: 0 },
    prevPos: { x: 0, y: 0.5, z: 0 },
    vel: { x: 0, y: 0, z: 0 },
    mass: 14,
    volume: 0.015,
    area: 0.14,
    dragCoeff: 0.82,
    submergedFraction: 0,
  };

  // Water level at y = 1.0m (fully submerged chest at y = 0.5m)
  const waterSurfaceY = 1.0;
  const zeroWaterVel = { x: 0, y: 0, z: 0 };

  const hydroCalm = computeHydro(chestLimb, zeroWaterVel, waterSurfaceY);
  assert.equal(hydroCalm.submerged, true, 'Limb below surface must be submerged');
  assert.equal(chestLimb.submergedFraction, 1.0, 'Fully submerged fraction must be 1.0');
  // Net vertical force = buoyancy (150.8 N) - gravity (137.3 N) > 0
  assert(hydroCalm.buoyancy.y > 0, 'Buoyancy must act upwards');
  assert(hydroCalm.drag.x === 0 && hydroCalm.drag.z === 0, 'Zero current produces zero lateral drag');

  // Fast water current rushing through corridor at 3.5 m/s along positive Z
  const fastWaterVel = { x: 0, y: 0, z: 3.5 };
  const hydroCurrent = computeHydro(chestLimb, fastWaterVel, waterSurfaceY);
  assert(hydroCurrent.drag.z > 0, 'Positive Z water current must produce positive Z drag force');
  // F_drag = 0.5 * Cd * rho * A * v^2 = 0.5 * 0.82 * 1025 * 0.14 * 3.5^2 ~= 721 N!
  assert(hydroCurrent.drag.z > 200, 'Submerged limb must experience strong drag from water current');

  console.log('  ok hydrodynamic per-limb buoyancy (Fb = rho*V*g) and current drag acceleration');
}

// 3. Articulated Joint Limit Clamping Across 12 Humanoid Segments
function testArticulatedJointLimits() {
  const segments = ragdollModule.HUMANOID_12_SEGMENTS;
  assert.equal(segments.length, 12, 'Must specify exactly 12 articulated ragdoll body segments');

  const ragdoll = new ragdollModule.ArticulatedRagdoll({ x: 0, y: 1.0, z: 0 });
  assert.equal(ragdoll.limbs.size, 12, 'Articulated ragdoll must instantiate 12 limbs');

  // Verify all segment IDs exist
  const expectedIds = [
    'pelvis', 'spine', 'chest', 'head',
    'upper_arm_l', 'lower_arm_l',
    'upper_arm_r', 'lower_arm_r',
    'thigh_l', 'calf_l',
    'thigh_r', 'calf_r'
  ];
  for (const id of expectedIds) {
    assert.ok(ragdoll.limbs.has(id), `Missing limb: ${id}`);
  }

  // Simulate extreme step under gravity and water current
  const waterVel = { x: 0, y: 0, z: 4.0 };
  for (let i = 0; i < 20; i++) {
    ragdoll.step(0.016, waterVel, 1.5, 0.0);
  }

  // Verify ragdoll was swept forward by water current
  const pelvisPos = ragdoll.limbs.get('pelvis').pos;
  assert(pelvisPos.z > 0, 'Ragdoll pelvis must be swept downstream by water current');

  // Verify limb distances are constrained to bone lengths
  const chestPos = ragdoll.limbs.get('chest').pos;
  const spinePos = ragdoll.limbs.get('spine').pos;
  const spineChestDist = Math.hypot(chestPos.x - spinePos.x, chestPos.y - spinePos.y, chestPos.z - spinePos.z);
  // Target distance is ~0.26m; constraint relaxation keeps it within +/- 0.05m
  assert(Math.abs(spineChestDist - 0.26) < 0.08, `Spine-chest joint distance exceeded constraint: ${spineChestDist}`);

  console.log('  ok articulated joint limit constraints clamped across 12 humanoid body segments');
}

testRagdollTriggerConditions();
testHydrodynamicBuoyancyAndDrag();
testArticulatedJointLimits();

console.log('Ragdoll physics unit tests passed.');
