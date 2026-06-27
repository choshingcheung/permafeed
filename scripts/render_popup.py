"""
Render the Permafeed popup to a crisp PNG with headless Chrome, using the real
popup.css plus mock, copyright-safe data (generic placeholder thumbnails, made-up
titles). Produces:
  store-assets/popup.png         - default state (Freeze selected, list populated)
  store-assets/popup-search.png  - the same with the search box in use

Usage:  python scripts/render_popup.py
"""
import os
import subprocess
import tempfile
import urllib.parse

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "store-assets")
CSS = os.path.join(ROOT, "src", "popup", "popup.css")
os.makedirs(OUT, exist_ok=True)

CHROME = next((p for p in [
    r"C:\Program Files\Google\Chrome\Application\chrome.exe",
    r"C:\Program Files (x86)\Google\Chrome\Application\chrome.exe",
    r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe",
    r"C:\Program Files\Microsoft\Edge\Application\msedge.exe",
] if os.path.exists(p)), None)
if not CHROME:
    raise SystemExit("No Chrome/Edge found for headless rendering.")

# Fictional, copyright-safe sample videos.
ENTRIES = [
    ("How frost crystals form on a cold window", "Northbound", "2m ago"),
    ("A slow walk through the winter alps", "Still Frames", "14m ago"),
    ("Building a tiny synth from scratch", "Mono Lab", "1h ago"),
    ("The quietest places left on earth", "Field Notes", "3h ago"),
]


def thumb():
    svg = (
        "<svg xmlns='http://www.w3.org/2000/svg' width='100' height='56'>"
        "<defs><linearGradient id='g' x1='0' y1='0' x2='0' y2='1'>"
        "<stop offset='0' stop-color='#1a2937'/><stop offset='1' stop-color='#101a25'/>"
        "</linearGradient></defs>"
        "<rect width='100' height='56' rx='7' fill='url(%23g)'/>"
        "<path d='M44 20 L44 36 L58 28 Z' fill='none' stroke='#9fe9ff' "
        "stroke-width='2' stroke-linejoin='round' opacity='0.8'/></svg>"
    )
    return "data:image/svg+xml," + urllib.parse.quote(svg)


def entry_html(title, channel, time):
    return (
        f'<a class="entry"><img src="{thumb()}" alt="">'
        f'<div class="meta"><div class="title">{title}</div>'
        f'<div class="by">{channel} &middot; <span class="time">{time}</span></div></div></a>'
    )


def page(entries, count, search_value, freeze_active=True, log_on=True):
    with open(CSS, encoding="utf-8") as f:
        css = f.read()
    rows = "".join(entry_html(*e) for e in entries)
    sv = f' value="{search_value}"' if search_value else ""
    def act(m): return " active" if (m == "freeze") == freeze_active and m == ("freeze" if freeze_active else "default") else ""
    freeze_cls = " active" if freeze_active else ""
    default_cls = "" if freeze_active else " active"
    checked = "checked" if log_on else ""
    return f"""<!DOCTYPE html><html><head><meta charset="utf-8"><style>{css}</style></head>
<body><div class="stagger" style="animation:none">
  <header><div class="crest">&#10052;</div>
    <div class="word"><span class="name">Permafeed</span><span class="tag">feed, kept on ice</span></div></header>
  <div class="modes">
    <label class="mode{default_cls}" data-mode="default"><span class="dot"></span>
      <span><span class="name">Default</span><div class="desc">Vanilla YouTube. Nothing touched.</div></span></label>
    <label class="mode{freeze_cls}" data-mode="freeze"><span class="dot"></span>
      <span><span class="name">&#10052; Freeze</span><div class="desc">Hold the last feed you saw until you refresh.</div></span></label>
  </div>
  <div><button id="refresh">&#10052; Refresh feed now</button>
    <div class="status">Frozen feed saved at 9:41 PM</div></div>
  <div class="seam"></div>
  <div>
    <div class="label"><span>Recently seen <span class="count">({count})</span></span>
      <button class="ghost">Clear</button></div>
    <label class="toggle"><input type="checkbox" {checked}><span class="track"></span>
      <span class="text">Record videos I see on Home</span></label>
    <div class="search-wrap">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round">
        <circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/></svg>
      <input id="search" type="search" placeholder="Search title or channel..."{sv}></div>
    <div class="log-list">{rows}</div>
  </div>
</div>
<style>.stagger>*{{opacity:1;animation:none}} body::after{{display:none}}</style>
</body></html>"""


def shot(html, out_name, height):
    tmp = os.path.join(tempfile.gettempdir(), out_name.replace(".png", ".html"))
    with open(tmp, "w", encoding="utf-8") as f:
        f.write(html)
    out = os.path.join(OUT, out_name)
    subprocess.run([
        CHROME, "--headless=new", "--disable-gpu", "--hide-scrollbars",
        "--no-first-run", "--no-default-browser-check",
        "--force-device-scale-factor=3", f"--window-size=384,{height}",
        f"--screenshot={out}", "file:///" + tmp.replace("\\", "/"),
    ], check=True, capture_output=True)
    print("wrote", out_name, f"({os.path.getsize(out) // 1024} KB)")


shot(page(ENTRIES, 4, ""), "popup.png", 740)
shot(page(ENTRIES[1:2], 4, "alps"), "popup-search.png", 524)
print("done ->", OUT)
