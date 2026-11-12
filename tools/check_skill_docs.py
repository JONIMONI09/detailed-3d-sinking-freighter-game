#!/usr/bin/env python3
"""
Skill and documentation governance check for the Freebuff AI agent.

The script deliberately runs CodeGraph through its one-shot MCP mode. The MCP
server is never used as an ad-hoc chat tool: the repository has one executable
entry point for the documentation gate.

Usage:
    python tools/check_skill_docs.py
    python tools/check_skill_docs.py --no-codegraph   # offline diagnosis only
"""

from __future__ import annotations

import argparse
import datetime as dt
import json
import os
import re
import subprocess
import sys
from pathlib import Path

WORKSPACE = Path(__file__).resolve().parent.parent
SKILLS_DIR = WORKSPACE / ".agents" / "skills"
REQUIRED_SKILLS = [
    "skill-index",
    "error-fix-document",
    "documentation-maintenance",
    "ci-workflow-audit",
    "skill-discovery-audit",
    "brainstorming",
    "skill-creator",
]
REQUIRED_DOCS = [
    WORKSPACE / "docs" / "SKILLS.md",
    WORKSPACE / "docs" / "AGENT_TOOLS.md",
    WORKSPACE / "docs" / "ERRORS_AND_FIXES.md",
]
DATE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")
LAST_REVIEWED_RE = re.compile(r"^Last reviewed:\s*(\d{4}-\d{2}-\d{2})", re.MULTILINE)
FRONTMATTER_DATE_RE = re.compile(
    r"^  last_updated:\s*(\d{4}-\d{2}-\d{2})\s*$", re.MULTILINE
)


def fail(message: str) -> None:
    print(f"[FAIL] {message}")
    raise SystemExit(1)


def ok(message: str) -> None:
    print(f"[PASS] {message}")


def germany_date() -> dt.date:
    try:
        from zoneinfo import ZoneInfo

        return dt.datetime.now(ZoneInfo("Europe/Berlin")).date()
    except Exception:
        # The container normally has zoneinfo. A fixed UTC+1 fallback is still
        # deterministic and close enough for a date-only governance check.
        return (dt.datetime.utcnow() + dt.timedelta(hours=1)).date()


def parse_frontmatter(path: Path) -> tuple[str, str]:
    text = path.read_text(encoding="utf-8")
    if not text.startswith("---\n"):
        fail(f"{path.relative_to(WORKSPACE)} has no YAML frontmatter")
    parts = text.split("---", 2)
    if len(parts) != 3:
        fail(f"{path.relative_to(WORKSPACE)} has incomplete YAML frontmatter")
    return parts[1], parts[2]


def check_required_files() -> None:
    for doc in REQUIRED_DOCS:
        if not doc.exists():
            fail(f"missing required document: {doc.relative_to(WORKSPACE)}")

    if not SKILLS_DIR.exists():
        fail("missing .agents/skills directory")

    for skill in REQUIRED_SKILLS:
        path = SKILLS_DIR / skill / "SKILL.md"
        if not path.exists():
            fail(f"missing skill: {path.relative_to(WORKSPACE)}")

        frontmatter, body = parse_frontmatter(path)
        if not re.search(rf"^name:\s*{re.escape(skill)}\s*$", frontmatter, re.MULTILINE):
            fail(f"{skill}: frontmatter name does not match its directory")
        if not re.search(r"^description:\s*\S", frontmatter, re.MULTILINE):
            fail(f"{skill}: missing description")
        date_match = FRONTMATTER_DATE_RE.search(frontmatter)
        if not date_match:
            fail(f"{skill}: missing metadata.last_updated")
        date_value = date_match.group(1)
        if not DATE_RE.match(date_value):
            fail(f"{skill}: invalid metadata.last_updated date {date_value!r}")
        if len(body.strip()) < 200:
            fail(f"{skill}: body is too short to be actionable")

    ok("required skills and documentation files exist")


def check_dates() -> None:
    today = germany_date()
    for doc in REQUIRED_DOCS:
        text = doc.read_text(encoding="utf-8")
        match = LAST_REVIEWED_RE.search(text)
        if not match:
            fail(f"{doc.relative_to(WORKSPACE)} has no Last reviewed date")
        value = dt.date.fromisoformat(match.group(1))
        if value > today:
            fail(f"{doc.relative_to(WORKSPACE)} review date is in the future: {value}")

    for skill in REQUIRED_SKILLS:
        frontmatter, _ = parse_frontmatter(SKILLS_DIR / skill / "SKILL.md")
        match = FRONTMATTER_DATE_RE.search(frontmatter)
        if not match:
            fail(f"{skill}: missing update date after validation")
        value = dt.date.fromisoformat(match.group(1))
        if value > today:
            fail(f"{skill}: update date is in the future: {value}")

    ok(f"all documentation dates are valid and not after {today.isoformat()}")


