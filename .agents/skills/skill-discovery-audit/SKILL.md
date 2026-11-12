---
name: skill-discovery-audit
description: >-
  Use when a project or account skill is missing from Freebuff, when a command
  such as /skill:name is not recognized, or when a skill was just added, moved,
  or renamed. Verify the native discovery path, the YAML frontmatter, the exact
  /skill:<name> invocation, and the required session reload before changing or
  duplicating the skill.
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

Freebuff registers skills as `/skill:<name>`. The command for
`skill-discovery-audit` is:

```text
/skill:skill-discovery-audit
```

A bare `/skill-discovery-audit` is not a Freebuff command. The same rule
applies to every account skill: `/skill:brainstorming`, `/skill:find-skills`,
and `/skill:skill-creator`, not `/brainstorming`, `/find-skills`, or
`/skill-creator`. Freebuff does not add a second alias for the bare name.

If the skill is not listed under `/skill:`, do not invent a new command
syntax. Check the path, the YAML, and the session reload instead.

## 4. Reload the session

Freebuff loads the skill registry at session start. Adding, moving, renaming,
or enabling a skill does not update a chat that is already running. Reload the
chat or start a new one, then open the `/skill:` menu again.

Do not claim that the slash menu works until that reload has happened. A file
path, a passing YAML check, and a green CI run prove the repository state;
they do not prove what a stale session displays.

## 5. Diagnose the remaining cases

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

## 6. Report evidence

State:

- the exact skill path
- the skill name and the exact `/skill:<name>` command
- the output of `npx skills list` and `python tools/ci_check.py`
- whether the session was reloaded
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
[ ] invocation is /skill:<name>
[ ] session was reloaded
[ ] remaining client behavior is reported, not guessed
```
