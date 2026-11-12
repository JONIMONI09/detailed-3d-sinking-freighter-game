# Active Error & Correction Log (LEARNING.md)

## Completed Triages & Resolutions (v2.0)

### [RESOLVED] HUD Overflow in Phone Landscape
- **Issue:** In phone landscape the schematic panel overlapped the virtual thumbstick, the interaction popup was covered by the event ticker and weapon dock, and the weapon dock showed a native scrollbar.
- **Root Cause:** Fixed pixel HUD sizes tuned for desktop, an expanded-by-default telemetry panel, and no height-based breakpoint — while landscape phones only expose ~300–430 px CSS height.
- **Fix:** Height variant `short` (`max-height: 560px`), panel collapsed by default with `max-h-[46vh]` and internal scrolling, icon-only top bar, compact interaction popup, 88 px thumbstick, scaled action cluster and a hidden dock scrollbar. Verified at 844x390 and 740x360 with zero overlaps; the settings modal fits at 768x351 in a 390 px viewport. See `RESPONSIVE_UI.md`.

### [RESOLVED] Touch Look Zone Blocked HUD Buttons
- **Issue:** On touch viewports the camera, flashlight, bulkhead and sound buttons in the wrapped top bar did not react; at 390 px width the interaction popup also covered the telemetry panel's action buttons.
- **Root Cause:** The look zone was a child of the `z-20` touch overlay and therefore painted above the entire `z-10` HUD; the telemetry panel only collapsed on short heights, not on narrow widths; the event ticker used a 576 px max width.
- **Fix:** Extracted the look zone to a sibling at `z-[5]` so the HUD stays above it, while joystick/action buttons remain at `z-20`; the panel auto-collapses below 640 px width; the ticker is capped at `92vw`; `.hud-safe` respects `env(safe-area-inset-*)` and `index.html` uses `viewport-fit=cover`.
- **Verified:** 844×390 and 390×844 each show 21 HUD buttons with 0 clipped and 0 covered; Settings 768×351 / 374×810; analyzer 374×810; both modals report 0 clipped buttons.
- **Lesson:** A `pointer-events` overlay can make a layout look correct while silently eating taps. Audit with `elementFromPoint`, not only bounding boxes — and reload the frame before measuring, because a modal left open by a timed-out probe reports the whole HUD as covered.

### [RESOLVED] German UI Text in an English Codebase
- **Issue:** Every player-facing label, tooltip, event message and modal narrative was German, while the repository standard is English.
- **Root Cause:** Strings were authored directly in JSX/literals without a locale layer.
- **Fix:** 331 exact literal replacements across `index.html`, `src/App.tsx`, `src/types/game.ts`, `src/game/CargoShipBuilder.ts`, `MaritimeViewport3D`, `NavalHudOverlay`, `SettingsModal`, `PhotoTxtAnalyzerModal`, `TouchControlsOverlay` and `CrashBoundary`. Status tokens, weapon names, deck/door names and both blackbox presets are English now; ship geometry, physics and gameplay were not touched.
- **Verified:** `npx vite build` plus a bundle scan for German markers (`UNTER WASSER`, `TÜREN`, `SCHOTTEN`, `KIEL SPRENGEN`, …) returns no hits; both typechecks and all tests stay green.

### [RESOLVED] Sonnet Edition Still German After the Root Pass
- **Issue:** The independent second edition under `detailed-3d-sinking-freighter-game_sonnet/` (served at `/sonnet/`) still showed German menus, HUD, settings, objectives, messages and ship-part names after the root UI had been translated.
- **Root Cause:** The first translation pass covered only the root tree. The Sonnet edition had its own literals, including template literals and fallback labels (locked-door messages, pickup names, engine-room marker, settings *Done*) that a JSX-only sweep misses.
- **Fix:** 282 literal replacements (259 scripted + 23 manual follow-ups) across screens, HUD, settings, touch controls, crash screen, weapons, ship builder, game messages and `index.html`; the follow-ups covered all 13 pickup labels and a message bug where the card colour was read after `unlock()`. Ship geometry, collision, physics and balancing untouched.
- **Verified:** both Sonnet build paths produce the same 1,000.20 kB artifact and hash; scans of both bundles find 0 German markers and 0 umlauts; both typechecks, `npm test` and both Vite builds exit 0. Preview at 1280×800 and 390×844 shows 5/5 menu buttons and 6/6 help buttons with 0 clipped/covered, settings scroll with *Done* visible. The root UI re-measured 23/23 and 21/21 buttons with 0 clipped/covered.
- **Lesson:** Scan the built bundle, not only JSX; template literals and fallback labels are easy to miss. Also expect the root single-file hash to move when a project-wide Tailwind scan sees a sibling edition's source — verify the root UI instead of assuming a hash change means root code changed.

