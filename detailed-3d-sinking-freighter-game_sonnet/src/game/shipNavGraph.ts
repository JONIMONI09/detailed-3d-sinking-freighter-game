export interface ShipNavNode {
  id: string;
  x: number;
  y: number;
  z: number;
  /** True when the node lies on a stairwell landing or transition. */
  stair?: boolean;
}

export interface ShipNavEdge {
  a: string;
  b: string;
  /** True when traversing between a and b is a vertical/sloped stair flight. */
  stair?: boolean;
  /** True when the edge is a gap jump across a stairwell opening. */
  jump?: boolean;
}

export interface ShipGraphWaypoint {
  x: number;
  y: number;
  z: number;
  onStair: boolean;
  jump?: boolean;
}

const NODES: ShipNavNode[] = [
  { id: "d1_gap_fwd", x: -0.875, y: 6.2, z: -48.1, stair: true },
  { id: "d1_gap_aft", x: -0.875, y: 6.2, z: -52.2, stair: true },
  { id: "d1_corr_aft", x: 0, y: 6.2, z: -53.6 },
  { id: "d1_corr_far_aft", x: 0, y: 6.2, z: -62.0 },
  { id: "d1_port_mid_door", x: -1.7, y: 6.2, z: -54.0 },
  { id: "d1_port_mid_room", x: -4.2, y: 6.2, z: -54.0 },
  { id: "d1_stbd_mid_door", x: 1.7, y: 6.2, z: -54.0 },
  { id: "d1_stbd_mid_room", x: 4.2, y: 6.2, z: -54.0 },
  { id: "d1_port_aft_door", x: -1.7, y: 6.2, z: -62.0 },
  { id: "d1_port_aft_room", x: -4.2, y: 6.2, z: -62.0 },
  { id: "d1_stbd_aft_door", x: 1.7, y: 6.2, z: -62.0 },
  { id: "d1_stbd_aft_room", x: 4.2, y: 6.2, z: -62.0 },
  { id: "d2_gap_aft", x: 0.875, y: 9.4, z: -52.2, stair: true },
  { id: "d2_gap_fwd", x: 0.875, y: 9.4, z: -48.1, stair: true },
  { id: "d2_corr_mid", x: 0, y: 9.4, z: -47.0 },
  { id: "d2_port_fwd_door", x: -1.7, y: 9.4, z: -47.0 },
  { id: "d2_port_fwd_room", x: -4.2, y: 9.4, z: -47.0 },
  { id: "d2_stbd_fwd_door", x: 1.7, y: 9.4, z: -47.0 },
  { id: "d2_stbd_fwd_room", x: 4.2, y: 9.4, z: -47.0 },
  // --- Main Exterior Deck & Container-Free Side Walkways (y = 3.0) ---
  { id: "deck_fwd", x: 0, y: 3.0, z: 55.2 },
  { id: "deck_mid", x: 0, y: 3.0, z: -9.2 },
  { id: "deck_aft", x: 0, y: 3.0, z: -38.5 },
  { id: "deck_port_aft", x: -8.5, y: 3.0, z: -38.5 },
  { id: "deck_port_mid", x: -8.5, y: 3.0, z: -9.2 },
  { id: "deck_port_prehold", x: -8.5, y: 3.0, z: 17.5 },
  { id: "deck_port_fwd", x: -5.2, y: 3.0, z: 27.6 },
  { id: "deck_port_bow", x: -8.5, y: 3.0, z: 55.2 },
  { id: "deck_stbd_aft", x: 8.5, y: 3.0, z: -38.5 },
  { id: "deck_stbd_mid", x: 8.5, y: 3.0, z: -9.2 },
  { id: "deck_stbd_fwd", x: 8.5, y: 3.0, z: 25.5 },
  { id: "deck_stbd_bow", x: 8.5, y: 3.0, z: 55.2 },
  { id: "d0_hold_gate", x: -8.6, y: 3.0, z: 27.6 },
  { id: "d0_hold_top", x: -8.6, y: 3.0, z: 26.2, stair: true },

  // Exterior catwalks around superstructure (clear of walls +-9.0, railings +-10.7, and fore barrels at -41/-42)
  { id: "d0_port_fwd_ext", x: -9.55, y: 3.0, z: -43.2 },
  { id: "d0_port_ext", x: -9.55, y: 3.0, z: -47.0 },
  { id: "d0_port_aft_ext", x: -9.55, y: 3.0, z: -60.0 },
  { id: "d0_stbd_fwd_ext", x: 9.55, y: 3.0, z: -43.2 },
  { id: "d0_stbd_ext", x: 9.55, y: 3.0, z: -47.0 },
  { id: "d0_stbd_aft_ext", x: 9.55, y: 3.0, z: -60.0 },
  { id: "d0_stern", x: 0, y: 3.0, z: -66.8 },

  // --- Superstructure Level 0 (y = 3.0) with doorway centers, starboard stairwell bypass, and Engine Control wings ---
  { id: "d0_main_door", x: 0, y: 3.0, z: -44.15 },
  { id: "d0_main_in", x: 0, y: 3.0, z: -45.2 },
  { id: "d0_corr_mid", x: 0, y: 3.0, z: -47.0 },
  { id: "d0_stbd_pass_fwd", x: 0.875, y: 3.0, z: -48.0 },
  { id: "d0_stbd_pass_aft", x: 0.875, y: 3.0, z: -52.6 },
  { id: "d0_corr_aft", x: 0, y: 3.0, z: -53.6 },
  { id: "d0_ctrl_door", x: 0, y: 3.0, z: -57.2 },
  { id: "d0_eng_top", x: -0.875, y: 3.0, z: -57.8, stair: true },
  { id: "d0_stair_bot", x: -0.875, y: 3.0, z: -52.8, stair: true },
  { id: "d0_ctrl_port", x: -3.8, y: 3.0, z: -57.6 },
  { id: "d0_ctrl_port_aft", x: -3.8, y: 3.0, z: -61.5 },
  { id: "d0_ctrl_stbd", x: 3.8, y: 3.0, z: -57.6 },
  { id: "d0_ctrl_stbd_aft", x: 3.8, y: 3.0, z: -61.5 },

  { id: "d0_port_corr_door", x: -1.7, y: 3.0, z: -47.0 },
  { id: "d0_port_corr_aft", x: -1.7, y: 3.0, z: -53.6 },
  { id: "d0_port_side_door", x: -8.85, y: 3.0, z: -47.0 },
  { id: "d0_port_mid", x: -4.2, y: 3.0, z: -47.0 },
  { id: "d0_port_aft", x: -3.4, y: 3.0, z: -53.6 },

  { id: "d0_stbd_corr_door", x: 1.7, y: 3.0, z: -47.0 },
  { id: "d0_stbd_corr_aft", x: 1.7, y: 3.0, z: -53.6 },
  { id: "d0_stbd_side_door", x: 8.85, y: 3.0, z: -47.0 },
  { id: "d0_stbd_mid", x: 3.6, y: 3.0, z: -47.0 },
  { id: "d0_stbd_aft", x: 4.2, y: 3.0, z: -53.6 },

  // --- Superstructure Level 1 (y = 6.2, forward landing & forward cabins reachable without crossing stairs) ---
  { id: "d1_stair_arr", x: -0.875, y: 6.2, z: -47.6, stair: true },
  { id: "d1_corr_mid", x: 0, y: 6.2, z: -47.0 },
  { id: "d1_stair_dep", x: 0.875, y: 6.2, z: -47.6, stair: true },
  { id: "d1_port_door", x: -1.7, y: 6.2, z: -47.0 },
  { id: "d1_stbd_door", x: 1.7, y: 6.2, z: -47.0 },
  { id: "d1_port_mid", x: -4.2, y: 6.2, z: -47.0 },
  { id: "d1_stbd_mid", x: 4.2, y: 6.2, z: -47.0 },

  // --- Superstructure Level 2 (y = 9.4, aft landing, aft corridor & mid/aft cabins) ---
  { id: "d2_stair_arr", x: 0.875, y: 9.4, z: -52.8, stair: true },
  { id: "d2_corr_aft", x: 0, y: 9.4, z: -53.6 },
  { id: "d2_stair_dep", x: -0.875, y: 9.4, z: -52.8, stair: true },
  { id: "d2_corr_far_aft", x: 0, y: 9.4, z: -62.0 },
  { id: "d2_port_mid_door", x: -1.7, y: 9.4, z: -54.0 },
  { id: "d2_port_mid_room", x: -4.2, y: 9.4, z: -54.0 },
  { id: "d2_stbd_mid_door", x: 1.7, y: 9.4, z: -54.0 },
  { id: "d2_stbd_mid_room", x: 4.2, y: 9.4, z: -54.0 },
  { id: "d2_port_aft_door", x: -1.7, y: 9.4, z: -62.0 },
  { id: "d2_port_aft_room", x: -4.2, y: 9.4, z: -62.0 },
  { id: "d2_stbd_aft_door", x: 1.7, y: 9.4, z: -62.0 },
  { id: "d2_stbd_aft_room", x: 4.2, y: 9.4, z: -62.0 },

  // --- Bridge Level 3 (y = 12.6) ---
  { id: "d3_stair_arr", x: -0.875, y: 12.6, z: -47.6, stair: true },
  { id: "d3_bridge", x: 0, y: 12.6, z: -46.8 },
  { id: "d3_port", x: -5.5, y: 12.6, z: -46.8 },
  { id: "d3_stbd", x: 5.5, y: 12.6, z: -46.8 },
  { id: "d3_bridge_door", x: 5.5, y: 12.6, z: -52.2 },
  { id: "d3_aft_roof", x: 5.5, y: 12.6, z: -55.0 },

  // --- Engine U-Stair Mid & Bottom (y = -1.0 -> -5.0) ---
  { id: "eng_mid", x: 0.0, y: -1.0, z: -63.5, stair: true },
  { id: "eng_bot", x: 0.875, y: -5.0, z: -57.2, stair: true },

  // --- Hold U-Stair Mid & Bottom (y = -1.0 -> -5.0) ---
  { id: "hold_mid", x: -7.7, y: -1.0, z: 20.0, stair: true },
  { id: "hold_bot", x: -6.8, y: -5.0, z: 26.3, stair: true },

  // --- Lower Engine Aisles & Holds (y = -5.0, routing clear of Diesel Engine [-3.2..3.2, -55..-44]) ---
  { id: "low_eng_aft", x: 0, y: -5.0, z: -56.2 },
  { id: "low_eng_port", x: -4.5, y: -5.0, z: -49.0 },
  { id: "low_eng_stbd", x: 4.5, y: -5.0, z: -49.0 },
  { id: "low_bh_eng", x: 0, y: -5.0, z: -39.0 },
  { id: "low_hold1", x: 0, y: -5.0, z: -22.0 },
  { id: "low_bh_12", x: 0, y: -5.0, z: -8.0 },
  { id: "low_hold2", x: 0, y: -5.0, z: 20.0 },
  { id: "low_bh_23", x: 0, y: -5.0, z: 26.0 },
  { id: "low_hold3", x: 0, y: -5.0, z: 40.0 },
];