def check_skill_index_consistency(index: str) -> None:
    """Every project skill has a row, path, and matching update date."""
    rows = {}
    for line in index.splitlines():
        if not line.startswith("|"):
            continue
        cells = [cell.strip() for cell in line.strip().strip("|").split("|")]
        if len(cells) < 6 or not cells[0].startswith("`"):
            continue
        name = cells[0].strip("`")
        scope = cells[1]
        path_cell = cells[2]
        date_cell = cells[4]
        rows[name] = (scope, path_cell, date_cell)

    for skill_dir in sorted(SKILLS_DIR.iterdir()):
        if not skill_dir.is_dir():
            continue
        path = skill_dir / "SKILL.md"
        if not path.exists():
            continue
        name = skill_dir.name
        frontmatter, _ = parse_frontmatter(path)
        date_match = FRONTMATTER_DATE_RE.search(frontmatter)
        if not date_match:
            fail(f"{name}: missing metadata.last_updated")
        file_date = date_match.group(1)

        if name not in rows:
            fail(f"docs/SKILLS.md has no row for project skill {name}")
        scope, path_cell, date_cell = rows[name]
        if "Project" not in scope:
            fail(f"docs/SKILLS.md row for {name} does not declare Project scope")
        canonical = f".agents/skills/{name}/SKILL.md"
        if canonical not in path_cell:
            fail(f"docs/SKILLS.md row for {name} does not point at {canonical}")
        if date_cell != file_date:
            fail(
                f"docs/SKILLS.md date for {name} is {date_cell!r}, "
                f"but metadata.last_updated is {file_date!r}"
            )

    for path_text in re.findall(r"`(\.agents/skills/[^`]+/SKILL\.md)`", index):
        if "*" in path_text or "<" in path_text:
            continue
        if not (WORKSPACE / path_text).exists():
            fail(f"docs/SKILLS.md points at a missing path: {path_text}")



def check_index_and_agent_rules() -> None:
    index = (WORKSPACE / "docs" / "SKILLS.md").read_text(encoding="utf-8")
    tools = (WORKSPACE / "docs" / "AGENT_TOOLS.md").read_text(encoding="utf-8")
    ledger = (WORKSPACE / "docs" / "ERRORS_AND_FIXES.md").read_text(encoding="utf-8")
    agents = (WORKSPACE / "AGENTS.md").read_text(encoding="utf-8")

    for skill in REQUIRED_SKILLS:
        if f"`{skill}`" not in index:
            fail(f"docs/SKILLS.md does not list `{skill}`")
        if f"`.agents/skills/{skill}/SKILL.md`" not in index:
            fail(f"docs/SKILLS.md does not list the canonical path for {skill}")

    check_skill_index_consistency(index)

    if "CodeGraph" not in tools or "tools/check_skill_docs.py" not in tools:
        fail("docs/AGENT_TOOLS.md does not describe the CodeGraph script")
    if "ERR-2026-11-12-01" not in ledger:
        fail("docs/ERRORS_AND_FIXES.md has no seeded incident entry")
    if "Freebuff AI agent only" not in agents:
        fail("AGENTS.md does not declare its Freebuff-agent-only scope")
    if "docs/SKILLS.md" not in agents:
        fail("AGENTS.md does not point to the skill index")

    ok("index rows, tool inventory, error ledger, and agent scope agree")


def git_output(*args: str) -> str:
    result = subprocess.run(
        ["git", *args],
        cwd=WORKSPACE,
        text=True,
        capture_output=True,
    )
    return result.stdout if result.returncode == 0 else ""


def resolve_base_branch() -> str:
    requested = os.environ.get("CODEGRAPH_BASE_BRANCH", "main")
    candidates = [requested]
    if requested == "main":
        candidates.extend(["origin/main", "master", "origin/master"])
    for candidate in candidates:
        result = subprocess.run(
            ["git", "rev-parse", "--verify", f"{candidate}^{{commit}}"],
            cwd=WORKSPACE,
            text=True,
            capture_output=True,
        )
        if result.returncode == 0:
            return candidate
    fail(
        f"cannot resolve base branch {requested!r}; fetch it or set "
        "CODEGRAPH_BASE_BRANCH to an available ref"
    )
    raise AssertionError("unreachable")


