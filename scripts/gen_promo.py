"""
Generate Permafeed Chrome Web Store promo tiles -> store-assets/
- small promo tile   440 x 280
- marquee promo tile 1400 x 560

Pure PIL, rendered at 2x and downscaled (LANCZOS). Uses Consolas for the
monospace wordmark (falls back to Arial / PIL default if unavailable).

Usage:  python scripts/gen_promo.py
"""
import math
import os
import random
from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "store-assets")
os.makedirs(OUT, exist_ok=True)

BG_TOP, BG_BOT = (18, 32, 49), (6, 11, 18)
GLOW, FROST, ICE, MUTED = (76, 196, 255), (210, 245, 255), (56, 182, 255), (138, 168, 196)


def font(paths, size):
    for p in paths:
        try:
            return ImageFont.truetype(p, size)
        except Exception:
            continue
    return ImageFont.load_default()


def MONO_B(s): return font([r"C:\Windows\Fonts\consolab.ttf", r"C:\Windows\Fonts\arialbd.ttf"], s)
def MONO_R(s): return font([r"C:\Windows\Fonts\consola.ttf", r"C:\Windows\Fonts\arial.ttf"], s)


def vgradient(w, h, top, bot):
    col = Image.new("RGB", (1, h))
    for y in range(h):
        t = y / (h - 1)
        col.putpixel((0, y), tuple(round(top[i] + (bot[i] - top[i]) * t) for i in range(3)))
    return col.resize((w, h))


def background(w, h, glow_xy):
    img = vgradient(w, h, BG_TOP, BG_BOT).convert("RGBA")
    glow = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    gx, gy = glow_xy
    r = max(w, h) * 0.5
    ImageDraw.Draw(glow).ellipse([gx - r, gy - r, gx + r, gy + r], fill=(GLOW[0], GLOW[1], GLOW[2], 120))
    img = Image.alpha_composite(img, glow.filter(ImageFilter.GaussianBlur(max(w, h) * 0.08)))
    random.seed(7)
    noise = Image.new("L", (w // 2, h // 2))
    noise.putdata([random.randint(0, 255) for _ in range((w // 2) * (h // 2))])
    noise = noise.resize((w, h))
    return Image.alpha_composite(img, Image.merge("RGBA", (noise, noise, noise, Image.new("L", (w, h), 10))))


def add_flake(mask, cx, cy, R, lw):
    d = ImageDraw.Draw(mask)

    def cap(p, w): d.ellipse([p[0] - w / 2, p[1] - w / 2, p[0] + w / 2, p[1] + w / 2], fill=255)
    def seg(p1, p2, w): d.line([p1, p2], fill=255, width=int(w)); cap(p1, w); cap(p2, w)

    for a in [-90 + 60 * k for k in range(6)]:
        rad = math.radians(a); dx, dy = math.cos(rad), math.sin(rad)
        seg((cx, cy), (cx + dx * R, cy + dy * R), lw)
        for t, bl in ((0.45, 0.26), (0.72, 0.20)):
            base = (cx + dx * R * t, cy + dy * R * t)
            for off in (60, -60):
                br = math.radians(a + off)
                seg(base, (base[0] + math.cos(br) * R * bl, base[1] + math.sin(br) * R * bl), lw * 0.82)
    hub = [(cx + math.cos(math.radians(-90 + 60 * k)) * R * 0.16,
            cy + math.sin(math.radians(-90 + 60 * k)) * R * 0.16) for k in range(6)]
    d.polygon(hub, fill=255)


def paste_flake(canvas, cx, cy, R, lw, glow_alpha=180):
    w, h = canvas.size
    mask = Image.new("L", (w, h), 0)
    add_flake(mask, cx, cy, R, lw)
    glow = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    glow.paste((GLOW[0], GLOW[1], GLOW[2], glow_alpha), (0, 0), mask)
    canvas = Image.alpha_composite(canvas, glow.filter(ImageFilter.GaussianBlur(R * 0.06)))
    canvas.paste(vgradient(w, h, FROST, ICE).convert("RGBA"), (0, 0), mask)
    return canvas


def draw_tracked_gradient(canvas, x, y, text, fnt, tracking, top, bot):
    w, h = canvas.size
    mask = Image.new("L", (w, h), 0)
    md = ImageDraw.Draw(mask)
    cx = x
    for ch in text:
        md.text((cx, y), ch, font=fnt, fill=255)
        cx += md.textlength(ch, font=fnt) + tracking
    canvas.paste(vgradient(w, h, top, bot).convert("RGBA"), (0, 0), mask)


def draw_tracked_solid(draw, x, y, text, fnt, tracking, fill):
    cx = x
    for ch in text:
        draw.text((cx, y), ch, font=fnt, fill=fill)
        cx += draw.textlength(ch, font=fnt) + tracking


def make(w, h, layout):
    S = 3
    W, H = w * S, h * S
    if layout == "small":
        img = background(W, H, (W * 0.2, -H * 0.1))
        img = paste_flake(img, W * 0.21, H * 0.5, H * 0.30, H * 0.028)
        d = ImageDraw.Draw(img)
        tx, track = W * 0.40, H * 0.012
        draw_tracked_gradient(img, tx, H * 0.34, "PERMAFEED", MONO_B(int(H * 0.16)), track, (255, 255, 255), FROST)
        draw_tracked_solid(d, tx, H * 0.56, "Freeze your", MONO_R(int(H * 0.066)), track * 0.4, MUTED)
        draw_tracked_solid(d, tx, H * 0.56 + H * 0.085, "YouTube feed.", MONO_R(int(H * 0.066)), track * 0.4, MUTED)
    else:
        img = background(W, H, (W * 0.78, H * 0.1))
        img = paste_flake(img, W * 0.80, H * 0.52, H * 0.42, H * 0.020)
        for (fx, fy, r) in [(W * 0.62, H * 0.2, H * 0.05), (W * 0.9, H * 0.82, H * 0.07)]:
            faint = Image.new("L", (W, H), 0)
            add_flake(faint, fx, fy, r, max(2, H * 0.006))
            ov = Image.new("RGBA", (W, H), (0, 0, 0, 0))
            ov.paste((GLOW[0], GLOW[1], GLOW[2], 60), (0, 0), faint)
            img = Image.alpha_composite(img, ov.filter(ImageFilter.GaussianBlur(1)))
        d = ImageDraw.Draw(img)
        tx, track = W * 0.07, H * 0.014
        d.rectangle([tx, H * 0.30, tx + W * 0.16, H * 0.30 + max(2, H * 0.006)], fill=(147, 234, 255, 255))
        draw_tracked_gradient(img, tx, H * 0.36, "PERMAFEED", MONO_B(int(H * 0.135)), track, (255, 255, 255), FROST)
        draw_tracked_solid(d, tx, H * 0.58, "Freeze your YouTube home feed,", MONO_R(int(H * 0.052)), track * 0.3, MUTED)
        draw_tracked_solid(d, tx, H * 0.58 + H * 0.085, "and never lose a video you saw.", MONO_R(int(H * 0.052)), track * 0.3, MUTED)
    return img.resize((w, h), Image.LANCZOS).convert("RGB")


make(440, 280, "small").save(os.path.join(OUT, "promo-small-440x280.png"))
print("wrote promo-small-440x280.png")
make(1400, 560, "marquee").save(os.path.join(OUT, "promo-marquee-1400x560.png"))
print("wrote promo-marquee-1400x560.png")
print("done ->", OUT)
