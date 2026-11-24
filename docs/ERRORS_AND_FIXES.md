# Error and Solution Ledger

Last reviewed: 2026-11-24 (Europe/Berlin)
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

### ERR-2026-11-24-04 - Audit branch merged into main's negated-heading helm convention

- Date (Europe/Berlin): 2026-11-24
- Area: `bridge.ts`, `game.ts`, `battleships.ts`, `tests/vessel-steering-and-engine-breakdown.test.mjs`
- Status: Resolved
- Symptom: The audit branch was based on `8fd625a`, while `main` advanced by 24
  commits and fixed the same stern-first/rudder bug independently
  (`ERR-2026-11-20-03`) with the opposite sign convention: `main` keeps
  `heading += yawRate` in `stepHelm` and applies `rotationY(-heading)` to the
  ship, so its forward vector is `(-sin h, 0, cos h)`. Merging produced a mixed
  tree: the branch's `+heading` yaw, `main`'s `-heading` quaternion, a duplicated
  ragdoll `enter()` call and a superseded 14 m battleship hit sphere.
- Root cause: Two valid but incompatible fixes for the same convention were
  developed in parallel; a textual merge cannot detect that a quaternion and a
  propulsion vector must flip together.
- Solution:
  1. Adopted `main`'s convention everywhere: `stepHelm` raises the heading for a
     starboard rudder, `vesselForward()` returns `(-sin h, cos h)` and is
     documented as matching `rotationY(-heading)`, and the autopilot uses
     `atan2(-awayX, awayZ)` with a positive rudder order for a positive error.
  2. Dropped the branch's `battleshipHitTest()`; `main` already tests projectiles
     against the oriented `pointInHull` / `BATTLESHIP_HULL` envelope, which also
     feeds deck standing and orbital strikes.
  3. Removed the duplicated `enter()` while keeping the 6 s ragdoll cooldown, and
     reverted the two tests that encoded the branch's sign convention.
- Verification: `npx tsc --noEmit` (root and Sonnet) pass; `npm test` runs all 13
  suites including `orbital-laser-and-multipart` and `vessel-collision`; both
  Vite builds succeed; `tests/physics-integrity-and-orientation.test.mjs` proves
  `vesselForward(h)` equals the mesh bow vector under `rotationY(-h)`.
- Prevention: The helm convention is documented once, at `vesselForward()`, and
  the steering test compares the forward vector against the actual 3D bow
  position instead of hard-coded signs.
- Related files / skills: `.../game/bridge.ts`, `.../game/game.ts`,
  `.../game/shipSim.ts`, `.../game/battleships.ts`,
  `tests/vessel-steering-and-engine-breakdown.test.mjs`,
  `tests/physics-integrity-and-orientation.test.mjs`, `error-fix-document`.

### ERR-2026-11-24-01 - Collision solver teleported embedded bodies and accepted NaN deltas

- Date (Europe/Berlin): 2026-11-24
- Area: `CollisionWorld.move` (`physics.ts`) used by the player, crew, guards and debris
- Status: Resolved
- Symptom: A body that spawned, was teleported, pushed by a blast or caught by a
  closing door inside a collider was snapped onto the roof of that collider.
  Dropping into any overlapping geometry moved the player to `y = 9` (the top of
  the wall) instead of leaving them where they were. A single `NaN` velocity
  (division by a zero-length frame somewhere upstream) permanently poisoned
  `body.x`, and the vertical pass also resolved collisions against colliders
  whose `enabled` flag was false.
- Root cause: The vertical pass treated *any* overlapping box as a floor and set
  `body.y = b.maxY` without checking whether the body had actually been above
  that surface before the step. There was no depenetration path and no
  `Number.isFinite` guard on the incoming deltas.
- Solution:
  1. Land only when `prevY >= b.maxY - 0.02` (the highest such surface wins);
     block ceilings only when `prevY + h <= b.minY + 0.02`.
  2. New `depenetrate()` separates a genuinely embedded body along its shallowest
     penetration axis, reports `hitX/hitY/hitZ`, and climbs onto the roof only
     when that **is** the shallowest axis.
  3. Non-finite `dx/dy/dz` are replaced with `0`, and the vertical pass honours
     `Collider.enabled` exactly like the horizontal and overlap passes.
- Verification: `tests/physics-integrity-and-orientation.test.mjs` - an embedded
  body is pushed out of a 9 m wall (stays at `y < 2`, `z` moves > 0.5 m), a
  30 m/s fall still lands on the deck at `y = 0.4`, and `move(body, NaN, 0, NaN)`
  leaves the position finite.
- Prevention: The new suite runs inside `npm test`, and `tools/ci_check.py`
  fails when it is no longer wired in.
- Related files / skills: `.../game/physics.ts`,
  `tests/physics-integrity-and-orientation.test.mjs`, `error-fix-document`.

### ERR-2026-11-24-02 - Trapped-air regulator was dead code and flooding ignored the wave surface

- Date (Europe/Berlin): 2026-11-24
- Area: `shipSim.ts` flooding model, `stormworksSupervisor.ts`, `ingress.ts`
- Status: Resolved
- Symptom: Sealed compartments flooded exactly like vented ones: a breached
  sealed engine room reached 69-100 % fill within 80 s even though the Boyle
  pocket cap at that depth is about 25 %. The Torricelli head was computed
  against a fixed sea level `y = 0`, so a hull breach that was above a wave
  trough still flooded and a crest did not increase the inflow.
- Root cause: `StormworksSupervisor.step()` scaled `c.flow` *before* calling
  `shipSim.update()`, but the simulation recomputes `c.flow` from scratch every
  step, so the factor never reached the integral. `ShipSim.update()` had no
  notion of the real sea surface at the hole and no regulator hook.
