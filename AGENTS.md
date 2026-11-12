# AGENTS.md - Maritime Freighter Simulation DOX Root

> **Scope: Freebuff AI agent only.** This file is the operating rulebook for
> the Freebuff AI agent in this repository. It is not user-facing product
> documentation. Update it whenever a durable rule, verification gate, tool,
> or skill workflow changes. Last updated: 2026-11-12 (Europe/Berlin).

## Scope & Project Overview
- **Project Name:** detailed-3d-sinking-freighter-game
- **Engine/Stack:** Vite, React 19, Three.js 0.187, Tailwind CSS 4, TypeScript 5.9
- **Core Simulation Components:**
  - `src/game/CargoShipBuilder.ts`: Procedural 3D cargo ship geometry, compartments, collision boxes, stairs, doors, breach nodes.
  - `src/components/MaritimeViewport3D.tsx`: Three.js rendering viewport, player movement, collision resolution, hydrostatic flooding simulation, TNT explosion physics, camera systems.
  - `src/components/NavalHudOverlay.tsx`: HUD, damage control schematic, interaction prompts, weapon bar, telemetry.
  - `src/audio/SoundEngine.ts`: Web Audio API procedural sound effects for hull creaks, explosions, water rush, alarms.

## Subtree Governance
- **Primary engine:** `detailed-3d-sinking-freighter-game_sonnet/` is the main game engine; the root `vite.config.ts` builds it. Do not alter the equations in its `src/game/shipSim.ts` or `src/game/physics.ts`. The former root `src/` (Maritime Viewport edition) is legacy.
- **Door security:** `src/game/doorSecurity.ts` (safety interlock, confirmation, terminal log) is pure and read-only toward the simulation; it is covered by `tests/door-security.test.mjs`.
- **Code Language:** English (identifiers, comments, docs, commit messages).
- **Quality Standard:** 100% complete implementations; strictly NO placeholders, NO empty stubs, NO `// TODO` markers.

## Verification & Delivery
- `npm test` runs the physics suite, the browser-guard regression suite and the Python integrity checks; CI invokes the same command.
- Browser APIs that can throw or reject (pointer capture, fullscreen) must go through `src/lib/browserGuards.ts` and have regression coverage in `tests/`.
- Validate `.github/workflows/*.yml` with Python (parse, duplicate keys, required steps) before pushing.
- Work on a feature branch; merge only after GitHub CI is green. A feature-branch push must create an Actions run for the exact commit; verify that run before merging, not just the local checks.
- Always pass the target `branch` to `cloud_git push`. The tool defaults to the chat's starting branch (`main`), not necessarily the branch currently checked out; an omitted argument can update `main` before the feature-branch gate.
- Keep tests and documentation in English and update both when behavior changes.
- Project skills live in `.agents/skills/`, Freebuff's native project path and highest-priority discovery location. Freebuff also supports `.claude/skills/` for Claude Code compatibility. Each skill uses YAML frontmatter with `metadata.last_updated`, and `tools/ci_check.py` checks presence, names, dates, index rows, body length and common non-English markers. The seven project skills cover the mandatory error-ledger, CI-audit, documentation, discovery, main-index, brainstorming and skill-authoring workflows. The canonical map is `docs/SKILLS.md`; read it before changing any skill. Use `npm run docs:check` (CodeGraph MCP through `tools/check_skill_docs.py`) as the documentation gate. In local sessions, invoke a skill as `/skill:<name>` (for example `/skill:error-fix-document`); a bare `/skill-name` is not a local command. **The web Cloud client does not read `.agents/skills/`**: it loads Account skills from Settings → Skills and Cloud project skills from Settings → Project settings. `.agents/skills/` applies to local CLI/Desktop and local executions. If a workflow must be available in web chats, register it in the matching web registry as well; account-wide only when it should follow the user into every project. The web picker inserts `/<name>`; the local CLI/Desktop form is `/skill:<name>`. The web picker matches with `name.includes(query)`, not a prefix or a namespace: `/skill` is the search text "skill" and hides names that do not contain it, while a bare `/` lists the account skills. `/skills` is the Settings → Skills command, not a skill list. Verify the exact typed name, not just the substring `/skill`.
- **Physics Fidelity:**
  - Hydrodynamic multi-compartment water simulation with pressure head calculation ($Q = C_d A \sqrt{2g \Delta h}$).
  - Realistic localized explosive damage preventing non-keel detonations from snapping the ship.
  - Multi-deck downflooding through stairwells and open doors.
  - Clear stairwell clearances with collision geometry strictly avoiding machinery.

## Skill, Documentation and Tool Governance

- This file is for the Freebuff AI agent only. Keep it current; do not treat it
  as a place for user-facing marketing copy.
- `docs/SKILLS.md` is the canonical skill index: names, project paths, Account
  copies, web commands, update dates, documentation map, and update protocol.
- `docs/AGENT_TOOLS.md` is the current English tool inventory. Update it in the
  same branch when the available tools, commands, or dependencies change.
- `docs/ERRORS_AND_FIXES.md` is a mandatory ledger. Every error and its solution
  gets an entry before a fix is merged; `error-fix-document` owns the sequence.
- The maintenance date is `TZ=Europe/Berlin date +%F`; check the current
  Freebuff web session date as a cross-check and record disagreements.
- CodeGraph is installed as `@astudioplus/codegraph-mcp`. Always use it through
  `npm run docs:check` (one-shot graph-only `codegraph_pr_context`), never as an
  ad-hoc chat client. `--no-codegraph` is offline diagnosis only.
- Do not duplicate a skill under an alias to make a picker search return more
  rows. Update the project copy and the Account copy, then verify the exact
  command name.
- Use `/brainstorming` before ambiguous creative work. The project copy is
  `.agents/skills/brainstorming/SKILL.md` and is canonical locally; the Account
  copy serves the web client. This repository has already agreed the product
  direction; do not reopen it. Read the existing code and docs first, make the
  non-trivial calls as stated assumptions, and proceed when a detailed
  implementation mission is already approved.
- Use `/skill-creator` for skill edits. The project copy is
  `.agents/skills/skill-creator/SKILL.md` and is canonical locally. Follow its
  sequence: project file first, update the Europe/Berlin date and index row,
  Account copy, `npm run docs:check`, full local gate, exact-SHA CI, merge,
  Pages.
