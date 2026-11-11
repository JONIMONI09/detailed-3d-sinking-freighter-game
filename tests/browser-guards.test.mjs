// tests/browser-guards.test.mjs - Browser API regression guards
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

const HELPER_FILES = [
  'src/lib/browserGuards.ts',
  'detailed-3d-sinking-freighter-game_sonnet/src/lib/browserGuards.ts',
];

async function loadHelper(file) {
  const source = readFileSync(file, 'utf8');
  const js = ts.transpileModule(source, {
    fileName: file,
    compilerOptions: {
      target: ts.ScriptTarget.ES2020,
      module: ts.ModuleKind.ESNext,
    },
  }).outputText;
  return import(`data:text/javascript;base64,${Buffer.from(js).toString('base64')}`);
}

let checks = 0;
const pass = (message) => {
  checks++;
  console.log(`  ✔ ${message}`);
};

for (const file of HELPER_FILES) {
  const { safeSetPointerCapture, toggleFullscreen } = await loadHelper(file);
  const label = file.startsWith('src/') ? 'root' : 'sonnet';

  let captured = null;
  const captureTarget = {
    isConnected: true,
    setPointerCapture(id) {
      captured = id;
    },
  };
  assert.equal(safeSetPointerCapture(captureTarget, 7), true, `${label}: capture succeeds`);
  assert.equal(captured, 7, `${label}: pointer id forwarded`);
  pass(`${label}: pointer capture forwards the active pointer id`);

  const throwingTarget = {
    isConnected: true,
    setPointerCapture() {
      const error = new Error('pointer is not active');
      error.name = 'InvalidStateError';
      throw error;
    },
  };
  assert.equal(safeSetPointerCapture(throwingTarget, 3), false, `${label}: throwing capture is contained`);
  pass(`${label}: InvalidStateError from setPointerCapture is contained`);

  let disconnectedCalled = false;
  const disconnectedTarget = {
    isConnected: false,
    setPointerCapture() {
      disconnectedCalled = true;
    },
  };
  assert.equal(safeSetPointerCapture(disconnectedTarget, 2), false, `${label}: disconnected target rejected`);
  assert.equal(disconnectedCalled, false, `${label}: disconnected target is not touched`);
  assert.equal(safeSetPointerCapture(null, 2), false, `${label}: null target rejected`);
  assert.equal(safeSetPointerCapture(captureTarget, -1), false, `${label}: invalid pointer id rejected`);
  pass(`${label}: disconnected/null targets and invalid ids are ignored`);

  let requested = 0;
  const enterDoc = {
    fullscreenElement: null,
    fullscreenEnabled: true,
    documentElement: {
      requestFullscreen: async () => {
        requested++;
      },
    },
  };
  assert.deepEqual(await toggleFullscreen(enterDoc), { active: true, error: false }, `${label}: enter result`);
  assert.equal(requested, 1, `${label}: requestFullscreen called once`);
  pass(`${label}: fullscreen request is awaited and reports active`);

  const deniedDoc = {
    fullscreenElement: null,
    fullscreenEnabled: true,
    documentElement: {
      requestFullscreen: () => Promise.reject(new Error('denied')),
    },
  };
  assert.deepEqual(await toggleFullscreen(deniedDoc), { active: false, error: true }, `${label}: rejected request`);
  pass(`${label}: rejected fullscreen request is caught as a normal error`);

  let exited = 0;
  const exitDoc = {
    fullscreenElement: {},
    documentElement: {},
    exitFullscreen: async () => {
      exited++;
    },
  };
  assert.deepEqual(await toggleFullscreen(exitDoc), { active: false, error: false }, `${label}: exit result`);
  assert.equal(exited, 1, `${label}: exitFullscreen called once`);
  pass(`${label}: exiting fullscreen is awaited`);

  const unsupportedDoc = { documentElement: {} };
  assert.deepEqual(await toggleFullscreen(unsupportedDoc), { active: false, error: true }, `${label}: unsupported API`);
  const disabledDoc = {
    fullscreenEnabled: false,
    documentElement: {
      requestFullscreen: async () => {
        throw new Error('must not be called');
      },
    },
  };
  assert.deepEqual(await toggleFullscreen(disabledDoc), { active: false, error: true }, `${label}: disabled API`);
  pass(`${label}: unsupported/disabled fullscreen is reported without throwing`);
}

console.log(`🎉 ALL ${checks} BROWSER GUARD REGRESSION TESTS PASSED!`);
