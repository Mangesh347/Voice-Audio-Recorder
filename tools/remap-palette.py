from pathlib import Path
import re

BLUE = "#1D8BE7"
ORANGE = "#F56600"
CHARCOAL = "#1A1A1A"
BLUE_RGB = "29, 139, 231"
ORANGE_RGB = "245, 102, 0"

hex_map = {
    "#6750a4": BLUE,
    "#8066c2": BLUE,
    "#b69df8": BLUE,
    "#4f378b": BLUE,
    "#7b5cc8": BLUE,
    "#c5a8f7": BLUE,
    "#c8a9fa": BLUE,
    "#dcc7ff": BLUE,
    "#eadcff": f"rgba({BLUE_RGB}, 0.18)",
    "#eaddff": f"rgba({BLUE_RGB}, 0.18)",
    "#c9a8ff": BLUE,
    "#e8d7ff": BLUE,
    "#f0e5ff": f"rgba({BLUE_RGB}, 0.22)",
    "#f6edff": f"rgba({BLUE_RGB}, 0.28)",
    "#d0bcff": BLUE,
    "#55469b": BLUE,
    "#7564cc": BLUE,
    "#7764eb": BLUE,
    "#6c5ce7": BLUE,
    "#dfd9ff": f"rgba({BLUE_RGB}, 0.2)",
    "#6d67be": BLUE,
    "#c9ceff": BLUE,
    "#aeb5ee": BLUE,
    "#381e72": CHARCOAL,
    "#3b2468": CHARCOAL,
    "#302342": CHARCOAL,
    "#2a1d3d": CHARCOAL,
    "#34264f": CHARCOAL,
    "#5c48c6": BLUE,
    "#4f58c9": BLUE,
    "#5a65c9": BLUE,
    "#e9e6ff": f"rgba({BLUE_RGB}, 0.16)",
    "#174fd8": BLUE,
    "#4c74e8": BLUE,
    "#8069e8": BLUE,
    "#ff6b2c": ORANGE,
    "#ffad32": ORANGE,
    "#ffad66": ORANGE,
    "#ff9456": ORANGE,
    "#f47b3c": ORANGE,
    "#ff7a1a": ORANGE,
    "#ff7a1c": ORANGE,
    "#ff8a1f": ORANGE,
    "#ff8a32": ORANGE,
    "#ff8a45": ORANGE,
    "#ff9a3c": ORANGE,
    "#ff9d3f": ORANGE,
    "#ff9f1c": ORANGE,
    "#ffb347": ORANGE,
    "#ffc56a": ORANGE,
    "#ffc38f": CHARCOAL,
    "#ffd2a0": CHARCOAL,
    "#ffb68b": CHARCOAL,
    "#a85025": CHARCOAL,
    "#ffcc24": ORANGE,
    "#ffd338": ORANGE,
    "#ff4f32": ORANGE,
    "#ff7628": ORANGE,
    "#ff8a2a": ORANGE,
    "#f56600": ORANGE,
    "#17131b": CHARCOAL,
    "#16111c": CHARCOAL,
    "#16121e": CHARCOAL,
    "#141217": CHARCOAL,
    "#100d16": CHARCOAL,
    "#181322": CHARCOAL,
    "#23141a": CHARCOAL,
    "#1c1b1f": CHARCOAL,
    "#211f26": CHARCOAL,
    "#241f20": CHARCOAL,
    "#09080e": CHARCOAL,
    "#17233f": CHARCOAL,
    "#1d1b20": CHARCOAL,
    "#27365c": CHARCOAL,
    "#243252": CHARCOAL,
}

