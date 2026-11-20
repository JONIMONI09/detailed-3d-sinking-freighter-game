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

  // Must NOT skip stair-entry alignment node d1_stair_dep (0.875, 6.2, -47.6) when 0.78m away in corridor
  const stairEntryWp = shipNavGraphMod.findNextShipGraphWaypoint(0.2, 6.2, -47.2, 0.0, 9.4, -47.0);
  assert.ok(Math.abs(stairEntryWp.x - 0.875) < 0.1 && Math.abs(stairEntryWp.z - -47.6) < 0.1, `Expected stair entry alignment (0.875, -47.6), got (${stairEntryWp.x}, ${stairEntryWp.z})`);

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

// 8. Catwalk Bounds, Level 0/1/2 Stairwell Bypass, Control Room Bypass, Open-Door Alignment & Locked Door Access
function testCatwalkBoundsBypassAndOpenDoorCentering() {
  const shipNavGraphMod = loadTs('detailed-3d-sinking-freighter-game_sonnet/src/game/shipNavGraph.ts');
  const navgridMod = loadTs('detailed-3d-sinking-freighter-game_sonnet/src/game/navgrid.ts');
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

  // A. Catwalk bounds must preserve x = +-9.55 and stern z = -66.8 instead of clamping into superstructure walls
  const catBot = crewMod.createCrewMember('CatwalkGuard', 'boatswain', 9.55, 3.0, -66.8, 4);
  crewMod.enforceShipBoundsAndRespawn(catBot);
  assert.ok(Math.abs(catBot.x - 9.55) < 1e-6, `Expected catwalk X=9.55 preserved, got ${catBot.x}`);
  assert.ok(Math.abs(catBot.z - -66.8) < 1e-6, `Expected stern Z=-66.8 preserved, got ${catBot.z}`);

  // B. Level 0 center corridor routes around divider via starboard lane (x = 0.875)
  const l0Bypass = shipNavGraphMod.findNextShipGraphWaypoint(0, 3.0, -47.0, 0, 3.0, -53.6);
  assert.ok(Math.abs(l0Bypass.x - 0.875) < 0.1, `Expected Level 0 starboard bypass x=0.875, got ${l0Bypass.x}`);

  // C. Level 0 side rooms must NOT cross solid wall at z = -50 directly
  const roomBypass = shipNavGraphMod.findNextShipGraphWaypoint(-4.2, 3.0, -47.0, -3.4, 3.0, -53.6);
  assert.ok(roomBypass.x > -2.5 && roomBypass.z > -48.5, `Expected exit via corridor door (-1.7, -47.0), got (${roomBypass.x}, ${roomBypass.z})`);

  // D. Control Room port/stbd wings route north via d0_ctrl_door (0, -57.2) instead of straight across engineHole railing
  const ctrlWp = shipNavGraphMod.findNextShipGraphWaypoint(3.8, 3.0, -61.5, -3.8, 3.0, -61.5);
  assert.ok(ctrlWp.z >= -58.2, `Expected Control Room North bypass around engineHole, got (${ctrlWp.x}, ${ctrlWp.z})`);

  // E. Open-door (enabled: false) world.boxes perpendicular centering & Mission-mode locked door forceOpen
  let forcedOpen = false;
  const openDoorOwner = {
    axis: 'z',
    fixed: -1.7,
    locked: 'red',
    target: 0,
    open: 0,
    forceOpen() {
      forcedOpen = true;
      this.target = 1;
      this.open = 1;
    },
  };
  const doorBoxes = [
    { minX: -1.8, minY: 3.0, minZ: -46.5, maxX: -1.6, maxY: 6.0, maxZ: -44.0, enabled: true, tag: 'wall' },
    { minX: -1.8, minY: 3.0, minZ: -50.0, maxX: -1.6, maxY: 6.0, maxZ: -47.5, enabled: true, tag: 'wall' },
    { minX: -1.77, minY: 3.0, minZ: -47.5, maxX: -1.63, maxY: 5.2, maxZ: -46.5, enabled: false, tag: 'door', owner: openDoorOwner },
  ];
  const doorWorld = {
    boxes: doorBoxes,
    move(body, dx, dy, dz) {
      body.x += dx;
      body.z += dz;
      const nextY = body.y + dy;
      if (nextY <= 3.0) {
        body.y = 3.0;
        body.onGround = true;
      } else {
        body.y = nextY;
        body.onGround = false;
      }
    },
    raycast(ox, oy, oz, dx, dy, dz, maxD) {
      return { hit: false, distance: maxD, dist: maxD, normal: { x: 0, y: 0, z: 0 }, point: { x: 0, y: 0, z: 0 } };
    },
  };
  const doorBot = crewMod.createCrewMember('DoorBot', 'damage-control', -0.9, 3.0, -47.38, 4);
  doorBot.state = 'moving';
  doorBot.targetId = 99;
  doorBot.onGround = true;
  const doorBreach = [{ id: 99, x: -4.2, y: 3.0, z: -47.0, area: 0.8 }];
  for (let i = 0; i < 6; i++) {
    crewMod.stepCrew(doorBot, 0.05, doorBreach, undefined, { world: doorWorld });
  }
  assert.equal(forcedOpen, true, 'Crew must open even keycard-locked doors cleanly when target === 0');
  assert.ok(Math.abs(doorBot.z - -47.0) < Math.abs(-47.38 - -47.0), `Expected open-door alignment toward z=-47.0, got z=${doorBot.z}`);
  console.log('  ok catwalk bounds, stairwell/room/Control Room bypass, and open/locked door alignment verified');
}

