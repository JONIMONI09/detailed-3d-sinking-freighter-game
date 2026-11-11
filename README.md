# 🚢 Detailed 3D Sinking Freighter Game

An advanced interactive maritime simulation built with **Vite**, **React 19**, **Three.js**, and **TypeScript**. Experience realistic multi-compartment hydrostatic flooding, structural beam bending stresses, localized explosive damage, and damage control operations on an ocean-going cargo freighter.

---

## 🌊 Core Simulation Features

### 1. Hydrostatic Inflow & Torricelli Flow
- Inflow velocity dynamically scales with hydrostatic pressure head following Torricelli's Law:
  $$v = C_d \sqrt{2g \cdot \Delta h}$$
  where $\Delta h = y_{\text{sea}} - y_{\text{breach}}$ and $C_d$ is the discharge coefficient.
- Deep underwater hull breaches flood compartments rapidly, whereas punctures near the waterline produce subdued spray until submerged.

### 2. Multi-Deck Downflooding & Stairway Cascades
- Multi-compartment interior: Fore Hold, Mid Hold, Engine Room, Aft Steering Flat, and Superstructure Decks.
- When cargo holds exceed **72% capacity**, excess water spills through stairwells and open passageways, cascading dynamically across the main deck (`mainDeckWaterMesh`).

### 3. Contact-Only Localized Hull Damage
- Upper decks and superstructures absorb blasts; detonations on the main deck or wheelhouse do **not** trigger premature keel fractures.
- Underwater breaching is strictly limited to direct contact detonations against the bottom hull ($Y < 0.8\,\text{m}$, distance $< 3.8\,\text{m}$) or outer shell plating ($|X| > 7.5\,\text{m}$).

### 4. Floating Sandbox Bending Moments & Keel Snapping
- Implements physical beam bending calculations:
  $$M_{\text{bending}} = \text{Load}_{\text{mid}} - 0.6 \cdot (\text{Load}_{\text{fore}} + \text{Load}_{\text{aft}})$$
- Asymmetrically flooded holds create sagging or hogging stresses. Exceeding structural yield strain triggers catastrophic hull deformation and keel failure.

### 5. Watertight Door Dogging & Damage Control
- Hold **`[L]`** for 0.85s to dog down watertight bulkheads and doors.
- Visual circular SVG progress indicator around the crosshair displays dogging progress.
- Fully dogged doors provide a **100% watertight seal** ($0.0$ water transfer coefficient), allowing compartmental damage control to save the vessel.

### 6. Engine Room Stairwell Clearance
- Fully accessible mid-aft stairwell (`stair_mid_hold`) leading to the lower engine spaces.
- Engine block machinery relocated to $Z = 17.5\,\text{m}$, leaving the stair landing completely clear of collision boundaries.

### 7. Real-Time Rendering & Performance
- Smooth 60+ FPS rendering on desktop and mobile platforms.
- Ocean mesh deformation optimized by eliminating CPU-bound vertex normal recalculations per frame.

---

## 🎮 Controls

| Key / Input | Action |
| :--- | :--- |
| **`W`, `A`, `S`, `D`** | Move Player |
| **`Mouse`** | Look / Aim (Pointer Lock) |
| **`Space`** | Jump / Swim Upward |
| **`Shift`** | Sprint |
| **`E`** | Toggle Door Open / Close |
| **`Hold L` (0.85s)** | Dog Down / Lock Watertight Door |
| **`1` - `5`** | Select Weapon / Damage Control Tool |
| **`Left Mouse Click`**| Use Selected Tool / Place TNT |
| **`Right Mouse Click`**| Detonate Remote Charges |
| **`C`** | Toggle Camera Mode (First Person / Free Orbit) |

---

## 📁 Repository Structure

```text
├── .agent/                             # Antigravity Rules, Workflows & LEARNING.md
├── detailed-3d-sinking-freighter-game_sonnet/ # Alternative / Sub-workspace Edition
├── src/
│   ├── audio/
│   │   └── SoundEngine.ts              # Web Audio API procedural sound engine
│   ├── components/
│   │   ├── MaritimeViewport3D.tsx      # Main Three.js simulation viewport & physics loop
│   │   └── NavalHudOverlay.tsx         # HUD, Damage Control schematic, SVG lock ring
│   ├── game/
│   │   └── CargoShipBuilder.ts         # Procedural 3D vessel geometry & collision volumes
│   ├── types/
│   │   └── game.ts                     # TypeScript interfaces & state definitions
│   ├── App.tsx                         # Primary React application container
│   └── main.tsx                        # Entry point
├── index.html
├── package.json
├── tsconfig.json
└── vite.config.ts
```

---

## 🛠️ Getting Started

### Prerequisites
- Node.js 18+ (tested on Node.js 25)
- npm or pnpm

### Installation
```bash
# Clone the repository
git clone https://github.com/JONIMONI09/detailed-3d-sinking-freighter-game.git

# Enter project directory
cd detailed-3d-sinking-freighter-game

# Install dependencies
npm install

# Start local development server
npm run dev
```

### Production Build
```bash
npm run build
```

---

## 📜 License
MIT License. Built for realistic maritime simulation and procedural vessel physics research.
