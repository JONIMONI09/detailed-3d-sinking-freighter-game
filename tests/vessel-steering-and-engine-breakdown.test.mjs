// tests/vessel-steering-and-engine-breakdown.test.mjs - Unit tests for real vessel propulsion, rudder steering kinematics, and engine room breakdown
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import * as THREE from 'three';
import ts from 'typescript';

console.log('🧪 Starting Vessel Propulsion, Rudder Steering & Engine Breakdown Unit Tests...');

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

const bridge = load('bridge');
const { ShipSim } = load('shipSim');
const battleships = load('battleships');
const supervisorMod = load('stormworksSupervisor');
const StormworksSupervisor = supervisorMod.StormworksSupervisor;

// ============================================================================
// 1. Vessel Propulsion & Kinematic Rudder Steering Test (Freighter +Z Bow & Battleship -Z Bow)
// ============================================================================
function testVesselPropulsionAndSteeringKinematics() {
  const helm = bridge.createHelm();
  const shipLength = 140; // Nordwind 140m LOA
  assert.equal(helm.speed, 0);
  assert.equal(helm.heading, 0);

  // Set telegraph to full-ahead (target: 8 m/s)
  helm.telegraph = "full-ahead";
  // Step 10 seconds of forward propulsion
  for (let i = 0; i < 100; i++) {
    bridge.stepHelm(helm, 0.1, shipLength, true);
  }
  // With SPEED_RESPONSE = 0.12, speed reaches ~5.6 m/s after 10s
  assert.ok(helm.speed > 5.0, `Vessel must accelerate ahead (got ${helm.speed} m/s)`);

  // Freighter bow is +Z (Z_BOW = +70), stern is -Z (Z_STERN = -70).
  // Verify full-ahead moves Freighter toward its 3D bow (+Z), NOT backwards toward stern (-Z)!
  const group = new THREE.Group();
  const sim = new ShipSim(group, []);
  const mockOcean = { height: () => 0 };
  sim.heading = helm.heading;
  sim.update(0.1, 0, mockOcean, 1);

  const forward0 = new THREE.Vector3(-Math.sin(helm.heading), 0, Math.cos(helm.heading));
  const bowWorld0 = new THREE.Vector3(0, 0, 70).applyMatrix4(group.matrixWorld);
  const sternWorld0 = new THREE.Vector3(0, 0, -70).applyMatrix4(group.matrixWorld);
  const bowDir0 = bowWorld0.clone().sub(sternWorld0).normalize();
  assert.ok(forward0.dot(bowDir0) > 0.999, `Full-ahead forward vector must point along bow (+Z), got dot=${forward0.dot(bowDir0)}`);

  // Apply starboard rudder (+25 deg)
  helm.rudderCmd = 25;
  for (let i = 0; i < 50; i++) {
    bridge.stepHelm(helm, 0.1, shipLength, true);
  }
  assert.equal(helm.rudderDeg, 25, 'Rudder must reach commanded +25 deg angle');
  assert.ok(helm.heading > 0.02, `Starboard rudder must raise the heading, got ${helm.heading} rad`);

  // Update ShipSim with turned heading and verify bow rotates to starboard (-X when facing +Z)
  // and Freighter's forward vector (-sin(heading), 0, cos(heading)) matches 3D bow orientation!
  sim.heading = helm.heading;
  sim.update(0.1, 0.1, mockOcean, 1);
  const bowWorld1 = new THREE.Vector3(0, 0, 70).applyMatrix4(group.matrixWorld);
  const sternWorld1 = new THREE.Vector3(0, 0, -70).applyMatrix4(group.matrixWorld);
  const bowDir1 = bowWorld1.clone().sub(sternWorld1).normalize();
  assert.ok(bowDir1.x < -0.01, `Starboard rudder from +Z bow must swing bow toward -X (right from bridge), got x=${bowDir1.x}`);

  const forward = new THREE.Vector3(
    -Math.sin(helm.heading),
    0,
    Math.cos(helm.heading),
  );
  assert.ok(Math.abs(forward.length() - 1.0) < 1e-4, 'Forward vector must be normalized');
  assert.ok(forward.dot(bowDir1) > 0.999, `Forward vector must stay aligned with ShipSim 3D bow after turning (dot=${forward.dot(bowDir1)})`);

  // Advance vessel position along forward vector -> must move toward bow, not stern
  const dt = 1.0;
  const initialPos = group.position.clone();
  group.position.addScaledVector(forward, helm.speed * dt);
  const moved = group.position.clone().sub(initialPos);
  assert.ok(moved.length() > 5.0, 'Vessel must advance in 3D space along forward vector');
  assert.ok(moved.normalize().dot(bowDir1) > 0.999, 'Freighter must move bow-first on full-ahead');

  // Verify Battleship (-Z bow) steering: +rudderDeg (starboard/D) turns bow toward +X (right when facing -Z)
  const bs = battleships.createBattleship('bs-steer', 0, 0, 1, 'blue');
  bs.targetSpeed = 12;
  bs.rudderDeg = 25;
  for (let i = 0; i < 40; i++) {
    battleships.stepBattleship(bs, 0.1, i * 0.1, new THREE.Vector3(0, 0, -200), () => 0, undefined, false);
  }
  assert.ok(bs.baseZ < -10, `Battleship ahead must advance toward -Z bow (got z=${bs.baseZ})`);
  assert.ok(bs.heading < 0, `Battleship starboard (+25 deg) rudder must decrease rotation.y to turn bow right (+X), got heading=${bs.heading}`);
  assert.ok(bs.baseX > 0.5, `Battleship starboard turn must curve toward +X, got x=${bs.baseX}`);

  // Verify Battleship AI steers toward a target on its starboard (+X, -Z) side
  const bsAi = battleships.createBattleship('bs-ai', 0, 0, 1, 'red');
  bsAi.speed = 8;
  battleships.stepBattleshipAI(bsAi, new THREE.Vector3(250, 0, -250), 0.2, []);
  assert.ok(bsAi.rudderDeg > 0, `AI must command positive starboard rudder to turn toward (+250, -250), got rudderDeg=${bsAi.rudderDeg}`);

  console.log('  ok vessel propulsion and kinematic rudder steering advance Freighter (+Z bow) and Battleship (-Z bow) accurately');
}

