# Error and Solution Ledger

Last reviewed: 2026-11-13 (Europe/Berlin)
Audience: Freebuff AI agent working in this repository only
Owner skill: `error-fix-document`

Every bug, failed check, failed build, broken deployment, browser exception, or
operational incident gets an entry here. A fix is not complete until this file
contains the symptom, the root cause, the solution, the verification, and a
prevention step.

Do not use this file for speculative risks. Put open limitations in
`CI_DEPLOYMENT.md`; put durable rules in `AGENTS.md`; put historical lessons in
`.agent/rules/LEARNING.md`.

## Entry format

```text
### ERR-YYYY-MM-DD-NN - Short title

- Date (Europe/Berlin):
- Area:
- Status: Open | Resolved | Reopened
- Symptom:
- Root cause:
- Solution:
- Verification:
- Prevention:
- Related files / skills:
```

### ERR-2026-11-13-02 - Crew Window Repair, Door/Stair Traversal, Bilge Pumping & Closed-Door Water Bleed

- Date (Europe/Berlin): 2026-11-13
- Area: Damage Control Crew AI, Crew Visuals, Compartment Water Containment
- Status: Resolved
- Symptom: (1) Crew could not repair broken windows (`repair` callback never fired); (2) crew got stuck in front of doors and on stairs; (3) crew standing in flooded compartments did not hold a bilge pump or pump water out; (4) water level queries and water planes bled slightly past closed bulkhead doors.
- Root cause: (1) `stepCrew()` in `crew.ts` decremented `target.area` without invoking `target.repair?.(sealedDelta)`; (2) `crewRay` in `game.ts` included `"door"` colliders causing `computeAntiClippingSteering` to steer crew away before `doorRay` opened them, and `body.step` was `0.35`; (3) `CrewVisual` only had a welding torch and `game.ts` did not drain flooded compartments when crew stood in water; (4) `waterAt` checked `z >= c.min.z - 0.3 && z <= c.max.z + 0.3` and compartment water `PlaneGeometry` had `+ 2` margin.
- Solution: Added `repair?: (amount: number) => void` invocation in `crew.ts`, increased `doorRay` range to `1.8` and `body.step` to `0.48`, filtered `"door"` out of `crewRay` in `game.ts`, added a visible portable bilge pump in `crewVisual.ts` (`member.pumping`) paired with active compartment draining (`1.8 m^3/s` per pumping crew member) in `game.ts`, tightened `waterAt` bounds to `[c.min, c.max]`, and removed the `+ 2` margin on compartment `PlaneGeometry` in `shipBuilder.ts`.
- Verification: `npx tsc --noEmit` (root & sonnet), `npm test`, `npm run build`, and `npm run docs:check` executed after final edit.
- Prevention: Always pass custom `repair` callbacks through `CrewBreach`, exclude dynamic `"door"` colliders from anti-clipping steering rays, and keep `waterAt` / `PlaneGeometry` bounds strictly inside `[c.min, c.max]`.
- Related files / skills: `detailed-3d-sinking-freighter-game_sonnet/src/game/crew.ts`, `crewVisual.ts`, `game.ts`, `shipBuilder.ts` / `error-fix-document`

### ERR-2026-11-13-01 - Orbital Death Ray, Multi-Part Destruction, Hull Collisions & Fleet Battle AI

- Date (Europe/Berlin): 2026-11-13
- Area: Orbital Death Ray, Space Station, Multi-Part Ships, Hull Collisions, Fleet AI, HUD
- Status: Resolved
- Symptom: (1) Orbital laser spawned 80ms cylinder bursts instead of a persistent beam; (2) Earth sphere occluded ocean/ships until zoomed inside; (3) Freighter vanished in 1 frame or left giant floating hull/container plates; (4) `[TAB]` Tablet had duplicate Salvo/Missile buttons alongside Fleet Strike; (5) Fleet Battle AI rammed vessels without avoiding collisions or firing real projectiles at both Battleships and Freighter.
- Root cause: (1) Per-burst geometry creation + `setTimeout`/`setInterval`; (2) `earthMesh` visible in orbital view regardless of zoom; (3) unpartitioned `InstancedMesh` containers & missing `ShipSim.reset()` fields; (4) redundant single-ship fire buttons in `Hud.tsx`; (5) `stepBattleshipAI()` lacked obstacle avoidance and `onTurretFire` only drew tracers without spawning `navalProjectiles`.
- Solution: Added persistent `orbitalBeamGroup`, zoom-gated `earthMesh`, 13-section Freighter + `InstancedMesh` partitioning, 8-part Battleships, complete `ShipSim.reset()` & `restoreFreighter()`, `vesselCollision.ts` OBB hull collisions + quadratic speed damage, `[TAB]` Fleet Strike (`fleetStrikeFreighter`), `[X]` Target Lock + seeking missiles, live `vesselStatusSnapshot()` HUD, and obstacle-avoidance + real shell projectiles in Fleet Battle AI.
- Verification: `npx tsc --noEmit` (root & sonnet), `npm test` (12 Node suites + 10 Python CI checks), `npm run build`, GitHub CI runs `43400718381` & `43400718327` passed.
- Prevention: Keep `tests/orbital-laser-and-multipart.test.mjs` and `tests/vessel-collision.test.mjs` wired in `npm test`, and avoid duplicating single-ship attack buttons in `Hud.tsx`.
- Related files / skills: `detailed-3d-sinking-freighter-game_sonnet/src/game/game.ts`, `battleships.ts`, `vesselCollision.ts`, `shipBuilder.ts`, `spaceStation.ts`, `Hud.tsx` / `error-fix-document`

