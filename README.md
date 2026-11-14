# Sheer knit stretch toy

A real-time 3D toy you can play in the browser. Press on the stocking on **either** thigh and drag it outward or back. The knit lifts off into a taut, see-through gauze "sail", the skirt hem sways in response, and when you let go everything springs back. With two fingers you can pull both legs at once.

## How to open

**Quickest:** double-click `stocking-play.html`. It's a single self-contained file (about 500 KB) that works from `file://` with no server.

**Source version:**

```bash
cd sakura-stocking-html
python3 -m http.server 8000
# then open http://localhost:8000/index.html
```

- You don't need a build step or internet access. Three.js r170 is included in `vendor/three.module.js` (MIT, see `vendor/THREE_LICENSE`). Nothing loads from a CDN.
- You need a browser with WebGL2 (any current Chrome, Edge, Firefox or Safari).
- Opening `index.html` directly with `file://` won't work, because browsers block ES modules there. Use any static server.
- `index.html?nodemo` turns off the one-time automatic demo pull.

## Controls

| Input | Action |
|---|---|
| Mouse / touch: press on either thigh, then drag | Pull the stocking. The further you pull, the more the knit opens (with elastic resistance). |
| Release | The fabric springs back with a short, damped bounce. |
| Two fingers, one on each thigh | Pull both stockings independently. |
| Do nothing for about 2 s | One automatic demo plays (right leg, then left), then you're in control. |

## Files

- `index.html`: the page (full-bleed canvas, hint, custom pinch cursor, vignette and grain)
- `src/main.js`: geometry, shaders, cloth deformation, input, auto demo
- `vendor/`: local Three.js
- `assets/`: reference stills. They're used for visual reference only and the page doesn't load them.
- `shots/`: verification screenshots taken in headless Chrome
- `stocking-play.html`: the single-file build. Rebuild it with `tools/build_single.sh`, which uses esbuild 0.24 via npx.
- `tools/shoot.py` and `tools/shoot_v2.py`: the v1 and v2 headless verification scripts. They need Python Playwright plus Chrome.
- `tools/check_single.py`: checks that `stocking-play.html` works from `file://`.
