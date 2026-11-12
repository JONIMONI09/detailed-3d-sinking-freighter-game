---
name: ci-workflow-audit
description: >-
  Use before changing GitHub Actions files or merging any branch. Validate the
  workflow YAML with Python, check branch and Pages triggers, verify the exact
  commit's Actions run, and record the evidence.
license: MIT
metadata:
  category: ci
  project: detailed-3d-sinking-freighter-game
---

# CI Workflow Audit

## Trigger

Use this skill when:

- `.github/workflows/` changes;
- a CI run fails or does not start;
- a branch is about to be merged;
- Pages deployment or the live URL is part of the delivery.

## 1. Inspect the workflow files

Read `.github/workflows/ci.yml` and `.github/workflows/deploy-pages.yml` in
full. Do not validate only the lines that changed.

## 2. Run the structural suite

```bash
python tools/ci_check.py
```

This must pass all Python checks, including the feature-branch trigger check.
Then run the complete application gate:

```bash
npm test
```

## 3. Validate YAML with Python

Parse both files with `yaml.SafeLoader` and a duplicate-key constructor. A
duplicate key silently wins in many parsers, so it must be rejected explicitly.
Assert all of the following:

- `ci.yml` has `push` and `pull_request` triggers.
- `ci.yml` push branches include `main`, `master`, and `"**"`.
- `deploy-pages.yml` pushes only to `main`; it must not use `"**"`.
- CI uses Node 22, runs `npm ci`, both typechecks, `npm test`, and both builds.
- Pages has `pages: write`, `id-token: write`, the `github-pages` environment,
  `enablement: true`, and the artifact existence check.
- Neither workflow uses `--force` or `--legacy-peer-deps`.
- Every step has a name and a valid `run` or `uses`.

If PyYAML is unavailable, report that full YAML parsing could not be performed.
Do not claim a YAML pass from a text-only check.

## 4. Exact-SHA CI gate

After pushing the feature branch, find the run for that exact commit:

```bash
curl -fsS \
  "https://api.github.com/repos/JONIMONI09/detailed-3d-sinking-freighter-game/actions/runs?branch=BRANCH&per_page=5"
```

If `gh` is authenticated, `gh run list --branch BRANCH` is also valid.

The gate passes only when a run exists with:

- `head_sha` equal to the pushed commit;
- `status` equal to `completed`;
- `conclusion` equal to `success`.

Do not merge on a local pass, a queued run, or a run for a different SHA.

## 5. Merge and verify main

1. Merge by fast-forward.
2. Confirm remote `main` and `FETCH_HEAD` point at the merged commit.
3. Wait for both main workflows: CI and `Deploy to GitHub Pages`.
4. Require `success` for both.
5. Fetch the live root and `/sonnet/` pages, require HTTP 200, and check the
   expected feature markers.
6. Record the run IDs, commit SHA, live URLs, and result in
   `CI_DEPLOYMENT.md`.

## Fallback rules

- If the Actions API is unavailable, do not merge. Report the branch, commit,
  and Actions URL, and state that CI could not be verified.
- If main CI fails, do not call the delivery complete. Fix the failure on a new
  branch and repeat the gate.
- If Pages fails but CI is green, report the deployment failure separately; do
  not describe the site as live.
- Never invent a run ID or a conclusion.

## Definition of done

- [ ] Both workflow files parse with duplicate-key detection.
- [ ] Branch, main, and Pages triggers are correct.
- [ ] The exact feature-branch SHA has a successful run.
- [ ] Main CI and Pages both succeeded after the merge.
- [ ] Live pages return 200 and contain the expected markers.
- [ ] `CI_DEPLOYMENT.md` records the evidence.