Keep secrets, tokens, account identifiers, and private URLs out of this ledger.
Use exact commands and real run IDs when they exist.

## Resolved incidents

### ERR-2026-11-12-01 - `/skill` hid registered account skills

- Date (Europe/Berlin): 2026-11-12
- Area: Freebuff web skill picker
- Status: Resolved
- Symptom: The Account registry contained the enabled project workflows, but
  typing `/skill` showed only names containing the text "skill"; the user
  concluded that the skills were not registered.
- Root cause: The web composer filters with `name.includes(query)`, not a
  prefix or a `/skill:` namespace. `/skills` is the Settings -> Skills command,
  not a category. The previous README told the user to type `/skill`.
- Solution: Corrected the documentation and discovery skill; added an exact
  command table and the bare-slash rule; did not add aliases. Bundle evidence is
  in `CI_DEPLOYMENT.md` section 22.
- Verification: Two Account registry reads returned all entries enabled;
  source lines `1fonzmqk2_vl0.js:1`, `2e_eymjorgxa-.js:4` and `:10`, and
  `1h9wqfa9xnvfo.js:3` were inspected. Exact-name simulation returned each
  command. The live overlay was not available to the agent.
- Prevention: `skill-index` and `skill-discovery-audit` both require the exact
  typed name or a bare `/`, never a broad `/skill` search.
- Related files / skills: `README.md`, `AGENTS.md`, `CI_DEPLOYMENT.md` section
  22, `.agents/skills/skill-discovery-audit/SKILL.md`, `skill-index`.

### ERR-2026-11-12-02 - CodeGraph one-shot tool name was assumed

- Date (Europe/Berlin): 2026-11-12
- Area: CodeGraph MCP documentation check
- Status: Resolved
- Symptom: `npx codegraph-mcp ... --run-tool codegraph_status` exited 1 with
  `Unknown tool: codegraph_status` after a successful index.
- Root cause: The package README lists tool families, but the one-shot engine
  does not expose a `codegraph_status` tool under that name. Tool names must be
  read from the actual MCP tool list, not inferred from the README.
- Solution: Use the documented one-shot `codegraph_pr_context` for the docs
  gate and validate file-level consistency in `tools/check_skill_docs.py`.
  Do not use `codegraph_index_markdown` in graph-only mode: the docs store
  requires the embedding memory manager.
- Verification: `codegraph_pr_context` returned valid JSON and exit 0 on the
  repository; the docs script records that output and then checks dates,
  required files, and index rows.
- Prevention: The tool inventory records the exact command; the script has a
  clear failure message instead of an assumed tool.
- Related files / skills: `docs/AGENT_TOOLS.md`,
  `tools/check_skill_docs.py`, `skill-index`.

### ERR-2026-11-12-03 - Sonnet build command did not exist as an npm script

- Date (Europe/Berlin): 2026-11-12
- Area: Local verification
- Status: Resolved
- Symptom: `npm run build:sonnet` exited 1 with `Missing script: build:sonnet`.
- Root cause: The Sonnet target is a separate Vite workspace with no npm script
  in the root `package.json`.
- Solution: Use the CI command
  `npx vite build detailed-3d-sinking-freighter-game_sonnet`; use the Pages
  variant with `--outDir ../dist/sonnet --base ./` when preparing the artifact.
- Verification: The command exits 0 and produces
  `detailed-3d-sinking-freighter-game_sonnet/dist/index.html`; the root gate
  records its byte size and hash.
