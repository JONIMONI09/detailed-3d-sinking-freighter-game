export interface Collider {
  minX: number;
  minY: number;
  minZ: number;
  maxX: number;
  maxY: number;
  maxZ: number;
  enabled: boolean;
  tag: string;
  owner?: any;
}

export interface Body {
  x: number;
  y: number; // feet
  z: number;
  vx: number;
  vy: number;
  vz: number;
  r: number;
  h: number;
  onGround: boolean;
  step: number;
}

export interface MoveResult {
  hitX: boolean;
  hitY: boolean;
  hitZ: boolean;
}

export interface RayHit {
  dist: number;
  collider: Collider;
  nx: number;
  ny: number;
  nz: number;
}

const EPS = 0.002;

export class CollisionWorld {
  boxes: Collider[] = [];

  add(minX: number, minY: number, minZ: number, maxX: number, maxY: number, maxZ: number, tag = "wall", owner?: any): Collider {
    const c: Collider = { minX, minY, minZ, maxX, maxY, maxZ, enabled: true, tag, owner };
    this.boxes.push(c);
    return c;
  }

  addCentered(cx: number, cy: number, cz: number, sx: number, sy: number, sz: number, tag = "wall", owner?: any): Collider {
    return this.add(cx - sx / 2, cy - sy / 2, cz - sz / 2, cx + sx / 2, cy + sy / 2, cz + sz / 2, tag, owner);
  }

  remove(c: Collider) {
    c.enabled = false;
    const i = this.boxes.indexOf(c);
    if (i >= 0) this.boxes.splice(i, 1);
  }

  overlaps(x: number, y: number, z: number, r: number, h: number, exclude?: Collider): boolean {
    const bs = this.boxes;
    for (let i = 0; i < bs.length; i++) {
      const b = bs[i];
      if (b.enabled && b !== exclude && x + r > b.minX && x - r < b.maxX && y + h > b.minY && y < b.maxY && z + r > b.minZ && z - r < b.maxZ)
        return true;
    }
    return false;
  }

  /** Move a body with axis separated collision, sliding and step climbing. */
  move(body: Body, dx: number, dy: number, dz: number): MoveResult {
    const res: MoveResult = { hitX: false, hitY: false, hitZ: false };
    const bs = this.boxes;
    const r = body.r;
    // horizontal axes
    for (let axis = 0; axis < 2; axis++) {
      const d = axis === 0 ? dx : dz;
      if (d === 0) continue;
      if (axis === 0) body.x += d;
      else body.z += d;
      for (let i = 0; i < bs.length; i++) {
        const b = bs[i];
        if (!b.enabled) continue;
        if (!(body.x + r > b.minX && body.x - r < b.maxX && body.y + body.h > b.minY && body.y < b.maxY && body.z + r > b.minZ && body.z - r < b.maxZ))
          continue;
        const rise = b.maxY - body.y;
        if (rise > 0.001 && rise <= body.step && (body.onGround || body.vy <= 0.5)) {
          // try stepping up
          if (!this.overlaps(body.x, b.maxY + EPS, body.z, r, body.h, b)) {
            // make sure nothing else overlaps at new height (checked above, excluding b only)
            body.y = b.maxY;
            body.onGround = true;
            if (body.vy < 0) body.vy = 0;
            continue;
          }
        }
        if (axis === 0) {
          body.x = d > 0 ? b.minX - r - EPS : b.maxX + r + EPS;
          res.hitX = true;
          body.vx = 0;
        } else {
          body.z = d > 0 ? b.minZ - r - EPS : b.maxZ + r + EPS;
          res.hitZ = true;
          body.vz = 0;
        }
      }
    }
    // vertical
    body.y += dy;
    let grounded = false;
    for (let i = 0; i < bs.length; i++) {
      const b = bs[i];
      if (!b.enabled) continue;
      if (!(body.x + r > b.minX && body.x - r < b.maxX && body.y + body.h > b.minY && body.y < b.maxY && body.z + r > b.minZ && body.z - r < b.maxZ))
        continue;
      if (dy <= 0) {
        body.y = b.maxY;
        if (body.vy < 0) body.vy = 0;
        grounded = true;
        res.hitY = true;
      } else {
        body.y = b.minY - body.h - EPS;
        if (body.vy > 0) body.vy = 0;
        res.hitY = true;
      }
    }
    body.onGround = grounded;
    return res;
  }

