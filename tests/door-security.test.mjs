// tests/door-security.test.mjs - Door security checks, confirmation flow and terminal log
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

const FILE = 'detailed-3d-sinking-freighter-game_sonnet/src/game/doorSecurity.ts';
const js = ts.transpileModule(readFileSync(FILE, 'utf8'), {
  fileName: FILE,
  compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.ESNext },
}).outputText;
const sec = await import(`data:text/javascript;base64,${Buffer.from(js).toString('base64')}`);

console.log('Starting door security tests...');

const comp = (name, z0, z1, fill) => ({ name, min: { z: z0, y: -5 }, max: { z: z1, y: 2.7 }, fill });
const door = (over = {}) => ({
  name: 'Watertight Bulkhead', axis: 'x', fixed: -39, y0: -5, h: 2.2,
  bulkhead: true, locked: null, target: 0, ...over,
});
const ctx = (comps, over = {}) => ({
  now: 10, hasKey: { red: false, blue: false }, sandbox: false, sinking: false, compartments: comps, ...over,
});
const dry = () => [comp('Engine Room', -69.5, -39.25, 0), comp('Cargo Hold 3', -38.75, -8.25, 0)];
const wet = () => [comp('Engine Room', -69.5, -39.25, 0.6), comp('Cargo Hold 3', -38.75, -8.25, 0)];

// 1. Adjacent compartment lookup
{
  const s = sec.bulkheadSides(door(), dry());
  assert.equal(s.aft.name, 'Engine Room');
  assert.equal(s.fore.name, 'Cargo Hold 3');
  assert.equal(sec.doorLocation(door(), dry()), 'Engine Room <-> Cargo Hold 3');
  assert.equal(sec.bulkheadSides(door({ axis: 'z' }), dry()).aft, null);
  console.log('  ok bulkhead sides resolved');
}

// 2. Locked doors
{
  const d = door({ bulkhead: false, locked: 'red', name: 'Engine Control Room' });
  assert.equal(sec.assessDoor(d, ctx(dry())).action, 'deny');
  assert.equal(sec.assessDoor(d, ctx(dry(), { hasKey: { red: true, blue: false } })).action, 'proceed');
  console.log('  ok locked doors require the matching card');
}

// 3. Bulkhead safety interlock
{
  assert.equal(sec.assessDoor(door(), ctx(dry())).action, 'proceed');
  assert.equal(sec.assessDoor(door(), ctx(wet())).action, 'confirm');
  assert.equal(sec.assessDoor(door({ target: 1 }), ctx(wet())).action, 'proceed', 'closing is always safe');
  assert.equal(sec.assessDoor(door(), ctx(wet(), { sandbox: true })).action, 'proceed', 'sandbox bypasses interlock');
  const bothFlooded = [comp('Engine Room', -69.5, -39.25, 0.8), comp('Cargo Hold 3', -38.75, -8.25, 0.8)];
  assert.equal(sec.assessDoor(door(), ctx(bothFlooded)).action, 'confirm', 'equal heavy flooding still needs confirmation');
  assert.equal(sec.assessDoor(door({ bulkhead: false, name: 'Cabin Door' }), ctx(wet())).action, 'proceed');
  console.log('  ok bulkhead interlock decisions');
}

// 4. Two-step confirmation with expiry, and terminal logging
{
  const log = new sec.TerminalLog(8);
  const ds = new sec.DoorSecurity(log, 3);
  const d = door();
  const first = ds.request(d, ctx(wet(), { now: 10 }));
  assert.equal(first.action, 'confirm');
  assert.equal(ds.isAwaitingConfirm(d, 11), true);
  assert.equal(ds.prompt(d, ctx(wet(), { now: 11 })).kind, 'confirm');
  const second = ds.request(d, ctx(wet(), { now: 11 }));
  assert.equal(second.action, 'proceed');
  assert.match(second.message, /OVERRIDE CONFIRMED/);
  assert.equal(ds.isAwaitingConfirm(d, 11), false);

  ds.request(d, ctx(wet(), { now: 20 }));
  const late = ds.request(d, ctx(wet(), { now: 24 }));
  assert.equal(late.action, 'confirm', 'confirmation window must expire');

  const lines = log.recent(10);
  assert.ok(lines.length >= 4);
  assert.ok(lines.every((e) => e.source === 'SEC'));
  console.log('  ok confirmation flow and expiry');
}

// 5. Terminal log is bounded and records door events
{
  const seen = [];
  const log = new sec.TerminalLog(3, (e) => seen.push(e.id));
  const ds = new sec.DoorSecurity(log);
  for (const ev of ['open', 'close', 'locked', 'unlock']) ds.recordEvent(door(), ev, ctx(dry()));
  assert.equal(log.size, 3, 'log capacity must be enforced');
  assert.equal(seen.length, 4, 'sink receives every entry');
  const last = log.recent(1)[0];
  assert.equal(last.source, 'DOOR');
  assert.match(last.text, /UNLOCKED \[Engine Room <-> Cargo Hold 3\]/);
  log.clear();
  assert.equal(log.size, 0);
  console.log('  ok terminal log capacity, sink and door events');
}

console.log('Door security tests passed.');