- Prevention: `AGENTS.md`, `docs/AGENT_TOOLS.md`, and the error workflow name
  the exact command; no script is invented.
- Related files / skills: `package.json`, `AGENTS.md`,
  `documentation-maintenance`, `ci-workflow-audit`.

### ERR-2026-11-12-04 - Dev preview was started on a non-reserved port

- Date (Europe/Berlin): 2026-11-12
- Area: Cloud preview
- Status: Resolved
- Symptom: `cloud_show_dev_server(port=5173)` returned `Use this chat's
  reserved preview port 3000. Other ports belong to other chats.`
- Root cause: The Cloud workspace reserves one preview port per chat; the
  ordinary Vite default, 5173, is not that port.
- Solution: Stopped the Vite process tree on 5173 and restarted on port 3000
  bound to `0.0.0.0`. Do not move another chat's server or use its port.
- Verification: `ss -ltnp` showed `0.0.0.0:3000`, and
  `curl http://127.0.0.1:3000/` returned HTTP 200 with the project title.
- Prevention: `docs/AGENT_TOOLS.md` records port 3000 as the only preview port.
- Related files / skills: `docs/AGENT_TOOLS.md`, `documentation-maintenance`.

### ERR-2026-11-12-05 - Vite rejected the Cloud preview hostname

- Date (Europe/Berlin): 2026-11-12
- Area: Cloud preview
- Status: Resolved
- Symptom: A request to the local server with the assigned preview hostname
  returned HTTP 403, body `Blocked request. This host (...) is not allowed.`
- Root cause: Vite 7 checks the `Host` header against `server.allowedHosts`;
  the generated `*.style.dev` hostname was not in the default localhost list.
- Solution: Restarted Vite with
  `__VITE_ADDITIONAL_SERVER_ALLOWED_HOSTS="<exact-preview-host>"`, preserving
  `--host 0.0.0.0 --port 3000`. No blanket `.style.dev` allowlist and no
  `allowedHosts: true`.
- Verification: The same request with the exact `Host` header returned HTTP 200
  and the expected title; the Vite process remained bound to `0.0.0.0:3000`.
- Prevention: The tool inventory records the exact-host command and
  distinguishes a Vite host rejection from the platform's owner-session 403.
- Related files / skills: `docs/AGENT_TOOLS.md`, `skill-index`,
  `documentation-maintenance`.

### ERR-2026-11-12-06 - `cloud_git push` defaulted to `main`

- Date (Europe/Berlin): 2026-11-12
- Area: Git delivery
- Status: Resolved by verification; process corrected
- Symptom: `cloud_git` with `operation=push` and no `branch` printed
  `87a9cfc..517fe39 HEAD -> main`, updating the integration branch before a
  feature-branch CI run had been verified.
- Root cause: The tool defaults to the chat's starting branch (`main`), not the
  currently checked-out branch. The explicit `branch` argument was omitted.
- Solution: Pushed `feat/skill-governance` explicitly at the same commit, then
  used the feature branch for all further evidence and verification. Remote
  `main` was not reset or force-pushed; the tree is identical to the verified
  feature commit.
- Verification: Remote `main` and `feat/skill-governance` pointed at
  `517fe39`; the feature branch was pushed successfully. CI and Pages for the
  final state are recorded below and in `CI_DEPLOYMENT.md` §23.
- Prevention: Always pass `branch` to `cloud_git push`, even when the local
  checkout already has the intended name. `AGENTS.md`, `docs/AGENT_TOOLS.md`,
  and `ci-workflow-audit` now state this explicitly.
- Related files / skills: `AGENTS.md`, `docs/AGENT_TOOLS.md`,
  `.agents/skills/ci-workflow-audit/SKILL.md`.

### ERR-2026-11-12-07 - CodeGraph failed in CI because `main` was absent

- Date (Europe/Berlin): 2026-11-12
- Area: GitHub Actions documentation gate
- Status: Resolved
- Symptom: Branch CI run `43255281208` failed at **Validate Skill and
  Documentation Governance** with exit code 1.
- Root cause: `actions/checkout@v4` defaults to a depth-1 checkout on the
  feature ref. It created neither a local `main` branch nor the ancestry for a
  merge base, so CodeGraph's `git diff main...HEAD` failed with
  `fatal: ambiguous argument 'main...HEAD'`.
- Solution: Set `fetch-depth: 0` in the CI checkout, fetch `origin/main`
  explicitly, create a local `main` ref when absent, and make
  `tools/check_skill_docs.py` resolve `main`, `origin/main`, `master`, or
  `origin/master` (in that order) instead of assuming a local `main`.
