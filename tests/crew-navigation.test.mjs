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
  const navgridMod = loadTs('detailed-3d-sinking-freighter-game_sonnet/src/game/navgrid.ts');
  const shipNavGraphMod = loadTs('detailed-3d-sinking-freighter-game_sonnet/src/game/shipNavGraph.ts');
  const crewMod = loadTs('detailed-3d-sinking-freighter-game_sonnet/src/game/crew.ts', (id) => {
    if (id === './navmesh3d') return navmesh;
    if (id === './ragdoll') return ragdollMod;
    if (id === './navgrid') return navgridMod;
    if (id === './shipNavGraph') return shipNavGraphMod;
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

  // Case B: Anti-loop fall respawn & active per-member patrol
  const floater = crewMod.createCrewMember('LoopBot', 'boatswain', 3.5, 3.0, 16.0, 4);
  floater.y = 3.0;
  floater.onGround = false;
  floater.patrol = [
    { x: 3.5, y: 3.0, z: 16.0 },
    { x: 3.5, y: 3.0, z: 24.0 },
  ];
  const voidWorld = {
    move(body, dx, dy, dz) {
      body.x += dx;
      body.y += dy;
      body.z += dz;
      body.onGround = false;
    },
    raycast() {
      return { hit: false, distance: Infinity };
    },
  };
  let respawnedCleanly = false;
  let prevY = floater.y;
  for (let i = 0; i < 65; i++) {
    crewMod.stepCrew(floater, 0.05, [], undefined, { world: voidWorld, raycast: voidWorld.raycast });
    if (floater.y > prevY + 2.0 && floater.falling === false) {
      respawnedCleanly = true;
      break;
    }
    prevY = floater.y;
  }
  assert.equal(respawnedCleanly, true, 'Anti-loop fall respawn must clear falling flag and return bot to valid deck spawnY');
  assert.ok(floater.z >= 16.0, 'Active patrol must advance crew along patrol waypoints');
  console.log('  ok anti-loop fall respawn & active patrol verified');
}

// 6. 2D Grid A* Wall Bypass & Proactive Doorway Traversal
function testGridAStarDoorwayAndWallBypass() {
  const navgridMod = loadTs('detailed-3d-sinking-freighter-game_sonnet/src/game/navgrid.ts');
  // Wall at x = -1.7 from z = -57 to -40 with a 1.0m door gap at z = -53.6
  const boxes = [
    { minX: -1.8, minY: 3.0, minZ: -57.0, maxX: -1.6, maxY: 6.0, maxZ: -54.1, enabled: true, tag: 'wall' },
    { minX: -1.8, minY: 3.0, minZ: -53.1, maxX: -1.6, maxY: 6.0, maxZ: -40.0, enabled: true, tag: 'wall' },
    { minX: -1.8, minY: 3.0, minZ: -54.1, maxX: -1.6, maxY: 5.2, maxZ: -53.1, enabled: true, tag: 'door' },
  ];
  const wp = navgridMod.findNextGridWaypoint(boxes, -0.5, 3.0, -48.0, -4.0, -50.0);
  assert.ok(wp, 'Grid A* must find a valid path through the 1.0m doorway');
  assert.ok(wp.z < -48.0, `Expected A* to head south toward doorway (-53.6), got z=${wp.z}`);
  console.log('  ok 2D Grid A* routes around wall and through 1.0m doorway');
}

// 7. 3D ShipNavGraph Stair Routing & Narrow Catwalk Entry + Stair Tag Exclusion
function test3DShipNavGraphStairAndCatwalkRouting() {
  const shipNavGraphMod = loadTs('detailed-3d-sinking-freighter-game_sonnet/src/game/shipNavGraph.ts');
  const navgridMod = loadTs('detailed-3d-sinking-freighter-game_sonnet/src/game/navgrid.ts');

  // Stairwell landing on Level 0 -> Level 1 should engage stair mode along A-run (x = -0.875)
  const stairWp = shipNavGraphMod.findNextShipGraphWaypoint(-0.875, 3.0, -52.8, 0.0, 9.4, -47.0);
  assert.equal(stairWp.onStair, true, '3D graph must flag stair traversal so wall-slide does not trigger on steps');
  assert.ok(Math.abs(stairWp.x - -0.875) < 0.25, `Expected A-run stair centerline x=-0.875, got ${stairWp.x}`);

  // Narrow exterior catwalk (x = 9.45, z = -58) -> Engine Control Room routes via Side Entrance (z = -47.0)
  const catwalkWp = shipNavGraphMod.findNextShipGraphWaypoint(9.45, 3.0, -58.0, 0.0, 3.0, -56.6);
  assert.ok(Math.abs(catwalkWp.x - 9.45) < 0.25 && catwalkWp.z >= -47.5, `Expected catwalk route toward Side Entrance (-47.0), got (${catwalkWp.x}, ${catwalkWp.z})`);
  assert.equal(shipNavGraphMod.isOnNarrowCatwalk(9.45, 3.0, -58.0), true, 'Must detect narrow exterior catwalk zone');

  // navgrid must ignore stair-tagged boxes so stairwells do not appear as impassable walls
  const boxesWithStair = [
    { minX: -1.6, minY: 3.0, minZ: -51.5, maxX: -0.15, maxY: 4.5, maxZ: -49.5, enabled: true, tag: 'stair' },
  ];
  const wp = navgridMod.findNextGridWaypoint(boxesWithStair, -0.875, 3.0, -52.5, -0.875, -48.0);
  assert.ok(wp, 'Grid A* must pass cleanly over stair-tagged colliders');

  // Doorway center node alignment: Level 0 corridor -> port aft room routes through (-1.7, 3.0, -53.6)
  const doorWp = shipNavGraphMod.findNextShipGraphWaypoint(0, 3.0, -53.6, -5.0, 3.0, -53.6);
  assert.ok(Math.abs(doorWp.x - -1.7) < 0.25 && Math.abs(doorWp.z - -53.6) < 0.25, `Expected doorway center (-1.7, -53.6), got (${doorWp.x}, ${doorWp.z})`);

  // Progress-based self-unstick hop & replanning when a bot is pinned against an obstacle
  const ragdollMod = loadTs('detailed-3d-sinking-freighter-game_sonnet/src/game/ragdoll.ts', (id) => {
    if (id === './navmesh3d') return navmesh;
    throw new Error(`Unexpected require in ragdoll: ${id}`);
  });
  const crewMod = loadTs('detailed-3d-sinking-freighter-game_sonnet/src/game/crew.ts', (id) => {
    if (id === './navmesh3d') return navmesh;
    if (id === './ragdoll') return ragdollMod;
    if (id === './navgrid') return navgridMod;
    if (id === './shipNavGraph') return shipNavGraphMod;
    throw new Error(`Unexpected require: ${id}`);
  });
  const pinnedBot = crewMod.createCrewMember('PinnedBot', 'damage-control', 0, 3.0, -48.0, 4);
  pinnedBot.state = 'moving';
  pinnedBot.targetId = 'b_pin';
  pinnedBot.onGround = true;
  pinnedBot.navWaypoint = { x: 0, z: -44.0 };
  const pinnedWorld = {
    move(body, _dx, dy, _dz) {
      body.y += dy;
      body.onGround = body.y <= 3.0;
    },
    raycast() {
      return { hit: false, distance: Infinity };
    },
  };
  let sawSelfHop = false;
  for (let i = 0; i < 25; i++) {
    crewMod.stepCrew(pinnedBot, 0.05, [{ id: 'b_pin', x: 0, y: 3.0, z: -40.0, area: 1.0, repair() {} }], undefined, {
      world: pinnedWorld,
      raycast: pinnedWorld.raycast,
    });
    if ((pinnedBot.vy ?? 0) > 2.0) sawSelfHop = true;
  }
  assert.equal(sawSelfHop, true, 'Pinned bot with zero net progress must trigger self-unstick hop and replanning');
  console.log('  ok 3D ShipNavGraph stair routing, doorway centering & self-unstick replanning verified');
}

test5RaySteeringAndDeflection();
testDoorTraversalSequence();
testVerticalLadderClimbing();
testPortableLadderPlacement();
testBelowDeckDescentAndDropJump();
testGridAStarDoorwayAndWallBypass();
test3DShipNavGraphStairAndCatwalkRouting();

console.log('Crew navigation unit tests passed.');
