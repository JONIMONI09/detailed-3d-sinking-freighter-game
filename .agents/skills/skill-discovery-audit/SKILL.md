---
name: skill-discovery-audit
description: >-
  Use when a project or account skill is missing from Freebuff, when a command
  such as /skill:name is not recognized, or when a skill was just added, moved,
  or renamed. Verify the native discovery path, the YAML frontmatter, the
  client-specific invocation, and the required session reload before changing
  or duplicating the skill.
license: MIT
metadata:
  category: quality
  project: detailed-3d-sinking-freighter-game
---

# Skill Discovery Audit

A skill can be correct and still invisible. Freebuff discovers skills at
session start, registers each one as `/skill:<name>`, and gives project skills
higher priority than account skills. Check those three facts separately:
"the file exists" is not proof that the running agent loaded it.

## 1. Check the path first

Use the native project path:

```text
.agents/skills/<name>/SKILL.md
```

`.claude/skills/` is a Claude Code compatibility path. Freebuff also reads it,
but `.agents/skills/` is the native path and wins when both contain a skill
with the same name. Prefer one canonical copy; a duplicate under both paths
can shadow the version the agent actually loads.

Confirm what is on disk:

```bash
find .agents/skills -maxdepth 2 -name SKILL.md -print
npx skills list
```

`npx skills list` also shows the scope it detected. A skill reported as
Claude Code scope is not proof that Freebuff's native loader ignored it, but
the native path removes that ambiguity.

Account skills are a separate source. Use the account skill list to confirm
whether the missing name is an account skill that is merely disabled. Do not
copy a working account skill into the project just to make it appear; a
project override with the same name shadows the account version and can drop
its bundled scripts, references, or assets.

## 2. Validate the file

A loadable `SKILL.md` has:

- a YAML frontmatter block delimited by `---`
- `name` exactly matching the directory name
- a non-empty `description` that says both what the skill does and when to use it
- an actionable body, not just a title
- no unfinished markers or accidental non-English text in this repository

Parse it as YAML instead of trusting a visual check:

```bash
python - <<'PY'
from pathlib import Path
import yaml
for path in sorted(Path(".agents/skills").glob("*/SKILL.md")):
    frontmatter = path.read_text(encoding="utf-8").split("---", 2)[1]
    data = yaml.safe_load(frontmatter)
    assert data["name"] == path.parent.name, path
    assert data["description"], path
    print("PASS", path.parent.name)
PY
python tools/ci_check.py
```

The repository integrity suite checks presence, names, frontmatter fields,
body length, and common non-English markers. It does not replace the YAML
parse above.

## 3. Check the invocation

The invocation depends on the client:

- **Local CLI/Desktop and local execution:** Freebuff registers skills as
  `/skill:<name>`. For this skill the command is
  `/skill:skill-discovery-audit`. A bare `/skill-discovery-audit` is not a
  CLI command. The same rule applies to account skills there:
  `/skill:brainstorming`, `/skill:find-skills`, and
  `/skill:skill-creator`.
- **Web composer:** the skill picker inserts `/<name>`; the web bundle builds
  the insertion as `/${e.name}`; the current account menu displays
  `/find-skills`. Select the skill from the `/` menu instead of typing the
  local `/skill:<name>` form. A leading slash plus the registry name is the
  web label.

The registry name is the same in both clients; only the command surface
differs. Do not add an alias in the repository to make one client imitate the
other. If the skill is absent from the relevant menu, check the client source,
the YAML, and the reload or next-turn refresh instead.

## 4. Use the client-specific source

Local CLI and Desktop sessions read `.agents/skills/` and `.claude/skills/`.
The web Cloud client does not read those repository directories. Its composer
uses two registries instead:

- **Account skills** from **Settings → Skills**. These are available in every
  project and are synced across web and Desktop.
- **Cloud project skills** from **Settings → Project settings**. These are
  scoped to the selected Cloud project.

The web bundle passes `localExecution ? folderSkillsChatId : null` when it
combines skills; a Cloud run passes `null`, so a committed `.agents/skills/`
directory is not a web registration. Register the workflow in the matching
registry before expecting it in the web `/` skill picker.

Use the narrowest scope that fits: project settings for one repository,
account skills only when the workflow should follow the user into every
project. Do not duplicate a skill under several names to force discovery.

## 5. Reload the session

Freebuff loads local skills at session start. Adding, moving, renaming, or
enabling a local skill does not update a chat that is already running. Reload
the chat or start a new one, then open the client's skill menu again. Registry
changes in the web client apply on the next turn after saving.

Do not claim that the slash menu works until that reload or next-turn refresh
has happened. A file path, a passing YAML check, and a green CI run prove the
repository state; they do not prove what a stale session displays.

## 6. Diagnose the remaining cases

If the path is native, the YAML parses, and the session was reloaded but the
skill is still absent:

1. Confirm the project root is the directory that contains `.agents/`.
2. Confirm the name matches the directory and contains only lowercase letters,
   digits, and single hyphens.
3. Check whether another skill with the same name exists in `.claude/skills/`
   or in the account registry and is overriding or being overridden.
4. Check the client version and its skill-loading log before changing files.
5. Reproduce with a minimal second skill in the same directory to separate a
   file problem from a client problem.

Do not fix a client problem by duplicating the skill under several names.
That creates shadowing and makes future audits unreliable.

## 7. Report evidence

State:

- the exact skill path
- the skill name and the exact invocation for the client (`/skill:<name>`
  locally, `/<name>` in the web picker)
- the output of `npx skills list` and `python tools/ci_check.py`
- whether the session was reloaded or the web registry was saved
- which client source was used: project path, account registry, or Cloud
  project registry
- what was not verified, especially the live slash menu

`npx skills find <query>` searches the public skill catalog. It does not load a
local skill and does not repair discovery. Use it only when the user wants to
find a new skill, then verify install counts and source reputation before
recommending an install.

## Quick checklist

```text
[ ] .agents/skills/<name>/SKILL.md exists
[ ] name matches the directory
[ ] description states what and when
[ ] YAML parses with yaml.safe_load
[ ] python tools/ci_check.py passes
[ ] client-specific invocation is identified
[ ] local path or web registry source is identified
[ ] session was reloaded or the registry was saved
[ ] remaining client behavior is reported, not guessed
```