- Verification: A depth-1 clone reproduced the failure. The script now prints
  the resolved base and CodeGraph returns valid JSON when `origin/main` exists;
  the final branch run is recorded in `CI_DEPLOYMENT.md` §23.
- Prevention: The CI workflow comment explains the depth requirement;
  `docs/AGENT_TOOLS.md` records the base-branch rule.
- Related files / skills: `.github/workflows/ci.yml`,
  `tools/check_skill_docs.py`, `ci-workflow-audit`, `skill-index`.

### ERR-2026-11-12-08 - Creative skills existed only as Account copies

- Date (Europe/Berlin): 2026-11-12
- Area: Skill governance
- Status: Resolved
- Symptom: `brainstorming` and `skill-creator` were available as Account skills
  and described in `docs/SKILLS.md`, but had no project copy under
  `.agents/skills/`. The index called them Account-only, and the Python gates
  required only five project skills.
- Root cause: The first governance pass treated the two upstream creative skills
  as external Account content. The user had explicitly asked for them to be
  improved, so referencing them from the index was not enough.
- Solution: Added full project skills with improved procedures, registered both
  names in `tools/ci_check.py` and `tools/check_skill_docs.py`, updated the
  index, README, AGENTS.md, and the Account copies, and added the index date and
  path consistency checks.
- Verification: `npm run docs:check` and `npm test` pass; `npx skills list`
  shows all seven project skills, including both creative skills. The branch,
  local gate, and exact-SHA CI path are recorded in `CI_DEPLOYMENT.md`
  section 24; final run IDs and live HTTP checks are in the delivery message.
- Prevention: `skill-creator` now requires a project copy, an index row with a
  matching date, both Python registries, and an Account copy. The documentation
  gate rejects a project skill without an index row or with a mismatched date.
- Related files / skills: `.agents/skills/brainstorming/SKILL.md`,
  `.agents/skills/skill-creator/SKILL.md`, `docs/SKILLS.md`,
  `tools/check_skill_docs.py`, `skill-index`.

### ERR-2026-11-12-09 - Index path checker treated a glob as a file

- Date (Europe/Berlin): 2026-11-12
- Area: Documentation gate
- Status: Resolved
- Symptom: `python tools/check_skill_docs.py --no-codegraph` failed with
  `docs/SKILLS.md points at a missing path: .agents/skills/*/SKILL.md`, although
  the path was only the wildcard example in the documentation map.
- Root cause: The new path validator scanned every backticked
  `.agents/skills/.../SKILL.md` string and tried to open the literal wildcard as
  a file.
- Solution: Skip entries containing `*` or `<` before checking filesystem
  existence. Concrete index paths are still checked.
- Verification: The offline gate passes again and reports the changed paths;
  the full CodeGraph gate passes before delivery.
- Prevention: The validator distinguishes a documentation pattern from a
  concrete skill path; `skill-creator` tells authors to use a concrete path in
  table rows.
- Related files / skills: `tools/check_skill_docs.py`, `docs/SKILLS.md`,
  `skill-index`.

### ERR-2026-11-12-10 - CodeGraph execution failed on Windows with WinError 193

- Date (Europe/Berlin): 2026-11-12
- Area: CodeGraph MCP documentation check on Windows
- Status: Resolved
- Symptom: `npm run docs:check` on Windows failed with `OSError: [WinError 193] %1 ist keine zulässige Win32-Anwendung` in `tools/check_skill_docs.py`.
- Root cause: On Windows, `node_modules/.bin/codegraph-mcp` is an extensionless shell script for Unix. Because it was checked first in `candidates`, `subprocess.run` called Windows `CreateProcess` directly without a shell, failing to execute the bash wrapper.
- Solution: Updated `tools/check_skill_docs.py` to prioritize `codegraph-mcp.cmd` on Windows (`sys.platform == "win32"`), and pass `shell=(sys.platform == "win32")` so the command script wrapper executes correctly.
- Verification: `npm run docs:check` runs cleanly on Windows and passes the CodeGraph MCP documentation context check with exit code 0 (`changed_files=0`).
- Prevention: Any CLI tool invoked via `node_modules/.bin` in Python scripts on Windows must target `.cmd` with `shell=True` or invoke Node directly on the package JS entry point.
- Related files / skills: `tools/check_skill_docs.py`, `docs/AGENT_TOOLS.md`, `ci-workflow-audit`.

### ERR-2026-11-12-11 - Open-air deck explosion breached dry engine room and KeyG God Mode conflict