### [RESOLVED] Android Fullscreen / Touch Crash at 785×303
- **Issue:** The deployed root game crashed with `InvalidStateError: Failed to execute 'setPointerCapture'` in the touch look zone at `785x303`; the fullscreen control appeared not to work.
- **Root Cause:** The root look/joystick handlers called `setPointerCapture` unguarded, and Android Chrome can cancel a pointer before React's `pointerdown` runs. The root edition had no fullscreen control; the Sonnet function used only a synchronous `try/catch`, which cannot catch the promise rejection from `requestFullscreen()`.
- **Fix:** Added `safeSetPointerCapture()` and awaited `toggleFullscreen()` helpers to both editions; guarded all capture calls; added a root HUD fullscreen button and a visible status message for blocked requests. Added `tests/browser-guards.test.mjs` (14 tests), wired it into `npm test`, and made `ci.yml` run `npm test` instead of only the Python suite.
- **Verified:** Both editions enter real fullscreen on an active-tab Playwright click (`document.fullscreenElement === HTML`); a background tab returns `TypeError: not granted` and shows the status instead of crashing. At `785x303` root shows 18/18 buttons, 0 clipped/covered, pointer zone present, invalid pointer id no longer throws. At `1280x800` root 22/22; at `390x844` root 18/18 and Sonnet menu 5/5.
- **Lesson:** Treat browser APIs as fallible async operations: await and catch the promise, guard pointer capture, test with active-tab user gestures, and commit the regression tests into the same CI command.

### [RESOLVED] Feature-Branch Push Did Not Start CI
- **Issue:** Pushing `fix/fullscreen-pointer-capture` produced no workflow run (`total_count: 0`), so the branch could not be gated before merge.
- **Root Cause:** `ci.yml` filtered `push` to `main`/`master`; the `pull_request` trigger only runs once a pull request exists. A branch push therefore matched neither trigger.
- **Fix:** The push trigger now includes the `"**"` branch pattern, and `tools/ci_check.py` asserts feature-branch coverage while keeping Pages deployment restricted to `main`. Branch run `43119185236` passed on `7e54232` before the fast-forward merge.
- **Lesson:** After pushing a branch, query the Actions API and confirm a run exists for that exact SHA. A green local suite and an existing remote branch are not a CI gate.

### [RESOLVED] Recurring Fix and Documentation Workflow Was Only in Conversation
- **Issue:** Error handling, fallback design, test updates and documentation rules were repeated in prompts but were not discoverable inside the project.
- **Root Cause:** The process lived only in conversation memory; the repository had no project skills and no validation that skill files stayed intact.
- **Fix:** Added three English project skills under `.agents/skills/` (`error-fix-document`, `ci-workflow-audit`, `documentation-maintenance`) with valid YAML frontmatter. Added a Python integrity check for presence, names, frontmatter fields, body length, absence of German umlauts and unfinished markers.
- **Verified:** `tools/ci_check.py` passes 10/10, skill frontmatter parses as YAML, and branch run `43212298392` passed on `cc32e2e` before the fast-forward merge.
- **Lesson:** Encode recurring quality rules as tested, discoverable skills instead of relying on the next conversation remembering them.

### [RESOLVED] Project Skills Were Invisible to Freebuff
- **Issue:** The three project skills were in Git, but Freebuff did not list them, and `/brainstorming`, `/find-skills` and `/skill-creator` appeared not to work.
- **Root Cause:** The skills lived only in `.claude/skills/`, which `npx skills list` reports under **Claude Code**; Freebuff's native project path is `.agents/skills/`. Freebuff also registers every skill as `/skill:<name>`, so the bare slash names were not commands.
- **Fix:** Moved the three skills to `.agents/skills/`, updated `tools/ci_check.py`, `AGENTS.md`, `README.md` and `CI_DEPLOYMENT.md`, and documented `/skill:<name>` invocation.
- **Verified:** `npx skills list` lists all three from `.agents/skills/`; `python tools/ci_check.py` passes 10/10; `npm test` passes 5/5 physics, 14/14 browser guards and 10/10 Python; branch run `43216150102`, main CI `43216286360` and Pages `43216286679` all **success** on `34f28d1`; live `/` and `/sonnet/` return HTTP 200. See `CI_DEPLOYMENT.md` §17.
- **Lesson:** A skill is discoverable only when it sits in a path the target runtime actually scans; Claude-only paths and bare slash names are not enough. Invocation syntax is part of discovery too.

