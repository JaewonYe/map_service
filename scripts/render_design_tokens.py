"""Render platform CSS tokens from the shared theme specification."""
import argparse
import json
from pathlib import Path
ROOT = Path(__file__).resolve().parents[1]

def render(config):
    def block(selector, values, mode=None):
        lines = [selector + " {"]
        if mode:
            lines.append(f"  color-scheme: {mode};")
        lines.extend(f"  --{key}: {value};" for key, value in values.items())
        return "\n".join(lines + ["}"])
    output = ["/* Generated from themes.json. Run python3 scripts/render_design_tokens.py --write. */"]
    output += [block(":root", config["variables"]),
               block(':root, :root[data-theme="light"]', config["themes"]["light"], "light"),
               block(':root[data-theme="dark"]', config["themes"]["dark"], "dark")]
    automatic = block(":root:not([data-theme])", config["themes"]["dark"], "dark")
    output.append("@media (prefers-color-scheme: dark) {\n" + "\n".join("  " + line for line in automatic.splitlines()) + "\n}")
    return "\n\n".join(output) + "\n"

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    group = parser.add_mutually_exclusive_group()
    group.add_argument("--write", action="store_true")
    group.add_argument("--check", action="store_true")
    args = parser.parse_args()
    css = render(json.loads((ROOT / "design-system/platform/themes.json").read_text()))
    target = ROOT / "design-system/platform/tokens.css"
    if args.check:
        if target.read_text() != css:
            parser.exit(1, "tokens.css differs from themes.json\n")
        print("Theme token generation: PASS")
    elif args.write:
        target.write_text(css)
    else:
        print(css, end="")