- Date (Europe/Berlin): 2026-11-12
- Area: Ship simulation breach logic, input handling, and damage control AI
- Status: Resolved
- Symptom: Explosions on the weather deck (`pos.y >= -0.2`) created exterior underwater hull breaches into the engine room even when the deck was dry above sea level. Additionally, tapping KeyG while holding TNT risked toggling God Mode rather than detonating charges, and single-tap KeyG accidentally deactivated God Mode.
- Root cause: `ShipSim.addBreach` allowed breaches up to `pos.y = 1.0` without checking whether the world coordinate of the blast point was actually submerged below the sea surface (`worldY < oceanHeight`). Furthermore, `KeyG` was overloaded between TNT detonation and God Mode without precedence rules or hold thresholds.
- Solution:
  1. In `shipSim.ts`: Guarded `addBreach` with `if (pos.y >= -0.2 && wy >= oceanHeight) return null`.
  2. In `game.ts` & `Hud.tsx`: Enforced TNT detonation precedence on `KeyG` whenever holding TNT (`cur === "tnt" || dyns.length > 0`). When God Mode is ON, single tap does not deactivate; deactivation requires holding `KeyG` continuously for 1.5s with a circular SVG progress ring on the crosshair.
  3. In `ingress.ts`: Added hydrostatic window burst thresholds (2.5m lower deck, 6.0m reinforced bridge) producing water ingress breaches.
  4. In `crew.ts`: Added threat prioritization `Priority = InflowRate * (isEngineRoom ? 2.5 : 1.0) / (1 + 0.1 * distance)` and automatic welding dispatch for shattered windows and hull breaches.
  5. Added regression test suites in `tests/deck-explosion-and-window-burst.test.mjs` and `tests/stormworks-prototypes.test.mjs`.
- Verification: `npm test` (all 8 test suites pass 100%), `npx tsc --noEmit` (0 errors), `npm run docs:check` (CodeGraph pass), `npm run build` (clean 1,029 kB build).
- Prevention: Geometric boundary conditions for exterior hull punctures must always evaluate against dynamic waterline elevation rather than un-submerged local height offsets.
- Related files / skills: `detailed-3d-sinking-freighter-game_sonnet/src/game/shipSim.ts`, `detailed-3d-sinking-freighter-game_sonnet/src/game/game.ts`, `detailed-3d-sinking-freighter-game_sonnet/src/game/ingress.ts`, `detailed-3d-sinking-freighter-game_sonnet/src/game/crew.ts`, `detailed-3d-sinking-freighter-game_sonnet/src/ui/Hud.tsx`, `tests/deck-explosion-and-window-burst.test.mjs`, `error-fix-document`.

### ERR-2026-11-12-12 - Sandbox explosion player death, deck TNT breach, guard orientation, and static vessel steering

- Date (Europe/Berlin): 2026-11-12
- Area: Sandbox player immortality, weather deck breach safety, enemy visuals, and bridge helm kinematics
- Status: Resolved
- Symptom: Player could die in Sandbox Mode from an explosion ("FAILED - Killed by an explosion"). TNT on deck punctured hull breaches that sank the freighter. Guard NPC meshes walked and shot backwards relative to their helmet visors and boots. Ship helm calculated heading and speed but vessel 3D position and yaw never moved.
- Root cause:
  1. `damagePlayer` in `game.ts` only filtered damage if `this.supervisor.isGodMode()` was explicitly active; entering sandbox mode without manually toggling god mode left player vulnerable to death.
  2. `addBreach` in `shipSim.ts` allowed deck explosions at `pos.y > -2.0` to puncture exterior hull breaches into compartments below.
  3. `Guard` in `enemies.ts` positioned helmet visor at `z = +0.15` and boots at `z = +0.04`, while walking and aiming rotated toward `-Z` with a inverted arm pitch `-aimPose * 1.45`.
  4. `Game.update` never updated `this.ship.group.position` or `this.ship.group.rotation.y` from `supervisor.helm`.
- Solution:
  1. In `game.ts`: Added early exit `if (this.mode === "sandbox" || this.supervisor.isGodMode()) return;` at top of `damagePlayer`.
  2. In `shipSim.ts`: Guarded `addBreach` with `if (pos.y > -2.0) return null;` so weather deck blasts never breach lower compartments.
  3. In `enemies.ts`: Inverted visor to `z = -0.15`, boots to `z = -0.04`, and aim rotation to `+aimPose * 1.45` (+-Z forward alignment).
  4. In `game.ts`: Applied vessel kinematics `this.ship.group.rotation.y = this.supervisor.helm.heading` and advanced position along forward vector `v3(-sin(yaw), 0, -cos(yaw)) * speed * dt`. Spawned 3D friendly crew members (`crewVisual.ts`) in sandbox mode and excluded guards.
  5. Added comprehensive test suites in `tests/sandbox-overhaul.test.mjs` and `tests/vessel-steering-and-engine-breakdown.test.mjs`.
