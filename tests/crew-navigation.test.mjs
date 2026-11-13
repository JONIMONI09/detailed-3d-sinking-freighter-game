// tests/crew-navigation.test.mjs - 5-ray anti-clipping steering, door portal sequence, ladder climbing
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

console.log('Starting Crew 3D Navigation and Steering Unit Tests...');

const NAVMESH_PATH = 'detailed-3d-sinking-freighter-game_sonnet/src/game/navmesh3d.ts';
function loadTs(path, customRequire) {
  const code = ts.transpileModule(readFileSync(path, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  const mod = { exports: {} };
  const req = customRequire || ((id) => require(id));
  vm.runInNewContext(code, { module: mod, exports: mod.exports, require: req, console, Math });
  return mod.exports;
}

const navmesh = loadTs(NAVMESH_PATH);

// 1. 5-Ray Anti-Clipping Steering and Tangential Deflection
function test5RaySteeringAndDeflection() {
  // Test buildSensorRays configuration
  const pos = { x: 0, y: 1.0, z: 0 };
  const rays = navmesh.buildSensorRays(pos, 0, 0.8);
  assert.ok(rays.center, 'Must include center ray');
  assert.ok(rays.chestLeft, 'Must include chestLeft ray');
  assert.ok(rays.chestRight, 'Must include chestRight ray');
  assert.ok(rays.kneeLeft, 'Must include kneeLeft ray');
  assert.ok(rays.kneeRight, 'Must include kneeRight ray');

  // Verify lateral offsets (+/- 0.35m) and vertical offsets (chest 1.3m, knee 0.4m)
  assert.ok(Math.abs(Math.abs(rays.chestLeft.origin.x - pos.x) - 0.35) < 1e-6);
  assert.ok(Math.abs(rays.chestLeft.origin.y - (pos.y + 1.3)) < 1e-6);
  assert.ok(Math.abs(rays.kneeLeft.origin.y - (pos.y + 0.4)) < 1e-6);

  // Test tangential deflection: v' = v - (v . n) n
  // Moving forward into a wall normal [0, 0, -1]
  const wallNormal = { x: 0, y: 0, z: -1 };
  const mockRaycastWall = (origin, dir, maxDist) => {
    // If ray points towards positive Z, hit wall at distance 0.3m
    if (dir.z > 0) {
      return { hit: true, distance: 0.3, normal: wallNormal, point: { x: origin.x, y: origin.y, z: origin.z + 0.3 } };
    }
    return { hit: false, distance: maxDist, normal: { x: 0, y: 0, z: 0 }, point: { x: 0, y: 0, z: 0 } };
  };

  const desiredVel = { x: 0, y: 0, z: 1.5 };
  const steered = navmesh.computeAntiClippingSteering(pos, desiredVel, mockRaycastWall, 0.5);
  assert.equal(steered.deflected, true, 'Frontal obstacle must trigger deflection');
  assert(Math.abs(steered.vel.z) < 1e-4, 'Forward motion into perpendicular wall must be halted');

  // Angled wall at 45 degrees: normal = [-0.7071, 0, -0.7071]
  const angledNormal = { x: -Math.SQRT1_2, y: 0, z: -Math.SQRT1_2 };
  const mockRaycastAngled = (origin, dir, maxDist) => {
    return { hit: true, distance: 0.3, normal: angledNormal, point: { x: origin.x, y: origin.y, z: origin.z + 0.3 } };
  };

  const angledSteered = navmesh.computeAntiClippingSteering(pos, desiredVel, mockRaycastAngled, 0.5);
  assert.equal(angledSteered.deflected, true);
  // Velocity must slide along tangent: (v' . n) == 0
  const normalDot = angledSteered.vel.x * angledNormal.x + angledSteered.vel.y * angledNormal.y + angledSteered.vel.z * angledNormal.z;
  assert(Math.abs(normalDot) < 1e-4, `Deflected velocity must be perpendicular to normal, got ${normalDot}`);
  assert(angledSteered.vel.x < 0, 'Velocity should slide along negative X direction');
  assert(angledSteered.vel.z > 0, 'Velocity should maintain forward Z slide');

  console.log('  ok 5-ray forward probe array and tangential deflection');
}

// 2. Door Traversal State Machine: Approach -> Open -> Step Through -> Close Behind
function testDoorTraversalSequence() {
  const doorRef = { open: 0, target: 0, locked: false, bulkhead: true };
  const portal = {
    id: 'door_mid_hold',
    name: 'Hold Bulkhead Door',
    entry: { x: 0, y: 0, z: 5.0 },
    exit: { x: 0, y: 0, z: 7.0 },
    threshold: { x: 0, y: 0, z: 6.0 },
    normal: { x: 0, y: 0, z: 1.0 },
    differential: 0.05,
    doorRef,
  };

  const tracker = navmesh.startDoorInteraction(portal);
  assert.equal(tracker.state, 'approach');

  // Step 1: Agent approaching door from z = 2.0m (distance to entry = 3.0m)
  const step1 = navmesh.updateDoorInteraction(tracker, { x: 0, y: 0, z: 2.0 }, 0.1);
  assert.equal(tracker.state, 'approach');
  assert.equal(step1.canMove, true);

  // Step 2: Agent within 1.5m of door entry (z = 4.0m)
  const step2 = navmesh.updateDoorInteraction(tracker, { x: 0, y: 0, z: 4.0 }, 0.1);
  assert.equal(tracker.state, 'check_pressure');
  assert.equal(step2.canMove, false);

  // Step 3: Check pressure and transition to open (sets target = 1)
  const step3 = navmesh.updateDoorInteraction(tracker, { x: 0, y: 0, z: 4.8 }, 0.1);
  assert.equal(tracker.state, 'open');
  assert.equal(doorRef.target, 1, 'Door target must be set to 1 (opening)');

  // Step 4: Wait for door to open (simulate door open >= 0.85) -> transitions to traverse
  doorRef.open = 0.9;
  const step4 = navmesh.updateDoorInteraction(tracker, { x: 0, y: 0, z: 4.8 }, 0.1);
  assert.equal(tracker.state, 'traverse');
  assert.equal(step4.canMove, true);

  // Step 5: Step through to exit (z = 6.8m, dist to exit < 0.6m) -> transitions to step_beyond
  const step5 = navmesh.updateDoorInteraction(tracker, { x: 0, y: 0, z: 6.8 }, 0.1);
  assert.equal(tracker.state, 'step_beyond');

  // Step 6: Step beyond threshold -> sets doorRef.target = 0 and transitions to close_behind
  const step6 = navmesh.updateDoorInteraction(tracker, { x: 0, y: 0, z: 7.2 }, 0.1);
  assert.equal(tracker.state, 'close_behind');
  assert.equal(doorRef.target, 0, 'Door target must be set to 0 (closing behind)');

  // Step 7: Wait for door to fully close (open <= 0.1) -> transitions to complete
  doorRef.open = 0.05;
  const step7 = navmesh.updateDoorInteraction(tracker, { x: 0, y: 0, z: 7.2 }, 0.1);
  assert.equal(tracker.state, 'complete');
  assert.equal(step7.canMove, true);

  console.log('  ok door traversal: approach -> open -> traverse -> close behind');
}

// 3. Vertical Ladder Ascent / Descent without Clipping or Teleportation
function testVerticalLadderClimbing() {
  const ladder = {
    id: 'ladder_engine_room',
    bottom: { x: 0, y: -2.0, z: 12.0 },
    top: { x: 0, y: 2.4, z: 12.0 },
    facingYaw: 0,
    kind: 'fixed',
    climbSpeed: 1.1,
  };

  const tracker = navmesh.startLadderClimb(ladder, 'up');
  assert.equal(tracker.active, true);
  assert.equal(tracker.direction, 'up');
  assert.equal(tracker.currentY, -2.0);

  // Climb upwards for 2.0s -> delta Y = 1.1 m/s * 2.0s = 2.2m => Y = 0.2m
  const step1 = navmesh.updateLadderClimb(tracker, 2.0);
  assert(Math.abs(tracker.currentY - 0.2) < 1e-4, `Expected 0.2m, got ${tracker.currentY}`);
  assert.equal(step1.finished, false);

  // Climb upwards for another 2.0s -> Y = 2.4m (reaches top landing)
  const step2 = navmesh.updateLadderClimb(tracker, 2.0);
  assert.equal(tracker.currentY, 2.4);
  assert.equal(step2.finished, true, 'Climb must complete upon reaching top landing');
  assert.equal(tracker.active, false);

  console.log('  ok ladder climb: continuous vertical kinematic motion (1.1 m/s) without teleportation');
}

// 4. Portable Ladder Deployment for High Breaches
function testPortableLadderPlacement() {
  const graph = new navmesh.NavMesh3D();
  const breachPos = { x: 2.5, y: 3.2, z: -10.0 };
  const deckPos = { x: 2.5, y: 0.0, z: -10.0 };

  const ladder = graph.deployPortableLadder('ladder_breach_1', deckPos, breachPos, Math.PI / 2);
  assert.ok(ladder, 'Must return deployed portable ladder');
  assert.equal(ladder.kind, 'portable');
  assert.equal(ladder.bottom.y, 0.0);
  assert.equal(ladder.top.y, 3.2);
  assert.equal(ladder.climbSpeed, 1.1);

  // Verify ladder removal after breach is sealed
  const removed = graph.removePortableLadder('ladder_breach_1');
  assert.equal(removed, true, 'Portable ladder must be cleanable after repair');

  console.log('  ok portable damage control ladder deployed for high breaches (> 1.8m)');
}

// 5. Below-Deck Descent & Jump-Down Fallback for Lower-Hold Explosions
function testBelowDeckDescentAndDropJump() {
  const ragdollMod = loadTs('detailed-3d-sinking-freighter-game_sonnet/src/game/ragdoll.ts', (id) => {
    if (id === './navmesh3d') return navmesh;
    throw new Error(`Unexpected require in ragdoll: ${id}`);
  });
  const crewMod = loadTs('detailed-3d-sinking-freighter-game_sonnet/src/game/crew.ts', (id) => {
    if (id === './navmesh3d') return navmesh;
    if (id === './ragdoll') return ragdollMod;
    throw new Error(`Unexpected require: ${id}`);
  });

  // Case A: Crew on main deck above solid steel deck (blocked downward) -> drops/jumps down after stuck threshold
  const world = {
    move(body, dx, dy, dz) {
      body.x += dx;
      body.z += dz;
      const nextY = body.y + dy;
      const onUpperDeck = body.y >= 2.8 && !(body.x >= -9.35 && body.x <= -6.05 && body.z >= 18.5 && body.z <= 25.5);
      const floor = onUpperDeck && body.y >= 2.8 ? 3.0 : -5.0;
      if (nextY <= floor) {
        body.y = floor;
        body.onGround = true;
      } else {
        body.y = nextY;
        body.onGround = false;
      }
    },
    raycast() {
      return { hit: false, distance: Infinity };
    },
  };

  // Start crew right at holdHole entrance on main deck (y = 3.0) with a breach in Cargo Hold 2 (y = -3.5)
  const member = {
    name: 'Test Diver',
    role: 'damage-control',
    x: -7.7,
    y: 3.0,
    z: 27.5,
    state: 'moving',
    targetId: 1,
    patchKits: 4,
    stateTime: 0,
    patrolIndex: 0,
    onGround: true,
    vy: 0,
  };
  const breaches = [{ id: 1, x: 0, y: -3.5, z: 10.0, area: 1.5, kind: 'hull-breach' }];
  const cfg = { ...crewMod.DEFAULT_CREW_CONFIG, walkSpeed: 4.5, repairRate: 1.2 };

  for (let i = 0; i < 400; i++) {
    crewMod.stepCrew(member, 0.05, breaches, cfg, { world, raycast: world.raycast });
    if (breaches[0].area <= 0) break;
  }

  assert.ok(member.y < 0, `Expected crew to descend below main deck (y < 0), got y=${member.y}`);
  assert.equal(breaches[0].area, 0, 'Expected crew to reach and seal the lower-hold breach');
  console.log('  ok crew descends/jumps into lower holds and seals explosion breach');
}

test5RaySteeringAndDeflection();
testDoorTraversalSequence();
testVerticalLadderClimbing();
testPortableLadderPlacement();
testBelowDeckDescentAndDropJump();

console.log('Crew navigation unit tests passed.');
