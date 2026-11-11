# 📋 Comprehensive Vessel & Simulation Integration Guide (Tomorrow's Prompt)

**Source Workspace A (Base Engine):** `C:\Users\ggjon\Desktop\detailed-3d-sinking-freighter-game`  
**Source Workspace B (Sonnet Edition):** `C:\Users\ggjon\Desktop\detailed-3d-sinking-freighter-game\detailed-3d-sinking-freighter-game_sonnet`  
**Target:** Unified Next-Generation Maritime Sinking Freighter Simulator  
**Date Generated:** 2026-11-11  

---

## 🎯 Master Prompt for Agent & Pair Programmer (Copy & Paste)

```markdown
# 🚢 PROMPT: Unified Maritime Simulation Integration (Base Engine + Sonnet 2 Edition)

You are tasked with executing a complete, seamless integration of the two specialized editions of the 3D Sinking Cargo Freighter Simulation:
- **Base Engine:** `detailed-3d-sinking-freighter-game/` (Features Torricelli orifice flow, contact-only blast attenuation, beam bending moments, watertight door dogging with L-key hold, unobstructed engine room stairwells, and 72% downflooding cascades).
- **Sonnet Edition:** `detailed-3d-sinking-freighter-game/detailed-3d-sinking-freighter-game_sonnet/` (Features modular subsystems: `shipSim.ts`, `weapons.ts`, `particles.ts`, `ocean.ts`, `enemies.ts`, `TouchControls.tsx`, `CrashScreen.tsx`, `audio.ts`, and procedural textures).

Your objective is to unite both repositories into a single, cohesive, high-performance simulation engine without regressions, stubs, or placeholder code.

---

### 🛠️ Execution Directives & Step-by-Step Architecture

#### 1. Coordinate System & Hull Alignment
- Reconcile `CargoShipBuilder.ts` (Base) with `shipBuilder.ts` / `shipSim.ts` (Sonnet).
- Ensure all compartment boundaries ($Z_{\text{fore}} = -32\,\text{m}..-10\,\text{m}$, $Z_{\text{mid}} = -10\,\text{m}..10\,\text{m}$, $Z_{\text{engine}} = 10\,\text{m}..28\,\text{m}$, $Z_{\text{aft}} = 28\,\text{m}..42\,\text{m}$) match the exact Three.js world transforms.
- Maintain the diesel engine block clearance at $Z = 17.5\,\text{m}$ so Stairwell 2 ($Z = 7.2\,\text{m}..13.8\,\text{m}$) remains completely unobstructed.

#### 2. Hydrodynamic Fluid & Torricelli Flow Fusion
- Merge `ShipSim.update()` with the Torricelli inflow formulation:
  $$v_{\text{inflow}} = C_d \sqrt{2g \cdot \Delta h}, \quad Q = A_{\text{hole}} \cdot v_{\text{inflow}}$$
- Integrate Sonnet's local water surface tilting (`localLevel(c, x, z)`):
  $$\text{Level}(x, z) = c.\text{level} + \frac{m_1(c_x - x) + m_9(c_z - z)}{\max(0.2, m_5)}$$
- Keep the multi-deck downflooding threshold: when hold fill ratio $\ge 72\%$, trigger water overflow through stairwells onto `mainDeckWaterMesh`.

#### 3. Weapon Arsenal & Contact Blast Armor Model
- Adopt Sonnet's multi-weapon arsenal (`weapons.ts`):
  1. Handheld Damage Control Patch Kit
  2. Underwater Demolition Charge (TNT)
  3. Remote Keel Torpedo
  4. Flare Gun & Spotlight
- Retain the armored blast filter: upper-deck explosions ($Y \ge 0.8\,\text{m}$) must NEVER rupture bottom hull plating. Underwater detonations breach hull nodes ONLY on direct contact ($d < 3.8\,\text{m}$, $Y < 0.8\,\text{m}$) or outer shell impact ($|X| > 7.5\,\text{m}$).

#### 4. Particle Systems & Ocean Shaders
- Port `particles.ts` (bubble columns, foam spray, fireballs, and sinking wake) into the Three.js render loop.
- Combine Sonnet's Gerstner wave ocean vertex displacement with Base Engine's CPU performance optimization (do NOT recalculate vertex normals on the CPU every frame; use GPU analytical normal calculation in shader chunks).

#### 5. User Interface & Controls
- Retain the circular SVG watertight dogging ring (`NavalHudOverlay.tsx`) for `KeyL` hold ($0.85\,\text{s}$).
- Integrate Sonnet's `TouchControls.tsx` for mobile / tablet devices (virtual joystick for WASD and look controls).
- Integrate `CrashScreen.tsx` for catastrophic hull snapping and vessel abandonment telemetry.

#### 6. Verification & Automated CI Protocol
- Run `npm run typecheck` (`tsc --noEmit`) to verify zero compile errors.
- Run `npm test` (`node tests/physics.test.mjs && python tools/ci_check.py`) to confirm 100% test pass rate.
- Execute `npm run build` to verify single-file production bundling for GitHub Pages.
```

---

## 🔍 Feature Comparison Matrix

| Feature | Base Engine | Sonnet Edition | Target Unified Simulator |
| :--- | :---: | :---: | :---: |
| **Torricelli Hydrostatic Inflow** | ✅ Active ($v = C_d\sqrt{2gh}$) | ⚠️ Partial approximation | ✅ Unified ($v = C_d\sqrt{2gh}$) |
| **Beam Bending Stress & Snapping** | ✅ Active ($M = L_m - 0.6(L_f+L_a)$) | ❌ Counter based | ✅ Physical Beam Bending |
| **Contact-Only Blast Plating** | ✅ Decks absorb surface blasts | ❌ Proximity spherical | ✅ Armored Plating Filter |
| **Watertight Dogging (`KeyL` 0.85s)** | ✅ SVG Progress Ring | ❌ Instant toggle | ✅ SVG Ring + 100% Hermetic Seal |
| **Downflooding Stairwell Cascade** | ✅ Active at 72% hold fill | ❌ No deck spill | ✅ 72% Spill onto Main Deck |
| **Multi-Weapon Arsenal** | ⚠️ Basic TNT + Detonator | ✅ TNT, Torpedoes, Patches | ✅ Full Arsenal (`weapons.ts`) |
| **Mobile Touch Controls** | ❌ Keyboard/Mouse only | ✅ Dual-stick Touch UI | ✅ Responsive Hybrid UI |
| **Particle Systems & VFX** | ⚠️ Basic spray particles | ✅ Rich plumes & bubbles | ✅ GPU Instanced Particle Engine |
| **Enemies & Patrol Hazards** | ❌ None | ✅ Submarines & Torpedoes | ✅ Modular Danger Entities |
| **GitHub Pages Singlefile Build** | ✅ Ready (`dist/index.html`) | ✅ Ready | ✅ Deployed & Live |

---

## 🚀 Tomorrow's Quick-Start Command
```bash
# Verify current state
python tools/ci_check.py
node tests/physics.test.mjs
npm run build
```
