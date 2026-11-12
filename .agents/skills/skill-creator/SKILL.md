---
name: skill-creator
description: >-
  Use when creating, revising, auditing, or registering a Freebuff skill in this
  repository. Produces a loadable SKILL.md with valid frontmatter and a current
  Europe/Berlin date, updates the canonical index, syncs the Account copy, and
  runs the documentation and CI gates.
license: MIT
metadata:
  category: quality
  project: detailed-3d-sinking-freighter-game
  last_updated: 2026-11-12
---

# Skill Creator

This skill is the repository's authoring and registration procedure. It is not
a generic prompt-writing guide. A new skill is not delivered until its file,
index row, Account copy, dates, and verification are consistent.

## When to use it

Use this skill when you:

- create a new project or Account skill;
- revise an existing `SKILL.md`;
- rename, move, or remove a skill;
- change a skill's invocation or scope;
- register a workflow for the local CLI/Desktop or the web Cloud client;
- audit why an existing skill is missing, stale, or shadowed.

For a one-line typo in a skill body, still check the date and index coupling.
For a new skill, follow every step below.

## Authoring sequence

### 1. Define the contract

Write four sentences before drafting:

1. What task does the skill make reliable?
2. What user phrases or situations must trigger it?
3. What concrete output or decision does it produce?
4. What is explicitly out of scope?

If the user already described the workflow, extract the answers from the
conversation first. Ask only about a missing answer that changes the procedure.
Do not ask the user to choose a file path, heading style, or validation command;
those are your calls under this repository's conventions.

### 2. Choose the name and scope

- Use lowercase ASCII letters, digits, and single hyphens.
- The directory name and `name` field must match exactly.
- Preserve an existing name when improving or moving a skill.
- A project skill lives in `.agents/skills/<name>/SKILL.md` and is canonical for
  local CLI/Desktop and local executions.
- Use an Account skill when the workflow must also work in the web Cloud client,
  because that client does not read `.agents/skills/`.
- Do not create an alias or a second name to make a search return more rows.
  Shadowing makes both discovery and maintenance less reliable.

### 3. Write valid frontmatter

Use this schema. Keep the `---` delimiters at the start and end of the block.

```yaml
---
name: skill-name
description: >-
  Use when [specific trigger situations]. Produces [concrete result] and
  [what it updates or verifies]. Include likely user phrases so the skill is
  selected when it is useful.
license: MIT
metadata:
  category: quality
  project: detailed-3d-sinking-freighter-game
  last_updated: YYYY-MM-DD
---
```

Rules:

- `name` must match the directory exactly.
- `description` is the trigger, not a summary of the body. State what the skill
  does and when to use it. Be direct about likely trigger situations without
  turning every sentence into a capitalised demand.
- `metadata.last_updated` is required in this repository. Use the current date in
  `YYYY-MM-DD`.
- Use `category` for the closest stable grouping: `quality`, `product`,
  `delivery`, `docs`, or `security`.
- Use the exact project slug above.
- Keep the file English. Do not introduce German umlauts, unfinished markers, or
  copied secrets.
- Do not add fields that no tool reads just to look complete.

### 4. Structure the body

Use a short, scannable shape:

```text
# Title
Purpose in two or three sentences
## When to use it
## Inputs to read first
## Procedure
## Output / report shape
## Failure handling
## Repository registration
## Verification
## Stop conditions
## Checklist
```

Make the procedure executable by another agent that has none of your context.
Prefer explaining why a step matters over a wall of capitalised MUSTs. Keep the
file under about 500 lines; move long reference material into `references/` and
link it from the body. Do not put a stub in the body with a pointer to an
external skill.

### 5. Apply the German-date rule

Run the real command from the repository root:

```bash
TZ=Europe/Berlin date +%F
```

Cross-check the date shown by the current Freebuff web session. If they differ,
stop and record the discrepancy in `docs/ERRORS_AND_FIXES.md`; do not silently
choose one. Use the same `YYYY-MM-DD` value in:

- `metadata.last_updated` of the skill;
- the skill's row in `docs/SKILLS.md`;
- the `Last reviewed:` line of `docs/SKILLS.md`, `docs/AGENT_TOOLS.md`, and
  `docs/ERRORS_AND_FIXES.md` when their content changed;
- the delivery record in `CI_DEPLOYMENT.md`.

A skill edit without a matching index date is an incomplete change.

### 6. Register it everywhere it must exist

Do these in order:

1. Create or edit `.agents/skills/<name>/SKILL.md`.
2. Add or update the row in `docs/SKILLS.md` with scope, canonical path, web
   command, `last_updated`, and role.
3. If the skill is mandatory for the repository, add its name to
   `REQUIRED_SKILLS` in both `tools/ci_check.py` and
   `tools/check_skill_docs.py`.
4. If the index or counts changed, update `README.md`.
5. If a durable rule, invocation, or delivery gate changed, update `AGENTS.md`.
6. If the skill changes the tool surface or a command, update
   `docs/AGENT_TOOLS.md`.