- Solution:
  1. `ShipSim.update(dt, t, ocean, floodSpeed, inflowFactor?)` accepts a
     per-compartment regulator and derives the head from
     `ocean.height(worldX, worldZ, t)` at the hole (hole position projected with
     `matrixWorld`).
  2. The supervisor builds `regulator(c)` from the matrix-projected hole
     depth (`inflowFactor(pocket, c.water, depth)`) and passes it as the fifth
     argument; vented holds and compartments without holes pass `1`.
  3. Merged blast openings are clamped to `MAX_HOLE_AREA = 6 m²`, and the wreck
     stops descending at `WRECK_REST_DEPTH = 135 m` instead of sinking forever.
- Verification: `supervisor.mjs` scratch run shows the sealed engine inflow
  decaying `45.1 -> 5.9 m³/s` instead of staying at ~53 m³/s; the new unit test
  floods a sealed engine to < 60 % and a vented hold to > 90 %, keeps a hole
  above a -6 m sea surface dry, and proves the 6 m² cap.
- Prevention: `ingress.ts` no longer claims to be an unwired prototype, and the
  regulator signature is covered by a test so the parameter cannot silently be
  dropped again.
- Related files / skills: `.../game/shipSim.ts`, `.../game/stormworksSupervisor.ts`,
  `.../game/ingress.ts`, `.../game/shipTypes.ts`,
  `tests/physics-integrity-and-orientation.test.mjs`, `error-fix-document`.

### ERR-2026-11-24-03 - Ragdoll damping was frame-rate dependent and crew breach ids shifted

- Date (Europe/Berlin): 2026-11-24
- Area: `ragdoll.ts`, `crew.ts`, `stormworksSupervisor.ts`
- Status: Resolved
- Symptom: Ragdoll limbs behaved differently at 30 fps and 144 fps, and a crew
  member repairing a breach could switch to a different hole after an unrelated
  repair finished. Crew ragdolls also re-triggered on the next frame after
  recovery while the water flow was still violent, producing one
  `[NORDWIND/CREW] ... ragdoll_triggered` log line per step, and the breach
  write-back loop ran once per crew member (3x per frame) with a `holes` filter
  nested inside the compartment loop.
- Root cause: Velocity retention used a fixed `0.98` per *frame* instead of a
  per-second decay; breach ids were renumbered `1..n` every frame; there was no
  cooldown after a ragdoll recovered; and the synchronization block sat inside
  the `for (const member of this.crew)` loop.
- Solution: `damp = exp(-1.2 * dt)`; a zero-length or non-finite ragdoll step is
  skipped instead of dividing by `dt`; `Hole.breachId` is assigned once and
  reused; `ragdollCooldown = 6 s` after recovery; and the breach write-back plus
  the fully-patched-hole filter now run once per frame after the crew loop.
- Verification: `tests/ragdoll-physics.test.mjs` and the new suite pass with the
  dt guard, and `tests/stormworks-supervisor.test.mjs` still proves that the
  autonomous crew seals a deck breach after the sync refactor.
- Prevention: The cooldown and the stable ids are commented at their definition
  sites, and the supervisor sync loop is no longer nested in the crew loop.
- Related files / skills: `.../game/ragdoll.ts`, `.../game/crew.ts`,
  `.../game/stormworksSupervisor.ts`, `.../game/shipTypes.ts`,
  `tests/ragdoll-physics.test.mjs`, `tests/stormworks-supervisor.test.mjs`,
  `error-fix-document`.

### ERR-2026-11-20-04 - Bridge Helm Double-Tap, Tablet Input Leaks, Battleship Deck Riding, Torpedo/Collision Hull Breaches & Superlaser Target Switching

- Date (Europe/Berlin): 2026-11-20
- Area: Helm & Input (`input.ts`, `game.ts`), Naval combat/ramming/breaches (`game.ts`), Battleship deck riding (`game.ts`), Spawn/Nav Lights/HUD (`shipBuilder.ts`, `Hud.tsx`)
- Status: Resolved
- Symptom: Rapidly double-tapping `[W]`/`[S]` at the Bridge Helm dropped the second tap (`telegraph` stayed at `half-ahead` instead of advancing to `full-ahead`) and collapsed multiple key presses inside slow render frames; opening the `[TAB]` Command Tablet leaked `[W/A/S/D/E]` into helm mode and interaction prompts; torpedoes, Fleet Strike missiles, and heavy vessel ramming failed to breach Freighter compartments or lower Freighter integrity (`0` hull breaches, `100%` integrity); walking on a Battleship deck dragged the player along with the moving/rotating Freighter and triggered Freighter-local out-of-bounds falls; triggering a Superlaser Strike over the player's Battleship switched onto `MV NORDWIND` mid-strike as soon as the Battleship sank; evacuating a sunk Battleship could fall through after orbital evacuation; lifeboat wave pitch rolled `boat.rotation.z`; player spawned atop an explosive barrel at `(9.6, 3.0, -42)` while Port/Stbd nav lights and pump labels were inverted for `+Z` bow; and the HUD status schematic pitched backwards.
- Root cause:
  1. `handleHelm()` polled held `KeyW`/`KeyS` behind a fixed `0.35s` cooldown without discrete tap actions, and `Input.queue` used a `Set` that deduplicated two `KeyW`/`KeyS` taps occurring in a single frame.
  2. `handleHelm` and `updateInteraction` did not return early when `tabletOpen` / `ended` / `orbitalLaserMode` were active.
  3. `navalProjectiles` only tested `|localHit.x| < 11.5` and fired `explode()` where `compAt` returned `null` outside `[-69.8, 57.05] x [-10.2, 10.2]` and `ShipSim.addBreach()` rejected `y > -2.0` waterline torpedoes (`-0.15m`) or inner hull contacts; `stepVesselCollisions()` hit the same `compAt`/`addBreach` rejection on bow/side impacts; and `navalProjectiles` did not damage `ShipSection`/`BattleshipPart` HP or allow already-destroyed sections to pass projectiles cleanly.
  4. `step()` had no Battleship-local coordinate tracking (`ridingBs`/`ridingLocal`), world-yaw offset for `Player.update()`, world ocean depth lookup, or Battleship-safe bounds guard (`b.y < -25`).
  5. `superlaserTimer` re-resolved `this.battleships[0]` every frame, `activeVessel === "battleship"` sink fallback was not guarded before running driving logic, and `restoreFreighter()` / `dyns` did not recursively dispose child meshes in `THREE.Group`.
  6. `shipBuilder.ts` placed a barrel on `(9.6, 3.0, -42)` at spawn and swapped Port (`+X` red) vs Stbd (`-X` green) for `+Z` bow, while `Hud.tsx` multiplied `h.pitchDeg` by `-0.6` and `updateEscape()` applied wave pitch on `boat.rotation.z`.