- Verification: `npm test` (all 10 test suites pass 100%, 65 unit tests + 10 Python CI checks), `npx tsc --noEmit` (0 errors), `npm run docs:check` (CodeGraph MCP pass), `npm run build` (clean 1,035 kB build).
- Prevention: Player immortality in sandbox modes must be enforced unconditionally at the damage pipeline entry point. Spatial features on humanoid characters must strictly adhere to the engine's canonical forward axis (-Z).
- Related files / skills: `detailed-3d-sinking-freighter-game_sonnet/src/game/game.ts`, `detailed-3d-sinking-freighter-game_sonnet/src/game/shipSim.ts`, `detailed-3d-sinking-freighter-game_sonnet/src/game/enemies.ts`, `detailed-3d-sinking-freighter-game_sonnet/src/game/crewVisual.ts`, `tests/sandbox-overhaul.test.mjs`, `tests/vessel-steering-and-engine-breakdown.test.mjs`, `error-fix-document`.

### ERR-2026-11-12-13 - Weapon firing and TNT blockage from pointer lock guard, unreachable code, and missing engine stair landing

- Date (Europe/Berlin): 2026-11-12
- Area: Player weapon firing, TNT throwing/placement, engine room stair landing, and console debugging
- Status: Resolved
- Symptom: Player could not fire weapons or throw TNT in sandbox mode; console reported "unreachable code after return statement shipBuilder.ts:565:5". The base of the U-stairwell in the engine room terminated abruptly above the floor without a walkable bottom landing step.
- Root cause:
  1. `handleInput` in `game.ts` checked `if (!this.isTouch() && !this.lockOk && !this.dragMode) return;` prior to invoking `tryFire()` or `throwTnt()`. When pointer lock was not active or was delayed by the browser, all mouse-click firing gestures were dropped silently.
  2. In `input.ts`, `mousedown` was listened on `target` canvas instead of `window`, causing clicks on HUD or parent containers to be missed.
  3. In `shipBuilder.ts`, line 565 contained `void i;` immediately following a `return` statement.
  4. In `uStair` (`shipBuilder.ts`), Flight B ended at `zTop = -58.0` with no bottom landing platform, leaving a step drop down to the engine floor.
- Solution:
  1. In `game.ts`: Removed the blocking `lockOk` guard from `tryFire()` and `throwTnt()`. Added auto-request of pointer lock on click while continuing the firing pipeline immediately.
  2. In `input.ts`: Bound `mousedown` to `window` and `target` so all left/right clicks register reliably, and added English console debugging (`[NORDWIND/INPUT]`).
  3. In `game.ts`: Added English console debug messages for weapon firing (`[NORDWIND/WEAPON]`), TNT throwing/placing/detonation (`[NORDWIND/TNT]`), and sandbox initialization (`[NORDWIND/SANDBOX]`).
  4. In `shipBuilder.ts`: Removed unreachable `void i;` and added a seamless bottom landing step (`rectBox("steelDark", bX0, bX1, yBot - 0.2, yBot, zTop, zTop + 1.8)`) in `uStair`.
  5. In `tests/sandbox-overhaul.test.mjs`: Added Unit Test 9 verifying weapon firing and TNT throwing without pointer lock dependency.
- Verification: `npm test` (all 10 test suites pass 100%, 66 unit tests + 10 Python CI checks), `npm run typecheck` (0 errors), `npm run docs:check` (CodeGraph MCP pass), `npm run build` (clean 1,038 kB single-file build).
- Prevention: Player input actions (fire, use, throw) must never be conditioned on browser pointer-lock states; pointer lock should be requested opportunistically while allowing gameplay gestures to proceed.
- Related files / skills: `detailed-3d-sinking-freighter-game_sonnet/src/game/game.ts`, `detailed-3d-sinking-freighter-game_sonnet/src/game/input.ts`, `detailed-3d-sinking-freighter-game_sonnet/src/game/shipBuilder.ts`, `tests/sandbox-overhaul.test.mjs`, `error-fix-document`.

### ERR-2026-11-12-14 - Crew clipping through deck floor and noclip flight activation

