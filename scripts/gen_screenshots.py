"""
Generate copyright-safe Chrome Web Store screenshot scenes (1280x800) -> store-assets/

  screenshot-1-freeze.png  - a fully synthetic "frozen feed" mockup (generic
                             placeholder cards; no real thumbnails/titles/logo).
  screenshot-2-popup.png   - the popup on a branded hero scene (Freeze).
  screenshot-3-search.png  - the popup (search state) on a branded hero scene.

The popup images come from `scripts/render_popup.py` (popup.png / popup-search.png).
If they're missing, a labeled placeholder is drawn so layout can be previewed.

Everything is drawn at 2x and downscaled with LANCZOS for crisp text and edges.

Usage:  python scripts/gen_screenshots.py
"""
import math
import os
import random
from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "store-assets")
os.makedirs(OUT, exist_ok=True)

S = 2                      # supersample factor
W, H = 1280, 800
CW, CH = W * S, H * S
BG_TOP, BG_BOT = (18, 32, 49), (6, 11, 18)
GLOW, FROST, ICE, MUTED, FAINT = (76, 196, 255), (210, 245, 255), (56, 182, 255), (150, 178, 202), (92, 112, 132)


def font(paths, size):
    for p in paths:
        try:
            return ImageFont.truetype(p, size)
        except Exception:
            continue
    return ImageFont.load_default()


def MONO_B(s): return font([r"C:\Windows\Fonts\consolab.ttf", r"C:\Windows\Fonts\arialbd.ttf"], int(s * S))
def MONO_R(s): return font([r"C:\Windows\Fonts\consola.ttf", r"C:\Windows\Fonts\arial.ttf"], int(s * S))


def vgradient(w, h, top, bot):
    col = Image.new("RGB", (1, h))
    for y in range(h):
        t = y / (h - 1)
        col.putpixel((0, y), tuple(round(top[i] + (bot[i] - top[i]) * t) for i in range(3)))
    return col.resize((w, h))


def stamp_flake(img, cx, cy, R, lw, color):
    d = ImageDraw.Draw(img)

    def cap(p, w): d.ellipse([p[0] - w / 2, p[1] - w / 2, p[0] + w / 2, p[1] + w / 2], fill=color)
    def seg(p1, p2, w): d.line([p1, p2], fill=color, width=max(1, int(w))); cap(p1, w); cap(p2, w)

    for a in [-90 + 60 * k for k in range(6)]:
        rad = math.radians(a); dx, dy = math.cos(rad), math.sin(rad)
        seg((cx, cy), (cx + dx * R, cy + dy * R), lw)
        base = (cx + dx * R * 0.55, cy + dy * R * 0.55)
        for off in (60, -60):
            br = math.radians(a + off)
            seg(base, (base[0] + math.cos(br) * R * 0.32, base[1] + math.sin(br) * R * 0.32), lw * 0.8)


