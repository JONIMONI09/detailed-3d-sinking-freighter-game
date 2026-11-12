# CI & Deployment Verification Record

Status: **green** — branch CI, main CI and the GitHub Pages deployment for the
fullscreen fix were verified on 2026-11-12. §14 records that delivery; sections
3–12 keep the earlier local runs and their historical numbers.

Fullscreen fix commit: `7e54232` — *Run CI on feature branches* on `main`.
Project skills commit: `cc32e2e` — *Add project skills for fix, CI and documentation workflows* on `main`.
Native skill-path commit: `34f28d1` — *Move project skills to Freebuff's native discovery path* on `main`.
Initial deployment fix: `410a321` — *Enable GitHub Pages provisioning*.

---

## 1. Summary (after the fullscreen fix, 2026-11-12)

| Item | Result |
| :--- | :--- |
| Dependency install (`npm ci`) | Exit 0, 104 packages |
| Root TypeScript check | Exit 0, 0 errors |
| Sonnet edition TypeScript check | Exit 0, 0 errors |
| Physics unit tests | Exit 0, 5/5 passed |
| Browser-guard regression tests | Exit 0, 14/14 passed |
| Python CI integrity suite | Exit 0, 10/10 passed |
| Project skills | 4 `SKILL.md` files; frontmatter structure checked by `tools/ci_check.py` |
| Branch CI (`fix/fullscreen-pointer-capture`) | **success**, run `43119185236` |
| Main CI (`7e54232`) | **success**, run `43119328266` |
| GitHub Pages deploy (`7e54232`) | **success**, run `43119328360` |
| Root production build | Exit 0, 956.06 kB (gzip 251.25 kB), `b5908820…` |
| Sonnet production build | Exit 0, 1,001.09 kB (gzip 275.92 kB), `7ea4957d…` |
| Live pages | HTTP 200 for `/` and `/sonnet/` |

The Pages failure described in §5 is fixed and the site is published. Sections
3–12 document the earlier passes; §14 is the authoritative final record.

---

## 2. Environment

| Tool | Value |
| :--- | :--- |
| Node.js | v26.13.0 (`node -v`) |
| npm | 11.20.0 |
| Python | 3.12.3 |
| Vite | 7.3.2 |
| TypeScript | 5.9.3 |
| OS | Linux cloud sandbox (CI runner uses `ubuntu-latest`, Node 22) |

Vite 7 declares `engines.node: ^20.19.0 || >=22.12.0`, so the CI's Node 22
satisfies it. The local runs used Node 26; a Node-version specific difference
has not been observed but was not exhaustively excluded.

---

## 2.1 Two independent TypeScript/Vite targets

The repository contains two complete, separately configured targets. There is
no `tsconfig.app.json` / `tsconfig.node.json` split and no second config inside
the root project:

| Target | package.json | tsconfig | Vite config | Typecheck | Build |
| :--- | :--- | :--- | :--- | :--- | :--- |
| Root app | `package.json` | `tsconfig.json` | `vite.config.ts` | `npm run typecheck` | `npx vite build` |
| Sonnet sub-site | `detailed-3d-sinking-freighter-game_sonnet/package.json` | `…/tsconfig.json` | `…/vite.config.ts` | `npx tsc -p …/tsconfig.json --noEmit` | `npx vite build detailed-3d-sinking-freighter-game_sonnet` |

Both targets are built in CI (`ci.yml`) and in the Pages deploy
(`deploy-pages.yml`); the deploy additionally writes the Sonnet build to
`dist/sonnet` via `--outDir ../dist/sonnet --base ./`.

---

## 3. Local CI run — exact commands and results

```bash
npm ci
npx tsc --noEmit
npx tsc -p detailed-3d-sinking-freighter-game_sonnet/tsconfig.json --noEmit
node tests/physics.test.mjs
python tools/ci_check.py
npx vite build
mkdir -p dist/sonnet
npx vite build detailed-3d-sinking-freighter-game_sonnet --outDir ../dist/sonnet --base ./
```

| Step | Exit | Duration | Output |
| :--- | :---: | :--- | :--- |
| `npm ci` | 0 | ~5 s | `added 104 packages`, 2 advisories (1 low, 1 high) |
| Root `tsc --noEmit` | 0 | 4 s | no diagnostics |
| Sonnet `tsc --noEmit` | 0 | 4 s | no diagnostics |
| `node tests/physics.test.mjs` | 0 | <1 s | 5/5 tests, `ALL 5 SIMULATION PHYSICS TESTS PASSED` |
| `python tools/ci_check.py` | 0 | <1 s | 7/7 checks, `All 7 CI checks passed successfully` |
| Root `vite build` | 0 | 3.96 s | 2106 modules; `dist/index.html 953.59 kB │ gzip: 250.56 kB` |
| Sonnet `vite build` | 0 | 3.02 s | 53 modules; `../dist/sonnet/index.html 1,001.18 kB │ gzip: 276.57 kB` |

Artifact hashes of the verified run:

```
2e69b066375e726eb59bb7aa49952056780ce1cdaf9a31f3ff3cfade46ecab85  dist/index.html
a0ff5b7e6671785a2f2ed3ff63d14cd62a319bc8803a459a1f7845a140951eaa  dist/sonnet/index.html
```

Both builds use `vite-plugin-singlefile`, so every script and stylesheet is
inlined. The only external requests are the Google Fonts links from
`index.html`; there are no `assets/`, texture, model or audio files to fetch.

---

## 4. GitHub Pages sub-path simulation

A project site is served from `https://<user>.github.io/<repo>/`, not from the
domain root. To verify the relative `base: "./"` configuration, the built
artifacts were served under a nested directory:

```bash
mkdir -p /tmp/pages-sim/detailed-3d-sinking-freighter-game
cp -r dist/. /tmp/pages-sim/detailed-3d-sinking-freighter-game/
cd /tmp/pages-sim && python3 -m http.server 4199
```

