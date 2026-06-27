# Store assets

Branded images for the Chrome Web Store listing, plus a guide for the
screenshots (those have to be captured from a real browser).

## Generated assets (ready to upload)

| File | Size | Where it goes |
|------|------|---------------|
| `promo-small-440x280.png` | 440x280 | Store listing "Small promo tile" |
| `promo-marquee-1400x560.png` | 1400x560 | Store listing "Marquee promo tile" |
| `screenshot-1-freeze.png` | 1280x800 | Store screenshot 1 (synthetic feed) |
| `screenshot-2-popup.png` | 1280x800 | Store screenshot 2 (your popup) |
| `screenshot-3-search.png` | 1280x800 | Store screenshot 3 (your popup, search) |
| `screenshot-backdrop-1280x800.png` | 1280x800 | Spare backdrop, if you compose by hand |

The toolbar/store icon is `../icons/icon128.png`.

## Screenshots: a copyright-safe approach

We do **not** show the real YouTube feed (its thumbnails, titles, and logo are
not ours to publish). Instead:

- **Screenshot 1** is a fully synthetic "frozen feed" mockup (generic placeholder
  cards, no real content).
- **Screenshots 2 and 3** feature the popup itself, rendered from the real
  `popup.css` with mock, copyright-safe data, composited onto a branded scene.

### Fully automated (no manual capture needed)

`scripts/render_popup.py` drives headless Chrome to render the popup to
`popup.png` and `popup-search.png` (generic placeholder thumbnails, made-up
titles - nothing from YouTube). `scripts/gen_screenshots.py` then composites
those into the scenes. Just run, in order:

```sh
python scripts/render_popup.py     # -> store-assets/popup{,-search}.png
python scripts/gen_screenshots.py  # -> store-assets/screenshot-{1,2,3}-*.png
```

If the popup PNGs are missing, the scenes fall back to a labeled placeholder so
you can still preview the layout.

## Regenerating the branded assets

These PNGs are generated with PIL (`pip install pillow`). If you tweak the
palette or mark, re-run the generators:

```sh
python scripts/gen_icons.py        # -> icons/icon{16,32,48,128}.png
python scripts/gen_promo.py        # -> store-assets/promo-*.png
python scripts/gen_backdrop.py     # -> store-assets/screenshot-backdrop-1280x800.png
python scripts/render_popup.py     # -> store-assets/popup{,-search}.png  (headless Chrome)
python scripts/gen_screenshots.py  # -> store-assets/screenshot-{1,2,3}-*.png
```
