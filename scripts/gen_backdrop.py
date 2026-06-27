"""
Generate a 1280x800 frosted backdrop -> store-assets/screenshot-backdrop-1280x800.png

Composite the (small) popup screenshots onto this so all Chrome Web Store
screenshots share the Permafeed look and meet the 640px minimum. Pure PIL.

Usage:  python scripts/gen_backdrop.py
"""
import math
import os
import random
from PIL import Image, ImageDraw, ImageFilter

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "store-assets")
os.makedirs(OUT, exist_ok=True)

W, H = 1280, 800
BG_TOP, BG_BOT, GLOW = (20, 35, 53), (6, 10, 17), (76, 196, 255)


def vgrad(w, h, a, b):
    c = Image.new("RGB", (1, h))
    for y in range(h):
        t = y / (h - 1)
        c.putpixel((0, y), tuple(round(a[i] + (b[i] - a[i]) * t) for i in range(3)))
    return c.resize((w, h))


img = vgrad(W, H, BG_TOP, BG_BOT).convert("RGBA")
glow = Image.new("RGBA", (W, H), (0, 0, 0, 0))
ImageDraw.Draw(glow).ellipse([W * 0.5 - 700, -500, W * 0.5 + 700, 500],
                             fill=(GLOW[0], GLOW[1], GLOW[2], 90))
img = Image.alpha_composite(img, glow.filter(ImageFilter.GaussianBlur(120)))

mask = Image.new("L", (W, H), 0)
d = ImageDraw.Draw(mask)
cx, cy, R, lw = W * 0.86, H * 0.82, 260, 7


def cap(p, w): d.ellipse([p[0] - w / 2, p[1] - w / 2, p[0] + w / 2, p[1] + w / 2], fill=255)
def seg(p1, p2, w): d.line([p1, p2], fill=255, width=int(w)); cap(p1, w); cap(p2, w)


for a in [-90 + 60 * k for k in range(6)]:
    r = math.radians(a); dx, dy = math.cos(r), math.sin(r)
    seg((cx, cy), (cx + dx * R, cy + dy * R), lw)
    for t, bl in ((0.45, 0.26), (0.72, 0.20)):
        base = (cx + dx * R * t, cy + dy * R * t)
        for off in (60, -60):
            br = math.radians(a + off)
            seg(base, (base[0] + math.cos(br) * R * bl, base[1] + math.sin(br) * R * bl), lw * 0.8)
flake = Image.new("RGBA", (W, H), (0, 0, 0, 0))
flake.paste((GLOW[0], GLOW[1], GLOW[2], 26), (0, 0), mask)
img = Image.alpha_composite(img, flake)

ImageDraw.Draw(img).rectangle([0, 0, W, 3], fill=(147, 234, 255, 200))

n = Image.new("L", (W // 2, H // 2)); random.seed(3)
n.putdata([random.randint(0, 255) for _ in range((W // 2) * (H // 2))])
n = n.resize((W, H))
img = Image.alpha_composite(img, Image.merge("RGBA", (n, n, n, Image.new("L", (W, H), 8))))

img.convert("RGB").save(os.path.join(OUT, "screenshot-backdrop-1280x800.png"))
print("wrote screenshot-backdrop-1280x800.png ->", OUT)
