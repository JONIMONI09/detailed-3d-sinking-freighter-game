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

## Open incidents

None at this revision. Add a new entry before merging any future fix, even when
the fix is a one-line documentation correction.