### [RESOLVED] GitHub Pages Deploy Never Created a Site
- **Issue:** The Pages workflow never published a site; the project URL stayed blank or 404.
- **Root Cause:** `actions/configure-pages` ran without `enablement`, so the job aborted whenever no Pages site existed; no `github-pages` environment was declared; and a branch-based Pages source would serve the raw `index.html`, which references `/src/main.tsx` and has no compiled CSS.
- **Fix:** Added `enablement: true`, the `github-pages` environment with `page_url`, and a "Verify Pages artifact" gate to `.github/workflows/deploy-pages.yml` (commit `410a321`). Local CI — install, both typechecks, physics tests, Python integrity suite and both Vite builds — verified green; see `CI_DEPLOYMENT.md`.
- **Remaining:** GitHub Pages for private repositories requires Pro/Team/Enterprise; otherwise the repository must be public or hosted elsewhere. Pages source must be `GitHub Actions`, not a branch.

### [RESOLVED] Engine Room Mid-Aft Stairway Collision Block
- **Issue:** Player was blocked from descending into the engine room.
- **Root Cause:** `diesel_engine_core` at `Z = 13.5m` occupied the exact footprint of Stairwell 2 (`Z = 7.2m..13.8m`).
- **Fix:** Relocated `diesel_engine_core` to `Z = 17.5m` (`length = 6.2m`, `Z` span 14.1m to 20.3m). Pistons relocated to `Z = 15.0m..19.8m`, flywheel to `Z = 20.8m`. Stairwell landing is now completely clear and unobstructed.

### [RESOLVED] 3 TNT Detonations Anywhere Breaking Ship
- **Issue:** Detonating 3 TNT charges on the upper deck or bridge caused underwater hull breaches and snapped the ship in half.
- **Root Cause:** Proximity fallback queried up to 14.25m away unconditionally for `Y < 2.8m`, damaging bottom hull nodes through solid steel decks.
- **Fix:** Upper-deck blasts (`Y >= 0.8m`) cannot breach underwater hull nodes. Only direct contact explosions on the lower hull (`Y < 0.8m` and `d < 3.8m`, or outer plating `|X| > 7.5m`) can breach hull nodes.

### [RESOLVED] Watertight Door Locking with [L] Key
- **Issue:** No mechanism existed to lock doors or stop inter-compartment water transfer.
- **Root Cause:** Interaction only toggled open/close on `[E]`.
- **Fix:** Implemented holding `[L]` (0.8s) with a circular SVG progress ring around the crosshair. Dogged doors seal 100% watertight (0.0% water transfer). Tapping `[E]` respects the lock.

### [RESOLVED] Torricelli Hydrodynamics & Floating Sandbox Sinking
- **Issue:** Flooding was linear, flat, and capped at `Y = -0.15m` in the hold.
- **Fix:** Torricelli orifice flow ($v = \sqrt{2g \Delta h}$) dynamically scales with immersion depth. Holds overflowing past 72% spill water through stairwells onto the main deck (`mainDeckWaterMesh`). Physical beam bending moment ($M = \text{load}_{\text{mid}} - (\text{load}_{\text{fore}} + \text{load}_{\text{aft}}) \cdot 0.6$) governs keel failure.

### [RESOLVED] Performance Optimization
- **Issue:** CPU lag from per-frame `computeVertexNormals()` on 96x96 ocean grid.
- **Fix:** Removed per-frame CPU vertex normal calculation. Smooth 60+ FPS on mobile and desktop.

### [RESOLVED] Quota Sentinel Sidecar Blank White Screen / Exit Code 1
- **Issue:** Opening the `[Quota Sentinel]` Aux Pane tab displayed a blank white screen or error `sidecar process failed exit status 1`.
- **Root Cause:**
  1. Python Windows execution alias / CWD mismatch when executed from IDE sidecar launcher.
  2. External Tailwind CDN script was blocked by Aux Pane Electron Webview CSP.
- **Fix:** Converted the sidecar to native Node.js (`server.mjs`) with pure embedded CSS and dedicated `index.html`. Listening on `0.0.0.0:8769`.
- **Access:** [Quota Sentinel](sidecar://quota-sentinel/sentinel-dashboard/) or direct URL `http://127.0.0.1:8769/`.
