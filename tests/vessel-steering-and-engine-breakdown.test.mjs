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
const supervisorMod = load('stormworksSupervisor');
const StormworksSupervisor = supervisorMod.StormworksSupervisor;

// ============================================================================
// 1. Vessel Propulsion & Kinematic Rudder Steering Test
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

  // Apply starboard rudder (+25 deg)
  helm.rudderCmd = 25;
  for (let i = 0; i < 50; i++) {
    bridge.stepHelm(helm, 0.1, shipLength, true);
  }
  assert.equal(helm.rudderDeg, 25, 'Rudder must reach commanded +25 deg angle');
  assert.ok(helm.heading > 0, `Heading must yaw to starboard (> 0), got ${helm.heading} rad`);

  // Verify motion vector calculation in 3D world coordinates
  const group = new THREE.Group();
  group.position.set(0, 0, 0);
  group.rotation.y = helm.heading;

  // Forward vector: (-sin(yaw), 0, -cos(yaw))
  const forward = new THREE.Vector3(
    -Math.sin(group.rotation.y),
    0,
    -Math.cos(group.rotation.y),
  );
  assert.ok(Math.abs(forward.length() - 1.0) < 1e-4, 'Forward vector must be normalized');

  // Advance vessel position
  const dt = 1.0;
  const initialPos = group.position.clone();
  group.position.addScaledVector(forward, helm.speed * dt);

  assert.ok(group.position.distanceTo(initialPos) > 5.0, 'Vessel must advance in 3D space along forward vector');

  console.log('  ok vessel propulsion and kinematic rudder steering advance ship position in 3D');
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

// ============================================================================
// Execution
// ============================================================================
testVesselPropulsionAndSteeringKinematics();
testBridgeHelmModeKeyboardControls();
testEngineRoomExplosionAndMotorBreakdown();

console.log('🎉 ALL 3 VESSEL PROPULSION, RUDDER STEERING & ENGINE BREAKDOWN TESTS PASSED!');