- Solution:
  1. Added counted `helmUp`/`helmDown` discrete taps (`consumeHelmSteps()`) plus touch joystick throttle/rudder in `input.ts` and `handleHelm(dt)` in `game.ts`, and isolated helm/interaction while `tabletOpen`, `dead`, `ended`, or `orbitalLaserMode`.
  2. Implemented `freighterHitSection`, `breachFreighterHullAt`, `damageFreighterSectionAt`, `destroyFreighterSection`, and `damageBattleshipPartAt` in `game.ts`, wiring naval projectiles (with `ownerId` self-hit guards and velocity-aligned torpedo quaternions) and `stepVesselCollisions()` so underwater torpedoes, diving missiles, and heavy collisions reliably breach compartments and shatter sections while letting projectiles fly through destroyed sections.
  3. Implemented `ridingBs` / `ridingLocal` Battleship-deck riding with world-space camera height, Freighter-heading-compensated `Player.yaw`, world ocean immersion check, and bounds-check exemption when riding a Battleship.
  4. Locked `superlaserTargetBsId` at `triggerSuperlaserStrike()` start, fixed Battleship sink-evacuation branching, added recursive `disposeObject3D` cleanup on `holeGroup`/`dyns` and `helm.rudderCmd` resets in `switchVessel()`/`restoreFreighter()`, fixed `boat.rotation.order = "YXZ"` wave pitch in `updateEscape()`, moved the colliding barrel to `[9.6, -39.5]` and aligned Port/Stbd nav lights/pump labels in `shipBuilder.ts`, and flipped `Hud.tsx` schematic pitch sign to `+0.6`.
- Verification: `npx tsc --noEmit`, `npx tsc -p detailed-3d-sinking-freighter-game_sonnet/tsconfig.json --noEmit`, `npm test` (including new helm double-tap/tablet-isolation and collision/breach assertions), `npm run docs:check`, both Vite builds, and live headless Chrome CDP E2E verification on `http://127.0.0.1:5173/`.
- Prevention: Verify discrete action counters across slow render frames, test naval impacts and Battleship deck riding in headless WebGL CDP, and keep all vessel orientation conventions (`+Z` Freighter vs `-Z` Battleship) consistent across geometry, physics, UI, and input.
- Related files / skills: `detailed-3d-sinking-freighter-game_sonnet/src/game/input.ts`, `game.ts`, `shipBuilder.ts`, `detailed-3d-sinking-freighter-game_sonnet/src/ui/Hud.tsx`, `tests/vessel-steering-and-engine-breakdown.test.mjs`, `tests/vessel-collision.test.mjs` / `error-fix-document`.

### ERR-2026-11-20-03 - Inverted Freighter Propulsion (+Z Bow), Rudder Yaw, Battleship Steering & Gameplay Physics Bugs

- Date (Europe/Berlin): 2026-11-20
- Area: Vessel kinematics & steering (`shipSim.ts`, `game.ts`, `battleships.ts`, `vesselCollision.ts`), Flood water/compass/torpedo/TNT sync (`game.ts`)
- Status: Resolved
- Symptom: Commanding `full-ahead` on `MV NORDWIND` drove the freighter backwards (stern-first toward `-Z`); starboard/port `[D]/[A]` rudder inputs rotated both the freighter (`+Z` bow) and battleship (`-Z` bow) in the opposite direction; rotated freighter OBB collision boxes, evasive autopilot, flood `waterMesh`, lifeboat launch direction, and HUD compass were misaligned; torpedoes spun around their roll axis instead of yawing toward target; attached TNT reducing a battleship to `0 HP` left `bs.sunk === false`; and `ShipSim.update()` produced `NaN` when compartment volume totaled `0`.
- Root cause:
  1. Freighter geometry in `shipBuilder.ts`/`shipTypes.ts` places the bow at `+Z` (`Z_BOW = 70`) and stern at `-Z` (`Z_STERN = -70`), whereas `game.ts` used `(-sin(heading), 0, -cos(heading))` (the `-Z` FPS/Battleship forward vector), `shipSim.ts` applied `+heading` to `qYaw` (turning starboard rudder to port `-X`/`+X` opposite), and `vesselCollision.ts` + Freighter autopilot/velocity/superlaser assumed `-Z` bow.
  2. `battleships.ts` added `+rudderDeg` to `bs.heading` (`group.rotation.y`), turning its `-Z` bow left (`-X`) on starboard `[D]` input instead of right (`+X`).
  3. `game.ts` kept compartment `waterMesh` unrotated in world space, computed HUD compass from ship-local `lookDirLocal()` with inverted `atan2(dir.x, dir.z)`, rotated torpedoes with `XYZ` Euler `rotation.x = Math.PI/2`, omitted `sunk = true` in `explodeDyn`, checked non-existent `"superstructure"` section id in `waterAt`, left `rudderCmd`/`helmMode` dirty in `restoreFreighter()`, and omitted `totV > 0` guard in `shipSim.ts`.
