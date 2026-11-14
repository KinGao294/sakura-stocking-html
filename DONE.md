# DONE: Sheer knit stretch toy (v2)

**Entries**
- `index.html` is the source version. Serve the folder with `python3 -m http.server`, then open it.
- `stocking-play.html` is a single self-contained file (about 500 KB) that you can double-click. It works from `file://` with no server and no network.

## v2 changes
### A) The skirt reacts to the drag (clamped hard)
- A spring-damped skirt state follows both pulls.
  - **Lateral sway:** the summed pull pulls the hem toward it, and pointer velocity pushes it as an impulse. The limit is ±12 mm.
  - **Outward flare:** this grows with the pull amount and is biased toward the side being pulled. The limit is 14 mm.
  - **Pleat ripple:** a wave travels around the hem, its strength set by pointer speed, and dies away after release.
  - All three settle with damping (ζ≈0.22 for sway, 0.3 for flare, ripple decays by e^-2.2t).
- **Hard limit (enforced in the vertex shader, not just tuned):**
  - Vertical hem motion is `clamp(dy, -4 mm, +1 mm)`.
  - Flare and ripple only push outward. Z-sway only moves toward the camera.
  - The camera can no longer drop below its rest height; parallax only raises it. It always looks down onto the hem.
  - The skirt can't be grabbed, because picking only hits the two thigh proxies.

### B) Both thighs are pullable
- The pull system is now a per-leg rig (`makeRig` in `src/main.js`). Each thigh has its own 241×171 shell, physics, ripple, collision lookup table and pick proxy.
- The left rig is mirrored, with knit u-coordinates and normals flipped, so both sails look and light the same.
- Grabs are tracked per pointer, so two fingers can pull both stockings at once and release them independently.
- **Auto demo:** after about 2 s idle it pulls and releases the right leg, then the left, then hands control back. Its timing now runs on simulation time, so it stays in step with the physics even on slow devices.
- Framing is centred so a sail on either side stays in view at 16:9.

### Single-file build
- `tools/build_single.sh` runs `npx -y esbuild@0.24.0 src/main.js --bundle --format=iife --minify`, then swaps the inlined bundle into `index.html` in place of the module script tag. The output is `stocking-play.html`.
- `index.html` now has an empty inline favicon, so the console stays clean on both versions.

## Unchanged from v1
- **The look:** black void, pale sheer sparkly pantyhose, pleated charcoal skirt with stripes and a perforated mesh hem.
- **The gauze shader:** a knit grid in rest-fabric space that opens with the measured stretch.
- **Spring-back:** an underdamped spring plus a release ripple.
- **UX:** the hint, the custom cursor and the DPR fallback.
- No audio, tracking or network use.

## Verified in v2 (headless Chrome + SwiftShader, `tools/shoot_v2.py`; screenshots in `shots/`)
- **Console:** zero messages, with no errors or 404s, on both the served `index.html` and the `file://` `stocking-play.html` (`tools/check_single.py`).
- **Left leg** (`v2_left_mid_pull.png`): a real mouse drag pulls the left stocking. The right one stays at rest (D = 0).
- **Right leg** (`v2_right_mid_pull.png`): same check the other way round. The left one stays at rest.
- **Skirt during a pull** (`v2_skirt_sway_during_pull.png`): measured sway hit the 12 mm limit and flare reached about 8 mm. Ripple builds and then decays after release.
- **Multi-touch** (`v2_multitouch_both.png`): two pointers pull both legs at once. Lifting one finger releases only that leg.
- **Settled** (`v2_settled.png`): both springs end at about 1e-10 m, both shells switch off, and the skirt state returns to 0.
- **Auto demo** (`v2_auto_demo_left.png`): pulls right, then left, then hands control back.
- **Hem hard-limit test** (`v2_hem_worstcase_skirt_only.png`):
  - Setup: the skirt is rendered alone and forced to its worst-case limits (full sway in all directions, full flare, full ripple at 6 phases, both side biases), then compared with rest.
  - The lowest hem pixel is unchanged and the median hem rise is 0 px.
  - The largest single-column apparent rise is about 3 mm. That's the back layer of the hem, seen between pleats, flaring away from the camera in perspective. It isn't a lift: world-space vertical motion is clamped to at most +1 mm.
- **Single file** (`v2_singlefile_rest.png`, `v2_singlefile_left_pull.png`): renders and plays from `file://`.

## Known limits
- This is still a procedural deformation with spring dynamics, not a full cloth solver. The two sails don't collide with each other or with the opposite leg.
- The skirt response is a spring-driven vertex wobble within strict limits. It isn't simulated cloth, and its normals aren't recomputed (displacements are only millimetres).
- Performance was only measured under software rendering, which is slow: about 1–5 fps here, depending on load. Under that load the auto demo takes tens of seconds of wall time, but at real frame rates it takes about 5 s. Each active rig costs about 3.5 ms of CPU per frame under SwiftShader, and an idle rig costs nothing. Expect 60 fps on a typical laptop GPU, but I haven't measured that.
- Moiré can appear at mid stretch. `uDensity` adjusts it.
- In headless screenshots the Chinese hint renders with a fallback font.
