---
name: skill-index
description: >-
  Use as the first stop before adding, editing, renaming, removing, or
  debugging any skill in this repository, and whenever a skill command, update
  date, documentation path, or tool inventory must be checked. Reads the
  canonical skill map, enforces the Europe/Berlin date rule, records errors and
  solutions, and runs the documentation and tooling checks before delivery.
license: MIT
metadata:
  category: governance
  project: detailed-3d-sinking-freighter-game
  last_updated: 2026-11-12
---

# Skill Index and Documentation Steward

This is the main skill for skill maintenance. It keeps the map, the dates, the
documentation structure, and the verification gate in one place so a later
session does not have to rediscover them.

Read `docs/SKILLS.md` first. It is the canonical index of skill names, paths,
Account copies, web commands, and update dates. This file explains how to use
that index without drifting from it.

## Source hierarchy

1. Project skills: `.agents/skills/<name>/SKILL.md`. These are the canonical
   instructions for local CLI/Desktop and local executions.
2. Account skills: **Settings -> Skills** in Freebuff. These are required for
   the web Cloud client, which does not read `.agents/skills/`.
3. Documentation: `README.md`, `AGENTS.md`, `CI_DEPLOYMENT.md`,
   `docs/SKILLS.md`, `docs/AGENT_TOOLS.md`, and `docs/ERRORS_AND_FIXES.md`.

The same name must refer to the same instructions in both registries. Update
the project file first, then save the Account copy. Never create an alias or a
second name just to make a picker search return more rows.

## The two creative skills

Both are now full project skills and also have Account copies for the web
client. The project files are canonical locally:

- `.agents/skills/brainstorming/SKILL.md`
- `.agents/skills/skill-creator/SKILL.md`

`/brainstorming` is for finding out what to build before building it. Read the
repository and the existing docs first. Choose discovery or convergence, ask
only questions whose answers change the work, generate real alternatives, and
close with a decision and one next step. If the user has already given a
detailed mission and asked for implementation, state the material assumptions in
the delivery evidence and proceed; do not reopen settled decisions.

`/skill-creator` is for writing or revising a skill. Follow this sequence:

1. Choose a lowercase hyphenated name and create
   `.agents/skills/<name>/SKILL.md`.
2. Write a description that states both what the skill does and when it must
   trigger, including likely user phrases.
3. Keep the body actionable and under about 500 lines. Move large references
   into `references/`.
4. Add `metadata.last_updated: YYYY-MM-DD`.
5. Add the name and matching date to the table in `docs/SKILLS.md`, and add it
   to `REQUIRED_SKILLS` in both `tools/ci_check.py` and
   `tools/check_skill_docs.py` when it is mandatory.
6. Save the complete procedure as an Account skill if the web client must use
   it. The project file stays canonical.
7. Run `npm run docs:check`, the typechecks, the tests, the builds, and
   `npx skills list`.
8. Push a feature branch with the branch explicit and verify the exact-SHA CI
   run before merging.

The full upstream `skill-creator` evaluation viewer is optional in this
headless Cloud environment. Use focused prompts and inspect the resulting
files; record any check that was not run.

## Date rule

The maintenance date is the German calendar date:

```bash
TZ=Europe/Berlin date +%F
```

Check the date shown by the current Freebuff web session as a visual
cross-check. If they disagree, stop and record the discrepancy. Store dates as
`YYYY-MM-DD`. Update the skill frontmatter and every row in `docs/SKILLS.md` in
the same change. A date is evidence of a review, not a decorative label.

## Documentation structure

| File | Purpose |
| :--- | :--- |
| `README.md` | User-facing behavior, controls, setup, live links, command table |
| `AGENTS.md` | Freebuff-agent-only rules and gates |
| `CI_DEPLOYMENT.md` | Exact evidence: commands, hashes, run IDs, Pages, limits |
| `docs/SKILLS.md` | Canonical skill map, dates, documentation map, update protocol |
| `docs/AGENT_TOOLS.md` | Current English tool inventory and CodeGraph commands |
| `docs/ERRORS_AND_FIXES.md` | Mandatory ledger of errors, causes, solutions, proof |
| `.agent/rules/LEARNING.md` | Historical root causes and reusable lessons |
| `RESPONSIVE_UI.md` | Viewport measurements and browser evidence |
| `.agents/skills/*/SKILL.md` | Loadable skill instructions |

Current-state facts go in current-state files. Historical results stay in
`CI_DEPLOYMENT.md` with their date and run ID. Link rather than duplicate.

## Error ledger

`docs/ERRORS_AND_FIXES.md` is mandatory. Before a fix is considered complete,
add or update an entry with:

- the date in Europe/Berlin;
- the observable symptom and the command or URL that showed it;
- the root cause, not only the symptom;
- the complete solution and fallback;
- the verification command and result;
- a prevention step and related skill.

`error-fix-document` owns the repair sequence; this skill owns the index and
date consistency.

## Tools and CodeGraph

Read `docs/AGENT_TOOLS.md` before relying on a tool that may have changed. The
live Freebuff tool list is authoritative; update the inventory in the same
branch when the surface changes.

CodeGraph is installed as `@astudioplus/codegraph-mcp`. Always invoke it through
the repository script:

```bash
npm run docs:check
```

The script runs the MCP server in one-shot, graph-only mode
(`codegraph_pr_context`), then validates required files, skill names, dates,
index rows, and documentation changes. `--no-codegraph` is for offline
diagnosis only and never counts as a full docs gate.

## Update protocol

1. Read `docs/SKILLS.md`, `AGENTS.md`, and the target `SKILL.md`.
2. Run the date command and note the branch.
3. Edit the project skill.
4. Update `metadata.last_updated` and the index row.
5. Update `docs/AGENT_TOOLS.md` when a tool or command changed.
6. Add an error-ledger entry when fixing an incident.
7. Update `README.md` and `AGENTS.md` when the command surface or a durable
   rule changed.
8. Save the Account copy for web availability.
9. Run `npm run docs:check`, `npm test`, both typechecks, and both builds.
10. Push, verify exact-SHA CI, merge, and verify main CI and Pages.

## Stop conditions

Do not merge when any of these is true:

- a project skill is missing from `docs/SKILLS.md` or has no update date;
- the project and Account copies have different instructions;
- `docs/AGENT_TOOLS.md` names a command that no longer exists;
- `docs/ERRORS_AND_FIXES.md` has no entry for a fixed incident;
- `npm run docs:check` fails, or CodeGraph is unavailable;
- the exact-SHA CI, main CI, or Pages run is not successful.

Report the missing mechanism or the exact user-only click path instead of
claiming a pass.