- Solution:
  1. In `shipSim.ts` & `game.ts`: Changed `qYaw` to `-this.heading` and Freighter forward/velocity/autopilot/superlaser sweep to `(-sin(heading), 0, cos(heading))` / `Math.atan2(-awayX, awayZ)`, and guarded `totV > 0 ? totW / totV : 0`.
  2. In `vesselCollision.ts` & `game.ts`: Added optional `bowZ?: 1 | -1` to `HullBox` (`fz = (b.bowZ ?? -1) * Math.cos(b.heading)`), set `bowZ: 1` on `freighterHull()`, and updated Freighter collision velocity.
  3. In `battleships.ts` & `game.ts`: Fixed Battleship steering sign (`bs.heading -= ...` and AI `turnSign`), set chase camera `yaw = bs.heading` on `switchVessel()`, cleared queued inputs on mode transitions, rotated `waterMesh` with `(-Math.PI/2, -heading, 0, "YXZ")`, computed world-space compass heading `atan2(-wdir.x, wdir.z)`, oriented torpedoes via `quaternion.setFromUnitVectors`, synced `bs.sunk = true` + mesh disposal in `explodeDyn`, fixed `waterAt` `super_*` check, rotated lifeboat launch vector, used `worldPos` + `pointInHull` for walkable Battleship decks, and reset `rudderCmd`/`helmMode` in `restoreFreighter()`.
- Verification: `npx tsc --noEmit`, `npx tsc -p detailed-3d-sinking-freighter-game_sonnet/tsconfig.json --noEmit`, `npm test` (including updated `tests/vessel-steering-and-engine-breakdown.test.mjs` and `tests/vessel-collision.test.mjs`), `npm run docs:check`, both Vite builds, and live Chrome CDP verification on `http://127.0.0.1:5173/`.
- Prevention: Always derive forward/steering/collision vectors from each vessel's actual 3D bow axis (`+Z` for Freighter, `-Z` for Battleship) and test `ShipSim` + `stepBattleship` directly against 3D world bow transforms.
- Related files / skills: `detailed-3d-sinking-freighter-game_sonnet/src/game/shipSim.ts`, `game.ts`, `battleships.ts`, `vesselCollision.ts`, `tests/vessel-steering-and-engine-breakdown.test.mjs`, `tests/vessel-collision.test.mjs` / `error-fix-document`.

### ERR-2026-11-20-02 - Bilge Capacity, Incomplete Dewatering, Gap Jumping & Surface Swimming

- Date (Europe/Berlin): 2026-11-20
- Area: Bilge pumps (`shipBuilder.ts`, `game.ts`, `Hud.tsx`), crew navigation (`shipNavGraph.ts`, `crew.ts`)
- Status: Resolved
- Symptom: Flooded compartments never drained fully (residual water kept the ship sinking), only 6 pump stations at 16 m3/s existed, and crew fell into floor gaps or sank in flood water.
- Root cause: Pumping stopped at low fill levels, compartment fill/level/mesh were not re-synced after pumping, the sinking state was never reset, and the nav graph had no jump edges or swimming buoyancy.
- Solution: 14 pump stations (12 x 32 m3/s = 384 m3/s plus 2 master consoles); crew activate all pumps of their compartment while water remains; `syncCompartmentsAfterPumping` clamps to exactly 0 m3, hides the water mesh, recomputes `sim.F` and clears `sim.sinking` when `F < 0.28`; overboard spray particles; jump edges on Level 1/2 gaps; surface swimming at `waterLevel - 0.55` with ragdoll recovery.
- Verification: `testGapJumpSwimmingAndCompleteDewatering` in `tests/crew-navigation.test.mjs`, `tsc --noEmit`, `npm test`.
- Prevention: Test asserts pump count, per-unit rate, total capacity and full drainage.
- Related files / skills: `error-fix-document`, `documentation-maintenance`

### ERR-2026-11-20-01 - Catwalk Clamping, Phantom Stair/Room Graph Edges, Disabled Open-Door Centering & Localized Sandbox Physics

