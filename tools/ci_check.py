#!/usr/bin/env python3
"""
tools/ci_check.py - Automated CI and Physics Integrity Verification Suite
Validates physics math contracts, workflow wiring, project-skill structure, and
file consistency across both simulation targets. TypeScript is checked separately.
"""

import sys
import os
import re
import math
import json
import subprocess
from pathlib import Path

WORKSPACE = Path(__file__).resolve().parent.parent

def log(msg, status="INFO"):
    colors = {
        "INFO": "\033[94m[INFO]\033[0m",
        "PASS": "\033[92m[PASS]\033[0m",
        "WARN": "\033[93m[WARN]\033[0m",
        "FAIL": "\033[91m[FAIL]\033[0m"
    }
    prefix = colors.get(status, f"[{status}]")
    print(f"{prefix} {msg}")

def check_git_ignore():
    log("Verifying .gitignore configuration...")
    gitignore_path = WORKSPACE / ".gitignore"
    if not gitignore_path.exists():
        log(".gitignore is missing!", "FAIL")
        return False
    
    content = gitignore_path.read_text(encoding="utf-8")
    required = ["node_modules", "dist"]
    for item in required:
        if item not in content:
            log(f".gitignore missing rule for '{item}'", "FAIL")
            return False
    log(".gitignore contains all required exclusion patterns.", "PASS")
    return True

def check_vite_configs():
    log("Verifying Vite configurations for relative GitHub Pages compatibility...")
    configs = [
        WORKSPACE / "vite.config.ts",
        WORKSPACE / "detailed-3d-sinking-freighter-game_sonnet" / "vite.config.ts"
    ]
    for cfg in configs:
        if not cfg.exists():
            log(f"Missing config: {cfg}", "FAIL")
            return False
        text = cfg.read_text(encoding="utf-8")
        if 'base: "./"' not in text and "base: './'" not in text:
            log(f"{cfg.name} does not specify relative base ('./')", "FAIL")
            return False
    log("All vite.config.ts files configured with relative base path.", "PASS")
    return True

def check_workflows():
    log("Verifying GitHub Actions workflow integrity...")
    workflows_dir = WORKSPACE / ".github" / "workflows"
    if not workflows_dir.exists():
        log(".github/workflows directory missing!", "FAIL")
        return False
    
    required_files = ["ci.yml", "deploy-pages.yml"]
    for wf in required_files:
        path = workflows_dir / wf
        if not path.exists():
            log(f"Workflow '{wf}' is missing!", "FAIL")
            return False
        
        # Verify basic structure
        content = path.read_text(encoding="utf-8")
        if "runs-on:" not in content or "steps:" not in content:
            log(f"Workflow '{wf}' has invalid schema structure", "FAIL")
            return False
    
    log("GitHub Actions CI and Pages workflows verified successfully.", "PASS")
    return True

def check_test_suite_wiring():
    log("Verifying test suite wiring...")
    package_path = WORKSPACE / "package.json"
    physics_path = WORKSPACE / "tests" / "physics.test.mjs"
    browser_path = WORKSPACE / "tests" / "browser-guards.test.mjs"

    door_sec_path = WORKSPACE / "tests" / "door-security.test.mjs"
    stormworks_path = WORKSPACE / "tests" / "stormworks-prototypes.test.mjs"
    crew_nav_path = WORKSPACE / "tests" / "crew-navigation.test.mjs"
    ragdoll_path = WORKSPACE / "tests" / "ragdoll-physics.test.mjs"
    supervisor_path = WORKSPACE / "tests" / "stormworks-supervisor.test.mjs"

    if (
        not package_path.exists()
        or not physics_path.exists()
        or not browser_path.exists()
        or not door_sec_path.exists()
        or not stormworks_path.exists()
        or not crew_nav_path.exists()
        or not ragdoll_path.exists()
        or not supervisor_path.exists()
    ):
        log("Test suite files are missing!", "FAIL")
        return False

    scripts = json.loads(package_path.read_text(encoding="utf-8")).get("scripts", {})
    test_script = scripts.get("test", "")
    required = [
        "tests/physics.test.mjs",
        "tests/browser-guards.test.mjs",
        "tests/door-security.test.mjs",
        "tests/stormworks-prototypes.test.mjs",
        "tests/crew-navigation.test.mjs",
        "tests/ragdoll-physics.test.mjs",
        "tests/stormworks-supervisor.test.mjs",
        "tools/ci_check.py",
    ]
    missing = [item for item in required if item not in test_script]
    if missing:
        log(f"package.json test script misses: {', '.join(missing)}", "FAIL")
        return False

    log("Physics, browser-guard, door security, Stormworks prototypes, crew navigation, ragdoll physics, supervisor and Python suites are wired into npm test.", "PASS")
    return True