7. If the work fixed an incident, add an entry to
   `docs/ERRORS_AND_FIXES.md` with symptom, cause, fix, verification, and
   prevention.
8. Save the same procedure as an Account skill in **Settings -> Skills** for the
   web client. The project file remains canonical; do not let the two versions
   drift in name, trigger, date, or command surface.
9. If the skill is referenced from another skill, update that reference.

Use the Account copy only for web availability. Local sessions load the project
copy from `.agents/skills/`.

### 7. Test the skill

Choose two or three realistic prompts that should trigger the skill. Include one
near-miss that should not trigger it. Run the prompts with and without the skill
when the environment supports independent runs; otherwise run the focused
prompts yourself and record that limitation.

Check:

- the trigger description selects the skill for the intended task;
- the body is actionable without the conversation that created it;
- the output shape is concrete;
- the procedure does not depend on a tool, path, or command that does not exist;
- the skill does not claim that a check ran when it did not.

The upstream `skill-creator` evaluation viewer and benchmark loop are optional
in this headless Cloud repository. Do not invent eval results or claim a viewer
was opened if it was not. Add `evals/` only when the user explicitly wants a
repeatable benchmark, and keep it out of the required delivery gate.

### 8. Verify the repository

Run the real gates from the repository root:

```bash
npm run docs:check
npm test
npx tsc --noEmit
npx tsc -p detailed-3d-sinking-freighter-game_sonnet/tsconfig.json --noEmit
npm run build
npx vite build detailed-3d-sinking-freighter-game_sonnet --outDir ../dist/sonnet --base ./
npx skills list
```

`npm run docs:check` is the CodeGraph-backed documentation gate. It checks the
required files, skill names, dates, index paths, and the skill/index coupling.
`npm test` includes the Python integrity suite. The Sonnet build must use
`--outDir ../dist/sonnet --base ./` for the published sub-site; a plain
`npx vite build detailed-3d-sinking-freighter-game_sonnet` writes to the root
`dist` and is not the delivery artifact.

If `npx skills list` is unavailable, report that separately; do not substitute a
file listing for a loader result.

### 9. Deliver through the gate

1. Commit on a feature branch.
2. Push with the branch explicit: `cloud_git` must receive
   `operation=push` and `branch=<name>`. An omitted branch can update the chat's
   starting branch.
3. Wait for the exact-SHA CI run and require `completed/success`.
4. Merge by fast-forward.
5. Verify main CI and the Pages workflow.
6. Fetch the live root and `/sonnet/` URLs, require HTTP 200, and check the
   expected title and byte size.
7. Record the commit, run IDs, artifact sizes/hashes, and any limitation in
   `CI_DEPLOYMENT.md` and the error ledger.

## Report shape

```text
Skill:
Scope:
Canonical path:
Index date:
Account copy:
What changed:
Checks run:
Not run / limitations:
Next action:
```

## Failure handling

- **Missing skill in the web picker:** check the Account registry, the exact
  command, and the substring filter. Do not create an alias.
- **Missing skill in local sessions:** check `.agents/skills/`, YAML, name
  matching, and reload the session. Do not copy an Account skill over a project
  skill to make it appear.
- **Date mismatch:** stop, run the Europe/Berlin command, and fix the file and
  index together. Do not backdate to make a check pass.
- **CodeGraph base failure:** ensure `main` or `origin/main` exists and CI uses
  `fetch-depth: 0`; do not fall back to `--no-codegraph` for delivery.
- **Account save failure:** report the exact client error. Do not claim the web
  copy is updated when only the repository file changed.

## Stop conditions

Do not merge when:

- the skill file is missing, has invalid frontmatter, or has no current date;
- the index row or canonical path is missing;
- a required skill is absent from either Python gate;
- the project and Account copies disagree on name, trigger, or command surface;
- `npm run docs:check`, tests, typechecks, or builds fail;
- the exact-SHA CI, main CI, or Pages run is not successful;
- a live URL is not HTTP 200.

Report the blocker and the evidence instead of calling the delivery complete.

## Checklist

```text
[ ] Name: lowercase, hyphenated, matches directory
[ ] Description states what and when, with realistic trigger language
[ ] metadata.last_updated is today's Europe/Berlin date
[ ] Body is English, actionable, and under about 500 lines
[ ] No placeholders, secrets, or invented commands
[ ] Row added to docs/SKILLS.md with the same date
[ ] Required lists in ci_check.py and check_skill_docs.py updated
[ ] README / AGENTS / AGENT_TOOLS updated when counts or rules changed
[ ] Error ledger updated for any incident
[ ] Account copy saved for web availability
[ ] npm run docs:check passes
[ ] npm test passes
[ ] Both typechecks pass
[ ] Root and Sonnet production builds pass
[ ] Feature branch CI is green for the exact SHA
[ ] Main CI, Pages, and both live URLs are green
```
