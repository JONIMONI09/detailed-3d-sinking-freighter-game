import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const ROOT = process.cwd();
const SONNET_GAME = path.join(ROOT, 'detailed-3d-sinking-freighter-game_sonnet/src/game');

// Stub minimal browser globals needed by spaceStation.ts canvas texture creation
if (typeof globalThis.document === 'undefined') {
  globalThis.document = {
    createElement: () => ({
      width: 512,
      height: 256,
      getContext: () => ({
        createLinearGradient: () => ({ addColorStop: () => {} }),
        fillStyle: '',
        fillRect: () => {},
        beginPath: () => {},
        arc: () => {},
        fill: () => {},
        fillText: () => {},
        strokeRect: () => {},
      }),
    }),
  };
}

function loadTs(relName) {
  const full = path.join(SONNET_GAME, `${relName}.ts`);
  const src = fs.readFileSync(full, 'utf8');
  const out = ts.transpileModule(src, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
    },
  }).outputText;

  const mod = { exports: {} };
  const localRequire = (spec) => {
    if (spec.startsWith('./') || spec.startsWith('../')) {
      return loadTs(spec.replace(/^\.\//, ''));
    }
    return require(spec);
  };
  const fn = new Function('require', 'module', 'exports', out);
  fn(localRequire, mod, mod.exports);
  return mod.exports;
}

console.log('🧪 Starting Orbital Laser, Multi-Part Ship & Space Station Unit Tests...');

// 1. Battleship Multi-Part Segmentation & Destroyed Turret Guard
{
  const bsMod = loadTs('battleships');
  const THREE = require('three');
  const bs = bsMod.createBattleship('bs-multi', 50, -20, 1, 'blue');
  assert.equal(bs.maxHp, 1000, 'Level 1 Battleship maxHp must remain 1000');
  assert.equal(bs.armorAbsorption, 0.3, 'Level 1 Battleship armorAbsorption must remain 0.3');
  assert.equal(bs.parts.length, 8, 'Battleship must be segmented into 8 destructible parts');
  const ids = bs.parts.map((p) => p.id);
  for (const expected of ['bow', 'mid', 'stern', 'bridge', 'mast', 'funnel', 'turret_fore', 'turret_aft']) {
    assert.ok(ids.includes(expected), `Battleship must include part ${expected}`);
  }

  // Destroy fore turret and verify salvo only fires from aft turret
  bs.parts[6].destroyed = true;
  bs.turrets[0].destroyed = true;
  let firedCount = 0;
  bsMod.fireBattleshipSalvo(bs, new THREE.Vector3(0, 0, 0), () => {
    firedCount++;
  });
  assert.equal(firedCount, 1, 'Destroyed fore turret must not fire in salvo');
  console.log('  ✔ Battleship 8-part segmentation and destroyed-turret guard verified');
}

// 2. ShipSim.reset() Completeness
{
  const { ShipSim } = loadTs('shipSim');
  const THREE = require('three');
  const group = new THREE.Group();
  const sim = new ShipSim(group, []);
  sim.sinking = true;
  sim.sunk = true;
  sim.sinkDepth = 14.5;
  sim.pitch = 0.25;
  sim.roll = -0.3;
  sim.F = 0.85;
  sim.totalFlow = 42.3;
  sim.tiltDeg = 18.4;
  sim.waveHeave = 1.2;
  sim.firstBreach = true;
  sim.heading = 1.1;
  sim.forceSink = true;

  sim.reset();
  assert.equal(sim.sinking, false);
  assert.equal(sim.sunk, false);
  assert.equal(sim.sinkDepth, 0);
  assert.equal(sim.pitch, 0);
  assert.equal(sim.roll, 0);
  assert.equal(sim.F, 0);
  assert.equal(sim.totalFlow, 0);
  assert.equal(sim.tiltDeg, 0);
  assert.equal(sim.waveHeave, 0);
  assert.equal(sim.firstBreach, false);
  assert.equal(sim.heading, 0);
  assert.equal(sim.forceSink, false);
  console.log('  ✔ ShipSim.reset() full state restoration verified');
}

// 3. Space Station Earth Non-Occlusion, Lockdown, Blast & Reset
{
  const THREE = require('three');
  const { CollisionWorld } = loadTs('physics');
  const { OrbitalSpaceStationSim, STATION_BASE_Y } = loadTs('spaceStation');
  const scene = new THREE.Scene();
  const world = new CollisionWorld();
  const station = new OrbitalSpaceStationSim(scene, world);
  station.active = true;

  // Verify earthMesh does not occlude the Freighter/Ocean/Orbital camera corridor around (0, 0..260, 0)
  const earthWorldPos = new THREE.Vector3(
    station.earthMesh.position.x,
    STATION_BASE_Y + station.earthMesh.position.y,
    station.earthMesh.position.z,
  );
  const distToShipCorridor = Math.hypot(earthWorldPos.x, earthWorldPos.z);
  assert.ok(distToShipCorridor > 200, `Earth must be offset away from (0,0) ship corridor (dist=${distToShipCorridor})`);

  // Verify interior detection
  assert.equal(station.isPointInside(new THREE.Vector3(0, STATION_BASE_Y + 1.6, 0)), true);
  assert.equal(station.isPointInside(new THREE.Vector3(0, 10, 0)), false);

  // Verify applyBlast & reset
  const events = station.applyBlast(0, STATION_BASE_Y + 1.5, 0, 2.0);
  assert.ok(events.length > 0, 'applyBlast must generate breach event');
  assert.equal(station.stationAlarm, true);
  const cmdMod = station.modules.find((m) => m.id === 'mod_command');
  assert.ok(cmdMod && cmdMod.breaches.length > 0, 'mod_command must record breach');

  // Verify lockdown closes bulkhead doors
  for (const d of station.doors) d.target = 1;
  station.step(0.016, 1.0, true);
  for (const d of station.doors) {
    if (d.bulkhead) assert.equal(d.target, 0, 'Lockdown must close station bulkhead doors');
  }

  station.reset();
  assert.equal(station.stationAlarm, false);
  assert.equal(cmdMod.breaches.length, 0);
  assert.equal(cmdMod.pressureKpa, 101.3);
  assert.equal(cmdMod.structuralHp, 100);
  console.log('  ✔ Space Station Earth non-occlusion, blast, lockdown & reset verified');
}

// 4. Input & Source Contracts (No duplicate mousedown, Continuous Orbital Beam, Grey-Out UI)
{
  const inputSrc = fs.readFileSync(path.join(SONNET_GAME, 'input.ts'), 'utf8');
  const mousedownAttachments = inputSrc.match(/,\s*"mousedown"\s*,/g) || [];
  assert.equal(mousedownAttachments.length, 1, 'input.ts must attach mousedown only once');

  const gameSrc = fs.readFileSync(path.join(SONNET_GAME, 'game.ts'), 'utf8');
  assert.ok(gameSrc.includes('orbitalBeamGroup'), 'game.ts must use persistent orbitalBeamGroup');
  assert.ok(gameSrc.includes('freighterIntegrityPct'), 'HudState must expose freighterIntegrityPct');
  assert.ok(gameSrc.includes('freighterDestroyed'), 'HudState must expose freighterDestroyed');
  assert.ok(gameSrc.includes('battleshipSunk'), 'HudState must expose battleshipSunk');
  assert.ok(!gameSrc.includes('setInterval('), 'game.ts must not use setInterval for laser shockwaves');

  const builderSrc = fs.readFileSync(path.join(SONNET_GAME, 'shipBuilder.ts'), 'utf8');
  assert.ok(builderSrc.includes('export interface ShipSection'), 'shipBuilder.ts must export ShipSection');
  assert.ok(builderSrc.includes('sections: ShipSection[]'), 'ShipModel must expose sections');

  const hudSrc = fs.readFileSync(path.join(ROOT, 'detailed-3d-sinking-freighter-game_sonnet/src/ui/Hud.tsx'), 'utf8');
  assert.ok(hudSrc.includes('100% DESTROYED'), 'Hud.tsx must display 100% DESTROYED badge');
  assert.ok(hudSrc.includes('opacity-40 grayscale'), 'Hud.tsx must grey out destroyed vessels');
  assert.ok(hudSrc.includes('max-h-[90vh]'), 'Tablet modal must be scrollable');
  console.log('  ✔ Input, persistent beam, multi-part ShipSection & HUD grey-out contracts verified');
}

// 5. Real buildShip() Multi-Part Section & Container Partitioning Verification
{
  const THREE = require('three');
  const { buildShip } = loadTs('shipBuilder');
  const dummyTex = new THREE.Texture();
  const texSet = {
    hull: dummyTex,
    deck: dummyTex,
    rust: dummyTex,
    steel: dummyTex,
    wood: dummyTex,
    container: dummyTex,
    crate: dummyTex,
    wall: dummyTex,
    floor: dummyTex,
  };
  const ship = buildShip(texSet, { sandbox: true });
  assert.equal(ship.sections.length, 13, 'buildShip must create 13 ShipSections');
  for (const sec of ship.sections) {
    assert.ok(sec.group.children.length > 0, `Section ${sec.id} must own at least one mesh/child`);
  }
  const topLevelInstanced = ship.group.children.filter((c) => c instanceof THREE.InstancedMesh);
  assert.equal(topLevelInstanced.length, 0, 'No InstancedMesh containers may remain directly on ship.group');
  const cargoAft = ship.sections.find((s) => s.id === 'cargo_aft');
  const cargoFwd = ship.sections.find((s) => s.id === 'cargo_fwd');
  assert.ok(
    cargoAft.group.children.some((c) => c instanceof THREE.InstancedMesh),
    'cargo_aft section must own its container InstancedMesh',
  );
  assert.ok(
    cargoFwd.group.children.some((c) => c instanceof THREE.InstancedMesh),
    'cargo_fwd section must own its container InstancedMesh',
  );
  console.log('  ✔ Real buildShip() 13-section & container InstancedMesh partitioning verified');
}

console.log('🎉 ALL ORBITAL LASER, MULTI-PART & SPACE STATION TESTS PASSED!');
