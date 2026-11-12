# 🚢 Detailed 3D Sinking Freighter Game

An advanced interactive maritime simulation built with **Vite**, **React 19**, **Three.js**, and **TypeScript**. Experience realistic multi-compartment hydrostatic flooding, structural beam bending stresses, localized explosive damage, and damage control operations on an ocean-going cargo freighter.

**Live editions:** [Root game](https://jonimoni09.github.io/detailed-3d-sinking-freighter-game/) · [Sonnet edition](https://jonimoni09.github.io/detailed-3d-sinking-freighter-game/sonnet/)

---

## 🌊 Core Simulation Features

### 1. Hydrostatic Inflow & Torricelli Flow
- Inflow velocity dynamically scales with hydrostatic pressure head following Torricelli's Law:
  $$v = C_d \sqrt{2g \cdot \Delta h}$$
  where $\Delta h = y_{\text{sea}} - y_{\text{breach}}$ and $C_d$ is the discharge coefficient.
- Deep underwater hull breaches flood compartments rapidly, whereas punctures near the waterline produce subdued spray until submerged.

### 2. Multi-Deck Downflooding & Stairway Cascades
- Multi-compartment interior: Fore Hold, Mid Hold, Engine Room, Aft Steering Flat, and Superstructure Decks.
- When cargo holds exceed **72% capacity**, excess water spills through stairwells and open passageways, cascading dynamically across the main deck (`mainDeckWaterMesh`).

### 3. Contact-Only Localized Hull Damage
- Upper decks and superstructures absorb blasts; detonations on the main deck or wheelhouse do **not** trigger premature keel fractures.
- Underwater breaching is strictly limited to direct contact detonations against the bottom hull ($Y < 0.8\,\text{m}$, distance $< 3.8\,\text{m}$) or outer shell plating ($|X| > 7.5\,\text{m}$).

### 4. Floating Sandbox Bending Moments & Keel Snapping
- Implements physical beam bending calculations:
  $$M_{\text{bending}} = \text{Load}_{\text{mid}} - 0.6 \cdot (\text{Load}_{\text{fore}} + \text{Load}_{\text{aft}})$$
- Asymmetrically flooded holds create sagging or hogging stresses. Exceeding structural yield strain triggers catastrophic hull deformation and keel failure.

### 5. Watertight Door Dogging & Damage Control
- Hold **`[L]`** for 0.85s to dog down watertight bulkheads and doors.
- Visual circular SVG progress indicator around the crosshair displays dogging progress.
- Fully dogged doors provide a **100% watertight seal** ($0.0$ water transfer coefficient), allowing compartmental damage control to save the vessel.

### 6. Engine Room Stairwell Clearance
- Fully accessible mid-aft stairwell (`stair_mid_hold`) leading to the lower engine spaces.
- Engine block machinery relocated to $Z = 17.5\,\text{m}$, leaving the stair landing completely clear of collision boundaries.

### 7. Real-Time Rendering & Performance
- Smooth 60+ FPS rendering on desktop and mobile platforms.
- Ocean mesh deformation optimized by eliminating CPU-bound vertex normal recalculations per frame.

---

## 🎮 Controls

| Key / Input | Action |
| :--- | :--- |
| **`W`, `A`, `S`, `D`** | Move Player |
| **`Mouse`** | Look / Aim (Pointer Lock) |
| **`Space`** | Jump / Swim Upward |
| **`Shift`** | Sprint |
| **`E`** | Toggle Door Open / Close |
| **`Hold L` (0.85s)** | Dog Down / Lock Watertight Door |
| **`1` - `5`** | Select Weapon / Damage Control Tool |
| **`Left Mouse Click`**| Use Selected Tool / Place TNT |
| **`Right Mouse Click`**| Detonate Remote Charges |
| **`C`** | Toggle Camera Mode (First Person / Free Orbit) |

The HUD top bar also has a fullscreen toggle. It uses the real Fullscreen API;
if the browser blocks a request (for example while the tab is in the
background), the game shows a status message instead of throwing. Both editions
share the guarded pointer-capture and fullscreen helpers and include regression
tests for them.

---

## 📁 Repository Structure

```text
├── .agent/                             # Antigravity Rules, Workflows & LEARNING.md
├── .agents/skills/                     # Project skills (governance, quality, CI, docs, discovery)
├── docs/                               # Agent skill index, tool inventory, error ledger
├── CI_DEPLOYMENT.md                    # CI & GitHub Pages verification record
├── RESPONSIVE_UI.md                    # Responsive HUD & landscape layout record
├── detailed-3d-sinking-freighter-game_sonnet/ # Alternative / Sub-workspace Edition
├── src/
│   ├── audio/
│   │   └── SoundEngine.ts              # Web Audio API procedural sound engine
│   ├── components/
│   │   ├── MaritimeViewport3D.tsx      # Main Three.js simulation viewport & physics loop
│   │   └── NavalHudOverlay.tsx         # HUD, Damage Control schematic, SVG lock ring
│   ├── game/
│   │   └── CargoShipBuilder.ts         # Procedural 3D vessel geometry & collision volumes
│   ├── types/
│   │   └── game.ts                     # TypeScript interfaces & state definitions
│   ├── App.tsx                         # Primary React application container
│   └── main.tsx                        # Entry point
├── index.html
├── package.json
├── tsconfig.json
└── vite.config.ts
```

---

## 🛠️ Getting Started

### Prerequisites
- Node.js 22.12+ (Vite 7; Node 20.19.x also works — verified on Node.js 26)
- npm or pnpm

### Installation
```bash
# Clone the repository
git clone https://github.com/JONIMONI09/detailed-3d-sinking-freighter-game.git

# Enter project directory
cd detailed-3d-sinking-freighter-game

# Install dependencies
npm install

# Start local development server
npm run dev
```

### Production Build
```bash
npm run build
```

---

## 📱 Responsive Layout

Viewports shorter than 560 px (phone landscape) switch the HUD into a compact
mode: the telemetry panel starts collapsed and scrolls internally, the top bar
shows icon-only actions, the thumbstick shrinks to 88 px and the interaction
popup is capped and scrollable. The weapon dock keeps all five slots visible
without a scrollbar.

Narrow viewports (< 640 px width) also collapse the telemetry panel, the event
ticker is capped at `92vw`, and the HUD respects `env(safe-area-inset-*)` with
`viewport-fit=cover`. The touch look zone sits below the HUD so every top-bar
button stays tappable.

All player-facing text is English (HUD, weapon bar, prompts, settings, blackbox
analyzer, crash screen); German survives only in internal code comments. The
Sonnet edition at `/sonnet/` is fully English as well, with unchanged ship
geometry and physics; details are in [CI_DEPLOYMENT.md](CI_DEPLOYMENT.md) §12.

Layout harness (dev server): `/tools/hud-preview.html?w=844&h=390`.
Details and measurements: [RESPONSIVE_UI.md](RESPONSIVE_UI.md).

### Agent skills

Seven project skills under `.agents/skills/` encode the recurring workflow:
reproduce, fix the root cause, add a fallback and regression tests, update the
English documentation, verify the feature branch through CI, audit skill
discovery, keep the skill map current, and run the authoring checks. `skill-index`
is the main index; `brainstorming` and `skill-creator` are now full project
skills with their own procedures. `docs/SKILLS.md` is the canonical date and
ownership table. `.agents/skills/`
is Freebuff's native project discovery path; `.claude/skills/` is also supported
for Claude Code compatibility. These skills follow the official
[Freebuff skills format](https://docs.freebuff.page/working-with-the-agent/#skills).

In local CLI/Desktop sessions, invoke a skill as `/skill:<name>`. In the web
client, choose the skill from the `/` picker; the picker inserts `/<name>`.
The same registry name is used in both clients:

| Command in web picker | Local CLI/Desktop | Source |
| :--- | :--- | :--- |
| `/brainstorming` | `/skill:brainstorming` | Project + Account skill |
| `/find-skills` | `/skill:find-skills` | Account skill |
| `/skill-creator` | `/skill:skill-creator` | Project + Account skill |
| `/ci-workflow-audit` | `/skill:ci-workflow-audit` | Project + Account skill |
| `/documentation-maintenance` | `/skill:documentation-maintenance` | Project + Account skill |
| `/error-fix-document` | `/skill:error-fix-document` | Project + Account skill |
| `/skill-discovery-audit` | `/skill:skill-discovery-audit` | Project + Account skill |
| `/skill-index` | `/skill:skill-index` | Project + Account skill |

Locally, a bare `/brainstorming` or `/find-skills` is not a Freebuff command;
the `/skill:` prefix is required. Local discovery happens at session start, so
reload the chat (or start a new one) after adding, moving, or renaming a skill.

In the web picker, the query is a **substring match**, not a namespace. The
composer filters account skills with `name.includes(query)`. That means
`/skill` is only the search text "skill"; it shows the names that contain that
text (`/find-skills`, `/skill-creator`, `/skill-discovery-audit`) plus the
`/skills` command that opens Settings → Skills. It does not show
`/brainstorming` or the three workflows whose names do not contain "skill".
This is expected picker behavior, not a missing skill.

| Typed in the web composer | Skill rows it shows |
| :--- | :--- |
| `/` (bare slash) | all seven commands |
| `/brain` | `/brainstorming` |
| `/find` | `/find-skills` |
| `/skill-creator` | `/skill-creator` |
| `/ci` | `/ci-workflow-audit` |
| `/documentation` | `/documentation-maintenance` |
| `/error` | `/error-fix-document` |
| `/skill-discovery` | `/skill-discovery-audit` |

Type `/` alone or the exact command name. The old instruction to type `/skill`
for every skill was wrong and is removed; `/skill` hides most of these names.
See [CI_DEPLOYMENT.md](CI_DEPLOYMENT.md) §22 for the bundle lines and the
two consecutive registry reads.

An earlier `@codebuff/sdk@0.10.7` `loadSkills()` run proved the original four
project skills loaded from `.agents/skills/` with their exact `/skill:<name>`
handles. The repository now has seven project skills; `tools/ci_check.py`
checks all seven, and `npx skills list` is the current local loader check. That
loader proof covers **local CLI/Desktop and local executions**, not the web Cloud
client.

The web Cloud client does not read a repository's `.agents/skills/` directory.
It loads **Account skills** from **Settings → Skills** and **Cloud project
skills** from **Settings → Project settings**. Account skills are available in
every project; Cloud project skills are scoped to one project. The project
workflows and the main index also have enabled Account copies, so the account
copy is what a web chat can resolve. The registry has eleven entries: the eight
commands above plus `web-design-guidelines`, `performance`, and
`github-actions-docs`. Two consecutive reads on 2026-11-12 returned every entry
as enabled; the registry is not the reason a name is missing from `/skill`.
The web picker inserts `/<name>`; the local CLI/Desktop form is
`/skill:<name>`. The browser pixels are the remaining UI-only check. See
[CI_DEPLOYMENT.md](CI_DEPLOYMENT.md) §19, §20, §22 and §23.

- `skill-index` — main skill map, Europe/Berlin dates, documentation structure.
- `brainstorming` — divergence/convergence procedure ending in a decided next step.
- `skill-creator` — frontmatter, index, Account-copy, and verification checklist.
- `error-fix-document` — bug, incident, and mandatory error-ledger workflow.
- `ci-workflow-audit` — YAML validation, exact-SHA CI gate and Pages checks.
- `documentation-maintenance` — stale-claim scan and evidence recording.
- `skill-discovery-audit` — native path, YAML, client-specific invocation and reload checks.

`tools/ci_check.py` checks their presence, names, frontmatter dates, index
rows, body length, and absence of German umlauts or unfinished markers.
`npm run docs:check` runs the installed CodeGraph MCP server through
`tools/check_skill_docs.py` and validates the documentation structure. Full
YAML syntax is parsed separately during delivery.

### Agent documentation map

- [docs/SKILLS.md](docs/SKILLS.md) — canonical skill index, update protocol, documentation map.
- [docs/AGENT_TOOLS.md](docs/AGENT_TOOLS.md) — current English tool inventory and CodeGraph commands.
- [docs/ERRORS_AND_FIXES.md](docs/ERRORS_AND_FIXES.md) — mandatory error, cause, solution, and prevention ledger.
- [AGENTS.md](AGENTS.md) — Freebuff-AI-agent-only operating rules; last updated 2026-11-12.
- [.agent/rules/LEARNING.md](.agent/rules/LEARNING.md) — historical root causes and lessons.

---

## 🚀 CI & GitHub Pages Deployment

Both editions are verified on every feature-branch push and on every push to
`main`. `npm test` runs 5 physics tests, 14 browser-guard tests and 10 Python
integrity checks; CI invokes the same command and adds the documentation gate:

```bash
npm ci
npm run typecheck
npx tsc -p detailed-3d-sinking-freighter-game_sonnet/tsconfig.json --noEmit
npm test
npm run docs:check
npm run build
npx vite build detailed-3d-sinking-freighter-game_sonnet --outDir ../dist/sonnet --base ./
```

The documentation gate uses `@astudioplus/codegraph-mcp` in one-shot graph-only
mode. The package is a development dependency; `npm audit --omit=dev` remains
0, while the full development audit may report advisories in the Vite/esbuild
toolchain. Do not run `npm audit fix --force` as part of a docs change.

Two independent targets are built and type-checked: the root app (`package.json`,
`tsconfig.json`, `vite.config.ts`) and the Sonnet sub-site
(`detailed-3d-sinking-freighter-game_sonnet/` with its own package.json, tsconfig
and Vite config).

Before installing, both workflow files are parsed and asserted with Python
(`yaml.SafeLoader` with duplicate-key detection: triggers, jobs, Node 22,
`npm ci`, both typechecks and builds, Pages permissions, `enablement: true`,
artifact paths, no `--force`), and `python tools/ci_check.py` verifies the
workflow and physics contracts.

Merge a feature branch only after its Actions run is green. The root app is
published as a single-file bundle (`dist/index.html`), the Sonnet edition as a
sub-site under `/sonnet/`. The deploy workflow requires
**Settings → Pages → Source: GitHub Actions**. The repository is public and
Pages deployments succeed; if it is ever made private, Pages requires a plan
that includes it.

Full verification record, measured results and known limitations:
[CI_DEPLOYMENT.md](CI_DEPLOYMENT.md).

---

## 📜 License
MIT License. Built for realistic maritime simulation and procedural vessel physics research.