def changed_paths(base: str) -> set[str]:
    paths: set[str] = set()
    for args in (
        ("diff", "--name-only", "--diff-filter=ACMR", f"{base}...HEAD"),
        ("diff", "--name-only", "--diff-filter=ACMR"),
        ("diff", "--name-only", "--cached", "--diff-filter=ACMR"),
        ("ls-files", "--others", "--exclude-standard"),
    ):
        for line in git_output(*args).splitlines():
            line = line.strip()
            if line:
                paths.add(line)
    return paths


def check_change_coupling(paths: set[str]) -> None:
    skill_changes = {
        path
        for path in paths
        if path.startswith(".agents/skills/") and path.endswith("/SKILL.md")
    }
    if skill_changes and "docs/SKILLS.md" not in paths:
        fail(
            "a skill changed without docs/SKILLS.md; update the index and the "
            "Europe/Berlin date in the same change"
        )
    if skill_changes:
        ok("skill changes are coupled to the canonical skill index")
    else:
        ok("no skill file changes require an index update in this diff")


def codegraph_binary() -> Path:
    candidates = (
        [
            WORKSPACE / "node_modules" / ".bin" / "codegraph-mcp.cmd",
            WORKSPACE / "node_modules" / ".bin" / "codegraph-mcp",
        ]
        if sys.platform == "win32"
        else [
            WORKSPACE / "node_modules" / ".bin" / "codegraph-mcp",
            WORKSPACE / "node_modules" / ".bin" / "codegraph-mcp.cmd",
        ]
    )
    for candidate in candidates:
        if candidate.exists():
            return candidate
    fail(
        "CodeGraph MCP is not installed at node_modules/.bin/codegraph-mcp; "
        "run npm ci, then retry"
    )
    raise AssertionError("unreachable")


def check_codegraph(base: str) -> None:
    binary = codegraph_binary()
    args = {
        "baseBranch": base,
        "format": "json",
    }
    command = [
        str(binary),
        "--graph-only",
        "--workspace",
        str(WORKSPACE),
        "--run-tool",
        "codegraph_pr_context",
        "--tool-args",
        json.dumps(args),
    ]
    try:
        result = subprocess.run(
            command,
            cwd=WORKSPACE,
            text=True,
            capture_output=True,
            timeout=120,
            shell=(sys.platform == "win32"),
        )
    except subprocess.TimeoutExpired:
        fail("CodeGraph MCP timed out after 120 seconds")
        raise AssertionError("unreachable")

    if result.returncode != 0:
        detail = (result.stderr or result.stdout or "").strip().splitlines()[-6:]
        fail(
            "CodeGraph MCP failed with exit "
            f"{result.returncode}: " + " | ".join(detail)
        )

    try:
        payload = json.loads(result.stdout)
    except json.JSONDecodeError:
        fail("CodeGraph MCP returned non-JSON output; inspect its stderr")

    changed = payload.get("changed_files", "unknown")
    message = payload.get("message", "")
    ok(f"CodeGraph MCP pr_context returned valid JSON (changed_files={changed})")
    if message:
        print(f"[INFO] CodeGraph: {message}")
    stale = payload.get("stale_docs") or payload.get("docs") or []
    if stale:
        print(f"[INFO] CodeGraph documentation findings: {stale}")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--no-codegraph",
        action="store_true",
        help="skip the CodeGraph MCP call (offline diagnosis only)",
    )
    args = parser.parse_args()

    print("=" * 60)
    print("  FREEBUFF SKILL AND DOCUMENTATION GOVERNANCE")
    print("=" * 60)
    print(f"Europe/Berlin date: {germany_date().isoformat()}")

    check_required_files()
    check_dates()
    check_index_and_agent_rules()
    base = resolve_base_branch()
    print(f"[INFO] CodeGraph base branch: {base}")
    paths = changed_paths(base)
    check_change_coupling(paths)
    print(f"[INFO] changed paths considered: {len(paths)}")

    if args.no_codegraph:
        print("[WARN] CodeGraph skipped: this is not a complete documentation gate")
    else:
        check_codegraph(base)

    print("-" * 60)
    ok("skill and documentation governance checks passed")
    return 0


if __name__ == "__main__":
    sys.exit(main())
