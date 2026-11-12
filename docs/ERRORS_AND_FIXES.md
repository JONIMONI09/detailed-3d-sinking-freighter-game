# Error and Solution Ledger

Last reviewed: 2026-11-12 (Europe/Berlin)
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

## Open incidents

None at this revision. Add a new entry before merging any future fix, even when
the fix is a one-line documentation correction.