| URL | Status |
| :--- | :--- |
| `http://127.0.0.1:4199/detailed-3d-sinking-freighter-game/` | 200 |
| `http://127.0.0.1:4199/detailed-3d-sinking-freighter-game/sonnet/` | 200 |

This proves the deployment works from a sub-path. It does not prove that WebGL
renders — that still requires a real browser check.

---

## 5. Deployment fix

File: `.github/workflows/deploy-pages.yml`

**Before:** `actions/configure-pages@v4` ran without `enablement`, so the job
failed whenever the repository had no Pages site yet. The job also declared no
`environment`, so the deployment URL was never surfaced, and nothing validated
the build output before upload.

**After:**

1. `configure-pages@v4` with `with: enablement: true` — the job can create the
   Pages site itself instead of failing with
   *"Get Pages site failed … configured to build using GitHub Actions"*.
2. Job-level `environment: github-pages` with
   `url: ${{ steps.deployment.outputs.page_url }}` — the deployment appears in
   GitHub and exposes its URL.
3. New step **Verify Pages artifact** — fails fast if `dist/index.html` or
   `dist/sonnet/index.html` is missing.

Verification of the change: the workflow YAML parses (11 steps in order,
`enablement: True`), and `python tools/ci_check.py` passed 7/7 at the time.

---

## 6. Why the page could still appear blank

If **Settings → Pages → Source** is set to *Deploy from a branch*, GitHub serves
the repository's raw `index.html`. That file references `/src/main.tsx`
(TypeScript/TSX source, not built JavaScript) and the repository contains no
compiled CSS, because `dist/` is git-ignored. The result is a blank page with a
404 on `/src/main.tsx`. The Pages source must be **GitHub Actions**.

---

## 7. Known limitations and open risks

| Topic | Status |
| :--- | :--- |
| Live GitHub Actions run | **Verified on 2026-11-12.** Branch run `43119185236` (success), main CI `43119328266` (success) and Pages `43119328360` (success); see §14. Earlier observations in §11/§12 were made while the API was unreadable and are superseded. |
| Private repository on GitHub Free | The repository is publicly readable and the Pages deployment succeeds. If it is ever made private, Pages requires a plan that includes it; `enablement: true` may then fail on GitHub Free. |
| CI integrity suite depth | `check_watertight_dogging` greps for the strings `door.locked` and `0.85` anywhere in the file — `0.85` also matches `HemisphereLight(..., 0.85)`, so the check can pass even if the dogging timing regresses. `check_engine_room_collision_clearance` depends on the exact `addWallBox('diesel_engine_core', x, y, z)` formatting. Both are formatting checks, not behavioural tests. |
| Sonnet dependency isolation | `detailed-3d-sinking-freighter-game_sonnet/` ships its own `package.json` and `package-lock.json`, but CI installs only the root dependencies. The build works because every Sonnet dependency also exists at the root; adding a Sonnet-only dependency will break CI. |
| Node parity | CI uses Node 22, verification ran on Node 26. |
| Dependency advisories | `npm audit --omit=dev` reports **0 production vulnerabilities**. Two dev-only advisories remain in Vite 7.3.2/esbuild; fixing them requires a Vite upgrade, so no dependency change was made in this delivery. |
| Visual verification | Fullscreen, pointer and responsive HUD checks were run in the Cloud browser (§13 and `RESPONSIVE_UI.md`); the early runs in §3/§4 used HTTP status and HTML content only. |

---

## 8. Reproduce / regression check

```bash
npm ci
npm run typecheck
npx tsc -p detailed-3d-sinking-freighter-game_sonnet/tsconfig.json --noEmit
npm test
npm run build
npx vite build detailed-3d-sinking-freighter-game_sonnet --outDir ../dist/sonnet --base ./
```

Expected: every command exits 0, `dist/index.html` and `dist/sonnet/index.html`
exist, and neither file references an external `/assets/…` bundle.

---

## 9. Rollback

The deployment change is limited to `.github/workflows/deploy-pages.yml`:

```bash
git revert 410a321
```

Reverting restores the previous workflow (no `enablement`, no `environment`,
no artifact check). The application code and build configuration are unchanged
by this record.

---

## 10. Clean-room re-verification (2026-11-11, after the responsive HUD + English UI change)

The whole chain was re-run from a fresh install state: `node_modules`, `dist`
and `detailed-3d-sinking-freighter-game_sonnet/dist` were removed first, then
`npm ci` restored the tree from `package-lock.json` only (no `npm install`, no
`--force`, no `--legacy-peer-deps`). The lockfile stayed untouched — `git
status` shows no change to `package-lock.json`.

| # | Command | Exit | Key output |
| :-: | :--- | :-: | :--- |
| 1 | `npm ci` | 0 | `added 104 packages`, 2 advisories (1 low, 1 high); only the esbuild postinstall warning |
| 2 | `npm run typecheck` (→ `tsc --noEmit`) | 0 | no diagnostics |
| 3 | `npx tsc -p detailed-3d-sinking-freighter-game_sonnet/tsconfig.json --noEmit` | 0 | no diagnostics |
| 4 | `npm test` | 0 | 5/5 physics tests, 7/7 Python integrity checks |
| 5 | `npx vite build` | 0 | 2106 modules, `dist/index.html` 953.59 kB (gzip 250.56 kB), 3.96 s |
| 6 | `npx vite build detailed-3d-sinking-freighter-game_sonnet --outDir ../dist/sonnet --base ./` | 0 | 53 modules, `../dist/sonnet/index.html` 1,001.18 kB (gzip 276.57 kB), 3.02 s |
| 7 | `npx vite build detailed-3d-sinking-freighter-game_sonnet` (ci.yml path) | 0 | 53 modules, `…/dist/index.html` 1,001.18 kB, 2.94 s |

Both Sonnet invocations produced the **same** artifact hash (`a0ff5b7e…`), so CI
and the Pages deploy build an identical file. The root artifact hash is
`2e69b066…`.