const EDGES: ShipNavEdge[] = [
  { a: "d1_corr_mid", b: "d1_gap_fwd" },
  { a: "d1_gap_fwd", b: "d1_gap_aft", jump: true, stair: true },
  { a: "d1_gap_aft", b: "d1_corr_aft" },
  { a: "d1_corr_aft", b: "d1_corr_far_aft" },
  { a: "d1_corr_aft", b: "d1_port_mid_door" },
  { a: "d1_port_mid_door", b: "d1_port_mid_room" },
  { a: "d1_corr_aft", b: "d1_stbd_mid_door" },
  { a: "d1_stbd_mid_door", b: "d1_stbd_mid_room" },
  { a: "d1_corr_far_aft", b: "d1_port_aft_door" },
  { a: "d1_port_aft_door", b: "d1_port_aft_room" },
  { a: "d1_corr_far_aft", b: "d1_stbd_aft_door" },
  { a: "d1_stbd_aft_door", b: "d1_stbd_aft_room" },
  { a: "d2_corr_aft", b: "d2_gap_aft" },
  { a: "d2_gap_aft", b: "d2_gap_fwd", jump: true, stair: true },
  { a: "d2_gap_fwd", b: "d2_corr_mid" },
  { a: "d2_corr_mid", b: "d2_port_fwd_door" },
  { a: "d2_port_fwd_door", b: "d2_port_fwd_room" },
  { a: "d2_corr_mid", b: "d2_stbd_fwd_door" },
  { a: "d2_stbd_fwd_door", b: "d2_stbd_fwd_room" },
  // Exterior deck, side aisles & catwalks
  { a: "deck_fwd", b: "deck_port_bow" },
  { a: "deck_fwd", b: "deck_stbd_bow" },
  { a: "deck_port_bow", b: "deck_port_fwd" },
  { a: "deck_port_fwd", b: "deck_port_prehold" },
  { a: "deck_port_prehold", b: "deck_port_mid" },
  { a: "deck_port_mid", b: "deck_port_aft" },
  { a: "deck_port_aft", b: "deck_aft" },
  { a: "deck_stbd_bow", b: "deck_stbd_fwd" },
  { a: "deck_stbd_fwd", b: "deck_stbd_mid" },
  { a: "deck_stbd_mid", b: "deck_stbd_aft" },
  { a: "deck_stbd_aft", b: "deck_aft" },
  { a: "deck_port_mid", b: "deck_mid" },
  { a: "deck_stbd_mid", b: "deck_mid" },
  { a: "deck_port_fwd", b: "d0_hold_gate" },
  { a: "d0_hold_gate", b: "d0_hold_top" },
  { a: "deck_aft", b: "d0_main_door" },
  { a: "d0_main_door", b: "d0_main_in" },
  { a: "deck_port_aft", b: "d0_port_fwd_ext" },
  { a: "deck_stbd_aft", b: "d0_stbd_fwd_ext" },
  { a: "deck_aft", b: "d0_port_fwd_ext" },
  { a: "deck_aft", b: "d0_stbd_fwd_ext" },
  { a: "d0_port_fwd_ext", b: "d0_port_ext" },
  { a: "d0_port_ext", b: "d0_port_aft_ext" },
  { a: "d0_port_aft_ext", b: "d0_stern" },
  { a: "d0_stbd_fwd_ext", b: "d0_stbd_ext" },
  { a: "d0_stbd_ext", b: "d0_stbd_aft_ext" },
  { a: "d0_stbd_aft_ext", b: "d0_stern" },
  { a: "d0_port_ext", b: "d0_port_side_door" },
  { a: "d0_port_side_door", b: "d0_port_mid" },
  { a: "d0_stbd_ext", b: "d0_stbd_side_door" },
  { a: "d0_stbd_side_door", b: "d0_stbd_mid" },

  // Level 0 interior (uses starboard bypass around center stairwell divider; no edge through z = -50 cross-wall)
  { a: "d0_main_in", b: "d0_corr_mid" },
  { a: "d0_corr_mid", b: "d0_port_corr_door" },
  { a: "d0_port_corr_door", b: "d0_port_mid" },
  { a: "d0_corr_mid", b: "d0_stbd_corr_door" },
  { a: "d0_stbd_corr_door", b: "d0_stbd_mid" },
  { a: "d0_corr_mid", b: "d0_stbd_pass_fwd" },
  { a: "d0_stbd_pass_fwd", b: "d0_stbd_pass_aft" },
  { a: "d0_stbd_pass_aft", b: "d0_corr_aft" },
  { a: "d0_corr_aft", b: "d0_port_corr_aft" },
  { a: "d0_port_corr_aft", b: "d0_port_aft" },
  { a: "d0_corr_aft", b: "d0_stbd_corr_aft" },
  { a: "d0_stbd_corr_aft", b: "d0_stbd_aft" },
  { a: "d0_corr_aft", b: "d0_stair_bot" },
  { a: "d0_corr_aft", b: "d0_ctrl_door" },
  { a: "d0_ctrl_door", b: "d0_eng_top" },
  { a: "d0_ctrl_door", b: "d0_ctrl_port" },
  { a: "d0_ctrl_port", b: "d0_ctrl_port_aft" },
  { a: "d0_ctrl_door", b: "d0_ctrl_stbd" },
  { a: "d0_ctrl_stbd", b: "d0_ctrl_stbd_aft" },

  // Level 0 <-> Level 1 stair
  { a: "d0_stair_bot", b: "d1_stair_arr", stair: true },

  // Level 1 interior (forward corridor & forward cabins)
  { a: "d1_stair_arr", b: "d1_corr_mid" },
  { a: "d1_corr_mid", b: "d1_stair_dep" },
  { a: "d1_corr_mid", b: "d1_port_door" },
  { a: "d1_port_door", b: "d1_port_mid" },
  { a: "d1_corr_mid", b: "d1_stbd_door" },
  { a: "d1_stbd_door", b: "d1_stbd_mid" },

  // Level 1 <-> Level 2 stair
  { a: "d1_stair_dep", b: "d2_stair_arr", stair: true },

  // Level 2 interior (aft/mid corridor & mid/aft cabins)
  { a: "d2_stair_arr", b: "d2_corr_aft" },
  { a: "d2_corr_aft", b: "d2_stair_dep" },
  { a: "d2_corr_aft", b: "d2_corr_far_aft" },
  { a: "d2_corr_aft", b: "d2_port_mid_door" },
  { a: "d2_port_mid_door", b: "d2_port_mid_room" },
  { a: "d2_corr_aft", b: "d2_stbd_mid_door" },
  { a: "d2_stbd_mid_door", b: "d2_stbd_mid_room" },
  { a: "d2_corr_far_aft", b: "d2_port_aft_door" },
  { a: "d2_port_aft_door", b: "d2_port_aft_room" },
  { a: "d2_corr_far_aft", b: "d2_stbd_aft_door" },
  { a: "d2_stbd_aft_door", b: "d2_stbd_aft_room" },

  // Level 2 <-> Level 3 stair
  { a: "d2_stair_dep", b: "d3_stair_arr", stair: true },

  // Level 3 Bridge & Aft Roof
  { a: "d3_stair_arr", b: "d3_bridge" },
  { a: "d3_bridge", b: "d3_port" },
  { a: "d3_bridge", b: "d3_stbd" },
  { a: "d3_stbd", b: "d3_bridge_door" },
  { a: "d3_bridge_door", b: "d3_aft_roof" },

  // Engine U-stair & side walkways
  { a: "d0_eng_top", b: "eng_mid", stair: true },
  { a: "eng_mid", b: "eng_bot", stair: true },
  { a: "eng_bot", b: "low_eng_aft" },
  { a: "low_eng_aft", b: "low_eng_port" },
  { a: "low_eng_aft", b: "low_eng_stbd" },
  { a: "low_eng_port", b: "low_bh_eng" },
  { a: "low_eng_stbd", b: "low_bh_eng" },

  // Hold U-stair & Lower holds
  { a: "d0_hold_top", b: "hold_mid", stair: true },
  { a: "hold_mid", b: "hold_bot", stair: true },
  { a: "hold_bot", b: "low_hold2" },
  { a: "low_bh_eng", b: "low_hold1" },
  { a: "low_hold1", b: "low_bh_12" },
  { a: "low_bh_12", b: "low_hold2" },
  { a: "low_hold2", b: "low_bh_23" },
  { a: "low_bh_23", b: "low_hold3" },
];

