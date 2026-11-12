---
name: error-fix-document
description: >-
  Use for every bug fix, failed check, incident, or unexpected behavior in this
  repository. Reproduce the failure, write it into the mandatory error ledger,
  fix its root cause, add a safe fallback and regression tests, update the
  English documentation, and verify the feature branch through GitHub CI before
  merging.
license: MIT
metadata:
  category: quality
  project: detailed-3d-sinking-freighter-game
  last_updated: 2026-11-12
---

# Error Fix and Documentation Workflow

## Trigger

Use this skill when a request involves any of:

- a bug, crash, failed test, failed build, or CI failure;
- a behavior change that needs verification;
- a browser API, network call, or other operation that can fail;
- a fix that must be documented and merged.

## Mandatory sequence

1. Read `AGENTS.md`, `package.json`, and the files named by the request.
2. Create a feature branch from the current `main`. Do not work directly on `main`.
3. Reproduce the failure or establish the expected behavior with a command,
   test, or browser measurement. Keep the real output.
4. Identify the root cause. Do not patch only the visible symptom.
5. Implement the complete fix. No stubs, no skipped checks, no silent fallbacks.
6. Add a safe fallback for every fallible boundary:
   - browser APIs: guard the call, await promises, show a user-visible status;
   - external services: catch failures and return a documented degraded path;
   - unsupported environments: detect them and report, rather than pretending
     success.
7. Add or update regression tests under `tests/`. Wire new suites into
   `npm test`.
8. Add or update the mandatory entry in `docs/ERRORS_AND_FIXES.md` before
   merging. Include the date in Europe/Berlin, symptom, root cause, solution,
   verification, prevention, and related files or skills. A fix without a
   ledger entry is incomplete.
9. Update the English documentation in the same change:
   - `README.md` for user-facing behavior;
   - `CI_DEPLOYMENT.md` for commands, results, hashes, runs, and limitations;
   - `docs/SKILLS.md` for a skill or command-surface change;
   - `docs/AGENT_TOOLS.md` for a tool or command change;
   - `RESPONSIVE_UI.md` for layout and browser evidence;
   - `AGENTS.md` for durable project rules;
   - `.agent/rules/LEARNING.md` for the root cause and lesson.
10. Run the full local gate:

```bash
npm ci
npm run docs:check
npx tsc --noEmit
npx tsc -p detailed-3d-sinking-freighter-game_sonnet/tsconfig.json --noEmit
npm test
npx vite build
npx vite build detailed-3d-sinking-freighter-game_sonnet
```

11. Verify the artifacts and, for UI changes, the exact viewports. Record byte
    sizes, hashes, and measurements.
12. Commit on the feature branch and push it.
13. Wait for the GitHub Actions run for the exact commit SHA. Merge only when it
    is `completed` with conclusion `success`.
14. Merge by fast-forward, then verify main CI, Pages deployment, remote hash,
    and live URLs.

## Failure rules

- A failed check is evidence, not noise. Read the first useful error before
  changing anything.
- Fix the cause and add a regression test for it.
- Never weaken an assertion, skip a test, or suppress a type or lint error to
  get green.
- Never claim a pass for a command that was not run.
- If GitHub CI is unreachable, do not merge. Report the Actions URL and the
  missing verification.
- If a service or credential is unavailable, implement the safe fallback and
  document the blocker.
- Keep the lockfile. Do not upgrade dependencies as a side effect of a fix.

## Definition of done

- [ ] The original failure is reproduced or the expected behavior is shown.
- [ ] The root cause is fixed, not hidden.
- [ ] A fallback exists for every fallible boundary.
- [ ] Regression tests cover the fix and run in `npm test`.
- [ ] `docs/ERRORS_AND_FIXES.md` has a complete entry for the incident.
- [ ] English documentation, `docs/SKILLS.md`, and `LEARNING.md` are updated.
- [ ] `npm run docs:check` passes with CodeGraph enabled.
- [ ] Typechecks, tests, builds, and YAML gates pass with real output.
- [ ] The feature-branch Actions run for the exact SHA is green.
- [ ] `main` and the live deployment are verified after the merge.