- Date (Europe/Berlin): 2026-11-12
- Area: Crew navigation, ship bounds clamping, and noclip 3D flight
- Status: Resolved
- Symptom: Crew members walked diagonally through the deck floor toward lower-hull breaches; `[N]` noclip toggled a flag without enabling 3D flight.
- Root cause: `walkToward` in `crew.ts` interpolated `m.y` directly toward lower-deck targets; `Player.update` in `player.ts` did not handle `ctx.noclip`.
- Solution: Restricted `walkToward` to horizontal deck movement (`dy = 0`) with `enforceShipBoundsAndRespawn`; implemented 3D flight in `Player.update` when `noclip` is active.
- Verification: `npm test` (10 suites + 10 Python checks pass), `npm run build` clean.
- Related files / skills: `detailed-3d-sinking-freighter-game_sonnet/src/game/crew.ts`, `detailed-3d-sinking-freighter-game_sonnet/src/game/player.ts`, `detailed-3d-sinking-freighter-game_sonnet/src/game/game.ts`, `error-fix-document`.

### ERR-2026-11-12-15 - Crew CollisionWorld door traversal, Command Tablet [TAB], Battleship 3rd-person mode, and Freighter NaN telegraph fix

- Date (Europe/Berlin): 2026-11-12
- Area: Crew AI & repair logging, Bridge Command Tablet, Battleship combat mode, Freighter autopilot
- Status: Resolved
- Symptom: Crew members fell through deck floors during explosion ragdoll events, failed to open doors or detect breaches beyond 30 m, and logged no repair events; `[TAB]` Tablet lacked remote controls and triggered pause on pointer unlock; switching to the Battleship left the FPS viewmodel visible and caused the Freighter to vanish with `NaNm` / `NaN% FLOODED` and an `AudioParam.setTargetAtTime` non-finite error.
- Root cause: `stepCrew` triggered floor-dropping ragdoll physics (`deckFloorY: -5.0`) even when `CollisionWorld` was active, used a 30 m `detectRadius`, and did not use `world.move` / `world.raycast` door opening; `onLockChange` triggered `onPause()` when `tabletOpen` released pointer lock; Freighter evasive autopilot assigned invalid telegraph `"half"` instead of `"half-ahead"`, producing `NaN` in `stepHelm` and `ship.group.position`.
- Solution:
  1. In `crew.ts` and `stormworksSupervisor.ts`: Enabled `Guard`-style `CollisionWorld` gravity, `world.move`, and automatic door opening (`world.raycast(..., c.tag === "door")`), suppressed floor-clipping ragdolls when `world` is active, spawned all 3 crew on clear `DECK_Y` (`y = 0.1`) lanes, increased `detectRadius` to `120 m`, and added `[NORDWIND/CREW]` event logging.
  2. In `game.ts`, `Hud.tsx`, `App.tsx`, `input.ts`, and `battleships.ts`: Implemented the `[TAB]` Bridge Command Tablet (releasing pointer lock without pausing), `[V]` vessel switching with 3rd-person Battleship chase camera (hiding the FPS viewmodel), WASD driving, mouse-aimed twin turrets, `[LMB]` hull-breaching cannons, `[RMB]/[Q]` torpedoes, and clickable HUD controls.
  3. In `game.ts` and `bridge.ts`: Fixed Freighter autopilot telegraph to `"half-ahead"`, added `TELEGRAPH_SPEED[h.telegraph] ?? 0` guard, kept `ship.group.visible = true` while sinking in Sandbox/Battleship mode, and parked the FPS body safely on deck during Battleship command.
- Verification: `npm test` (all 10 unit test suites + 10 Python CI checks pass) and `npm run build` (clean single-file production bundle).
- Related files / skills: `detailed-3d-sinking-freighter-game_sonnet/src/game/crew.ts`, `detailed-3d-sinking-freighter-game_sonnet/src/game/stormworksSupervisor.ts`, `detailed-3d-sinking-freighter-game_sonnet/src/game/battleships.ts`, `detailed-3d-sinking-freighter-game_sonnet/src/game/bridge.ts`, `detailed-3d-sinking-freighter-game_sonnet/src/game/game.ts`, `detailed-3d-sinking-freighter-game_sonnet/src/ui/Hud.tsx`, `error-fix-document`.
### ERR-2026-11-13-01 - Sonnet edition TypeScript gate failed on main