The responsive HUD rules survive the single-file build: `dist/index.html`
contains the `max-height:560px` media query (2 occurrences) and the
`naval-scroll-x` helper (3 occurrences). No typecheck or test broke because of
the landscape changes.

---

## 11. English UI pass and YAML gate (2026-11-11)

All player-facing German strings in the root app were replaced with English
(331 literal replacements across `index.html`, `src/App.tsx`, `src/types/game.ts`,
`src/game/CargoShipBuilder.ts` and the HUD/modal components). Only code comments
and the binary-string regex keep umlauts; `dist/index.html` contains no German UI
marker (`UNTER WASSER`, `TÜREN`, `SCHOTTEN`, `KIEL SPRENGEN`, …).

Before the clean install, both workflows were parsed and asserted with Python
(33 checks: duplicate-key detection through a custom `yaml.SafeLoader`, trigger
and job presence, Node 22, `npm ci`, both typechecks, both builds, Pages
permissions, `enablement: true`, artifact paths, no `--force` or
`--legacy-peer-deps`). `python tools/ci_check.py` passed 7/7, including its own
workflow integrity check. The clean-room chain then passed with the numbers in
§10; the root bundle is 953.59 kB and hashes to `2e69b066…`.

The verified tree was pushed to `main` as `98d649f` (fast-forward
`410a321..98d649f`). At that time the Cloud sandbox could not read Actions
(`gh` unauthenticated, anonymous API 403). That limitation is resolved: §14
records the actual branch, main and Pages runs.

---

## 12. Sonnet edition English UI pass (2026-11-11)

The second, independent edition (`detailed-3d-sinking-freighter-game_sonnet/`,
served at `/sonnet/`) was still German. Its player-facing strings are now
English: **282 literal replacements** (259 from a one-off script plus 23 manual
follow-ups for template literals, all 13 pickup labels, the engine-room
detonation marker, the settings *Done* button and the locked-door messages).
The unlock message now captures the card colour before `unlock()` instead of
reading the already-cleared lock state. Screens,
help, settings, HUD, weapon names, ship-part/door names, objectives, event
messages, crash screen, touch controls and `index.html` (`lang="en"`, English
title) were covered. Ship geometry, collision, physics, balancing and the root
edition were not touched — `git diff` for root `src/`, `index.html` and both
build configs is empty.

The final clean-room chain (`npm ci` from the lockfile) passed:

| Step | Exit | Result |
| :--- | :---: | :--- |
| `npm ci` | 0 | 104 packages, lockfile unchanged |
| `npm run typecheck` | 0 | no diagnostics |
| Sonnet `tsc --noEmit` | 0 | no diagnostics |
| `npm test` | 0 | 5/5 physics tests, 7/7 Python checks |
| Root `npx vite build` | 0 | 953.62 kB (gzip 250.57 kB) |
| Sonnet Pages build | 0 | 1,000.17 kB (gzip 275.60 kB) |
| Sonnet `ci.yml` build | 0 | 1,000.17 kB (gzip 275.60 kB) |

Artifact hashes of the verified run:

```
1c9d3b60143df32166718c60d9ebadbc5d29f1b5945293d698303ebb817d2898  dist/index.html
cd863102621f2b381455ee4427112667ba38d5d1f6cfc1d4eb1928f2ac953d9b  dist/sonnet/index.html
cd863102621f2b381455ee4427112667ba38d5d1f6cfc1d4eb1928f2ac953d9b  detailed-3d-sinking-freighter-game_sonnet/dist/index.html
```

Both Sonnet invocations produce the same artifact. Scans of both Sonnet bundles
find **no German UI marker and no umlaut**; the only `der` match is Three.js'
"Van der Corput" shader comment, and `die()` is an internal enemy method. German
comments in the source are unchanged and allowed.

Preview in the Cloud browser at exact iframe sizes (buttons measured with
`elementFromPoint` and clip-aware scroll-ancestor intersections):

| Viewport | Screen | Fully visible | Clipped | Covered |
| :--- | :--- | :---: | :---: | :---: |
| 1280×800 | Menu | 5/5 | 0 | 0 |
| 1280×800 | Settings | 20 own controls | 0 | 0 (5 background buttons intentionally behind the modal) |
| 1280×800 | Help | 6/6 | 0 | 0 |
| 390×844 | Menu / after start | 5/5 | 0 | 0 |
| 390×844 | Settings | 20 own controls | 0 | 0 |
| 390×844 | Help | 6/6 | 0 | 0 |

The settings body scrolls (978/652 px desktop, 1,553/701 px mobile), the four
tabs scroll horizontally at 390 px (416/390), and *Done* stays visible. After
*Start Mission* the mobile build shows 5/5 ready-screen buttons with the canvas
running. Root spot checks: 1280×800 23/23 buttons, 390×844 21/21, 0 clipped and
0 covered. The root UI was therefore re-checked after the Sonnet pass.

**Root bundle hash change:** §10/§11 recorded `2e69b066…`, while the same root
source now builds to `1c9d3b60…` (953.62 kB). No root file was edited. Tailwind's
project-wide content scan also reads the Sonnet source; removing that folder
from the tree temporarily and rebuilding root yields `8ccb0d75…` (929.73 kB),
which isolates the cause. The extra generated utilities are unused by the root
UI, which measured with zero clipped/covered buttons; the shipped and CI build
includes the Sonnet folder and is the `1c9d3b60…` artifact above.

Before the push both workflows were validated again with Python (`yaml.SafeLoader`
plus a duplicate-key constructor): **46/46 assertions passed**, including triggers,
Node 22, `npm ci`, both typechecks/builds, Pages permissions, `enablement: true`,
artifact checks and no force flags. `python tools/ci_check.py` passed 7/7.

At the time of this pass, Actions could not be read from the sandbox (`gh`
unauthenticated, anonymous API 403). This is superseded by §14, which records
the successful branch, main and Pages runs.

