/**
 * 2D per-floor A* NavGrid derived from CollisionWorld AABB boxes.
 * Uses Minkowski radius inflation, explicit doorway carving, wall-clearance
 * cost weighting, and corner-cut prevention so crew route cleanly around
 * walls, furniture, and through doorway centers.
 */

export interface NavBox {
  minX: number;
  minY: number;
  minZ: number;
  maxX: number;
  maxY: number;
  maxZ: number;
  enabled: boolean;
  tag?: string;
}

const CELL = 0.4;
const MIN_X = -11.2;
const MAX_X = 11.2;
const MIN_Z = -67.2;
const MAX_Z = 56.0;
const COLS = Math.round((MAX_X - MIN_X) / CELL);
const ROWS = Math.round((MAX_Z - MIN_Z) / CELL);
const TOTAL = COLS * ROWS;

interface FloorGrid {
  blocked: Uint8Array;
  cost: Uint8Array;
  boxCount: number;
  builtAt: number;
}

const floorCache = new Map<number, FloorGrid>();

function idx(gx: number, gz: number): number {
  return gz * COLS + gx;
}

function toGridX(x: number): number {
  return Math.max(0, Math.min(COLS - 1, Math.floor((x - MIN_X) / CELL)));
}

function toGridZ(z: number): number {
  return Math.max(0, Math.min(ROWS - 1, Math.floor((z - MIN_Z) / CELL)));
}

function toWorldX(gx: number): number {
  return MIN_X + (gx + 0.5) * CELL;
}

function toWorldZ(gz: number): number {
  return MIN_Z + (gz + 0.5) * CELL;
}

function buildFloorGrid(boxes: readonly NavBox[], floorY: number, now: number): FloorGrid {
  const blocked = new Uint8Array(TOTAL);
  const cost = new Uint8Array(TOTAL);
  cost.fill(1);

  const yLow = floorY + 0.48;
  const yHigh = floorY + 1.72;
  const pad = 0.14;

  // 1. Mark wall/furniture obstacles with slight Minkowski inflation
  for (const b of boxes) {
    if (!b.enabled || b.tag === "door") continue;
    if (b.maxY <= yLow || b.minY >= yHigh) continue;
    const gx0 = toGridX(b.minX - pad);
    const gx1 = toGridX(b.maxX + pad);
    const gz0 = toGridZ(b.minZ - pad);
    const gz1 = toGridZ(b.maxZ + pad);
    for (let gz = gz0; gz <= gz1; gz++) {
      const rowOff = gz * COLS;
      for (let gx = gx0; gx <= gx1; gx++) {
        blocked[rowOff + gx] = 1;
      }
    }
  }

  // 2. Ensure doorway openings remain passable on the grid
  for (const b of boxes) {
    if (b.tag !== "door") continue;
    if (b.maxY <= yLow || b.minY >= yHigh) continue;
    const cx = (b.minX + b.maxX) * 0.5;
    const cz = (b.minZ + b.maxZ) * 0.5;
    const gx = toGridX(cx);
    const gz = toGridZ(cz);
    blocked[idx(gx, gz)] = 0;
  }

  // 3. Clearance-based cost: penalize cells adjacent to walls so paths hug centers
  for (let gz = 1; gz < ROWS - 1; gz++) {
    for (let gx = 1; gx < COLS - 1; gx++) {
      const i = idx(gx, gz);
      if (blocked[i]) continue;
      if (
        blocked[i - 1] ||
        blocked[i + 1] ||
        blocked[i - COLS] ||
        blocked[i + COLS]
      ) {
        cost[i] = 4;
      }
    }
  }

  return { blocked, cost, boxCount: boxes.length, builtAt: now };
}

function getFloorGrid(boxes: readonly NavBox[], y: number): FloorGrid {
  const key = Math.round(y * 2) / 2;
  const now = Date.now();
  const cached = floorCache.get(key);
  if (cached && cached.boxCount === boxes.length && now - cached.builtAt < 3000) {
    return cached;
  }
  const built = buildFloorGrid(boxes, key, now);
  floorCache.set(key, built);
  return built;
}

function findNearestWalkable(grid: FloorGrid, gx: number, gz: number): [number, number] {
  if (!grid.blocked[idx(gx, gz)]) return [gx, gz];
  for (let r = 1; r <= 4; r++) {
    for (let dz = -r; dz <= r; dz++) {
      for (let dx = -r; dx <= r; dx++) {
        const nx = gx + dx;
        const nz = gz + dz;
        if (nx >= 0 && nx < COLS && nz >= 0 && nz < ROWS && !grid.blocked[idx(nx, nz)]) {
          return [nx, nz];
        }
      }
    }
  }
  return [gx, gz];
}