- Date (Europe/Berlin): 2026-11-20
- Area: Crew & Guard AI Navigation (`shipNavGraph.ts`, `crew.ts`, `stormworksSupervisor.ts`, `enemies.ts`), Localized Blast Physics, Hole Cleanup & Bilge Control (`game.ts`, `Hud.tsx`)
- Status: Resolved
- Symptom: Crew bots on exterior catwalks remained pinned against the superstructure wall/aft edge; corridor/stairwell/Control Room bots collided with divider walls, `z = -50` bulkheads, `engineHole` railings, Galley/Lounge furniture, diesel engine blocks, and deck container stacks; open doorframes (`door.open >= 0.4`) lost center-alignment; `StormworksSupervisor.crew` spawned at `y = 0.1` mid-air without patrols or peer separation; distant crew ragdolled from global camera shake; sealed breach meshes remained visible; and thrown TNT ignored water drag/buoyancy.
- Root cause: (1) `enforceShipBoundsAndRespawn` clamped `m.x` to `[-9.2, 9.2]` and `m.z` to `[-65.5, 62.0]`, pressing catwalk/stern crew into superstructure walls at `|x| = 9.0` and `z = -66.0`; (2) `shipNavGraph.ts` contained blocked phantom edges (`d0_corr_mid <-> d0_corr_aft`, `d0_port_mid <-> d0_port_aft`, `d0_stbd_mid <-> d0_stbd_aft`, `d1_corr_mid <-> d1_corr_aft`, `d2_corr_aft <-> d2_corr_mid`), orphaned nodes, and waypoints inside containers, Galley counter, diesel engine, and `holdHole` railings, while `isInStairwellBand` spanned `|x| <= 1.9, z in [-53.2, -47.2]` and blocked adjacent doorway alignment; (3) `door.collider.enabled` became `false` once `door.open >= 0.4`, hiding open doorways from `world.raycast`, and `(!door.locked || door.key)` failed because `Door` has no `.key` property; (4) `StormworksSupervisor.crew` spawned at `y = 0.1` with min-water `-99`; (5) `game.ts` fed global `this.shake * 420` to all crew and omitted Level 1/3 `deckFloorY`, hole mesh disposal, TNT hydrodynamics, and remote bilge toggle.
- Solution:
  1. In `shipNavGraph.ts` & `game.ts`: Rebuilt `NODES`/`EDGES` around obstacle-free deck walkways (`deck_port_aft/mid/prehold/fwd/bow`), catwalks (`x = +-9.55, z = -43.2`), Level 0 starboard stairwell bypass (`x = 0.875`), Control Room North bypass around `engineHole`, connected Level 1/2 stair landings/cabins without phantom walls, engine side aisles around the diesel engine, and updated all 22 crew spawns/patrols plus multi-deck `deckFloorY` (`12.6/9.4/6.2/3.0/-5.0`).
  2. In `crew.ts`: Widened ship bounds clamp to `x in [-10.2, 10.2], z in [-68.5, 62.0]`; scanned `world.boxes` (including disabled open door colliders) regardless of `stairMode` for perpendicular doorway alignment; removed the broken `door.key` guard; and added idle patrol kit/ladder replenishment after `8.0s` when no breaches are targeted.
  3. In `stormworksSupervisor.ts` & `enemies.ts`: Grounded `supervisor.crew` on `DECK_Y = 3.0` with patrol routes, peer separation, and accurate active flood level (`Math.max`); upgraded `Guard.moveTo()` to route via `navgrid.ts` A* and open swinging doors in the approach direction.
  4. In `game.ts` & `Hud.tsx`: Attenuated blast ragdoll impulse per crew member by inverse-square distance (`lastBlast`), pushed loose `dyns` radially, added water drag/buoyancy/splash to thrown TNT in `updateDyns`, removed/disposed 3D breach meshes upon seal, translated remaining German strings to English, and added `remoteToggleBilgePumps()` + button in the `[TAB]` Command Tablet.
- Verification: `npx tsc --noEmit`, `npx tsc -p detailed-3d-sinking-freighter-game_sonnet/tsconfig.json --noEmit`, `npm test` (all 12 Node test suites including new catwalk/bypass/open-door regression checks + 10 Python CI checks), `npm run build`, Sonnet Vite build, and `npm run docs:check` passed after final edits.
- Prevention: Validate every navigation graph node and spawn/patrol coordinate against actual collider bounds (walls, stairs, railings, furniture, machinery, containers), keep open-door alignment active via `world.boxes`, and test multi-floor/catwalk/doorway topology in `tests/crew-navigation.test.mjs`.
- Related files / skills: `detailed-3d-sinking-freighter-game_sonnet/src/game/shipNavGraph.ts`, `crew.ts`, `stormworksSupervisor.ts`, `enemies.ts`, `game.ts`, `detailed-3d-sinking-freighter-game_sonnet/src/ui/Hud.tsx`, `tests/crew-navigation.test.mjs` / `error-fix-document`.

### ERR-2026-11-13-11 - Catwalk Edge Cornering, Doorway Collider Centering & Ragdoll Fall-and-Stand Recovery

- Date (Europe/Berlin): 2026-11-13
- Area: Crew AI Edge/Doorframe Recovery (`navgrid.ts`, `crew.ts`)
- Status: Resolved
- Symptom: Bots could repeatedly loop on narrow catwalk corners (`0.90m` clearance) and doorframes for long runs instead of forcing past or falling/standing up to break the loop.
- Root cause: (1) `navgrid.ts` (`pad = 0.08`) choked the `0.90m` catwalk clearance and steered diagonally into the superstructure corner; (2) `walkToward()` did not center-align onto the exact doorway `Collider` center; (3) `monitorProgressAndUnstick()` only hopped laterally and reversed `patrolIndex`, allowing indefinite edge loops.
- Fix: Lowered `navgrid.ts` padding to `0.04` and bypassed 2D `navgrid` on narrow catwalks (`shipNavGraph` centerline), added doorway `Collider` center-alignment in `walkToward()`, upgraded `stuckCount === 2` to a forward force-vault (`0.75m` + `0.35m` hop), and added `stuckCount >= 3` brief ragdoll fall-and-stand recovery (`fallRecovery`, `1.15-1.9s`) that tumbles past the snag and resumes cleanly.
- Prevention: Break persistent edge/doorframe loops with a physical forward force-vault followed by a brief ragdoll fall/stand-up reset rather than reversing patrol waypoints indefinitely.
- Related files / skills: `detailed-3d-sinking-freighter-game_sonnet/src/game/crew.ts`, `detailed-3d-sinking-freighter-game_sonnet/src/game/navgrid.ts`, `tests/crew-navigation.test.mjs`.