---

## 13. Fullscreen and touch-pointer crash fix (2026-11-11)

The reported Android crash at `785x303` was reproduced from the crash log:
`InvalidStateError: Failed to execute 'setPointerCapture'` in the root look
zone. Android Chrome can cancel a pointer before React's `pointerdown` handler
runs, so the unguarded capture call threw and reached the global crash guard.

Changes:

1. Both editions now use `safeSetPointerCapture()` from
   `src/lib/browserGuards.ts` (Sonnet has its own copy). It rejects null,
   disconnected and invalid targets and contains `InvalidStateError`, so touch
   movement continues without capture instead of crashing.
2. The root HUD gained a fullscreen button. Both editions use the awaited
   `toggleFullscreen()` helper, which catches the **promise rejection** that a
   synchronous `try/catch` cannot catch. A blocked request now shows a short
   status message instead of silently doing nothing.
3. `tests/browser-guards.test.mjs` covers throwing/disconnected pointer targets,
   successful and rejected fullscreen requests, exit, unsupported APIs and both
   edition helper copies. `npm test` now runs physics + browser guards + Python;
   `ci.yml` invokes `npm test` instead of only the Python suite, so these tests
   run on GitHub. CI now also triggers on every branch push, so a feature branch
   can be verified before it is merged.

Browser verification (real Playwright click in the active tab):

- Root fullscreen: `document.fullscreenElement` becomes `HTML`; button changes
  to *Exit fullscreen*. Sonnet fullscreen works the same way. A background tab
  rejects with `TypeError: not granted`; that is a browser focus rule and is
  surfaced by the new status message, not an application crash.
- Original viewport `785x303`: 18/18 buttons fully visible, 0 clipped, 0 covered;
  synthetic `pointerdown` with an invalid pointer id produces no error and no
  crash screen.
- `390x844`: 18/18 buttons, 0 clipped/covered, pointer zone present.
- `1280x800`: 22/22 buttons, 0 clipped/covered. Sonnet menu: 5/5 at both
  `1280x800` and `390x844`.

Final artifacts after this fix:

```
b590882086dbd9be6dba4e8fce0d5831ac03e1205211997196c728e11b67eb72  dist/index.html
7ea4957dfe82f83ac489e159b5683d0a2f056424329399482cd1ffa5d1a9635f  dist/sonnet/index.html
7ea4957dfe82f83ac489e159b5683d0a2f056424329399482cd1ffa5d1a9635f  detailed-3d-sinking-freighter-game_sonnet/dist/index.html
```

Root build: 956.06 kB (gzip 251.25 kB). Sonnet build: 1,001.09 kB
(gzip 275.92 kB).

The feature branch was gated on run `43119185236` and merged only after it
succeeded; §14 records the merge, main CI and Pages deployment.

---

## 14. Fullscreen fix delivery verification (2026-11-12)

### Branch and merge