/**
 * Computes the next walkable 2D waypoint toward (tx, tz) on the current floor
 * using 8-way A* with clearance weighting and look-ahead smoothing.
 */
export function findNextGridWaypoint(
  boxes: readonly NavBox[],
  sx: number,
  sy: number,
  sz: number,
  tx: number,
  tz: number,
): { x: number; z: number } | null {
  if (Math.hypot(tx - sx, tz - sz) < 1.0) return { x: tx, z: tz };
  const grid = getFloorGrid(boxes, sy);
  const [sgx, sgz] = findNearestWalkable(grid, toGridX(sx), toGridZ(sz));
  const [tgx, tgz] = findNearestWalkable(grid, toGridX(tx), toGridZ(tz));
  if (sgx === tgx && sgz === tgz) return { x: tx, z: tz };

  const start = idx(sgx, sgz);
  const goal = idx(tgx, tgz);

  const gScore = new Float32Array(TOTAL);
  gScore.fill(Infinity);
  const cameFrom = new Int32Array(TOTAL);
  cameFrom.fill(-1);
  const closed = new Uint8Array(TOTAL);

  // Simple binary min-heap of [fScore, cellIdx]
  const heapIdx: number[] = [start];
  const heapF: number[] = [Math.hypot(tgx - sgx, tgz - sgz)];
  gScore[start] = 0;

  const push = (cell: number, f: number) => {
    let i = heapIdx.length;
    heapIdx.push(cell);
    heapF.push(f);
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (heapF[p] <= heapF[i]) break;
      [heapIdx[p], heapIdx[i]] = [heapIdx[i], heapIdx[p]];
      [heapF[p], heapF[i]] = [heapF[i], heapF[p]];
      i = p;
    }
  };

  const pop = (): number => {
    const top = heapIdx[0];
    const lastIdx = heapIdx.pop()!;
    const lastF = heapF.pop()!;
    if (heapIdx.length > 0) {
      heapIdx[0] = lastIdx;
      heapF[0] = lastF;
      let i = 0;
      const n = heapIdx.length;
      while (true) {
        let best = i;
        const l = 2 * i + 1;
        const r = 2 * i + 2;
        if (l < n && heapF[l] < heapF[best]) best = l;
        if (r < n && heapF[r] < heapF[best]) best = r;
        if (best === i) break;
        [heapIdx[i], heapIdx[best]] = [heapIdx[best], heapIdx[i]];
        [heapF[i], heapF[best]] = [heapF[best], heapF[i]];
        i = best;
      }
    }
    return top;
  };

  const dirs: readonly [number, number, number][] = [
    [1, 0, 1],
    [-1, 0, 1],
    [0, 1, 1],
    [0, -1, 1],
    [1, 1, 1.414],
    [1, -1, 1.414],
    [-1, 1, 1.414],
    [-1, -1, 1.414],
  ];

  let found = false;
  let expansions = 0;
  while (heapIdx.length > 0 && expansions < 6000) {
    const cur = pop();
    if (cur === goal) {
      found = true;
      break;
    }
    if (closed[cur]) continue;
    closed[cur] = 1;
    expansions++;

    const cx = cur % COLS;
    const cz = (cur - cx) / COLS;

    for (const [dx, dz, stepCost] of dirs) {
      const nx = cx + dx;
      const nz = cz + dz;
      if (nx < 0 || nx >= COLS || nz < 0 || nz >= ROWS) continue;
      const ni = idx(nx, nz);
      if (closed[ni] || grid.blocked[ni]) continue;
      // Prevent diagonal corner cutting through walls/doorframes
      if (dx !== 0 && dz !== 0) {
        if (grid.blocked[idx(cx + dx, cz)] || grid.blocked[idx(cx, cz + dz)]) continue;
      }
      const tentG = gScore[cur] + stepCost * grid.cost[ni];
      if (tentG < gScore[ni]) {
        cameFrom[ni] = cur;
        gScore[ni] = tentG;
        const h = Math.hypot(tgx - nx, tgz - nz);
        push(ni, tentG + h);
      }
    }
  }

  if (!found) return null;

  // Reconstruct path and pick look-ahead node (2 steps ahead to avoid zigzag)
  const path: number[] = [];
  let cur = goal;
  while (cur !== -1 && cur !== start) {
    path.push(cur);
    cur = cameFrom[cur];
  }
  if (path.length === 0) return { x: tx, z: tz };
  path.reverse();
  const lookAhead = path[Math.min(2, path.length - 1)];
  const lx = lookAhead % COLS;
  const lz = (lookAhead - lx) / COLS;
  return { x: toWorldX(lx), z: toWorldZ(lz) };
}
