"""
Generate Permafeed toolbar icons (16/32/48/128) -> icons/

A frosted cyan snowflake on a deep blue-shifted rounded square, rendered at
high resolution and downscaled with LANCZOS for crisp edges. Pure PIL.

Usage:  python scripts/gen_icons.py
"""
import math
import os
from PIL import Image, ImageDraw, ImageFilter

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "icons")
os.makedirs(OUT, exist_ok=True)

SS = 1024
CX = CY = SS / 2
BG_TOP, BG_BOT = (17, 30, 46), (7, 12, 19)
GLOW = (76, 196, 255)
FLAKE_TOP, FLAKE_BOT = (210, 245, 255), (56, 182, 255)


def vgradient(size, top, bot):
    img = Image.new("RGB", (1, size), 0)
    for y in range(size):
        t = y / (size - 1)
        img.putpixel((0, y), tuple(round(top[i] + (bot[i] - top[i]) * t) for i in range(3)))
    return img.resize((size, size))


def rounded_mask(size, radius):
    m = Image.new("L", (size, size), 0)
    ImageDraw.Draw(m).rounded_rectangle([0, 0, size - 1, size - 1], radius=radius, fill=255)
    return m


bg = vgradient(SS, BG_TOP, BG_BOT).convert("RGBA")
glow = Image.new("RGBA", (SS, SS), (0, 0, 0, 0))
gr = SS * 0.62
ImageDraw.Draw(glow).ellipse([CX - gr, -gr * 0.5, CX + gr, gr * 1.5],
                             fill=(GLOW[0], GLOW[1], GLOW[2], 110))
bg = Image.alpha_composite(bg, glow.filter(ImageFilter.GaussianBlur(SS * 0.06)))
hi = Image.new("RGBA", (SS, SS), (0, 0, 0, 0))
ImageDraw.Draw(hi).rounded_rectangle([2, 2, SS - 3, SS - 3], radius=int(SS * 0.22),
                                     outline=(150, 220, 255, 40), width=max(2, int(SS * 0.006)))
bg = Image.alpha_composite(bg, hi)


def draw_flake(mask_size, line_w, arm_r):
    m = Image.new("L", (mask_size, mask_size), 0)
    d = ImageDraw.Draw(m)
    cx = cy = mask_size / 2

    def cap(p, w): d.ellipse([p[0] - w / 2, p[1] - w / 2, p[0] + w / 2, p[1] + w / 2], fill=255)
    def seg(p1, p2, w): d.line([p1, p2], fill=255, width=int(w)); cap(p1, w); cap(p2, w)

    for a in [-90 + 60 * k for k in range(6)]:
        rad = math.radians(a); dx, dy = math.cos(rad), math.sin(rad)
        seg((cx, cy), (cx + dx * arm_r, cy + dy * arm_r), line_w)
        for t, bl in ((0.45, 0.26), (0.72, 0.20)):
            base = (cx + dx * arm_r * t, cy + dy * arm_r * t)
            for off in (60, -60):
                br = math.radians(a + off)
                seg(base, (base[0] + math.cos(br) * arm_r * bl, base[1] + math.sin(br) * arm_r * bl), line_w * 0.82)
    hub = [(cx + math.cos(math.radians(-90 + 60 * k)) * arm_r * 0.16,
            cy + math.sin(math.radians(-90 + 60 * k)) * arm_r * 0.16) for k in range(6)]
    d.polygon(hub, fill=255)
    return m


flake_mask = draw_flake(SS, SS * 0.026, SS * 0.34)
flake_grad = vgradient(SS, FLAKE_TOP, FLAKE_BOT).convert("RGBA")
flake_glow = Image.new("RGBA", (SS, SS), (0, 0, 0, 0))
flake_glow.paste((GLOW[0], GLOW[1], GLOW[2], 255), (0, 0), flake_mask)
flake_glow = flake_glow.filter(ImageFilter.GaussianBlur(SS * 0.02))

art = Image.alpha_composite(bg, flake_glow)
art.paste(flake_grad, (0, 0), flake_mask)
out = Image.new("RGBA", (SS, SS), (0, 0, 0, 0))
out.paste(art, (0, 0), rounded_mask(SS, int(SS * 0.22)))

for size in (128, 48, 32, 16):
    out.resize((size, size), Image.LANCZOS).save(os.path.join(OUT, f"icon{size}.png"))
    print("wrote", f"icon{size}.png")
print("done ->", OUT)