const NODE_MAP = new Map<string, number>();
const ADJ: Array<Array<{ to: number; cost: number; stair: boolean; jump: boolean }>> = [];

for (let i = 0; i < NODES.length; i++) {
  NODE_MAP.set(NODES[i].id, i);
  ADJ.push([]);
}

for (const e of EDGES) {
  const ia = NODE_MAP.get(e.a);
  const ib = NODE_MAP.get(e.b);
  if (ia === undefined || ib === undefined) continue;
  const na = NODES[ia];
  const nb = NODES[ib];
  const dist = Math.hypot(na.x - nb.x, na.y - nb.y, na.z - nb.z);
  const cost = e.stair ? dist * 1.15 : dist;
  ADJ[ia].push({ to: ib, cost, stair: !!e.stair, jump: !!e.jump });
  ADJ[ib].push({ to: ia, cost, stair: !!e.stair, jump: !!e.jump });
}

function nearestNode(x: number, y: number, z: number): number {
  let best = 0;
  let bestScore = Infinity;
  for (let i = 0; i < NODES.length; i++) {
    const n = NODES[i];
    const dy = Math.abs(n.y - y);
    // Strongly prefer nodes on the same deck/floor
    const score = Math.hypot(n.x - x, n.z - z) + dy * 8.0;
    if (score < bestScore) {
      bestScore = score;
      best = i;
    }
  }
  return best;
}