### ERR-2026-11-13-10 - Peer Yielding, Catwalk Lateral Sidestep & Exterior Wall-Climb Fallback

- Date (Europe/Berlin): 2026-11-13
- Area: Crew AI Peer Separation & Exterior Traversal (`crew.ts`)
- Status: Resolved
- Symptom: Bots could overlap inside each other on narrow catwalks (`isOnNarrowCatwalk` previously skipped separation), push continuously head-on without yielding, or stall outside elevated hull/superstructure walls.
- Root cause: `stepCrew()` skipped peer separation on narrow catwalks and had no priority-based `yieldTimer` waiting or exterior vertical wall-climbing fallback.
- Fix: Enabled `0.52m` no-cramming peer separation everywhere (with lateral sidestepping on catwalks), added `yieldTimer` so lower-priority bots wait cleanly instead of pushing forever, and added `wallClimbing` fallback when blocked outside (climbs up to fix the breach and jumps down cleanly onto the deck upon `"sealed"`).
- Prevention: Never disable peer separation completely on narrow corridors; use lateral sidestep + priority yielding, and provide a clean exterior wall-climb/jump-down fallback.
- Related files / skills: `detailed-3d-sinking-freighter-game_sonnet/src/game/crew.ts`, `tests/crew-navigation.test.mjs`.

### ERR-2026-11-13-09 - Stair-Entry Ping-Pong Fix, Anti-Oscillation Replanning & Expanded 22-NPC Crew Roster

- Date (Europe/Berlin): 2026-11-13
- Area: Crew AI Stair Alignment & Population (`shipNavGraph.ts`, `crew.ts`, `game.ts`)
- Status: Resolved
- Symptom: Bots oscillated back and forth ("hin und her") in front of Level 1/2 stairwells and cabin doors instead of climbing through, and the ship needed more crew NPCs across all decks.
- Root cause: (1) `findNextShipGraphWaypoint()` skipped `path[1]` stair-entry nodes at `< 0.85m`, causing bots in the corridor to angle diagonally into the stairwell center divider wall, bounce back `>= 0.85m`, and ping-pong between `path[1]` and `path[2]`; (2) `monitorProgressAndUnstick()` flipped `slideSign` every `0.45s` (`stuckCount >= 1`), amplifying back-and-forth oscillation; (3) Level 1/2 lacked cabin doorway center nodes and `distXZ < 3.2` bypassed the graph near walls.
- Fix: Tightened stair-entry alignment tolerance to `0.35m` and direct-target shortcut to `1.1m`, added Level 1/2 cabin doorway nodes, removed premature `slideSign` flipping at `stuckCount === 1`, and expanded `deckCrew` to 19 active NPCs (22 total with `supervisor.crew`) across Bridge, Officer/Cabin Decks, Catwalks, Control Room, Main Deck, Engine Room, and Cargo Holds 1-3.
- Prevention: Never skip a stair-entry node before strict centerline alignment (`<= 0.35m`), and never flip lateral steering sign on the first replan attempt.
- Related files / skills: `detailed-3d-sinking-freighter-game_sonnet/src/game/shipNavGraph.ts`, `detailed-3d-sinking-freighter-game_sonnet/src/game/crew.ts`, `detailed-3d-sinking-freighter-game_sonnet/src/game/game.ts`, `tests/crew-navigation.test.mjs`.

### ERR-2026-11-13-08 - Progress-Based Crew Replanning, Doorway Centering & Interactive Ship Bilge Pumps

- Date (Europe/Berlin): 2026-11-13
- Area: Crew AI Replanning & Ship Dewatering (`crew.ts`, `shipNavGraph.ts`, `shipBuilder.ts`, `game.ts`)
- Status: Resolved
- Symptom: Bots that bounced off peers or doorframes could run in place without recomputing paths, failed to align cleanly through all doorways, and the ship lacked physical interactive bilge pumps to pump water out.
- Root cause: (1) Stuck detection checked single-frame speed (`moved < 0.2 * dt`), which missed lateral oscillation/bouncing and did not clear `navWaypoint` on peer collisions; (2) `shipNavGraph.ts` lacked explicit doorway-center nodes for Level 0 interior/exterior doors and `barrierHit` deflected bots at open doorframes; (3) only portable crew pumps existed with no physical ship-mounted bilge pumps or master consoles.
- Fix: Added `monitorProgressAndUnstick()` (0.45s net-displacement check -> immediate `navWaypoint` reset, `slideSign` flip, and self-unstick hop), peer-bounce path reset, doorway-center nodes in `shipNavGraph.ts`, open-doorway `barrierHit` suppression, and 6 interactive `BilgePumpUnit` stations (4 compartment pumps at `16 m^3/s` each + Bridge & Control Room master consoles).
- Prevention: Measure net progress over a time window rather than single-step speed when triggering A* replanning, and anchor graph edges at exact doorway centers.
- Related files / skills: `detailed-3d-sinking-freighter-game_sonnet/src/game/crew.ts`, `detailed-3d-sinking-freighter-game_sonnet/src/game/shipNavGraph.ts`, `detailed-3d-sinking-freighter-game_sonnet/src/game/shipBuilder.ts`, `detailed-3d-sinking-freighter-game_sonnet/src/game/game.ts`, `tests/crew-navigation.test.mjs`.

### ERR-2026-11-13-07 - 3D ShipNavGraph Stair Mode, Stair Tagging & Narrow Catwalk Separation Fix

