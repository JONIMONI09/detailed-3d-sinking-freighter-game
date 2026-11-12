# Skill Index and Documentation Steward

Last reviewed: 2026-11-12 (Europe/Berlin)
Owner: Freebuff AI agent working in this repository
Canonical project path: `.agents/skills/`
Canonical web source: Freebuff Account skills in **Settings -> Skills**

This is the first file to read when a skill is added, changed, renamed, removed,
or reported as missing. It answers four questions:

1. Which skill exists, and where is its canonical copy?
2. When was it last reviewed or changed?
3. How is this repository's documentation organized?
4. Which checks prove that the documentation and the skill registry agree?

The prose in this file is the source of truth for dates and ownership. The
loadable instructions remain in each `SKILL.md`.

## Skill map

Local invocation uses `/skill:<name>`. The web composer inserts `/<name>`.
`/skill` is a substring search, not a namespace; use a bare `/` to list all
account skills or type the exact name.

| Skill | Scope | Local path or registry | Web command | Last updated | Role |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `skill-index` | Project + Account | `.agents/skills/skill-index/SKILL.md`; Settings -> Skills | `/skill-index` | 2026-11-12 | Main index, dates, documentation structure, and update protocol |
| `error-fix-document` | Project + Account | `.agents/skills/error-fix-document/SKILL.md`; Settings -> Skills | `/error-fix-document` | 2026-11-12 | Mandatory error ledger, repair sequence, fallback, regression tests |
| `documentation-maintenance` | Project + Account | `.agents/skills/documentation-maintenance/SKILL.md`; Settings -> Skills | `/documentation-maintenance` | 2026-11-12 | Stale-claim scan and evidence recording |
| `ci-workflow-audit` | Project + Account | `.agents/skills/ci-workflow-audit/SKILL.md`; Settings -> Skills | `/ci-workflow-audit` | 2026-11-12 | Workflow YAML, exact-SHA CI, Pages gate |
| `skill-discovery-audit` | Project + Account | `.agents/skills/skill-discovery-audit/SKILL.md`; Settings -> Skills | `/skill-discovery-audit` | 2026-11-12 | Discovery paths, client invocation, reload rules |
| `brainstorming` | Project + Account | `.agents/skills/brainstorming/SKILL.md`; Settings -> Skills | `/brainstorming` | 2026-11-12 | Divergence/convergence procedure ending in a decided next step |
| `find-skills` | Account | Settings -> Skills | `/find-skills` | 2026-11-12 reviewed | Public skill-catalog search |
| `skill-creator` | Project + Account | `.agents/skills/skill-creator/SKILL.md`; Settings -> Skills | `/skill-creator` | 2026-11-12 | Authoring checklist, registration map, and verification gate |
| `web-design-guidelines` | Account | Settings -> Skills | `/web-design-guidelines` | 2026-11-12 reviewed | UI review heuristics |
| `performance` | Account | Settings -> Skills | `/performance` | 2026-11-12 reviewed | Web performance guidance |
| `github-actions-docs` | Account | Settings -> Skills | `/github-actions-docs` | 2026-11-12 reviewed | Official GitHub Actions guidance |

The seven project skills also have Account copies because the web Cloud client
does not read `.agents/skills/`. Update the project file first, then save the
same procedure to the Account copy. The project file is canonical; do not
maintain two different versions with the same name. Every
`.agents/skills/*/SKILL.md` must have a row in this table with the same
`metadata.last_updated` date, and every path in this table must exist.

## How to use the two creative skills

### `/brainstorming`

Use it before creative or ambiguous work: a feature, a layout, a new workflow,
or a change whose success criteria are not agreed. The project procedure is
`.agents/skills/brainstorming/SKILL.md`; the Account copy mirrors it for the web
client.

The procedure is opinionated: read the repository first, choose discovery or
convergence, generate two or three genuinely different options, recommend one,
ask at most one build-changing question, and close with a decision, assumptions,
non-goals, and one executable next action. When the user has already supplied a
detailed mission and wants implementation, record the assumptions in the
delivery notes and move forward; do not reopen decisions already made.

Record a design decision in the same branch as the implementation when the
change is project-sized. The relevant evidence belongs in
`CI_DEPLOYMENT.md`; the durable rule belongs in `AGENTS.md`.

### `/skill-creator`

Use it to create or revise a skill. The complete authoring procedure is
`.agents/skills/skill-creator/SKILL.md`; the Account copy mirrors it for the web
client. For this repository:

1. Put the canonical skill in `.agents/skills/<name>/SKILL.md`.
2. Use a lowercase hyphenated name; it must match the directory.
3. Give the description both the what and the when, including likely trigger
   words.
