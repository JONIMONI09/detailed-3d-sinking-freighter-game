# Project Rules - Maritime Freighter Simulation

## 1. Simulation Stability & Physics Invariants
- **No Invisible Blockers:** Colliders must match visible geometry within 0.1m tolerance. Passageways, doors, and stairs must guarantee minimum clearance of 1.2m width and 2.2m height.
- **Machinery Separation:** Heavy machinery components (diesel engine block, crankshaft, flywheel, pumps) must maintain at least 0.8m margin from pedestrian access routes, stairs, and doors.
- **Hydrostatic Accuracy:**
  - Water ingress rate into breached hull nodes scales with real immersion depth below waterline: $v = \sqrt{2g \cdot \max(0, y_{\text{sea}} - y_{\text{node}})}$.
  - Water equalization across compartments respects door states: open doors allow unhindered equalization; locked/dogged doors seal watertight (<0.1% seepage); closed unlocked doors restrict flow.
  - Deck downflooding: When lower compartments fill past 85%, water must spill upward through open stairwells onto the main deck.
- **Explosion & Structural Damage:**
  - Blast wave decays with the inverse square law: $P(d) = P_0 / (1 + (d / r_0)^2)$.
  - Bulkheads and decks attenuate explosive blast by at least 80% unless directly breached.
  - Non-keel explosions (bridge, upper deck, cargo containers above waterline) cannot trigger hull breaches below the waterline.

## 2. Controls & Interaction Contracts
- **Door Operations:**
  - Quick tap `[E]`: Toggle door open / closed (if unlocked).
  - Press `[L]`: Lock / dog door watertight or unlock door.
  - Interactive prompts on HUD must clearly indicate both available keys (`[E] Open/Close`, `[L] Lock/Unlock`).
- **Bilge Pump & Drainage:**
  - Bilge pump terminal in engine room controls active suction across all compartments.
  - When pumps are active, water drain rate must exceed incoming leak rate for minor breaches (<30% severity) to allow emergency salvage.

## 3. Performance & Rendering
- Do not perform full CPU vertex normal recalculation every frame on dense grids (96x96). Use step throttling or analytical normal calculation in vertex shaders.

## 4. Quota Sentinel & Token Preservation (Hardrule)
- Execute `swarm{action: "models", all: true}` before launching swarms or recursive tasks.
- If quota drops $\le 50\%$, enforce token-conservation mode.
- If quota drops $\le 25\%$, soft-pause subagents, serialize state to persistent memory, and failover to a healthy model. Never run quota to 0%.