- Date (Europe/Berlin): 2026-11-13
- Area: Crew AI 3D Pathfinding & Stair/Catwalk Navigation (`shipNavGraph.ts`, `navgrid.ts`, `crew.ts`, `shipBuilder.ts`)
- Status: Resolved
- Symptom: Bots got stuck on overlapping superstructure/lower-deck stair flights (sliding sideways into stairwell divider walls) and on the narrow `1.15m` exterior catwalk (`|x| ~ 9.45m`).
- Root cause: (1) `stairSteps` colliders were untagged (`"wall"`), so `navgrid.ts` marked stairs as impassable floor obstacles and `walkToward()`'s `barrierHit` ray at `y + 0.75` mistook the next stair step for a vertical wall and pushed bots sideways into the center divider; (2) `computeDeckWaypoint` used ad-hoc heuristics instead of an explicit 3D deck/stair/doorway graph; (3) `0.72m` peer separation pushed passing bots sideways into the `1.15m` catwalk walls and railings.
- Fix: Added `shipNavGraph.ts` (~46 nodes across exterior deck/catwalks, Deck 0-3 corridors/rooms, A/B stairs, `engineHole`, `holdHole`, and lower holds), tagged `stairSteps` colliders `"stair"` in `shipBuilder.ts`, skipped `"stair"` colliders in `navgrid.ts` and `walkToward()`, bypassed wall-slide/grid-steering when `onStair` is active, and suppressed peer separation on narrow catwalks and inside stairwells.
- Prevention: Never treat sloped/stepped stair colliders as horizontal wall obstacles in 2D floor grids or chest-height barrier rays; route multi-deck and narrow-corridor movement through an explicit 3D node-edge graph with `onStair` mode.
- Related files / skills: `detailed-3d-sinking-freighter-game_sonnet/src/game/shipNavGraph.ts`, `detailed-3d-sinking-freighter-game_sonnet/src/game/crew.ts`, `detailed-3d-sinking-freighter-game_sonnet/src/game/navgrid.ts`, `detailed-3d-sinking-freighter-game_sonnet/src/game/shipBuilder.ts`, `tests/crew-navigation.test.mjs`.

### ERR-2026-11-13-06 - 2D Grid A* Pathfinding, Proactive Door Opening & Patrol Waypoint Routing

- Date (Europe/Berlin): 2026-11-13
- Area: Crew AI Pathfinding (`navgrid.ts`, `crew.ts`)
- Status: Resolved
- Symptom: Bots still walked in place in front of closed corridor doors or against interior walls/corners during patrol and off-axis movement.
- Root cause: (1) `walkToward()` used a single forward `doorRay` that missed off-axis doors and did not wait for the swinging door collider (`open < 0.65`) to clear, causing `stuckTime` / `exteriorBypass` loops; (2) `patrol` bypassed `computeDeckWaypoint()` and walked straight through walls; (3) local 5-ray steering without a real floor-level A* NavGrid cannot route around L-shaped walls, stair columns, or narrow `1.0m` doorways.
- Solution: Added `navgrid.ts` (`findNextGridWaypoint`) building a `0.35m` per-floor 8-way A* grid from `CollisionWorld.boxes` with `0.08m` Minkowski inflation, full perpendicular doorway passage carving, wall-clearance cost weighting (`cost = 5`), and 1-step look-ahead (no corner cutting); added proactive omnidirectional door opening + swing-wait pause and tangential surface-normal barrier sliding with `0.6s` anti-oscillation `slideSign` in `walkToward()` (`crew.ts`); routed `patrol` through `computeDeckWaypoint()` + A*; and added `testGridAStarDoorwayAndWallBypass` in `tests/crew-navigation.test.mjs`.
- Verification: `npx tsc --noEmit` (root & sonnet), `npm test`, `npm run build`, and `npm run docs:check` executed after final edit.
- Prevention: Always use floor-level A* (`navgrid.ts`) + proactive doorway clearance for both `patrol` and `moving`, and never count door swing time toward `stuckTime`.
- Related files / skills: `detailed-3d-sinking-freighter-game_sonnet/src/game/navgrid.ts`, `crew.ts`, `tests/crew-navigation.test.mjs` / `error-fix-document`

### ERR-2026-11-13-05 - Window Burst Hole Ring, Doorway Steering Lock & Below-Deck Crew Descent

- Date (Europe/Berlin): 2026-11-13
- Area: Crew Doorway & Wall-Slide Navigation, Below-Deck Descent, Window Burst Visuals
- Status: Resolved
- Symptom: (1) Burst windows rendered a circular steel hull-breach ring inside the glass opening; (2) crew froze in narrow `1.0m` doorframes or walked head-first into corridor walls; (3) crew could not descend into lower cargo holds/engine room after explosions due to locked keycard doors (`red`/`blue`), missing `holdHole`/bulkhead routing, and lack of drop-down fallback.
- Root cause: (1) `game.ts` called `this.makeHoleVisual(hole)` on `shouldWindowBurst` even though `this.breakGlass(pane)` already handled the shattered window; (2) `CrewBody.r = 0.34` + 5-ray `computeAntiClippingSteering` deflected crew into narrow `1.0m` doorjambs and perpendicular corridor walls; (3) `walkToward` skipped doors with `door.locked === true` and `computeDeckWaypoint` lacked `holdHole`/side-room/bulkhead waypoints.
- Solution: Removed `this.makeHoleVisual(hole)` from window burst in `game.ts`; reduced `CrewBody.r` to `0.2`, bypassed 5-ray steering when threading doors, added 90-degree wall-slide clearance (`walkToward`), added side-room/corridor/`holdHole`/bulkhead routing (`computeDeckWaypoint`), granted crew master-key door access (`door.key`), and added shaft jump (`vy = 4.2`) + `2.2s` drop-down fallback (`stepCrew`) plus regression test `testBelowDeckDescentAndDropJump`.
- Verification: `npx tsc --noEmit` (root & sonnet), `npm test`, `npm run build`, and `npm run docs:check` executed after final edit.
- Prevention: Never spawn steel hull-breach rings on broken glass panes; test multi-deck crew descent, doorway clearance, and wall-slide steering in `tests/crew-navigation.test.mjs`.
- Related files / skills: `detailed-3d-sinking-freighter-game_sonnet/src/game/crew.ts`, `game.ts`, `tests/crew-navigation.test.mjs` / `error-fix-document`

