"""Renders the app icons into public/. Run: .venv/bin/python scripts/make_icons.py"""

import math
from pathlib import Path

from PIL import Image, ImageDraw

OUT = Path(__file__).resolve().parent.parent / "public"
BG = (20, 20, 19)
RING = (245, 244, 239)
ACCENT = (57, 135, 229)
SS = 4  # supersampling factor


def render(size: int, padding: float = 0.0) -> Image.Image:
    s = size * SS
    img = Image.new("RGB", (s, s), BG)
    d = ImageDraw.Draw(img)
    c = s / 2
    r = s * (0.30 - padding * 0.5)
    w = s * 0.075
    box = [c - r, c - r, c + r, c + r]
    # progress ring, open at the top right where the "peak" sits
    d.arc(box, start=-35, end=250, fill=RING, width=int(w))
    # peak dot at the end of the arc
    a = math.radians(-62)
    rm = r - w / 2  # PIL draws arc width inward from the box
    px, py = c + rm * math.cos(a), c + rm * math.sin(a)
    dr = w * 0.8
    d.ellipse([px - dr, py - dr, px + dr, py + dr], fill=ACCENT)
    return img.resize((size, size), Image.LANCZOS)


def main() -> None:
    OUT.mkdir(exist_ok=True)
    render(180).save(OUT / "apple-touch-icon.png")
    render(192).save(OUT / "icon-192.png")
    render(512).save(OUT / "icon-512.png")
    render(512, padding=0.12).save(OUT / "icon-maskable-512.png")
    render(64).save(OUT / "favicon.png")
    print("icons written to", OUT)


if __name__ == "__main__":
    main()
