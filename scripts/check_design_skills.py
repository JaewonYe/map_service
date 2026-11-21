"""Verify pinned design skills, shared baseline, and local Python search. No network."""
from pathlib import Path
import argparse
import hashlib
import json
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[1]
LOCK = Path("design-system/platform/skills.lock.json")

def check(root):
    lock = json.loads((root / LOCK).read_text())
    for name, expected in lock["files"].items():
        path = root / name
        if not path.is_file() or hashlib.sha256(path.read_bytes()).hexdigest() != expected:
            raise ValueError(f"Missing or modified design asset: {path}")
    for name in ("ui-ux-pro-max", "web-design-guidelines"):
        text = (root / ".agents/skills" / name / "SKILL.md").read_text()
        if not text.startswith("---\n") or f"name: {name}\n" not in text:
            raise ValueError(f"Invalid skill metadata: {name}")
    script = root / ".agents/skills/ui-ux-pro-max/scripts/search.py"
    result = subprocess.run([sys.executable, str(script), "keyboard focus modal", "--domain", "ux", "--json"],
                            capture_output=True, text=True, check=True, timeout=30)
    data = json.loads(result.stdout)
    if data.get("domain") != "ux" or not data.get("count", 0) or not data.get("results"):
        raise ValueError("UI/UX search did not return UX guidance")
    print(f"PASS: {root} — {len(lock['files'])} locked assets, two skill entries, local UX search")
    return lock

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--modules", action="store_true", help="Compare initialized platform submodules")
    args = parser.parse_args()
    try:
        baseline = check(ROOT)
        if args.modules:
            for name in ("map-service", "reservation-service"):
                module = ROOT / "modules" / name
                if check(module) != baseline:
                    raise ValueError(f"Design snapshot differs: {name}")
        print("Design asset verification completed. This does not test application UI.")
    except (OSError, ValueError, KeyError, subprocess.SubprocessError) as error:
        print(f"FAIL: {error}", file=sys.stderr)
        sys.exit(1)