rgba_replacements = [
    (r"rgba\(\s*103\s*,\s*80\s*,\s*164\s*,\s*([\d.]+)\s*\)", rf"rgba({BLUE_RGB}, \1)"),
    (r"rgba\(\s*79\s*,\s*55\s*,\s*139\s*,\s*([\d.]+)\s*\)", rf"rgba({BLUE_RGB}, \1)"),
    (r"rgba\(\s*182\s*,\s*157\s*,\s*248\s*,\s*([\d.]+)\s*\)", rf"rgba({BLUE_RGB}, \1)"),
    (r"rgba\(\s*208\s*,\s*188\s*,\s*255\s*,\s*([\d.]+)\s*\)", rf"rgba({BLUE_RGB}, \1)"),
    (r"rgba\(\s*201\s*,\s*168\s*,\s*255\s*,\s*([\d.]+)\s*\)", rf"rgba({BLUE_RGB}, \1)"),
    (r"rgba\(\s*197\s*,\s*168\s*,\s*247\s*,\s*([\d.]+)\s*\)", rf"rgba({BLUE_RGB}, \1)"),
    (r"rgba\(\s*216\s*,\s*194\s*,\s*255\s*,\s*([\d.]+)\s*\)", rf"rgba({BLUE_RGB}, \1)"),
    (r"rgba\(\s*220\s*,\s*199\s*,\s*255\s*,\s*([\d.]+)\s*\)", rf"rgba({BLUE_RGB}, \1)"),
    (r"rgba\(\s*232\s*,\s*215\s*,\s*255\s*,\s*([\d.]+)\s*\)", rf"rgba({BLUE_RGB}, \1)"),
    (r"rgba\(\s*234\s*,\s*220\s*,\s*255\s*,\s*([\d.]+)\s*\)", rf"rgba({BLUE_RGB}, \1)"),
    (r"rgba\(\s*234\s*,\s*221\s*,\s*255\s*,\s*([\d.]+)\s*\)", rf"rgba({BLUE_RGB}, \1)"),
    (r"rgba\(\s*240\s*,\s*229\s*,\s*255\s*,\s*([\d.]+)\s*\)", rf"rgba({BLUE_RGB}, \1)"),
    (r"rgba\(\s*244\s*,\s*235\s*,\s*255\s*,\s*([\d.]+)\s*\)", rf"rgba({BLUE_RGB}, \1)"),
    (r"rgba\(\s*85\s*,\s*70\s*,\s*155\s*,\s*([\d.]+)\s*\)", rf"rgba({BLUE_RGB}, \1)"),
    (r"rgba\(\s*148\s*,\s*150\s*,\s*255\s*,\s*([\d.]+)\s*\)", rf"rgba({BLUE_RGB}, \1)"),
    (r"rgba\(\s*91\s*,\s*112\s*,\s*225\s*,\s*([\d.]+)\s*\)", rf"rgba({BLUE_RGB}, \1)"),
    (r"rgba\(\s*79\s*,\s*97\s*,\s*171\s*,\s*([\d.]+)\s*\)", rf"rgba({BLUE_RGB}, \1)"),
    (r"rgba\(\s*69\s*,\s*91\s*,\s*180\s*,\s*([\d.]+)\s*\)", rf"rgba({BLUE_RGB}, \1)"),
    (r"rgba\(\s*255\s*,\s*135\s*,\s*66\s*,\s*([\d.]+)\s*\)", rf"rgba({ORANGE_RGB}, \1)"),
    (r"rgba\(\s*255\s*,\s*138\s*,\s*42\s*,\s*([\d.]+)\s*\)", rf"rgba({ORANGE_RGB}, \1)"),
    (r"rgba\(\s*255\s*,\s*138\s*,\s*69\s*,\s*([\d.]+)\s*\)", rf"rgba({ORANGE_RGB}, \1)"),
    (r"rgba\(\s*255\s*,\s*128\s*,\s*24\s*,\s*([\d.]+)\s*\)", rf"rgba({ORANGE_RGB}, \1)"),
    (r"rgba\(\s*255\s*,\s*122\s*,\s*28\s*,\s*([\d.]+)\s*\)", rf"rgba({ORANGE_RGB}, \1)"),
    (r"rgba\(\s*255\s*,\s*130\s*,\s*36\s*,\s*([\d.]+)\s*\)", rf"rgba({ORANGE_RGB}, \1)"),
    (r"rgba\(\s*255\s*,\s*122\s*,\s*26\s*,\s*([\d.]+)\s*\)", rf"rgba({ORANGE_RGB}, \1)"),
    (r"rgba\(\s*255\s*,\s*106\s*,\s*24\s*,\s*([\d.]+)\s*\)", rf"rgba({ORANGE_RGB}, \1)"),
    (r"rgba\(\s*255\s*,\s*112\s*,\s*26\s*,\s*([\d.]+)\s*\)", rf"rgba({ORANGE_RGB}, \1)"),
    (r"rgba\(\s*255\s*,\s*104\s*,\s*38\s*,\s*([\d.]+)\s*\)", rf"rgba({ORANGE_RGB}, \1)"),
    (r"rgba\(\s*255\s*,\s*91\s*,\s*32\s*,\s*([\d.]+)\s*\)", rf"rgba({ORANGE_RGB}, \1)"),
    (r"rgba\(\s*255\s*,\s*159\s*,\s*28\s*,\s*([\d.]+)\s*\)", rf"rgba({ORANGE_RGB}, \1)"),
    (r"rgba\(\s*255\s*,\s*154\s*,\s*60\s*,\s*([\d.]+)\s*\)", rf"rgba({ORANGE_RGB}, \1)"),
    (r"rgba\(\s*255\s*,\s*182\s*,\s*145\s*,\s*([\d.]+)\s*\)", rf"rgba({ORANGE_RGB}, \1)"),
    (r"rgba\(\s*255\s*,\s*157\s*,\s*122\s*,\s*([\d.]+)\s*\)", rf"rgba({ORANGE_RGB}, \1)"),
]

root = Path(r"C:\Users\Lenovo\Projects\fenwick-recorder")
files = [
    root / "popup.css",
    root / "popup.html",
    root / "options.css",
    root / "icons" / "fenwick-mic.svg",
]


def remap(text: str) -> str:
    def repl_hex(match: re.Match[str]) -> str:
        return hex_map.get(match.group(0).lower(), match.group(0))

    text = re.sub(r"#[0-9a-fA-F]{6}", repl_hex, text)
    for pattern, replacement in rgba_replacements:
        text = re.sub(pattern, replacement, text, flags=re.I)
    return text


for path in files:
    original = path.read_text(encoding="utf-8")
    updated = remap(original)
    if updated != original:
        path.write_text(updated, encoding="utf-8")
        print(f"updated {path.name}")
    else:
        print(f"unchanged {path.name}")

print("done")