### ERR-2026-11-13-04 - Superstructure Ocean Wave Clipping & Water Query Isolation

- Date (Europe/Berlin): 2026-11-13
- Area: Ocean Shader Clipping, Superstructure Water Isolation
- Status: Resolved
- Symptom: (1) Ocean waves visibly clipped and rendered inside the enclosed superstructure rooms (e.g., Engine Control Room at `y = 3.0`) through solid collision walls when the ship heeled or waves rose above `lp.y = 2.95`, and `waterAt` reported ocean water inside dry superstructure compartments; (2) the temporary `engineHole2` deck cutout and U-stair at `x = 4.6..7.6, z = -44.2..-39.8` obstructed the main deck in front of the superstructure entrance.
- Root cause: (1) The ocean fragment shader in `ocean.ts` only discarded fragments inside the lower hull (`lp.y < 2.95`), leaving the superstructure volume (`lp.y >= 2.95 && lp.y < 15.6`, `abs(lp.x) < 8.85`, `lp.z` in `-65.7..-44.3`) unclipped, while `waterAt` in `game.ts` only checked `this.ship.compartments` (`y <= 2.95`) before falling back to `this.ocean.height(...)`; (2) `engineHole2` had been placed directly on the open weather deck instead of routing via the aft Engine Control Room staircase (`engineHole`).
- Solution: Added a superstructure interior discard in `ocean.ts` (`lp.y >= 2.95 && lp.y < 15.6 && lp.z > -65.7 && lp.z < -44.3 && abs(lp.x) < 8.85`), guarded `waterAt` in `game.ts` to return `-Infinity` inside intact superstructure when `sinkDepth < 14`, removed `engineHole2` and its deck railings from `shipBuilder.ts`, and updated `computeDeckWaypoint()` in `crew.ts` to route down into the Engine Room via the Main Entrance and aft `engineHole` U-stair.
- Verification: `npx tsc --noEmit` (root & sonnet), `npm test`, `npm run build`, and `npm run docs:check` executed after final edit.
- Prevention: Ensure both visual ocean shader cutouts and physical `waterAt` queries cover all enclosed ship volumes above `y = 2.95` as well as lower hull compartments, and never cut ad-hoc stairwells into the open weather deck outside established superstructure/hold access shafts.
- Related files / skills: `detailed-3d-sinking-freighter-game_sonnet/src/game/ocean.ts`, `game.ts`, `shipBuilder.ts`, `crew.ts` / `error-fix-document`

### ERR-2026-11-13-03 - Grounded Crew Routing, Airborne Fall/Swim Animations, Engine Room Staircase, Laser Debris & Battleship Sticky TNT

- Date (Europe/Berlin): 2026-11-13
- Area: Crew Physics & Multi-Deck Navigation, Orbital Laser Debris, Freighter Stairs, TNT Physics
- Status: Resolved
- Symptom: (1) Crew climbed exterior walls into mid-air toward bridge windows instead of using doors and interior stairs, and lacked airborne fall/swim animations; (2) Engine Room only had the aft Control Room staircase; (3) Orbital Laser section destruction left crew trying to repair obliterated sections without dropping floating crates; (4) thrown TNT passed through Battleship hulls instead of sticking as physics bodies.
- Root cause: (1) `stepCrew()` allowed `deploying_ladder` for high exterior targets (`target.y > 3.2`) and lacked interior stair waypoints, airborne fall tracking, and underwater swimming physics; (2) forward Engine Room deck slab lacked a second open stair opening; (3) `fireOrbitalDeathRay` did not clear destroyed compartment holes, detach crates, or nudge crew into the water; (4) `updateDyns()` only tested `this.ship.world` without checking Battleship OBBs.
- Solution: Added `computeDeckWaypoint()` (routing via Main Entrance + interior Superstructure stairs `LV = [3.0, 6.2, 9.4, 12.6]` and forward Engine Room stair), restricted `deploying_ladder` to lower holds (`target.y <= 3.2 && m.y < 2.0`), added airborne `falling` flail + underwater `swimming` physics & animations (`crew.ts`, `crewVisual.ts`), added second open Engine Room U-stair (`engineHole2` in `shipBuilder.ts`), detached up to 6 floating crates & cleared destroyed breaches on Orbital Laser section destruction, and added Battleship OBB sticking (`attachedBs`, `MAX_DYNS = 24`) + `260` HP detonation damage in `game.ts`.
- Verification: `npx tsc --noEmit` (root & sonnet), `npm test`, `npm run build`, and `npm run docs:check` executed after final edit.
- Prevention: Never allow portable-ladder mid-air climbs above `y = 3.2`; route multi-deck crew via interior stair waypoints and test dynamic props (`dyns`) against all active vessel OBBs.
- Related files / skills: `detailed-3d-sinking-freighter-game_sonnet/src/game/crew.ts`, `crewVisual.ts`, `stormworksSupervisor.ts`, `shipBuilder.ts`, `game.ts` / `error-fix-document`

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