def scene_bg(glow_xy, watermark_xy=None):
    img = vgradient(CW, CH, BG_TOP, BG_BOT).convert("RGBA")
    glow = Image.new("RGBA", (CW, CH), (0, 0, 0, 0))
    gx, gy = glow_xy
    r = max(CW, CH) * 0.5
    ImageDraw.Draw(glow).ellipse([gx - r, gy - r, gx + r, gy + r], fill=(GLOW[0], GLOW[1], GLOW[2], 95))
    img = Image.alpha_composite(img, glow.filter(ImageFilter.GaussianBlur(CW * 0.07)))
    if watermark_xy:
        wm = Image.new("RGBA", (CW, CH), (0, 0, 0, 0))
        stamp_flake(wm, watermark_xy[0], watermark_xy[1], 240 * S, 7 * S, (GLOW[0], GLOW[1], GLOW[2], 22))
        img = Image.alpha_composite(img, wm)
    random.seed(11)
    n = Image.new("L", (CW // 2, CH // 2))
    n.putdata([random.randint(0, 255) for _ in range((CW // 2) * (CH // 2))])
    n = n.resize((CW, CH))
    return Image.alpha_composite(img, Image.merge("RGBA", (n, n, n, Image.new("L", (CW, CH), 8))))


def tracked(draw, x, y, text, fnt, tr, fill):
    cx = x
    for ch in text:
        draw.text((cx, y), ch, font=fnt, fill=fill)
        cx += draw.textlength(ch, font=fnt) + tr
    return cx


def tracked_grad(canvas, x, y, text, fnt, tr, top, bot):
    mask = Image.new("L", canvas.size, 0)
    tracked(ImageDraw.Draw(mask), x, y, text, fnt, tr, 255)
    canvas.paste(vgradient(CW, CH, top, bot).convert("RGBA"), (0, 0), mask)


def rounded(size, radius):
    m = Image.new("L", size, 0)
    ImageDraw.Draw(m).rounded_rectangle([0, 0, size[0] - 1, size[1] - 1], radius=radius, fill=255)
    return m


def drop_in(scene, panel, x, y, radius, shadow):
    pw, ph = panel.size
    mask = rounded((pw, ph), radius)
    sh = Image.new("RGBA", scene.size, (0, 0, 0, 0))
    sh.paste(Image.new("RGBA", (pw, ph), (0, 0, 0, 160)), (x, y + 14 * S), mask)
    scene = Image.alpha_composite(scene, sh.filter(ImageFilter.GaussianBlur(shadow)))
    rim = Image.new("RGBA", scene.size, (0, 0, 0, 0))
    ImageDraw.Draw(rim).rounded_rectangle([x - 2, y - 2, x + pw + 1, y + ph + 1], radius=radius + 2,
                                          outline=(GLOW[0], GLOW[1], GLOW[2], 110), width=3)
    scene = Image.alpha_composite(scene, rim.filter(ImageFilter.GaussianBlur(6 * S)))
    pr = panel.copy(); pr.putalpha(mask)
    scene.alpha_composite(pr, (x, y))
    return scene


def check(d, x, y, s, color, w):
    d.line([(x, y + s * 0.55), (x + s * 0.42, y + s)], fill=color, width=w, joint="curve")
    d.line([(x + s * 0.42, y + s), (x + s, y)], fill=color, width=w, joint="curve")


# ---------- scene 1: synthetic frozen feed ----------
def feed_card(d, x, y, w):
    th = w * 9 / 16
    d.rounded_rectangle([x, y, x + w, y + th], radius=10 * S, fill=(20, 32, 47))
    d.rounded_rectangle([x, y, x + w, y + th], radius=10 * S, outline=(128, 198, 255, 45), width=S)
    cxp, cyp = x + w / 2, y + th / 2
    s = w * 0.06
    d.polygon([(cxp - s * 0.6, cyp - s), (cxp - s * 0.6, cyp + s), (cxp + s, cyp)],
              outline=(147, 234, 255, 150), width=2 * S)
    ay = y + th + 12 * S
    d.ellipse([x, ay, x + 22 * S, ay + 22 * S], fill=(38, 54, 72))
    d.rounded_rectangle([x + 30 * S, ay + S, x + w - 12 * S, ay + 9 * S], radius=4 * S, fill=(50, 68, 90))
    d.rounded_rectangle([x + 30 * S, ay + 15 * S, x + w - 70 * S, ay + 23 * S], radius=4 * S, fill=(34, 48, 64))


def make_freeze():
    sc = scene_bg((CW * 0.5, -CH * 0.1))
    tracked_grad(sc, 64 * S, 38 * S, "YOUR HOME FEED, FROZEN IN PLACE", MONO_B(30), 2 * S, (255, 255, 255), FROST)
    d = ImageDraw.Draw(sc)
    tracked(d, 66 * S, 84 * S, "It stays exactly as you left it until you choose to refresh.", MONO_R(16), 0.5 * S, MUTED)

    wx, wy, ww, wh = 64 * S, 132 * S, (W - 128) * S, (H - 196) * S
    win = Image.new("RGBA", (ww, wh), (0, 0, 0, 0))
    wd = ImageDraw.Draw(win)
    wd.rounded_rectangle([0, 0, ww - 1, wh - 1], radius=16 * S, fill=(11, 18, 27, 255))
    wd.rounded_rectangle([0, 0, ww - 1, 44 * S], radius=16 * S, fill=(16, 26, 39, 255))
    wd.rectangle([0, 30 * S, ww, 44 * S], fill=(16, 26, 39, 255))
    for i, c in enumerate([(255, 95, 86), (255, 189, 46), (39, 201, 63)]):
        wd.ellipse([18 * S + i * 20 * S, 16 * S, 30 * S + i * 20 * S, 28 * S], fill=c)
    wd.rounded_rectangle([ww / 2 - 130 * S, 12 * S, ww / 2 + 130 * S, 32 * S], radius=10 * S, fill=(9, 15, 23))
    wd.text((ww / 2 - 116 * S, 16 * S), "youtube.com  -  Home", font=MONO_R(12), fill=FAINT)
    win.paste(vgradient(ww, 3 * S, FROST, ICE), (0, 46 * S))
    pad, cols = 26 * S, 3
    gx0, gy0 = pad, 64 * S
    cw = (ww - pad * 2 - (cols - 1) * 22 * S) / cols
    for r in range(2):
        for c in range(cols):
            feed_card(wd, gx0 + c * (cw + 22 * S), gy0 + r * (cw * 9 / 16 + 56 * S), cw)
    sc.alpha_composite(win, (wx, wy))

    px, py = wx + ww - 190 * S, wy + wh - 70 * S
    pill = Image.new("RGBA", (180 * S, 44 * S), (0, 0, 0, 0))
    pd = ImageDraw.Draw(pill)
    pd.rounded_rectangle([0, 0, 180 * S - 1, 44 * S - 1], radius=22 * S, fill=(13, 23, 35, 235), outline=(128, 198, 255, 130), width=S)
    stamp_flake(pill, 24 * S, 22 * S, 9 * S, 2 * S, (147, 234, 255, 255))
    pd.text((42 * S, 13 * S), "Refresh feed", font=MONO_B(15), fill=(219, 243, 255))
    glow = Image.new("RGBA", sc.size, (0, 0, 0, 0)); glow.alpha_composite(pill, (px, py))
    sc = Image.alpha_composite(sc, glow.filter(ImageFilter.GaussianBlur(10 * S)))
    sc.alpha_composite(pill, (px, py))
    return sc.resize((W, H), Image.LANCZOS).convert("RGB")


# ---------- scenes 2 & 3: popup hero ----------
def placeholder_popup():
    pw, ph = 384 * S, 720 * S
    p = Image.new("RGBA", (pw, ph), (14, 22, 34, 255))
    d = ImageDraw.Draw(p)
    d.rounded_rectangle([0, 0, pw - 1, ph - 1], radius=16 * S, outline=(128, 198, 255, 120), width=2 * S)
    d.text((30 * S, 320 * S), "run scripts/render_popup.py", font=MONO_R(14), fill=(150, 178, 202))
    return p


def make_popup_scene(popup_path, headline, sub, ticks):
    sc = scene_bg((CW * 0.26, -CH * 0.12), watermark_xy=(CW * 0.9, CH * 1.05))
    if os.path.exists(popup_path):
        popup = Image.open(popup_path).convert("RGBA")
    else:
        popup = placeholder_popup()
    target_h = int(700 * S)
    popup = popup.resize((round(popup.width * target_h / popup.height), target_h), Image.LANCZOS)
    px = CW - popup.width - 78 * S
    py = (CH - popup.height) // 2
    sc = drop_in(sc, popup, px, py, radius=18 * S, shadow=42 * S)

    d = ImageDraw.Draw(sc)
    lx = 74 * S
    stamp_flake(sc, lx + 7 * S, 132 * S, 9 * S, 2 * S, FROST)
    d = ImageDraw.Draw(sc)
    tracked(d, lx + 24 * S, 125 * S, "PERMAFEED", MONO_B(13), 3 * S, (150, 178, 202))

    hy = 190 * S
    for i, line in enumerate(headline):
        tracked_grad(sc, lx, hy + i * 56 * S, line, MONO_B(45), 1.5 * S, (255, 255, 255), FROST)
    d = ImageDraw.Draw(sc)
    sy = hy + len(headline) * 56 * S + 26 * S
    for i, line in enumerate(sub):
        tracked(d, lx + 2 * S, sy + i * 27 * S, line, MONO_R(16.5), 0.3 * S, MUTED)

    ty = sy + len(sub) * 27 * S + 30 * S
    for i, t in enumerate(ticks):
        yy = ty + i * 40 * S
        check(d, lx + 2 * S, yy + 2 * S, 15 * S, FROST, 3 * S)
        tracked(d, lx + 34 * S, yy, t, MONO_R(15.5), 0.2 * S, (200, 214, 226))
    return sc.resize((W, H), Image.LANCZOS).convert("RGB")


make_freeze().save(os.path.join(OUT, "screenshot-1-freeze.png"))
print("wrote screenshot-1-freeze.png")

make_popup_scene(
    os.path.join(OUT, "popup.png"),
    ["FREEZE YOUR", "HOME FEED."],
    ["The feed you last saw stays put across", "navigation and reloads, until you refresh."],
    ["Freezes on the first visit", "Restores your scroll position", "No tracking - everything stays local"],
).save(os.path.join(OUT, "screenshot-2-popup.png"))
print("wrote screenshot-2-popup.png")

make_popup_scene(
    os.path.join(OUT, "popup-search.png"),
    ["RECALL EVERY", "VIDEO YOU SAW."],
    ["Every video on Home is logged and", "searchable, even after the feed changed."],
    ["A searchable history", "Opens in one click", "Works in any mode"],
).save(os.path.join(OUT, "screenshot-3-search.png"))
print("wrote screenshot-3-search.png")
print("done ->", OUT)