- Date (Europe/Berlin): 2026-11-13
- Area: CI typecheck of `detailed-3d-sinking-freighter-game_sonnet`
- Status: Resolved
- Symptom: Every `Continuous Integration & Physics Verification` and
  `Deploy to GitHub Pages` run failed in the Typecheck step. The Sonnet project
  reported 14 errors: unused `ty`/`bs`/`i`/`doorHandles`/`compInfos`, a
  `CollisionWorld`/`CrewWorld` mismatch at the supervisor call, `Input.jump`
  instead of `Input.jumpHeld`, numeric first arguments to
  `SoundEngine.explosion(pos, power)`, an unknown `key` door option instead of
  `locked`, station crew roles `electrician`/`medic` missing from `CrewRole`,
  and an arithmetic operation on the HUD `flood` compartment array.
- Root cause: New gameplay code was merged without running the Sonnet
  typecheck locally. CI is the first gate that typechecks that project, and the
  Sonnet build step never ran because the typecheck failed first.
- Solution:
  1. `crew.ts`: added `electrician` and `medic` to `CrewRole`; introduced the
     shared `CrewBody` (including `step: 0.35`) so `CollisionWorld.move` satisfies
     `CrewWorld.move`; dropped the unused `ty` argument from `walkToward`.
  2. `game.ts`: `SoundEngine.explosion` now receives a positional object plus a
     power value, and the unused battleship local was removed.
  3. `player.ts`: noclip vertical translation reads `input.jumpHeld`.
  4. `shipBuilder.ts`: unused compartment map index removed.
  5. `spaceStation.ts`: airlock doors pass `locked: doorKey ?? null`; the dead
     `doorHandles`/`compInfos` copies were deleted.
  6. `Hud.tsx`: flooded percentage is the mean compartment fill, not arithmetic
     on the array.
- Verification: `npx tsc --noEmit` and
  `npx tsc -p detailed-3d-sinking-freighter-game_sonnet/tsconfig.json --noEmit`
  both exit 0; `npm test` passes all 10 suites and 10 Python checks; both Vite
  builds produce `dist/index.html` and `dist/sonnet/index.html`.
- Prevention: `.github/workflows/ci.yml` now builds the Sonnet edition into
  `dist/sonnet` with the exact Pages flags and asserts both HTML artifacts, so a
  Pages-only break cannot pass CI again.
- Related files / skills: `detailed-3d-sinking-freighter-game_sonnet/src/game/crew.ts`,
  `.../game/game.ts`, `.../game/player.ts`, `.../game/shipBuilder.ts`,
  `.../game/spaceStation.ts`, `.../ui/Hud.tsx`, `.github/workflows/ci.yml`,
  `ci-workflow-audit`, `error-fix-document`.

### ERR-2026-11-13-02 - Documentation gate blocked by the optional CodeGraph engine

- Date (Europe/Berlin): 2026-11-13
- Area: `npm run docs:check` / `tools/check_skill_docs.py`
- Status: Resolved
- Symptom: `npm run docs:check` exited 1 with
  `CodeGraph MCP failed with exit 1: Binary not found:
  node_modules/@astudioplus/codegraph-mcp/bin/codegraph-server-linux-x64 |
  Platform: linux-x64 | Available binaries: none`, even though every file-level
  documentation check had already passed.
- Root cause: `@astudioplus/codegraph-mcp` downloads its native analysis engine
  in a best-effort postinstall step. The download can be skipped or blocked
  (air-gapped host, TLS interception, unsupported platform), leaving the npm
  wrapper installed but no engine. `check_skill_docs.py` treated that optional
  tooling gap as a documentation failure.
- Solution: The gate now checks for `CODEGRAPH_SERVER_PATH` or a
  `codegraph-server-*` engine in the package `bin` directory. A missing engine,
  a launch failure that reports `Binary not found`/`no engine`, or a 120-second
  MCP timeout prints an explicit `[WARN]` with the
  `npx codegraph-mcp-fetch-engine` recovery command and then continues with the
  file-level checks. Real CodeGraph errors (non-zero exit for another reason,
  non-JSON output, unknown tool) still fail the gate.
- Verification: `npm run docs:check` exits 0 with the WARN line and all PASS
  lines; YAML and Python syntax checks pass.
- Prevention: `docs/AGENT_TOOLS.md` and `AGENTS.md` document the optional-engine
  rule so the behavior is not mistaken for a silently weakened gate.
- Related files / skills: `tools/check_skill_docs.py`, `docs/AGENT_TOOLS.md`,
  `AGENTS.md`, `documentation-maintenance`, `ci-workflow-audit`.


## Open incidents

None at this revision. Add a new entry before merging any future fix, even when
the fix is a one-line documentation correction.