/**
 * Returns true if the position lies inside or immediately adjacent to one of
 * the freighter's stair flights or narrow exterior catwalks.
 */
export function isInStairwellBand(x: number, y: number, z: number): boolean {
  // Superstructure stairwell (steps span x in [-1.6, 1.6], z in [-52.0, -48.4]; leave z=-47/-53.6 doorways clear)
  if (Math.abs(x) <= 1.65 && z >= -52.5 && z <= -47.9 && y >= 2.6 && y <= 13.0) return true;
  // Engine U-stairwell
  if (Math.abs(x) <= 1.9 && z >= -64.5 && z <= -57.0 && y <= 3.5) return true;
  // Hold U-stairwell
  if (x >= -9.6 && x <= -5.0 && z >= 19.0 && z <= 26.8 && y <= 3.5) return true;
  return false;
}

/**
 * Returns true if the position lies on the narrow 1.15 m exterior catwalk
 * around the superstructure (|x| in [8.6, 10.2], z in [-66.5, -43.5], y in [2.5, 4.5]).
 */
export function isOnNarrowCatwalk(x: number, y: number, z: number): boolean {
  return Math.abs(x) >= 8.6 && Math.abs(x) <= 10.4 && z >= -66.5 && z <= -43.0 && y >= 2.5 && y <= 4.5;
}

