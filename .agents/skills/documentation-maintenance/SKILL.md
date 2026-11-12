---
name: documentation-maintenance
description: >-
  Use whenever behavior, CI, deployment, or known limitations change. Remove
  stale claims, update the English documentation and learning log, and record
  commands, results, run IDs, and remaining risks.
license: MIT
metadata:
  category: documentation
  project: detailed-3d-sinking-freighter-game
---

# Documentation Maintenance

## Trigger

Use this skill when a change affects:

- user-visible behavior, controls, layout, or errors;
- tests, builds, dependencies, or CI;
- deployment, live URLs, or repository visibility;
- a known limitation, warning, or unresolved risk.

## Document map

| File | What belongs there |
| :--- | :--- |
| `README.md` | What the project does, controls, live links, setup, CI summary |
| `CI_DEPLOYMENT.md` | Exact commands, exit codes, artifacts, hashes, run IDs, deployment status, limitations |
| `RESPONSIVE_UI.md` | Viewport measurements, clipping/coverage counts, browser caveats |
| `AGENTS.md` | Durable rules the next agent must follow |
| `.agent/rules/LEARNING.md` | Root cause, fix, verification, and reusable lesson |

## Mandatory documentation sequence

1. Search for stale claims before editing:

```bash
rg -n "Not observed|could not be read|private repository|TODO|FIXME|[0-9]+/[0-9]+" \
  --glob '*.md' .
```

2. Verify every count, hash, run ID, URL, and date against the current output.
   Never copy an old number into a new section.
3. Mark historical sections as historical. Do not rewrite the old result as if
   it were the current one.
4. Record the exact commands that ran and their exit codes. State which checks
   were not run.
5. Record warnings and limitations separately from passes. A green build does
   not erase a dependency advisory or an untested physical device.
6. Put the current delivery at the end of `CI_DEPLOYMENT.md` with its commit,
   branch run, main run, Pages run, and live URLs.
7. Add or update the `LEARNING.md` entry for the underlying cause and the
   lesson, not only the symptom.
8. Keep all documentation, commit messages, identifiers, and UI text in
   English. German belongs only in user chat replies.
9. Cross-link related records instead of duplicating large sections.
10. Re-run the relevant checks after editing commands or counts.

## Required evidence block

A delivery record must contain:

- date and branch;
- commit SHA and merge type;
- exact commands with exit status;
- artifact sizes and SHA-256 hashes when builds changed;
- feature-branch CI run ID and conclusion;
- main CI and Pages run IDs and conclusions;
- live URL status codes and feature markers;
- known limitations and checks that could not run.

## Fallback rules

- If a run ID or live status is unavailable, write that it is unavailable and
  link the Actions page. Do not invent evidence.
- If a test cannot run, document the blocker and do not mark it passed.
- If a historical statement is superseded, label it as historical and point to
  the current section.
- If the docs and code disagree, stop and verify the code before editing the
  docs.

## Definition of done

- [ ] No stale claims remain in current-state sections.
- [ ] Counts, hashes, run IDs, and URLs match real output.
- [ ] Historical and current results are clearly separated.
- [ ] `LEARNING.md` captures the cause and lesson.
- [ ] English is used throughout.
- [ ] The documentation change is included in the same branch and CI gate.
