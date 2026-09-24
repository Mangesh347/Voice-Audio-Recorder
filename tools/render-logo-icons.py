"""Build all extension/website icons from the provided solid blue mic logo."""
from pathlib import Path
from PIL import Image, ImageDraw

ASSETS = Path(
    r"C:\Users\Lenovo\.cursor\projects\c-Users-Lenovo-Projects-fenwick-recorder"
    r"\assets\c__Users_Lenovo_AppData_Roaming_Cursor_User_workspaceStorage_"
    r"121c60524fcf30c7bea049eee9d69505_images_logo-source-ea6eeb92-d039-47d9-b17a-243da583fdb8.png"
)
root = Path(__file__).resolve().parents[1] / "icons"
web = Path(__file__).resolve().parents[1] / "website" / "icons"
web.mkdir(parents=True, exist_ok=True)

src = Image.open(ASSETS).convert("RGBA")
# Persist as logo-source
src.save(root / "logo-source.png")

# Knock out near-black / dark charcoal background → transparent
px = src.load()
w, h = src.size
for y in range(h):
    for x in range(w):
        r, g, b, a = px[x, y]
        # Dark charcoal plate behind the mic
        if r < 55 and g < 55 and b < 60:
            px[x, y] = (0, 0, 0, 0)
        # Also soft edges that are mostly dark
        elif r < 80 and g < 80 and b < 90 and (r + g + b) < 200:
            # Keep bright blue pixels (logo)
            if not (b > 150 and b > r + 40 and b > g + 20):
                px[x, y] = (0, 0, 0, 0)

bbox = src.getbbox()
mark = src.crop(bbox) if bbox else src


def fit_on_plate(size: int, with_plate: bool = True) -> Image.Image:
    """Scale mic to fill most of the tile; optional dark squircle for toolbar."""
    canvas = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    if with_plate:
        draw = ImageDraw.Draw(canvas)
        rad = max(2, round(size * 0.22))
        draw.rounded_rectangle([0, 0, size - 1, size - 1], radius=rad, fill=(26, 26, 26, 255))

    pad = max(1, round(size * 0.06))
    box = size - pad * 2
    ratio = min(box / mark.size[0], box / mark.size[1])
    # Slight overscale so the mic reads big in the toolbar
    ratio *= 1.12
    nw = max(1, int(mark.size[0] * ratio))
    nh = max(1, int(mark.size[1] * ratio))
    scaled = mark.resize((nw, nh), Image.Resampling.LANCZOS)
    ox = (size - nw) // 2
    oy = (size - nh) // 2
    canvas.alpha_composite(scaled, (ox, oy))
    return canvas


for size in (16, 32, 48, 128):
    # Supersample for cleaner edges
    hi = fit_on_plate(size * 4, with_plate=True)
    out = hi.resize((size, size), Image.Resampling.LANCZOS)
    out.save(root / f"icon{size}.png", optimize=True)
    print(f"wrote icon{size}.png")

# Website favicons
for name in ("icon48.png", "icon128.png"):
    (web / name).write_bytes((root / name).read_bytes())

# Also save a transparent full-res mark for reference
fit_on_plate(256, with_plate=False).save(root / "logo-transparent-256.png")
print("done")