/**
 * Finds the next 3D waypoint along the freighter's explicit navigation graph
 * using A* across decks, stairs, doorways, and exterior catwalks.
 */
export function findNextShipGraphWaypoint(
  sx: number,
  sy: number,
  sz: number,
  tx: number,
  ty: number,
  tz: number
): ShipGraphWaypoint {
  const sameFloor = Math.abs(sy - ty) < 1.6;
  const distXZ = Math.hypot(tx - sx, tz - sz);

  // Only go direct on the same floor when very close (< 1.1m) and outside stairwells
  if (sameFloor && distXZ < 1.1 && !isInStairwellBand(sx, sy, sz)) {
    return { x: tx, y: ty, z: tz, onStair: false };
  }

  const startIdx = nearestNode(sx, sy, sz);
  const goalIdx = nearestNode(tx, ty, tz);

  if (startIdx === goalIdx) {
    const n = NODES[startIdx];
    const stairNow = !!n.stair && (!sameFloor || isInStairwellBand(sx, sy, sz));
    return { x: tx, y: ty, z: tz, onStair: stairNow };
  }

  const nCount = NODES.length;
  const gScore = new Float64Array(nCount).fill(Infinity);
  const fScore = new Float64Array(nCount).fill(Infinity);
  const cameFrom = new Int32Array(nCount).fill(-1);
  const cameStair = new Uint8Array(nCount);
  const cameJump = new Uint8Array(nCount);
  const closed = new Uint8Array(nCount);
  const open: number[] = [startIdx];

  const goalNode = NODES[goalIdx];
  gScore[startIdx] = 0;
  fScore[startIdx] = Math.hypot(NODES[startIdx].x - goalNode.x, NODES[startIdx].y - goalNode.y, NODES[startIdx].z - goalNode.z);

  while (open.length > 0) {
    let bestPos = 0;
    for (let i = 1; i < open.length; i++) {
      if (fScore[open[i]] < fScore[open[bestPos]]) bestPos = i;
    }
    const cur = open[bestPos];
    open.splice(bestPos, 1);

    if (cur === goalIdx) {
      // Reconstruct path from startIdx -> goalIdx
      const path: number[] = [];
      let p = cur;
      while (p !== -1) {
        path.push(p);
        p = cameFrom[p];
      }
      path.reverse();

      // Choose the next node we haven't already reached; require tight alignment (0.35m) at stair entries
      let nextIdx = path.length > 1 ? path[1] : path[0];
      const n1 = NODES[nextIdx];
      const d1 = Math.hypot(n1.x - sx, n1.z - sz);
      const reachTol = n1.stair ? 0.35 : 0.6;
      if (path.length > 2 && d1 < reachTol && Math.abs(n1.y - sy) < 1.2) {
        nextIdx = path[2];
      } else if (path.length === 1 && Math.hypot(NODES[path[0]].x - sx, NODES[path[0]].z - sz) < reachTol && Math.abs(NODES[path[0]].y - sy) < 1.2) {
        return { x: tx, y: ty, z: tz, onStair: isInStairwellBand(sx, sy, sz) };
      }

      const targetNode = NODES[nextIdx];
      const isStairEdge = cameStair[nextIdx] === 1 || (!!NODES[startIdx].stair && !!targetNode.stair && Math.abs(NODES[startIdx].y - targetNode.y) > 1.0);
      return {
        x: targetNode.x,
        y: targetNode.y,
        z: targetNode.z,
        onStair: isStairEdge || isInStairwellBand(sx, sy, sz),
        jump: Boolean(cameJump[nextIdx]),
      };
    }

    closed[cur] = 1;
    for (const edge of ADJ[cur]) {
      if (closed[edge.to]) continue;
      const tentative = gScore[cur] + edge.cost;
      if (tentative < gScore[edge.to]) {
        cameFrom[edge.to] = cur;
        cameStair[edge.to] = edge.stair ? 1 : 0;
        cameJump[edge.to] = edge.jump ? 1 : 0;
        gScore[edge.to] = tentative;
        const nb = NODES[edge.to];
        fScore[edge.to] = tentative + Math.hypot(nb.x - goalNode.x, nb.y - goalNode.y, nb.z - goalNode.z);
        if (!open.includes(edge.to)) open.push(edge.to);
      }
    }
  }

  return { x: tx, y: ty, z: tz, onStair: isInStairwellBand(sx, sy, sz) };
}