- Branch: `fix/fullscreen-pointer-capture`, based on `7274830`.
- `f0e8191` — **Guard fullscreen and pointer capture across editions**.
- `7e54232` — **Run CI on feature branches** and document the branch gate.
- Branch CI: run [`43119185236`](https://github.com/JONIMONI09/detailed-3d-sinking-freighter-game/actions/runs/43119185236),
  commit `7e54232`, **success**.
- Merge to `main`: fast-forward `7274830..7e54232`; worktree clean.
- At the fix merge, remote `main` and `FETCH_HEAD` were both at
  `7e54232e3b4b6b2a7101b787403e423bb760add6`.
- This documentation follow-up is CI-gated on its own feature branch before
  merge, so this section records the fix delivery rather than the latest repo tip.

### Main workflows

| Workflow | Run | Commit | Result |
| :--- | :--- | :--- | :--- |
| CI | [`43119328266`](https://github.com/JONIMONI09/detailed-3d-sinking-freighter-game/actions/runs/43119328266) | `7e54232` | **success** |
| GitHub Pages | [`43119328360`](https://github.com/JONIMONI09/detailed-3d-sinking-freighter-game/actions/runs/43119328360) | `7e54232` | **success** |

### Live deployment

| URL | HTTP | Bytes |
| :--- | :---: | ---: |
| `https://jonimoni09.github.io/detailed-3d-sinking-freighter-game/` | 200 | 956,060 |
| `https://jonimoni09.github.io/detailed-3d-sinking-freighter-game/sonnet/` | 200 | 1,001,088 |

The live root bundle contains `Enter fullscreen` and
`Fullscreen is blocked by this browser`; the Sonnet bundle contains
`Toggle Fullscreen` and the same blocked-request message.

### Gate at the fullscreen fix delivery

| Check | Result |
| :--- | :--- |
| `npm ci` | Exit 0, 104 packages |
| Root `tsc --noEmit` | Exit 0 |
| Sonnet `tsc --noEmit` | Exit 0 |
| `npm test` | Exit 0 at the fix delivery; the suite was later extended to 10 Python checks (§16) |
| Root build | 956.06 kB (gzip 251.25 kB), `b5908820…` |
| Sonnet build (both paths) | 1,001.09 kB (gzip 275.92 kB), `7ea4957d…` |
| Python YAML gate | 31/31 assertions, duplicate keys included |
| `npm audit --omit=dev` | 0 production vulnerabilities; 2 dev-only advisories documented in §7 |
| Live pages | HTTP 200 for `/` and `/sonnet/` |

The Android crash path at `785x303` is covered by the pointer guard and the
viewport measurements in §13. Real-device Android verification remains a manual
hardware check; the Cloud browser uses Chromium with exact-size iframes.

The Python suite grew to 10 checks when the project skills were added. §16
records that later delivery; §14 keeps the result from the fix itself.

---

## 15. Project skills and recurring workflow (2026-11-12)

Four project-local skills under `.agents/skills/` turn the recurring delivery
rules into discoverable instructions. `.agents/skills/` is Freebuff's native
project discovery path; `.claude/skills/` is also supported for Claude Code
compatibility. The native path is used here because `npx skills list` labels
`.claude/` skills as Claude Code scope.

| Skill | Purpose |
| :--- | :--- |
| `error-fix-document` | Reproduce, fix the root cause, add fallbacks, add regression tests, update docs, and gate the branch through CI. |
| `ci-workflow-audit` | Validate workflow YAML with duplicate-key detection, verify branch/Pages triggers, and check the exact-SHA Actions run before merging. |
| `documentation-maintenance` | Scan for stale claims, keep current and historical results separate, and record commands, hashes, run IDs, and limitations. |
| `skill-discovery-audit` | Verify the native path, YAML frontmatter, exact `/skill:<name>` command and session reload when a skill is missing or a slash command is not recognized. |

Each `SKILL.md` starts with YAML frontmatter containing `name`, `description`,
`license`, and `metadata`. Skill names match their directory names, which
Freebuff requires. The official format is documented at
<https://docs.freebuff.page/working-with-the-agent/#skills>.

Freebuff registers every skill as `/skill:<name>`. The project skills are
`/skill:error-fix-document`, `/skill:ci-workflow-audit`,
`/skill:documentation-maintenance` and `/skill:skill-discovery-audit`; the
built-in account skills are
`/skill:brainstorming`, `/skill:find-skills` and `/skill:skill-creator`. A bare
`/brainstorming` is not a command.

`tools/ci_check.py` checks the four skill files for presence, frontmatter
delimiters, directory/name match, a non-empty description, actionable body
length, absence of German umlauts, and no unfinished markers. Full YAML syntax
was parsed separately with `yaml.safe_load` during delivery. `npm test` fails
if a skill is deleted, renamed, or structurally broken.

---

## 16. Project-skills delivery (2026-11-12)

- Branch: `skills/quality-workflow-gate`, based on `866a4e9`.
- Commit: `cc32e2e` — *Add project skills for fix, CI and documentation workflows*.
- Branch CI: run [`43212298392`](https://github.com/JONIMONI09/detailed-3d-sinking-freighter-game/actions/runs/43212298392),
  commit `cc32e2e`, **success**.
- Merge to `main`: fast-forward `866a4e9..cc32e2e`.
- Main CI: run [`43212921120`](https://github.com/JONIMONI09/detailed-3d-sinking-freighter-game/actions/runs/43212921120),
  commit `cc32e2e`, **success**.
- GitHub Pages: run [`43212920586`](https://github.com/JONIMONI09/detailed-3d-sinking-freighter-game/actions/runs/43212920586),
  commit `cc32e2e`, **success**.
- Remote `main` and `FETCH_HEAD` were both at
  `cc32e2ef67b680cf16239089524ee63561de7709` after the merge.

Local gate at this commit:

| Check | Result |
| :--- | :--- |
| `npm test` | Exit 0: 5/5 physics, 14/14 browser guards, 10/10 Python |
| Root and Sonnet typechecks | Exit 0 |
| Root build | 956.06 kB (gzip 251.25 kB), `b5908820…` |
| Sonnet build (both paths) | 1,001.09 kB (gzip 275.92 kB), `7ea4957d…` |
| Workflow YAML gate | 31/31 assertions, duplicate keys included |
| Skill frontmatter | 3/3 parsed with `yaml.safe_load`; names match directories |
| Live pages | HTTP 200 for `/` and `/sonnet/`; markers present |

GitHub's anonymous REST API was rate-limited during this audit: `core.remaining`
was 0 at `2026-11-12T11:56Z`, with reset at `12:23Z`. The exact-SHA results
above were therefore verified from the official Actions run pages, which show
commit `cc32e2e` and `completed successfully`; no run ID or status was invented.
A later documentation-repair commit is CI-gated separately and does not change
these historical results.

---

## 17. Native project-skill discovery (2026-11-12)

The three project skills moved from `.claude/skills/` to `.agents/skills/`.
`npx skills list` lists all three from the native path. Freebuff registers every
skill as `/skill:<name>`; the built-in account skills are
`/skill:brainstorming`, `/skill:find-skills` and `/skill:skill-creator`. A bare
`/brainstorming` is not a command. Freebuff loads skills at session start, so a
running chat must be reloaded before it sees the new path.

- Branch: `fix/skill-discovery`, based on `f5a0ba7`.
- Fix commit: `34f28d1` — *Move project skills to Freebuff's native discovery path*.
- Branch CI: run [`43216150102`](https://github.com/JONIMONI09/detailed-3d-sinking-freighter-game/actions/runs/43216150102),
  commit `34f28d1`, **success**.
- Merge to `main`: fast-forward `f5a0ba7..34f28d1`.
- Main CI: run [`43216286360`](https://github.com/JONIMONI09/detailed-3d-sinking-freighter-game/actions/runs/43216286360),
  commit `34f28d1`, **success**.
- GitHub Pages: run [`43216286679`](https://github.com/JONIMONI09/detailed-3d-sinking-freighter-game/actions/runs/43216286679),
  commit `34f28d1`, **success**.
- Remote `main` and `FETCH_HEAD` were both at
  `34f28d1ae533b5505a20a08e5231dffe50929ff3` after the merge.

Local gate at this change:

| Check | Result |
| :--- | :--- |
| `npm test` | Exit 0: 5/5 physics, 14/14 browser guards, 10/10 Python |
| Root and Sonnet typechecks | Exit 0 |
| Root build | 956.06 kB (gzip 251.25 kB), `b5908820…` |
| Sonnet build (both paths) | 1,001.09 kB (gzip 275.92 kB), `7ea4957d…` |
| Workflow YAML | Both files parsed with duplicate-key rejection |
| Skill YAML | 3/3 parsed; names match directories; bodies 3,083–3,326 chars |
| `npm audit --omit=dev` | 0 vulnerabilities |

Live pages after the deployment:

| URL | HTTP | Bytes |
| :--- | :---: | ---: |
| `https://jonimoni09.github.io/detailed-3d-sinking-freighter-game/` | 200 | 956,060 |
| `https://jonimoni09.github.io/detailed-3d-sinking-freighter-game/sonnet/` | 200 | 1,001,088 |

The moved files are the three `SKILL.md` files; their contents did not change.

---

## 18. Skill-discovery audit skill (2026-11-12)

The fourth project skill, `skill-discovery-audit`, turns the recurring
"skill not recognized" investigation into a repeatable checklist: native
`.agents/skills/` path, YAML frontmatter, exact `/skill:<name>` invocation and
the session-start reload. `tools/ci_check.py` now requires all four skills.

- Branch: `skills/discovery-audit`, based on `31b54c3`.
- Fix commit: `4b7480a` — *Add skill discovery audit skill*.
- Branch CI: run [`43224320242`](https://github.com/JONIMONI09/detailed-3d-sinking-freighter-game/actions/runs/43224320242),
  commit `4b7480a`, **success**.
- Merge to `main`: fast-forward `31b54c3..4b7480a`.
- Main CI: run [`43225088772`](https://github.com/JONIMONI09/detailed-3d-sinking-freighter-game/actions/runs/43225088772),
  commit `4b7480a`, **success**.
- GitHub Pages: run [`43225088864`](https://github.com/JONIMONI09/detailed-3d-sinking-freighter-game/actions/runs/43225088864),
  commit `4b7480a`, **success**.
- Remote `main` and `FETCH_HEAD` were both at
  `4b7480a22ba2aac631fb51fc8f05703a30a2d05c` after the merge.

Local gate at this change:

| Check | Result |
| :--- | :--- |
| `npm test` | Exit 0: 5/5 physics, 14/14 browser guards, 10/10 Python |
| Root and Sonnet typechecks | Exit 0 |
| Root build | 956.10 kB (gzip 251.25 kB), `092f298f…` |
| Sonnet build (both paths) | 1,001.09 kB (gzip 275.92 kB), `7ea4957d…` |
| Workflow YAML | Both files parsed with duplicate-key rejection |
| Skill YAML | 4/4 parsed; names match directories; bodies 3,083–4,976 chars |
| `npm audit --omit=dev` | 0 vulnerabilities |

The root bundle moved from 956.06 kB/`b5908820…` to 956.10 kB/`092f298f…`;
the new Markdown skill is the only new source file, and the project-wide
Tailwind scan is the documented cause of root-only movements (§12). The Sonnet
bundle is unchanged.

Live pages after the deployment:

| URL | HTTP | Bytes |
| :--- | :---: | ---: |
| `https://jonimoni09.github.io/detailed-3d-sinking-freighter-game/` | 200 | 956,096 |
| `https://jonimoni09.github.io/detailed-3d-sinking-freighter-game/sonnet/` | 200 | 1,001,088 |

---

## 19. Fresh loader verification (2026-11-12)

A fresh Node.js 26 process using the published `@codebuff/sdk@0.10.7`
`loadSkills()` implementation was run against this repository. This was not a
file listing: the SDK parsed the discovered `SKILL.md` files and returned the
skills map. The run used both `includeHomeSkills: false` and
`includeHomeSkills: true`; both returned the same four project skills.

| Project skill | Exact handle | Loaded path |
| :--- | :--- | :--- |
| `ci-workflow-audit` | `/skill:ci-workflow-audit` | `.agents/skills/ci-workflow-audit/SKILL.md` |
| `documentation-maintenance` | `/skill:documentation-maintenance` | `.agents/skills/documentation-maintenance/SKILL.md` |
| `error-fix-document` | `/skill:error-fix-document` | `.agents/skills/error-fix-document/SKILL.md` |
| `skill-discovery-audit` | `/skill:skill-discovery-audit` | `.agents/skills/skill-discovery-audit/SKILL.md` |

The account registry was checked separately because account skills are not
stored in the project tree. At the time of this loader run it contained six
built-in skills; their enabled state is managed separately:

| Account skill | Exact handle | State |
| :--- | :--- | :--- |
| `brainstorming` | `/skill:brainstorming` | present |
| `find-skills` | `/skill:find-skills` | present |
| `skill-creator` | `/skill:skill-creator` | present |
| `web-design-guidelines` | `/skill:web-design-guidelines` | present |
| `performance` | `/skill:performance` | present |
| `github-actions-docs` | `/skill:github-actions-docs` | present |

Freebuff registers each loaded name with `getSlashCommandsWithSkills()` as
`skill:${name}` and inserts `/skill:${name}`. The loader returned no warnings;
project/account name intersection was empty, so there was no shadowing. The
project count was 4, the account count was 6 at that point, the home-inclusive
count stayed 4, and `.claude/skills` was absent. The temporary SDK install was
removed and no dependency was added to the repository. This section proves the
local SDK loader only; it does not prove web registration. See §20 for the web
client's separate registry.

Verified by execution:

- all four project skills load from `.agents/skills/`
- names, paths and `/skill:<name>` handles match
- the home-inclusive load does not change the project result
- no duplicate, shadowing or loader warnings
- six account skills were present separately

Only the UI can verify:

- whether a particular Desktop session renders the `/skill:` menu after reload
- whether that session accepts the command in its input field

A loader process cannot prove those pixels or the state of a chat that has not
been reloaded. `npx skills find` is catalog search and does not load local
skills; it was used only for the requested ecosystem search.

---

## 20. Web client skill registry (2026-11-12)

The web Cloud client is not a local skill loader. Its composer combines skills
as `localExecution ? folderSkillsChatId : null`; a Cloud run passes `null`, so
a committed `.agents/skills/` directory is not read. The web settings expose two
separate registries instead:

- **Settings → Skills** manages Account skills. The page states: "Synced across
  web and Desktop. Available in every project."
- **Settings → Project settings** manages Cloud project settings, including
  project-scoped skills for the selected Cloud project.

The browser tooltip that mentions "this folder's .agents/skills" applies to
local execution; it is not evidence that a Cloud chat loaded the repository
directory.

To make the four project workflows available in the web client, they were also
saved to the Account registry through the account skill manager. The registry
now contains ten skills; the four new entries are enabled:

| Account skill | Web picker | Local handle | State |
| :--- | :--- | :--- | :--- |
| `ci-workflow-audit` | `/ci-workflow-audit` | `/skill:ci-workflow-audit` | enabled |
| `documentation-maintenance` | `/documentation-maintenance` | `/skill:documentation-maintenance` | enabled |
| `error-fix-document` | `/error-fix-document` | `/skill:error-fix-document` | enabled |
| `skill-discovery-audit` | `/skill-discovery-audit` | `/skill:skill-discovery-audit` | enabled |

The pre-existing six account skills remain present: `brainstorming`,
`find-skills`, `skill-creator`, `web-design-guidelines`, `performance`, and
`github-actions-docs`. Their enabled state is managed separately.

Scope and shadowing:

- the four names now exist in both `.agents/skills/` and the Account registry;
  a local run prefers the project copy, while a web run reads the account copy
- both copies are the same content, so there is no conflicting shadowing
- the account copies are available in every project; use **Settings → Project
  settings** instead when a workflow must stay scoped to one project

The web bundle builds skill insertion as `/${e.name}` and renders the row as
`/` plus the raw registry name, so the web label is `/<name>`. The local CLI and
Desktop still use `/skill:<name>`; both reference the same registry name. Do
not type the local `/skill:` form into the web composer and expect the picker
to match it.

The web query is **not** a prefix search. The composer filters with
`name.includes(query)`, so `/skill` is just the search text "skill" and shows
only names containing that text. `/skills` in the same menu is the
**Settings → Skills** command, not a skill, and `/skill` therefore hides
`/brainstorming` and the workflows that do not contain "skill". This is the
behavior the earlier screenshots exposed; the account entries were not
missing. §22 records the exact bundle lines, the per-command query proof, and
the two registry reads.

The account registry save is necessary for availability. It does not override
the picker's substring filter. A repository-only commit cannot make a project
skill appear in a web Cloud chat, and aliases must not be added just to make
one search string show every name.

The documentation and skill change altered the root bundle. The local build
produced 956,117 bytes with SHA-256
`2841dd3980ca418cdaf5c4e0f0ec85a9ea7194878029041f9332ef92005855ab`; the Sonnet
bundle stayed at 1,001,088 bytes with SHA-256
`7ea4957dfe82f83ac489e159b5683d0a2f056424329399482cd1ffa5d1a9635f`. The branch
and main runs for this change are recorded in §21.

---

## 21. Web registry delivery (2026-11-12)

| Item | Value |
| :--- | :--- |
| Branch | `fix/web-skill-registry` |
| Functional/docs commit | `286cb5193753ff04e26299edd61a7083e671f354` |
| Branch CI | Run `43244789323`, success |
| Local gate | 5/5 physics, 14/14 browser guards, 10/10 Python checks, both typechecks, both builds, YAML parse, `npm audit --omit=dev` 0 |
| Root bundle | 956,117 bytes, `2841dd39…` |
| Sonnet bundle | 1,001,088 bytes, `7ea4957d…` |
| Account registry | 10 skills; four new entries enabled |

The code change is documentation and the discovery skill only; the runtime
state is the Account registry save. The final evidence-only commit adds this
section and is gated by its own branch run before the fast-forward merge. Main
CI and Pages are verified after that merge; their run IDs are reported in the
delivery message rather than rewritten into this file in a third cycle. §22
adds the picker-source audit and supersedes any earlier implication that
`/skill` lists every account skill.

---

## 22. Web slash-picker source audit (2026-11-12)

This section answers the recurring report that `/brainstorming`, `/find-skills`,
`/skill-creator` and the four project workflows are "not recognized" in the web
client. The report came from typing `/skill` and expecting it to be a
namespace. It is not. The picker receives the Account registry, then applies a
plain substring match.

### 22.1 Exact client sources

The three chunks below were fetched from the public web client on
2026-11-12 at about 15:37 UTC. They are minified, so the line number is the
served line, not a source-map line. Character offsets and SHA-256 hashes make
the quoted code reproducible.

| Served file | Line | SHA-256 / size | Finding |
| :--- | :--- | :--- | :--- |
| `https://freebuff.com/_next/static/chunks/1fonzmqk2_vl0.js` | 1 | `22638107416b5c48094a1890ab520962eacd9987d0cfd74cbff9cd9b14f7249b`, 42,714 bytes | `function x(e){return["workspace",e,"account-skills"]}`. `b()` queries `(0,l.c)("cloud/skills")` with `staleTime:6e4`; `C()` selects `e.settings.skills.filter(e=>!1!==e.enabled).map(e=>({name:e.name,description:e.description}))`. This is the Account registry source. |
| `https://freebuff.com/_next/static/chunks/2e_eymjorgxa-.js` | 4 | `36d545f573e215385b8b251211f826ca0a4a0082617fc7da81bcf5ae02c12f05`, 345,601 bytes | `rY=(0,s6.C)(z?.id,!e)` at character 88,662. `e` is the component's `agenticAdsLab` flag (`function oG({agenticAdsLab:e=!1,...})`); normal web workspace passes `false`, so the account query is enabled with the signed-in user id. |
| `https://freebuff.com/_next/static/chunks/2e_eymjorgxa-.js` | 10 | same file | The composer receives `skills:(0,am.$)(ak)?void 0:rY`. `am.$` only matches native-agent model strings (`agent:claude-code:<model>` / `agent:codex:<model>`); a normal web model passes the account list as `rY`. The Cloud `folderSkillsChatId` argument is separate and only affects merging folder skills, not this base list. |
| `https://freebuff.com/_next/static/chunks/1h9wqfa9xnvfo.js` | 3 | `9fc28857c4db739f25f10a6ac61b9c81ecd4a31545f8c18ffd5592b4b690d320`, 306,405 bytes | `function ec(e,t){return e.filter(e=>e.name.includes(t)&&...).sort(...)}` at character 98,691. The filter is a **substring** match (`includes`), not `startsWith`. It also excludes command names in `er` (`plan`, `mission`, `goal`, `compact`, `skills`) and `et` (`pause`, `close`); none of the seven skill names collide. |
| `https://freebuff.com/_next/static/chunks/1h9wqfa9xnvfo.js` | 3 | same file | `tb=tg?[...(tv?tc:[]).filter(...).map(...),...(U?[]:ec(q,tg.text)).map(...kind:"skill")]:[]` at character 104,159. `q` is the account list passed down from `rY`; `tg.text` is the text after `/`; every skill row is built from this call. |
| `https://freebuff.com/_next/static/chunks/1h9wqfa9xnvfo.js` | 3 | same file | `function t$(e,t=!1)` at character 112,009 builds the inserted string from the text before the slash, then `/`, then `e.name`, then a space. Selecting a skill inserts `/<name> ` as text. The picker label and the inserted command are the registry name. |

There is no repository path in this chain. `localExecution ?
folderSkillsChatId : null` controls only the folder-skills query in module
150739; the Account list is the separate `rY` base passed to the composer. A
Cloud run passing `null` therefore does not explain a missing Account skill.

### 22.2 Query-to-command proof

The seven names below are the exact `name` values returned by the Account
registry. Because `ec` uses `includes`, typing the exact name always leaves
that name in the result set. None is in the excluded command lists.

| Exact typed command | Row produced by `ec` | Source of the name |
| :--- | :--- | :--- |
| `/brainstorming` | `/brainstorming` | Account skill, `enabled:true` |
| `/find-skills` | `/find-skills` | Account skill, `enabled:true` |
| `/skill-creator` | `/skill-creator` | Account skill, `enabled:true` |
| `/ci-workflow-audit` | `/ci-workflow-audit` | Account skill, `enabled:true` |
| `/documentation-maintenance` | `/documentation-maintenance` | Account skill, `enabled:true` |
| `/error-fix-document` | `/error-fix-document` | Account skill, `enabled:true` |
| `/skill-discovery-audit` | `/skill-discovery-audit` | Account skill, `enabled:true` |

A bare `/` has an empty `tg.text`; `includes("")` is true for every name, so
the same code lists all seven (subject to the menu's normal enabled checks).
The queries the user actually typed explain the earlier confusion:

| Typed query | Skill rows | Why |
| :--- | :--- | :--- |
| `/skill` | `/find-skills`, `/skill-creator`, `/skill-discovery-audit` | Only these names contain "skill"; `/skills` is also shown as the **Settings → Skills** command. |
| `/brain` | `/brainstorming` | `brainstorming` contains `brain`; it does not contain `skill`. |
| `/ci` | `/ci-workflow-audit` | Unique substring. |
| `/documentation` | `/documentation-maintenance` | Unique substring (`/doc` also matches `error-fix-document`). |
| `/error` | `/error-fix-document` | Unique substring. |
| `/skill-discovery` | `/skill-discovery-audit` | Unique substring. |

This is why `/skill` looked like a broken namespace. `/skills` is not a skill
category; it is the command that opens **Settings → Skills**. No aliases were
created: duplicating a skill to make one query show it would create shadowing
and would still not change the exact-name commands.

### 22.3 Stable registry reads

`cloud_manage_skills` was called twice with a time gap. Both reads returned the
same ten entries; the seven commands above were `enabled:true` in both. The
second read was after 2026-11-12T15:37:53Z. No `performance` flapping appeared in
these two reads; the documentation no longer asserts a transient enabled state
for that separate skill. The stable seven-command subset is:

```text
brainstorming             enabled
find-skills               enabled
skill-creator             enabled
ci-workflow-audit         enabled
documentation-maintenance enabled
error-fix-document        enabled
skill-discovery-audit     enabled
```

### 22.4 What is still UI-only

The code proves the data source, the filter, and the insertion behavior. It
does not prove the pixels in the user's current tab. The account query has a
60-second stale time, so a tab that was open before the registry write can show
the old list until it refetches. The remaining checklist is user-visible:

1. Reload the web page or start a new chat.
2. Type `/` alone and confirm the seven names appear; if the list is long, type
   the exact name from §22.2 instead of `/skill`.
3. If one is absent, open **Settings → Skills** (the `/skills` command) and
   confirm the entry is still enabled; no repository or CI check can read the
   user's browser session.

### 22.5 Local gate for this evidence

| Check | Result |
| :--- | :--- |
| `npm test` | 5/5 simulation physics, 14/14 browser guards, 10/10 Python checks |
| Root TypeScript | `npx tsc --noEmit` exit 0 |
| Sonnet TypeScript | `npx tsc --project detailed-3d-sinking-freighter-game_sonnet/tsconfig.json --noEmit` exit 0 |
| Root build | 956,096 bytes, SHA-256 `092f298f472edcdc786f064420efc32d9e49b337fef792b6229864e8bc53f189` |
| Sonnet build | 1,001,088 bytes, SHA-256 `7ea4957dfe82f83ac489e159b5683d0a2f056424329399482cd1ffa5d1a9635f` |
| Workflow YAML | Both files parse with `yaml.safe_load`, exit 0 |
| `npm audit --omit=dev` | 0 vulnerabilities |
| `git diff --check` | exit 0 |

The root bundle moved from 956,117 to 956,096 bytes because Tailwind scans the
repository's Markdown and the corrected prose changes its generated CSS. The
Sonnet bundle stayed byte-identical. The exact-SHA branch run is recorded
below after it completes; main CI/Pages are reported with the delivery because
an evidence-only commit changes their SHA again.