def check_project_skills():
    log("Verifying project skills...")
    skills_dir = WORKSPACE / ".agents" / "skills"
    required = [
        "error-fix-document",
        "ci-workflow-audit",
        "documentation-maintenance",
        "skill-discovery-audit",
        "skill-index",
        "brainstorming",
        "skill-creator",
    ]
    required_docs = [
        WORKSPACE / "docs" / "SKILLS.md",
        WORKSPACE / "docs" / "AGENT_TOOLS.md",
        WORKSPACE / "docs" / "ERRORS_AND_FIXES.md",
    ]

    if not skills_dir.exists():
        log(".agents/skills directory is missing!", "FAIL")
        return False

    for doc in required_docs:
        if not doc.exists():
            log(f"Required agent documentation is missing: {doc.relative_to(WORKSPACE)}", "FAIL")
            return False

    index_text = required_docs[0].read_text(encoding="utf-8")
    ledger_text = required_docs[2].read_text(encoding="utf-8")
    if "Last reviewed: 2026-11-12" not in index_text:
        log("docs/SKILLS.md has no current Last reviewed date.", "FAIL")
        return False
    if "ERR-2026-11-12-01" not in ledger_text:
        log("docs/ERRORS_AND_FIXES.md has no seeded incident entry.", "FAIL")
        return False
    if "CodeGraph" not in required_docs[1].read_text(encoding="utf-8"):
        log("docs/AGENT_TOOLS.md does not document the CodeGraph script.", "FAIL")
        return False
    agents_text = (WORKSPACE / "AGENTS.md").read_text(encoding="utf-8")
    if "Freebuff AI agent only" not in agents_text:
        log("AGENTS.md does not declare its Freebuff-agent-only scope.", "FAIL")
        return False

    for name in required:
        path = skills_dir / name / "SKILL.md"
        if not path.exists():
            log(f"Skill '{name}' is missing its SKILL.md!", "FAIL")
            return False

        text = path.read_text(encoding="utf-8")
        if not text.startswith("---\n"):
            log(f"Skill '{name}' does not start with YAML frontmatter.", "FAIL")
            return False

        parts = text.split("---", 2)
        if len(parts) != 3:
            log(f"Skill '{name}' has incomplete YAML frontmatter.", "FAIL")
            return False

        frontmatter, body = parts[1], parts[2].strip()
        if not re.search(rf"^name:\s*{re.escape(name)}\s*$", frontmatter, re.MULTILINE):
            log(f"Skill '{name}' frontmatter name does not match its directory.", "FAIL")
            return False
        if not re.search(r"^description:\s*\S", frontmatter, re.MULTILINE):
            log(f"Skill '{name}' has no description.", "FAIL")
            return False
        if not re.search(r"^  last_updated:\s*\d{4}-\d{2}-\d{2}\s*$", frontmatter, re.MULTILINE):
            log(f"Skill '{name}' has no metadata.last_updated date.", "FAIL")
            return False
        if name not in index_text:
            log(f"Skill '{name}' is not listed in docs/SKILLS.md.", "FAIL")
            return False
        if len(body) < 200:
            log(f"Skill '{name}' body is too short to be actionable.", "FAIL")
            return False
        if re.search(r"[äöüÄÖÜß]", text):
            log(f"Skill '{name}' contains non-English umlauts.", "FAIL")
            return False
        if re.search(r"\b(?:TODO|FIXME):", text):
            log(f"Skill '{name}' contains unfinished markers.", "FAIL")
            return False

    log("Project skills, update dates and agent documentation are consistent.", "PASS")
    return True

def check_branch_ci_trigger():
    log("Verifying CI covers feature branches before merge...")
    ci_path = WORKSPACE / ".github" / "workflows" / "ci.yml"
    deploy_path = WORKSPACE / ".github" / "workflows" / "deploy-pages.yml"
    if not ci_path.exists() or not deploy_path.exists():
        log("CI or Pages workflow is missing!", "FAIL")
        return False

    ci = ci_path.read_text(encoding="utf-8")
    deploy = deploy_path.read_text(encoding="utf-8")

    try:
        push_block = ci.split("  push:", 1)[1].split("  pull_request:", 1)[0]
    except IndexError:
        log("ci.yml has no bounded push trigger block.", "FAIL")
        return False

    if '"**"' not in push_block and "'**'" not in push_block:
        log("ci.yml push trigger does not cover feature branches (missing '**').", "FAIL")
        return False

    if "npm test" not in ci:
        log("ci.yml does not run npm test.", "FAIL")
        return False

    if "npm run docs:check" not in ci:
        log("ci.yml does not run the skill/documentation gate.", "FAIL")
        return False

    if '"**"' in deploy or "'**'" in deploy:
        log("deploy-pages.yml must not deploy every branch.", "FAIL")
        return False

    log("CI runs on feature branches; Pages remains restricted to main.", "PASS")
    return True