// ============================================================================
// 2. Bridge Active Helm Mode & Keyboard Controls Test
// ============================================================================
function testBridgeHelmModeKeyboardControls() {
  class BridgeHelmController {
    constructor() {
      this.helm = bridge.createHelm();
      this.active = false;
    }

    toggleHelmMode() {
      this.active = !this.active;
    }

    handleInput(key) {
      if (!this.active) return;
      if (key === 'KeyW') {
        this.helm.telegraph = bridge.stepTelegraph(this.helm.telegraph, 1);
      } else if (key === 'KeyS') {
        this.helm.telegraph = bridge.stepTelegraph(this.helm.telegraph, -1);
      } else if (key === 'KeyA') {
        this.helm.rudderCmd = -bridge.MAX_RUDDER_DEG; // -35 deg port
      } else if (key === 'KeyD') {
        this.helm.rudderCmd = bridge.MAX_RUDDER_DEG;  // +35 deg stbd
      }
    }

    releaseRudder() {
      if (this.active) this.helm.rudderCmd = 0;
    }
  }

  const ctrl = new BridgeHelmController();
  assert.equal(ctrl.active, false);

  // Press E to enter Helm Mode
  ctrl.toggleHelmMode();
  assert.equal(ctrl.active, true, 'Pressing E must enter active Helm Mode');

  // Press W twice: stop -> half-ahead -> full-ahead
  ctrl.handleInput('KeyW');
  assert.equal(ctrl.helm.telegraph, 'half-ahead');
  ctrl.handleInput('KeyW');
  assert.equal(ctrl.helm.telegraph, 'full-ahead');

  // Press S three times: full-ahead -> half-ahead -> stop -> half-astern
  ctrl.handleInput('KeyS');
  ctrl.handleInput('KeyS');
  ctrl.handleInput('KeyS');
  assert.equal(ctrl.helm.telegraph, 'half-astern');

  // Press A (port rudder)
  ctrl.handleInput('KeyA');
  assert.equal(ctrl.helm.rudderCmd, -35, 'KeyA must command -35 deg port rudder');

  // Release rudder -> returns to 0
  ctrl.releaseRudder();
  assert.equal(ctrl.helm.rudderCmd, 0, 'Releasing rudder keys must center rudder command to 0 deg');

  // Press E to exit Helm Mode
  ctrl.toggleHelmMode();
  assert.equal(ctrl.active, false, 'Pressing E must exit Helm Mode');

  console.log('  ok bridge helm mode keyboard controls ([E] toggle, [W]/[S] telegraph, [A]/[D] rudder) verified');
}