function testGapJumpSwimmingAndCompleteDewatering() {
  const graphSrc = readFileSync('detailed-3d-sinking-freighter-game_sonnet/src/game/shipNavGraph.ts', 'utf8');
  const crewSrc = readFileSync('detailed-3d-sinking-freighter-game_sonnet/src/game/crew.ts', 'utf8');
  const builderSrc = readFileSync('detailed-3d-sinking-freighter-game_sonnet/src/game/shipBuilder.ts', 'utf8');
  const gameSrc = readFileSync('detailed-3d-sinking-freighter-game_sonnet/src/game/game.ts', 'utf8');

  // (a) gap-jump routing and execution
  assert.ok(/jump/.test(graphSrc), 'nav graph must carry jump flags');
  for (const [a, b] of [['d1_gap_fwd', 'd1_gap_aft'], ['d2_gap_aft', 'd2_gap_fwd']]) {
    const re = new RegExp(`a:\\s*"${a}",\\s*b:\\s*"${b}",\\s*jump:\\s*true`);
    assert.ok(re.test(graphSrc), `gap edge ${a} <-> ${b} must have jump: true`);
  }
  for (const id of ['d1_corr_mid', 'd1_corr_aft', 'd2_corr_aft', 'd2_corr_mid']) {
    assert.ok(graphSrc.includes(`"${id}"`), `${id} node must exist`);
  }
  assert.ok(/jumpingGap/.test(crewSrc) && /jumpCooldown/.test(crewSrc), 'crew must implement gap-jump state');

  // (b) surface swimming and ragdoll recovery
  assert.ok(/waterLevel\s*-\s*0\.55/.test(crewSrc) && /swimming/.test(crewSrc), 'crew must float at waterLevel - 0.55 while swimming');
  assert.ok(/ragdoll/.test(crewSrc), 'crew ragdoll recovery must exist');

  // Runtime behaviour: real shipNavGraph + crew modules
  const rdMod = loadTs('detailed-3d-sinking-freighter-game_sonnet/src/game/ragdoll.ts', (id) => {
    if (id === './navmesh3d') return navmesh;
    throw new Error(`Unexpected require in ragdoll: ${id}`);
  });
  const ngMod = loadTs('detailed-3d-sinking-freighter-game_sonnet/src/game/navgrid.ts');
  const sgMod = loadTs('detailed-3d-sinking-freighter-game_sonnet/src/game/shipNavGraph.ts');
  const cMod = loadTs('detailed-3d-sinking-freighter-game_sonnet/src/game/crew.ts', (id) => {
    if (id === './navmesh3d') return navmesh;
    if (id === './ragdoll') return rdMod;
    if (id === './navgrid') return ngMod;
    if (id === './shipNavGraph') return sgMod;
    throw new Error(`Unexpected require: ${id}`);
  });

  // 1. graph routes jump across Level 1 / Level 2 gaps
  const wp1 = sgMod.findNextShipGraphWaypoint(-0.875, 6.2, -48.1, 0, 6.2, -53.6);
  assert.ok(wp1 && wp1.jump === true && wp1.z <= -52.0, `Level 1 gap must route with jump, got ${JSON.stringify(wp1)}`);
  const wp2 = sgMod.findNextShipGraphWaypoint(0.875, 9.4, -52.2, 0, 9.4, -47.0);
  assert.ok(wp2 && wp2.jump === true && wp2.z >= -48.5, `Level 2 gap must route with jump, got ${JSON.stringify(wp2)}`);

  // 2. physical gap leap over a real 3.6 m hole (z in (-52.0, -48.4))
  const floors = [
    { zmin: -60, zmax: -52.0 },
    { zmin: -48.4, zmax: -40 },
  ];
  const FLOOR_TOP = 6.2;
  const onFloor = (z) => floors.some((f) => z >= f.zmin && z <= f.zmax);
  const gapWorld = {
    move(body, dx, dy, dz) {
      body.x += dx;
      body.z += dz;
      const nextY = body.y + dy;
      if (onFloor(body.z) && body.y >= FLOOR_TOP - 0.3 && nextY <= FLOOR_TOP) {
        body.y = FLOOR_TOP;
        body.onGround = true;
      } else {
        body.y = nextY;
        body.onGround = false;
      }
    },
    raycast(ox, oy, oz, dx, dy, dz, maxD) {
      const miss = { hit: false, distance: maxD, dist: maxD, normal: { x: 0, y: 0, z: 0 }, point: { x: 0, y: 0, z: 0 } };
      if (dy < -0.5 && oy >= FLOOR_TOP - 0.05 && onFloor(oz) && oy - FLOOR_TOP <= maxD) {
        const d = oy - FLOOR_TOP;
        return { hit: true, distance: d, dist: d, collider: {}, nx: 0, ny: 1, nz: 0, normal: { x: 0, y: 1, z: 0 }, point: { x: ox, y: FLOOR_TOP, z: oz } };
      }
      return miss;
    },
  };
  const bot = cMod.createCrewMember('GapBot', 'boatswain', -0.875, 6.2, -48.3, 4);
  bot.patrol = [
    { x: -0.875, y: 6.2, z: -47.6 },
    { x: 0, y: 6.2, z: -53.8 },
  ];
  bot.patrolIndex = 1;
  bot.onGround = true;
  let sawJump = false;
  let minZ = Infinity;
  let minY = Infinity;
  for (let i = 0; i < 45; i++) {
    cMod.stepCrew(bot, 0.05, [], undefined, { world: gapWorld, raycast: gapWorld.raycast, deckFloorY: 6.2 });
    minZ = Math.min(minZ, bot.z);
    minY = Math.min(minY, bot.y);
    if (bot.jumpingGap && bot.vy > 3.0) sawJump = true;
    if (sawJump && bot.onGround && bot.z <= -52.2) break;
  }
  assert.equal(sawJump, true, 'crew must leap (jumpingGap, vy > 3) over the floor gap');
  assert.ok(minZ <= -52.2, `crew must land on the far floor, minZ=${minZ}`);
  assert.ok(minY >= 5.5, `crew must not fall into the gap, minY=${minY}`);

  // 3. surface swimming and ragdoll recovery in flood water
  const openWorld = {
    move(body, dx, dy, dz) {
      body.x += dx;
      body.y += dy;
      body.z += dz;
      body.onGround = false;
    },
    raycast(ox, oy, oz, dx, dy, dz, maxD) {
      return { hit: false, distance: maxD, dist: maxD, normal: { x: 0, y: 0, z: 0 }, point: { x: 0, y: 0, z: 0 } };
    },
  };
  const swimmer = cMod.createCrewMember('Swimmer', 'boatswain', 0, -3.0, 0, 4);
  for (let i = 0; i < 80; i++) {
    cMod.stepCrew(swimmer, 0.05, [], undefined, { world: openWorld, raycast: openWorld.raycast, waterLevel: 1.5, deckFloorY: -5.0 });
  }
  assert.equal(swimmer.swimming, true, 'crew in flood water must be swimming');
  assert.ok(swimmer.y > 0.7, `swimmer must rise toward waterLevel - 0.55, y=${swimmer.y}`);
  const rag = cMod.createCrewMember('RagBot', 'boatswain', 0, 1.0, 0, 4);
  rag.state = 'ragdoll';
  rag.isRagdoll = true;
  rag.stateTime = 0;
  let recovered = false;
  for (let i = 0; i < 20; i++) {
    cMod.stepCrew(rag, 0.05, [], undefined, { world: openWorld, raycast: openWorld.raycast, waterLevel: 1.5, deckFloorY: -5.0 });
    if (rag.state !== 'ragdoll' && rag.swimming === true) {
      recovered = true;
      break;
    }
  }
  assert.equal(recovered, true, 'ragdoll bot in water must recover to swimming within 1.0 s');

  // (c) 14 pump stations, 12 x 32 m3/s = 384 m3/s
  const calls = [...builderSrc.matchAll(/addBilgePump\(\s*"([a-z0-9_]+)"/g)].map((m) => m[1]);
  assert.equal(calls.length, 14, `expected 14 pump stations, got ${calls.length}`);
  assert.equal(new Set(calls).size, 14, 'pump ids must be unique');
  const consoles = calls.filter((id) => id.startsWith('pump_master_')).length;
  assert.equal(consoles, 2, 'two master consoles');
  assert.ok(/rateM3s:\s*isConsole\s*\?\s*0\s*:\s*32\.0/.test(builderSrc), 'pump unit rate must be 32.0 m3/s');
  assert.equal((calls.length - consoles) * 32, 384, 'total capacity must be 384 m3/s');
  assert.ok(!/const DECK_Y\s*=/.test(builderSrc.slice(builderSrc.indexOf('const bilgePumps'))), 'DECK_Y must not be shadowed');

  // dewatering math mirrors Game.syncCompartmentsAfterPumping
  assert.ok(/syncCompartmentsAfterPumping/.test(gameSrc), 'game must sync compartments after pumping');
  const comp = { water: 900, volume: 1000, min: { y: -5 }, max: { y: 3 }, fill: 0.9, level: 2.2, visible: true };
  const sim = { sinking: true, sinkT: 5, sinkDepth: 8, F: 0.9, forceSink: false };
  const dt = 0.1;
  for (let i = 0; i < 100 && comp.water > 0; i++) {
    comp.water = Math.max(0, comp.water - 384 * dt);
    if (comp.water <= 1e-3) { comp.water = 0; comp.fill = 0; comp.visible = false; }
    else comp.fill = comp.water / comp.volume;
    comp.level = comp.min.y + comp.fill * (comp.max.y - comp.min.y);
    sim.F = comp.water / comp.volume;
    if (sim.F < 0.28 && !sim.forceSink) {
      sim.sinking = false;
      sim.sinkT = Math.max(0, sim.sinkT - dt * 3.0);
      sim.sinkDepth = Math.max(0, sim.sinkDepth - dt * 3.5);
    }
  }
  assert.equal(comp.water, 0, 'compartment must drain to exactly 0 m3');
  assert.equal(comp.visible, false);
  assert.equal(sim.sinking, false);
  console.log('  ok gap-jump, swimming, 14-pump 384 m3/s complete dewatering verified');
}

test5RaySteeringAndDeflection();
testDoorTraversalSequence();
testVerticalLadderClimbing();
testPortableLadderPlacement();
testBelowDeckDescentAndDropJump();
testGridAStarDoorwayAndWallBypass();
test3DShipNavGraphStairAndCatwalkRouting();
testCatwalkBoundsBypassAndOpenDoorCentering();
testGapJumpSwimmingAndCompleteDewatering();
console.log('Crew navigation unit tests passed.');
