"""Verify pinned design skills, shared baseline, and local Python search. No network."""
from pathlib import Path
import argparse
import hashlib
import json
import subprocess
import sys
import importlib.util

ROOT = Path(__file__).resolve().parents[1]
LOCK = Path("design-system/platform/skills.lock.json")

def check(root):
    lock = json.loads((root / LOCK).read_text())
    for name, expected in lock["files"].items():
        path = root / name
        if not path.is_file() or hashlib.sha256(path.read_bytes()).hexdigest() != expected:
            raise ValueError(f"Missing or modified design asset: {path}")
    for name in ("platform-ui-design", "ui-ux-pro-max", "web-design-guidelines"):
        text = (root / ".agents/skills" / name / "SKILL.md").read_text()
        if not text.startswith("---\n") or f"name: {name}\n" not in text:
            raise ValueError(f"Invalid skill metadata: {name}")
    themes = json.loads((root / "design-system/platform/themes.json").read_text())
    if set(themes["themes"]) != {"light", "dark"} or set(themes["themes"]["light"]) != set(themes["themes"]["dark"]):
        raise ValueError("Light/dark must define the same semantic tokens")
    spec = importlib.util.spec_from_file_location("design_tokens", root / "scripts/render_design_tokens.py")
    renderer = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(renderer)
    if renderer.render(themes) != (root / "design-system/platform/tokens.css").read_text():
        raise ValueError("Generated CSS differs from themes.json")
    if set(themes["themes"]["light"]) != set(themes["themes"]["dark"]):
        raise ValueError("Light and dark semantic token sets differ")
    def luminance(color):
        values = [int(color[i:i+2], 16) / 255 for i in (1, 3, 5)]
        values = [v / 12.92 if v <= 0.04045 else ((v + 0.055) / 1.055) ** 2.4 for v in values]
        return sum(v * w for v, w in zip(values, (0.2126, 0.7152, 0.0722)))
    for mode, values in themes["themes"].items():
        for pair in themes["contrast_checks"]:
            a, b = sorted(luminance(values[pair[key]]) for key in ("foreground", "background"))
            ratio = (b + 0.05) / (a + 0.05)
            if ratio < pair["minimum"]:
                raise ValueError(f"Insufficient {mode} contrast: {pair}, {ratio:.2f}")
    script = root / ".agents/skills/ui-ux-pro-max/scripts/search.py"
    result = subprocess.run([sys.executable, str(script), "keyboard focus modal", "--domain", "ux", "--json"],
                            capture_output=True, text=True, check=True, timeout=30)
    data = json.loads(result.stdout)
    if data.get("domain") != "ux" or not data.get("count", 0) or not data.get("results"):
        raise ValueError("UI/UX search did not return UX guidance")
    print(f"PASS: {root} — {len(lock['files'])} locked assets, three skill entries, light/dark tokens and contrast, local UX search")
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