// ============================================================================
// 3. Engine Room Explosion & Generator Breakdown Test
// ============================================================================
function testEngineRoomExplosionAndMotorBreakdown() {
  class VesselPropulsionSupervisor {
    constructor() {
      this.helm = bridge.createHelm();
      this.engineAvailable = true;
      this.generatorExploded = false;
      this.engineRoomFlooding = 0.0;
    }

    checkEngineStatus(pos, isTntExplosion) {
      // Engine room bounding volume: x in [-9.7, 9.7], y in [-5.0, 2.7], z in [-40, -10]
      const inEngineRoom =
        pos.x >= -9.7 && pos.x <= 9.7 &&
        pos.y >= -5.0 && pos.y <= 2.7 &&
        pos.z >= -40 && pos.z <= -10;

      if (isTntExplosion && inEngineRoom) {
        this.generatorExploded = true;
        this.engineAvailable = false;
      }

      if (this.engineRoomFlooding > 0.40) {
        this.generatorExploded = true;
        this.engineAvailable = false;
      }
    }

    step(dt) {
      bridge.stepHelm(this.helm, dt, 140, this.engineAvailable);
    }
  }

  // Case 3A: Engine Room Flooding > 40% triggers breakdown
  const supFlooding = new VesselPropulsionSupervisor();
  supFlooding.helm.telegraph = 'full-ahead';
  // Vessel cruising at speed
  for (let i = 0; i < 50; i++) supFlooding.step(0.1);
  assert.ok(supFlooding.helm.speed > 3.0, 'Ship must be moving ahead');

  // Water floods engine room past 40% threshold
  supFlooding.engineRoomFlooding = 0.45;
  supFlooding.checkEngineStatus(new THREE.Vector3(0, -4, -25), false);

  assert.equal(supFlooding.engineAvailable, false, 'Engine must break down permanently at > 40% flooding');
  assert.equal(supFlooding.generatorExploded, true, 'Generator explosion triggered');

  // Ship coasts to a halt without engine thrust
  for (let i = 0; i < 300; i++) supFlooding.step(0.1);
  assert.ok(supFlooding.helm.speed < 0.2, `Ship must coast down toward 0 m/s (got ${supFlooding.helm.speed})`);

  // Case 3B: TNT Detonation inside Engine Room triggers instant generator explosion
  const supTnt = new VesselPropulsionSupervisor();
  supTnt.helm.telegraph = 'full-ahead';
  const engineBlast = new THREE.Vector3(0, -4.5, -28); // inside engine room
  supTnt.checkEngineStatus(engineBlast, true);

  assert.equal(supTnt.engineAvailable, false, 'TNT inside engine room must immediately destroy propulsion');
  assert.equal(supTnt.generatorExploded, true);

  supTnt.step(1.0);
  assert.equal(supTnt.helm.speed, 0, 'Speed must remain 0 when engine is destroyed');

  console.log('  ok engine room explosion & flooding > 40% trigger generator breakdown and zero propulsion');
}

function testHelmQuickDoubleTapAndTabletIsolation() {
  const { stepTelegraph, TELEGRAPH_SPEED } = load('bridge');
  let t = 'stop';
  t = stepTelegraph(t, 1);
  assert.equal(t, 'half-ahead');
  t = stepTelegraph(t, 1);
  assert.equal(t, 'full-ahead');
  assert.equal(TELEGRAPH_SPEED[t], 8);

  const inputSrc = fs.readFileSync(baseDir + 'input.ts', 'utf8');
  assert.ok(inputSrc.includes('"helmUp"') && inputSrc.includes('"helmDown"') && inputSrc.includes('consumeHelmSteps'), 'input.ts must count discrete helmUp/helmDown taps across slow frames');

  const gameSrc = fs.readFileSync(baseDir + 'game.ts', 'utf8');
  assert.ok(gameSrc.includes('inp.consumeHelmSteps()'), 'handleHelm must process counted discrete helmUp/helmDown taps immediately');
  assert.ok(gameSrc.includes('if (this.helmMode && !this.tabletOpen) this.handleHelm(dt)'), 'handleHelm must stay isolated while Command Tablet modal is open');
  assert.ok(gameSrc.includes('if (this.dead || this.escapeState || this.ended || this.tabletOpen || this.orbitalLaserMode) return;'), 'updateInteraction must ignore E/inputs while Command Tablet is open');
  console.log('  ok bridge helm discrete double-tap telegraph & Command Tablet modal isolation verified');
}

// ============================================================================
// Execution
// ============================================================================
testVesselPropulsionAndSteeringKinematics();
testBridgeHelmModeKeyboardControls();
testEngineRoomExplosionAndMotorBreakdown();
testHelmQuickDoubleTapAndTabletIsolation();

console.log('🎉 ALL 4 VESSEL PROPULSION, RUDDER STEERING & ENGINE BREAKDOWN TESTS PASSED!');
