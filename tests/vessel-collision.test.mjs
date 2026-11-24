import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

const file = path.join(process.cwd(), 'detailed-3d-sinking-freighter-game_sonnet/src/game/vesselCollision.ts');
const js = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const mod = { exports: {} };
new Function('module', 'exports', js)(mod, mod.exports);
const {
  hullOverlap, pointInHull, collisionDamage, hullRadiusAlong,
  FREIGHTER_HULL, BATTLESHIP_HULL, FREIGHTER_MASS, BATTLESHIP_MASS,
} = mod.exports;

console.log('🧪 Starting Vessel Hull Collision Unit Tests...');

const box = (x, z, heading, hull) => ({ x, z, heading, ...hull });

{
  const a = box(0, 0, 0, FREIGHTER_HULL);
  const b = box(0, -200, 0, BATTLESHIP_HULL);
  assert.equal(hullOverlap(a, b), null);
  console.log('  ✔ distant hulls do not collide');
}
{
  // Battleship ramming the freighter from the side (starboard): contact normal must be along X
  const a = box(0, 0, 0, FREIGHTER_HULL);
  const b = box(17, 0, 0, BATTLESHIP_HULL); // 12 + 6 = 18 > 17 => 1 m overlap
  const c = hullOverlap(a, b);
  assert.ok(c, 'overlap expected');
  assert.ok(Math.abs(c.depth - 1) < 1e-9, `depth ${c.depth}`);
  assert.ok(c.nx > 0.99 && Math.abs(c.nz) < 1e-9);
  console.log('  ✔ side overlap detected with correct depth and normal (A → B)');
}
{
  // Rotated hull: a battleship at 90° lying across the freighter bow is long (29) along X
  const a = box(0, 0, 0, FREIGHTER_HULL);
  const b = box(35, 0, Math.PI / 2, BATTLESHIP_HULL); // half length 29 along X: 12 + 29 = 41 > 35
  assert.ok(hullOverlap(a, b));
  const farB = box(45, 0, Math.PI / 2, BATTLESHIP_HULL);
  assert.equal(hullOverlap(a, farB), null);
  console.log('  ✔ oriented (rotated) hulls use real footprint, not a sphere');
}
{
  assert.ok(pointInHull(0, 25, box(0, 0, 0, BATTLESHIP_HULL)));
  assert.ok(!pointInHull(0, 40, box(0, 0, 0, BATTLESHIP_HULL)));
  assert.ok(!pointInHull(10, 0, box(0, 0, 0, BATTLESHIP_HULL)));
  assert.ok(pointInHull(10, 0, box(0, 0, 0, BATTLESHIP_HULL), 5));
  console.log('  ✔ projectile hit test follows the hull box (length 58 m, beam 12 m)');
}
{
  const a = box(0, 0, 0, FREIGHTER_HULL);
  const b = box(17, 0, 0, BATTLESHIP_HULL);
  const c = hullOverlap(a, b);
  // Battleship moving at 10 m/s towards the freighter (-X direction), freighter static
  const hard = collisionDamage([0, 0], [-10, 0], c, FREIGHTER_MASS, BATTLESHIP_MASS);
  assert.ok(hard.closing > 9.9);
  assert.ok(hard.dmgB > hard.dmgA, 'lighter vessel takes the larger share');
  assert.ok(hard.dmgA > 0);
  const soft = collisionDamage([0, 0], [-0.5, 0], c, FREIGHTER_MASS, BATTLESHIP_MASS);
  assert.equal(soft.dmgA, 0);
  assert.equal(soft.dmgB, 0);
  const separating = collisionDamage([0, 0], [5, 0], c, FREIGHTER_MASS, BATTLESHIP_MASS);
  assert.equal(separating.dmgA + separating.dmgB, 0);
  // damage grows with the square of the closing speed
  const fast = collisionDamage([0, 0], [-20, 0], c, FREIGHTER_MASS, BATTLESHIP_MASS);
  assert.ok(fast.dmgB > hard.dmgB * 3.5);
  console.log('  ✔ collision damage: quadratic in speed, mass-weighted, zero for grazing/separating');
}
{
  const a = box(0, 0, 0, BATTLESHIP_HULL);
  assert.ok(hullRadiusAlong(a, 1, 0) === BATTLESHIP_HULL.halfWidth);
  assert.ok(hullRadiusAlong(a, 0, 1) === BATTLESHIP_HULL.halfLength);
  console.log('  ✔ support radius along axes matches half width / half length');
}
{
  // Rotated Freighter hull (bowZ = 1): at heading = +PI/4, forward is (-0.707, +0.707)
  // so point (-40, 40) lies along the bow axis (inside 68 m halfLength, outside 12 m halfWidth if perpendicular!)
  const freighter45 = { x: 0, z: 0, heading: Math.PI / 4, bowZ: 1, ...FREIGHTER_HULL };
  assert.ok(pointInHull(-40, 40, freighter45), 'point along rotated Freighter +Z bow (-sin, cos) must be inside hull');
  assert.ok(!pointInHull(40, 40, freighter45), 'point perpendicular to rotated Freighter hull must be outside hull');
  const bsSide = { x: 14, z: 14, heading: 0, ...BATTLESHIP_HULL };
  const sideContact = hullOverlap(freighter45, bsSide);
  assert.ok(sideContact && sideContact.depth > 0, 'rotated Freighter vs nearby Battleship overlap must be detected');
  const sideDmg = collisionDamage([-8, 8], [-10, -10], sideContact, FREIGHTER_MASS, BATTLESHIP_MASS);
  assert.ok(sideDmg.dmgA > 60 && sideDmg.dmgB > 60, 'high-speed oblique hull ramming must exceed hull breach threshold');
  console.log('  ✔ rotated Freighter hull (bowZ = 1) OBB matches 3D (-sin, cos) heading and oblique collision damage');
}
{
  const src = fs.readFileSync(path.join(process.cwd(), 'detailed-3d-sinking-freighter-game_sonnet/src/game/game.ts'), 'utf8');
  assert.ok(src.includes('stepVesselCollisions(dt)'), 'game loop must step vessel collisions');
  assert.ok(src.includes('pointInHull(proj.pos.x, proj.pos.z'), 'projectiles must use hull boxes');
  assert.ok(src.includes('breachFreighterHullAt(') && src.includes('freighterHitSection('), 'torpedoes, missiles & collisions must breach & hit Freighter hull sections');
  assert.ok(src.includes('superlaserTargetBsId'), 'superlaser must stay locked to its original Battleship id');
  console.log('  ✔ game loop steps vessel collisions, hull breaches, and locked Superlaser targets');
}
console.log('🎉 ALL VESSEL HULL COLLISION TESTS PASSED!');
