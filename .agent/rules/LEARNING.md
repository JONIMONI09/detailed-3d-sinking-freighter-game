# Active Error & Correction Log (LEARNING.md)

## Completed Triages & Resolutions (v2.0)

### [RESOLVED] Engine Room Mid-Aft Stairway Collision Block
- **Issue:** Player was blocked from descending into the engine room.
- **Root Cause:** `diesel_engine_core` at `Z = 13.5m` occupied the exact footprint of Stairwell 2 (`Z = 7.2m..13.8m`).
- **Fix:** Relocated `diesel_engine_core` to `Z = 17.5m` (`length = 6.2m`, `Z` span 14.1m to 20.3m). Pistons relocated to `Z = 15.0m..19.8m`, flywheel to `Z = 20.8m`. Stairwell landing is now completely clear and unobstructed.

### [RESOLVED] 3 TNT Detonations Anywhere Breaking Ship
- **Issue:** Detonating 3 TNT charges on the upper deck or bridge caused underwater hull breaches and snapped the ship in half.
- **Root Cause:** Proximity fallback queried up to 14.25m away unconditionally for `Y < 2.8m`, damaging bottom hull nodes through solid steel decks.
- **Fix:** Upper-deck blasts (`Y >= 0.8m`) cannot breach underwater hull nodes. Only direct contact explosions on the lower hull (`Y < 0.8m` and `d < 3.8m`, or outer plating `|X| > 7.5m`) can breach hull nodes.

### [RESOLVED] Watertight Door Locking with [L] Key
- **Issue:** No mechanism existed to lock doors or stop inter-compartment water transfer.
- **Root Cause:** Interaction only toggled open/close on `[E]`.
- **Fix:** Implemented holding `[L]` (0.8s) with a circular SVG progress ring around the crosshair. Dogged doors seal 100% watertight (0.0% water transfer). Tapping `[E]` respects the lock.

### [RESOLVED] Torricelli Hydrodynamics & Floating Sandbox Sinking
- **Issue:** Flooding was linear, flat, and capped at `Y = -0.15m` in the hold.
- **Fix:** Torricelli orifice flow ($v = \sqrt{2g \Delta h}$) dynamically scales with immersion depth. Holds overflowing past 72% spill water through stairwells onto the main deck (`mainDeckWaterMesh`). Physical beam bending moment ($M = \text{load}_{\text{mid}} - (\text{load}_{\text{fore}} + \text{load}_{\text{aft}}) \cdot 0.6$) governs keel failure.

### [RESOLVED] Performance Optimization
- **Issue:** CPU lag from per-frame `computeVertexNormals()` on 96x96 ocean grid.
- **Fix:** Removed per-frame CPU vertex normal calculation. Smooth 60+ FPS on mobile and desktop.

### [RESOLVED] Quota Sentinel Sidecar Blank White Screen / Exit Code 1
- **Issue:** Opening the `[Quota Sentinel]` Aux Pane tab displayed a blank white screen or error `sidecar process failed exit status 1`.
- **Root Cause:**
  1. Python Windows execution alias / CWD mismatch when executed from IDE sidecar launcher.
  2. External Tailwind CDN script was blocked by Aux Pane Electron Webview CSP.
- **Fix:** Converted the sidecar to native Node.js (`server.mjs`) with pure embedded CSS and dedicated `index.html`. Listening on `0.0.0.0:8769`.
- **Access:** [Quota Sentinel](sidecar://quota-sentinel/sentinel-dashboard/) or direct URL `http://127.0.0.1:8769/`.