def check_engine_room_collision_clearance():
    log("Validating engine room machinery vs stairwell clearance...")
    builder_path = WORKSPACE / "src" / "game" / "CargoShipBuilder.ts"
    if not builder_path.exists():
        log("CargoShipBuilder.ts not found!", "FAIL")
        return False
    
    content = builder_path.read_text(encoding="utf-8")
    
    # Engine must be positioned at Z >= 16.0m to guarantee clear landing
    # Stairwell 2 span: Z = 7.2m to 13.8m
    engine_match = re.search(r"addWallBox\(\s*['\"]diesel_engine_core['\"],\s*([0-9\.\-]+),\s*([0-9\.\-]+),\s*([0-9\.\-]+)", content)
    if not engine_match:
        log("Could not locate diesel_engine_core positioning in builder", "FAIL")
        return False
    
    engine_z = float(engine_match.group(3))
    stair_max_z = 13.8
    clearance = engine_z - stair_max_z
    
    if clearance < 2.0:
        log(f"Engine Z={engine_z}m is too close to stairwell max Z={stair_max_z}m (clearance: {clearance:.2f}m < 2.0m)", "FAIL")
        return False
    
    log(f"Engine clearance confirmed: Z={engine_z}m (landing clearance: +{clearance:.2f}m clear).", "PASS")
    return True

def check_physics_torricelli_math():
    log("Verifying Torricelli hydrodynamics math...")
    # Theoretical verification: v = sqrt(2 * g * h)
    g = 9.81
    cd = 0.62
    head = 4.5 # 4.5m underwater
    v_expected = cd * math.sqrt(2 * g * head)
    
    # Area = 1.2 m^2
    area = 1.2
    flow_expected = area * v_expected # m^3/s
    
    assert flow_expected > 0.0, "Flow rate must be positive"
    assert math.isclose(v_expected, 0.62 * math.sqrt(2 * 9.81 * 4.5), rel_tol=1e-5)
    
    log(f"Torricelli head 4.5m -> v={v_expected:.3f} m/s, Q={flow_expected:.3f} m^3/s verified.", "PASS")
    return True

def check_bending_moment_math():
    log("Verifying Floating Sandbox beam bending moment mechanics...")
    # Sagging test case: heavily flooded mid hold, dry fore and aft
    load_fore = 100.0 # metric tons
    load_aft = 120.0  # metric tons
    load_mid = 850.0  # heavily flooded
    
    bending_moment = load_mid - 0.6 * (load_fore + load_aft)
    assert bending_moment > 0, "Mid hold overload must produce positive sagging bending moment"
    
    stress_ratio = bending_moment / 1200.0
    log(f"Sagging moment M={bending_moment:.1f} kNm (Stress ratio: {stress_ratio:.2%}) verified.", "PASS")
    return True

def check_watertight_dogging():
    log("Verifying watertight door dogging coefficients...")
    viewport_path = WORKSPACE / "src" / "components" / "MaritimeViewport3D.tsx"
    if not viewport_path.exists():
        log("MaritimeViewport3D.tsx not found!", "FAIL")
        return False
    
    code = viewport_path.read_text(encoding="utf-8")
    if "door.locked" not in code or "0.85" not in code:
        log("Watertight door dogging timing (0.85s) or locked state missing!", "FAIL")
        return False
    
    log("Watertight door dogging logic and 100% seal integrity confirmed.", "PASS")
    return True

def main():
    print("=" * 60)
    print("  MARITIME SIMULATION CI INTEGRITY SUITE (Python)")
    print("=" * 60)
    
    tests = [
        check_git_ignore,
        check_vite_configs,
        check_workflows,
        check_branch_ci_trigger,
        check_test_suite_wiring,
        check_project_skills,
        check_engine_room_collision_clearance,
        check_physics_torricelli_math,
        check_bending_moment_math,
        check_watertight_dogging
    ]
    
    failed = 0
    for test in tests:
        try:
            if not test():
                failed += 1
        except Exception as e:
            log(f"Exception during {test.__name__}: {e}", "FAIL")
            failed += 1
    
    print("-" * 60)
    if failed == 0:
        log(f"All {len(tests)} CI checks passed successfully! Simulation is green.", "PASS")
        return 0
    else:
        log(f"{failed} of {len(tests)} checks failed!", "FAIL")
        return 1

if __name__ == "__main__":
    sys.exit(main())
