# AGENTS.md - Maritime Freighter Simulation DOX Root

## Scope & Project Overview
- **Project Name:** detailed-3d-sinking-freighter-game
- **Engine/Stack:** Vite, React 19, Three.js 0.187, Tailwind CSS 4, TypeScript 5.9
- **Core Simulation Components:**
  - `src/game/CargoShipBuilder.ts`: Procedural 3D cargo ship geometry, compartments, collision boxes, stairs, doors, breach nodes.
  - `src/components/MaritimeViewport3D.tsx`: Three.js rendering viewport, player movement, collision resolution, hydrostatic flooding simulation, TNT explosion physics, camera systems.
  - `src/components/NavalHudOverlay.tsx`: HUD, damage control schematic, interaction prompts, weapon bar, telemetry.
  - `src/audio/SoundEngine.ts`: Web Audio API procedural sound effects for hull creaks, explosions, water rush, alarms.

## Subtree Governance
- **Code Language:** English (identifiers, comments, docs, commit messages).
- **Quality Standard:** 100% complete implementations; strictly NO placeholders, NO empty stubs, NO `// TODO` markers.

## Verification & Delivery
- `npm test` runs the physics suite, the browser-guard regression suite and the Python integrity checks; CI invokes the same command.
- Browser APIs that can throw or reject (pointer capture, fullscreen) must go through `src/lib/browserGuards.ts` and have regression coverage in `tests/`.
- Validate `.github/workflows/*.yml` with Python (parse, duplicate keys, required steps) before pushing.
- Work on a feature branch; merge only after GitHub CI is green. A feature-branch push must create an Actions run for the exact commit; verify that run before merging, not just the local checks.
- Keep tests and documentation in English and update both when behavior changes.
- Project skills live in `.claude/skills/` and encode the mandatory error-fix, CI-audit and documentation workflows. Freebuff also discovers `.agents/skills/`; each skill uses YAML frontmatter, and `tools/ci_check.py` checks presence, names, frontmatter fields, body length and common non-English markers.
- **Physics Fidelity:**
  - Hydrodynamic multi-compartment water simulation with pressure head calculation ($Q = C_d A \sqrt{2g \Delta h}$).
  - Realistic localized explosive damage preventing non-keel detonations from snapping the ship.
  - Multi-deck downflooding through stairwells and open doors.
  - Clear stairwell clearances with collision geometry strictly avoiding machinery.