4. Keep the body actionable and under about 500 lines.
5. Add `metadata.last_updated: YYYY-MM-DD` from
   `TZ=Europe/Berlin date +%F`.
6. Add the row to this file with the same date, and add the name to both
   `tools/ci_check.py` and `tools/check_skill_docs.py` when it is mandatory.
7. Save the same procedure as an Account skill for the web client.
8. Run `npm run docs:check` and the full local gate.
9. Do not create a second skill with the same name to fix a client search.

The upstream `skill-creator` evaluation workflow is optional in this headless
Cloud environment. Use focused test prompts and inspect the resulting files;
record what was not run instead of claiming an eval viewer result.

## Documentation structure

| File | Audience | What belongs there |
| :--- | :--- | :--- |
| `README.md` | User and contributor | Product behavior, controls, setup, live links, skill command surface |
| `AGENTS.md` | Freebuff AI agent only | Durable operating rules, verification gates, tool and skill policy |
| `CI_DEPLOYMENT.md` | Maintainer and agent | Exact commands, exit codes, builds, hashes, Actions runs, Pages, limitations |
| `docs/SKILLS.md` | Freebuff AI agent | This index, update dates, skill ownership, documentation map |
| `docs/AGENT_TOOLS.md` | Freebuff AI agent | Current tool inventory and the rule for keeping it current |
| `docs/ERRORS_AND_FIXES.md` | Freebuff AI agent | Mandatory error ledger with symptom, cause, fix, proof, prevention |
| `.agent/rules/LEARNING.md` | Freebuff AI agent | Historical root causes and reusable lessons |
| `RESPONSIVE_UI.md` | Maintainer | Viewport measurements and layout evidence |
| `.agents/skills/*/SKILL.md` | Freebuff clients | Loadable instructions; not user documentation |

Rules for the structure:

- Current facts belong in the current-state file. Historical evidence stays in
  `CI_DEPLOYMENT.md` with its date and run ID.
- Link instead of copying a large section into several files.
- All repository documentation, identifiers, comments, and commit messages are
  English. German belongs only in chat replies to the user.
- Every skill or documentation change updates the relevant `Last updated` date
  and this table.
- Never put a secret, token, password, or private URL in documentation.

## Date rule

Use the German calendar date for this project's maintenance record:

```bash
TZ=Europe/Berlin date +%F
```

Check the date shown by the current Freebuff web session as a cross-check. If
the web session and the command disagree, stop and record the discrepancy; do
not silently choose one. Store dates as `YYYY-MM-DD`.

The user asked that the web date be checked on every skill maintenance pass.
The command is the reproducible source; the web session's date is the visual
confirmation.

## Mandatory update protocol

Run this sequence for every skill addition, edit, rename, or removal:

1. Read `AGENTS.md`, this file, and the target `SKILL.md`.
2. Get the Europe/Berlin date and note the current branch.
3. Edit the canonical project skill.
4. Update `metadata.last_updated` and the table above.
5. Update `docs/AGENT_TOOLS.md` if tool availability or commands changed.
6. Add or update an entry in `docs/ERRORS_AND_FIXES.md` if the work fixed an
   error, a failed check, or an incident.
7. Update `README.md` and `AGENTS.md` when the command surface or a durable rule
   changed.
8. Save the Account copy for every skill that must work in the web client.
9. Run:

```bash
npm run docs:check
npm test
npx tsc --noEmit
npx tsc -p detailed-3d-sinking-freighter-game_sonnet/tsconfig.json --noEmit
npx vite build
npx vite build detailed-3d-sinking-freighter-game_sonnet --outDir ../dist/sonnet --base ./
npx skills list
```

10. Push the feature branch and verify the exact-SHA CI run. Merge only after
    it succeeds, then verify main CI, Pages, and the live URLs.

## Error ledger

`docs/ERRORS_AND_FIXES.md` is mandatory, not advisory. A fix is not complete
until the ledger contains the symptom, root cause, solution, verification, and
a prevention step. `error-fix-document` owns the repair workflow; this index
owns the date and the consistency check.

## CodeGraph documentation check

`@astudioplus/codegraph-mcp` is installed as a development dependency. The
agent must not call it as an ad-hoc MCP client; it runs through
`tools/check_skill_docs.py`:

```bash
npm run docs:check
```

The script runs CodeGraph's one-shot MCP mode
(`codegraph_pr_context`, graph-only) and then validates that every required
skill, documentation file, date, and index row is present. It resolves the
base as `main`, `origin/main`, `master`, or `origin/master`; CI must check out
with `fetch-depth: 0` and fetch `origin/main` before the gate so the merge base
exists. A skill edit must be committed
together with this index, otherwise the change-coupling check fails when a
skill is edited alone. `--no-codegraph` exists only for offline diagnosis and
is not a valid pass for a docs delivery.