  raycast(ox: number, oy: number, oz: number, dx: number, dy: number, dz: number, maxD: number, filter?: (c: Collider) => boolean): RayHit | null {
    let best: RayHit | null = null;
    let bestT = maxD;
    const idx = 1 / (dx || 1e-9),
      idy = 1 / (dy || 1e-9),
      idz = 1 / (dz || 1e-9);
    const bs = this.boxes;
    for (let i = 0; i < bs.length; i++) {
      const b = bs[i];
      if (!b.enabled) continue;
      if (filter && !filter(b)) continue;
      let t1 = (b.minX - ox) * idx,
        t2 = (b.maxX - ox) * idx;
      let tmin = Math.min(t1, t2),
        tmax = Math.max(t1, t2);
      let nx = t1 < t2 ? -1 : 1,
        ny = 0,
        nz = 0;
      t1 = (b.minY - oy) * idy;
      t2 = (b.maxY - oy) * idy;
      const ymin = Math.min(t1, t2),
        ymax = Math.max(t1, t2);
      if (ymin > tmin) {
        tmin = ymin;
        nx = 0;
        ny = t1 < t2 ? -1 : 1;
        nz = 0;
      }
      tmax = Math.min(tmax, ymax);
      t1 = (b.minZ - oz) * idz;
      t2 = (b.maxZ - oz) * idz;
      const zmin = Math.min(t1, t2),
        zmax = Math.max(t1, t2);
      if (zmin > tmin) {
        tmin = zmin;
        nx = 0;
        ny = 0;
        nz = t1 < t2 ? -1 : 1;
      }
      tmax = Math.min(tmax, zmax);
      if (tmax >= Math.max(tmin, 0) && tmin < bestT) {
        const t = Math.max(tmin, 0);
        if (t < bestT) {
          bestT = t;
          best = { dist: t, collider: b, nx, ny, nz };
        }
      }
    }
    return best;
  }

  lineClear(ax: number, ay: number, az: number, bx: number, by: number, bz: number): boolean {
    const dx = bx - ax,
      dy = by - ay,
      dz = bz - az;
    const d = Math.hypot(dx, dy, dz);
    if (d < 0.01) return true;
    return !this.raycast(ax, ay, az, dx / d, dy / d, dz / d, d - 0.05, (c) => c.tag !== "glassbroken");
  }
}

/** Ray vs AABB used for entities. returns distance or -1 */
export function rayAABB(
  ox: number,
  oy: number,
  oz: number,
  dx: number,
  dy: number,
  dz: number,
  minX: number,
  minY: number,
  minZ: number,
  maxX: number,
  maxY: number,
  maxZ: number,
): number {
  const idx = 1 / (dx || 1e-9),
    idy = 1 / (dy || 1e-9),
    idz = 1 / (dz || 1e-9);
  let t1 = (minX - ox) * idx,
    t2 = (maxX - ox) * idx;
  let tmin = Math.min(t1, t2),
    tmax = Math.max(t1, t2);
  t1 = (minY - oy) * idy;
  t2 = (maxY - oy) * idy;
  tmin = Math.max(tmin, Math.min(t1, t2));
  tmax = Math.min(tmax, Math.max(t1, t2));
  t1 = (minZ - oz) * idz;
  t2 = (maxZ - oz) * idz;
  tmin = Math.max(tmin, Math.min(t1, t2));
  tmax = Math.min(tmax, Math.max(t1, t2));
  if (tmax >= Math.max(tmin, 0)) return Math.max(tmin, 0);
  return -1;
}
