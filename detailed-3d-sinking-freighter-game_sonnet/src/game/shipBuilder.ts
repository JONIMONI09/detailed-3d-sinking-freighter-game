import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { CollisionWorld } from "./physics";
import { TexSet, textTexture } from "./textures";
import {
  Barrel,
  CEIL_Y,
  Compartment,
  Crate,
  DECK_Y,
  Door,
  FLOOR_Y,
  GlassPane,
  GuardSpawn,
  HULL_HW,
  Lamp,
  Lifeboat,
  Marker,
  Pickup,
  PickupType,
  KeyColor,
  WI,
  Z_BOW,
  Z_STERN,
  hullHalfWidth,
} from "./shipTypes";

export interface ShipModel {
  group: THREE.Group;
  waterGroup: THREE.Group;
  world: CollisionWorld;
  doors: Door[];
  glass: GlassPane[];
  pickups: Pickup[];
  barrels: Barrel[];
  crates: Crate[];
  lamps: Lamp[];
  lampMat: THREE.MeshBasicMaterial;
  zones: THREE.Box3[];
  compartments: Compartment[];
  markers: Marker[];
  lifeboats: Lifeboat[];
  guardSpawns: GuardSpawn[];
  animated: ((t: number, dt: number) => void)[];
  funnelTop: THREE.Vector3;
  spawn: THREE.Vector3;
  holeGroup: THREE.Group;
  navLights: THREE.Mesh[];
  alarmLights: THREE.Mesh[];
  warnLightMat: THREE.MeshBasicMaterial;
  dispose: () => void;
}

function mulberry(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function boxGeo(sx: number, sy: number, sz: number, tile = 2.5): THREE.BoxGeometry {
  const g = new THREE.BoxGeometry(sx, sy, sz);
  const uv = g.attributes.uv as THREE.BufferAttribute;
  const dims = [
    [sz, sy],
    [sz, sy],
    [sx, sz],
    [sx, sz],
    [sx, sy],
    [sx, sy],
  ];
  for (let f = 0; f < 6; f++)
    for (let v = 0; v < 4; v++) {
      const i = f * 4 + v;
      uv.setXY(i, (uv.getX(i) * dims[f][0]) / tile, (uv.getY(i) * dims[f][1]) / tile);
    }
  return g;
}

class Batch {
  private m = new Map<string, THREE.BufferGeometry[]>();
  constructor(private mats: Record<string, THREE.Material>) {}
  add(g: THREE.BufferGeometry, mat: string) {
    if (!this.mats[mat]) throw new Error("Unknown material " + mat);
    let l = this.m.get(mat);
    if (!l) this.m.set(mat, (l = []));
    l.push(g);
  }
  box(mat: string, cx: number, cy: number, cz: number, sx: number, sy: number, sz: number, rotY = 0, tile = 2.5) {
    if (sx <= 0 || sy <= 0 || sz <= 0) return;
    const g = boxGeo(sx, sy, sz, tile);
    if (rotY) g.rotateY(rotY);
    g.translate(cx, cy, cz);
    this.add(g, mat);
  }
  cyl(mat: string, cx: number, cy: number, cz: number, r: number, h: number, axis: "x" | "y" | "z" = "y", seg = 14, r2?: number) {
    const g = new THREE.CylinderGeometry(r2 ?? r, r, h, seg, 1);
    if (axis === "x") g.rotateZ(Math.PI / 2);
    else if (axis === "z") g.rotateX(Math.PI / 2);
    g.translate(cx, cy, cz);
    this.add(g, mat);
  }
  build(parent: THREE.Object3D, disposables: THREE.BufferGeometry[]) {
    for (const [mat, list] of this.m) {
      const merged = mergeGeometries(list, false);
      list.forEach((g) => g.dispose());
      if (!merged) {
        console.warn("merge failed for", mat);
        continue;
      }
      disposables.push(merged);
      const mesh = new THREE.Mesh(merged, this.mats[mat]);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      parent.add(mesh);
    }
    this.m.clear();
  }
}

interface Opening {
  c: number;
  w: number;
  kind: "door" | "window" | "gap" | "sdoor";
  key?: KeyColor | null;
  sill?: number;
  top?: number;
  hinge?: 1 | -1;
  name?: string;
  bulkhead?: boolean;
}

export function buildShip(tex: TexSet, opts: { sandbox: boolean }): ShipModel {
  const rnd = mulberry(20240611);
  const group = new THREE.Group();
  const waterGroup = new THREE.Group();
  const world = new CollisionWorld();
  const doors: Door[] = [];
  const glass: GlassPane[] = [];
  const pickups: Pickup[] = [];
  const barrels: Barrel[] = [];
  const crates: Crate[] = [];
  const lamps: Lamp[] = [];
  const zones: THREE.Box3[] = [];
  const markers: Marker[] = [];
  const lifeboats: Lifeboat[] = [];
  const guardSpawns: GuardSpawn[] = [];
  const animated: ((t: number, dt: number) => void)[] = [];
  const geoms: THREE.BufferGeometry[] = [];
  const navLights: THREE.Mesh[] = [];
  const alarmLights: THREE.Mesh[] = [];
  const v3 = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

  const std = (o: THREE.MeshStandardMaterialParameters) => new THREE.MeshStandardMaterial(o);
  const lampMat = new THREE.MeshBasicMaterial({ color: 0xfff1c9 });
  const warnLightMat = new THREE.MeshBasicMaterial({ color: 0xff2200 });
  const glassMat = new THREE.MeshStandardMaterial({ color: 0xaaccdd, transparent: true, opacity: 0.28, roughness: 0.05, metalness: 0.1, depthWrite: false, side: THREE.DoubleSide });
  const mats: Record<string, THREE.Material> = {
    steel: std({ map: tex.steel, color: 0xc4c9ce, roughness: 0.55, metalness: 0.45 }),
    steelDark: std({ map: tex.steel, color: 0x757b82, roughness: 0.6, metalness: 0.5 }),
    deck: std({ map: tex.deck, roughness: 0.85, metalness: 0.1 }),
    wall: std({ map: tex.wall, roughness: 0.9 }),
    wallBlue: std({ map: tex.wall, color: 0x9db7d4, roughness: 0.9 }),
    wallGreen: std({ map: tex.wall, color: 0xa9c9b0, roughness: 0.9 }),
    wallCream: std({ map: tex.wall, color: 0xf0e6c8, roughness: 0.9 }),
    tile: std({ map: tex.tile, roughness: 0.5 }),
    carpet: std({ map: tex.carpet, roughness: 1 }),
    wood: std({ map: tex.wood, roughness: 0.8 }),
    rust: std({ map: tex.rust, roughness: 0.9, metalness: 0.3 }),
    grate: std({ map: tex.grate, roughness: 0.7, metalness: 0.6 }),
    white: std({ color: 0xe8e8e8, roughness: 0.8 }),
    black: std({ color: 0x15171a, roughness: 0.6, metalness: 0.2 }),
    red: std({ color: 0xb02a22, roughness: 0.6, metalness: 0.2 }),
    yellow: std({ color: 0xd9b030, roughness: 0.6, metalness: 0.2 }),
    green: std({ color: 0x2e7d4f, roughness: 0.7 }),
    blue: std({ color: 0x2a5fa5, roughness: 0.7 }),
    orange: std({ color: 0xe06a1a, roughness: 0.6 }),
    rubber: std({ color: 0x222222, roughness: 1 }),
    chrome: std({ color: 0xdddddd, roughness: 0.2, metalness: 1 }),
    engine: std({ map: tex.steel, color: 0x3d7a52, roughness: 0.45, metalness: 0.65 }),
    engineRed: std({ map: tex.steel, color: 0xa63a2a, roughness: 0.5, metalness: 0.5 }),
    fabric: std({ color: 0x3b4f6e, roughness: 1 }),
    sheet: std({ color: 0xdfe4ea, roughness: 1 }),
    lamp: lampMat,
    screen: new THREE.MeshBasicMaterial({ color: 0x66ffd0 }),
    screenAmber: new THREE.MeshBasicMaterial({ color: 0xffb040 }),
    ledGreen: new THREE.MeshBasicMaterial({ color: 0x33ff66 }),
    ledRed: new THREE.MeshBasicMaterial({ color: 0xff3322 }),
    doorMat: std({ map: tex.steel, color: 0x8da0b4, roughness: 0.5, metalness: 0.5 }),
  };
  const B = new Batch(mats);
  const doorMat = mats.doorMat;
  const heavyDoorMat = std({ map: tex.rust, color: 0xb0b8c0, roughness: 0.6, metalness: 0.6 });

  // ------------------------------------------------------------------ helpers
  const sbox = (mat: string, cx: number, cy: number, cz: number, sx: number, sy: number, sz: number, tag = "wall") => {
    B.box(mat, cx, cy, cz, sx, sy, sz);
    return world.addCentered(cx, cy, cz, Math.max(sx, 0.001), sy, Math.max(sz, 0.001), tag);
  };
  const colOnly = (cx: number, cy: number, cz: number, sx: number, sy: number, sz: number, tag = "wall") => world.addCentered(cx, cy, cz, sx, sy, sz, tag);
  const rectBox = (mat: string, x0: number, x1: number, y0: number, y1: number, z0: number, z1: number, collide = true) => {
    if (x1 <= x0 || y1 <= y0 || z1 <= z0) throw new Error(`rectBox with invalid dimensions: ${mat} ${x0},${x1} ${y0},${y1} ${z0},${z1}`);
    const cx = (x0 + x1) / 2,
      cy = (y0 + y1) / 2,
      cz = (z0 + z1) / 2;
    if (collide) sbox(mat, cx, cy, cz, x1 - x0, y1 - y0, z1 - z0);
    else B.box(mat, cx, cy, cz, x1 - x0, y1 - y0, z1 - z0);
  };
  const floorPad = (mat: string, x0: number, x1: number, z0: number, z1: number, y: number) => {
    B.box(mat, (x0 + x1) / 2, y + 0.011, (z0 + z1) / 2, x1 - x0, 0.022, z1 - z0, 0, 2);
  };

  const addLamp = (x: number, y: number, z: number, zone = -1, visual = true) => {
    lamps.push({ pos: v3(x, y, z), zone });
    if (visual) B.box("lamp", x, y + 0.04, z, 0.9, 0.08, 0.28);
  };

  const makeGlass = (axis: "x" | "z", fixed: number, c: number, w: number, y0: number, y1: number) => {
    const th = 0.04;
    const geo = new THREE.BoxGeometry(axis === "x" ? w : th, y1 - y0, axis === "x" ? th : w);
    geoms.push(geo);
    const mesh = new THREE.Mesh(geo, glassMat);
    const pos = axis === "x" ? v3(c, (y0 + y1) / 2, fixed) : v3(fixed, (y0 + y1) / 2, c);
    mesh.position.copy(pos);
    group.add(mesh);
    const pane: GlassPane = { mesh, collider: null as any, broken: false, pos, w, h: y1 - y0, axis };
    pane.collider = world.addCentered(pos.x, pos.y, pos.z, axis === "x" ? w : 0.1, y1 - y0, axis === "x" ? 0.1 : w, "glass", pane);
    glass.push(pane);
  };

  const makeDoor = (axis: "x" | "z", fixed: number, y0: number, o: Opening, heavy = false) => {
    const d = new Door(world, heavy ? heavyDoorMat : doorMat, {
      name: o.name ?? "Door",
      axis,
      fixed,
      c: o.c,
      w: o.w,
      y0,
      h: 2.2,
      hinge: o.hinge ?? -1,
      kind: o.kind === "sdoor" ? "slide" : "swing",
      locked: opts.sandbox ? null : (o.key ?? null),
      heavy,
      bulkhead: !!o.bulkhead,
    });
    group.add(d.pivot);
    doors.push(d);
    return d;
  };

  const wall = (axis: "x" | "z", fixed: number, s0: number, s1: number, y0: number, y1: number, thick: number, mat: string, openings: Opening[] = [], heavy = false) => {
    const ops = [...openings].sort((a, b) => a.c - b.c);
    const seg = (a: number, b: number, ya: number, yb: number) => {
      if (b - a < 0.01 || yb - ya < 0.01) return;
      if (axis === "x") sbox(mat, (a + b) / 2, (ya + yb) / 2, fixed, b - a, yb - ya, thick);
      else sbox(mat, fixed, (ya + yb) / 2, (a + b) / 2, thick, yb - ya, b - a);
    };
    let cur = s0;
    for (const o of ops) {
      const a = o.c - o.w / 2,
        b = o.c + o.w / 2;
      seg(cur, a, y0, y1);
      if (o.kind === "window") {
        const sill = o.sill ?? 0.9,
          top = o.top ?? 2.4;
        seg(a, b, y0, y0 + sill);
        seg(a, b, y0 + top, y1);
        makeGlass(axis, fixed, o.c, o.w, y0 + sill, y0 + top);
      } else {
        seg(a, b, y0 + 2.2, y1);
        if (o.kind === "door" || o.kind === "sdoor") makeDoor(axis, fixed, y0, o, heavy);
      }
      cur = b;
    }
    seg(cur, s1, y0, y1);
  };

  const decompose = (x0: number, x1: number, z0: number, z1: number, holes: [number, number, number, number][], cb: (xa: number, xb: number, za: number, zb: number) => void) => {
    const zs = [z0, z1];
    holes.forEach((h) => zs.push(h[2], h[3]));
    const u = [...new Set(zs.filter((z) => z >= z0 - 1e-6 && z <= z1 + 1e-6))].sort((a, b) => a - b);
    for (let i = 0; i < u.length - 1; i++) {
      const za = u[i],
        zb = u[i + 1];
      if (zb - za < 0.001) continue;
      const zm = (za + zb) / 2;
      const hs = holes.filter((h) => h[2] <= zm && zm <= h[3]).sort((a, b) => a[0] - b[0]);
      let cur = x0;
      for (const h of hs) {
        if (h[0] > cur) cb(cur, h[0], za, zb);
        cur = Math.max(cur, h[1]);
      }
      if (cur < x1) cb(cur, x1, za, zb);
    }
  };

  const slab = (x0: number, x1: number, z0: number, z1: number, yTop: number, thick: number, mat: string, holes: [number, number, number, number][] = []) => {
    decompose(x0, x1, z0, z1, holes, (xa, xb, za, zb) => {
      if (xb - xa < 0.001) return;
      sbox(mat, (xa + xb) / 2, yTop - thick / 2, (za + zb) / 2, xb - xa, thick, zb - za);
    });
  };

  const padH = (mat: string, x0: number, x1: number, z0: number, z1: number, y: number, holes: [number, number, number, number][]) => {
    decompose(x0, x1, z0, z1, holes, (xa, xb, za, zb) => B.box(mat, (xa + xb) / 2, y + 0.011, (za + zb) / 2, xb - xa, 0.022, zb - za, 0, 2));
  };

  /** Rails: visual thin bars + collider */
  const rail = (x0: number, x1: number, z0: number, z1: number, y0: number, collide = true, mat = "yellow") => {
    const alongX = x1 - x0 >= z1 - z0;
    const len = alongX ? x1 - x0 : z1 - z0;
    const cx = (x0 + x1) / 2,
      cz = (z0 + z1) / 2;
    const th = 0.06;
    if (alongX) {
      B.box(mat, cx, y0 + 1.04, cz, len, th, th);
      B.box(mat, cx, y0 + 0.55, cz, len, 0.04, 0.04);
    } else {
      B.box(mat, cx, y0 + 1.04, cz, th, th, len);
      B.box(mat, cx, y0 + 0.55, cz, 0.04, 0.04, len);
    }
    const n = Math.max(1, Math.ceil(len / 1.8));
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      const px = alongX ? x0 + len * t : cx,
        pz = alongX ? cz : z0 + len * t;
      B.box(mat, px, y0 + 0.52, pz, 0.06, 1.04, 0.06);
    }
    if (collide) {
      const tx = Math.max(x1 - x0, 0.2),
        tz = Math.max(z1 - z0, 0.2);
      colOnly(cx, y0 + 1.5, cz, tx, 3.0, tz, "rail");
    }
  };

  const stairSteps = (x0: number, x1: number, zStart: number, zEnd: number, yStart: number, yEnd: number, bottomY: number, mat = "grate") => {
    const rise = yEnd - yStart;
    const n = Math.max(2, Math.round(Math.abs(rise) / 0.29));
    const h = rise / n;
    const d = (zEnd - zStart) / n;
    for (let i = 1; i <= n; i++) {
      const top = yStart + i * h;
      const za = zStart + (i - 1) * d,
        zb = zStart + i * d;
      rectBox(mat, x0, x1, Math.min(bottomY, top - 0.1), top, Math.min(za, zb), Math.max(za, zb));
    }
  };

  /** U-förmige Treppe nach unten. A läuft von zTop Richtung -z, B zurück */
  const uStair = (x0: number, fw: number, zTop: number, yTop: number, yMid: number, yBot: number, len = 4.5, land = 2.0) => {
    const gap = 0.3;
    const aX0 = x0,
      aX1 = x0 + fw,
      bX0 = x0 + fw + gap,
      bX1 = x0 + 2 * fw + gap;
    const zMid = zTop - len;
    stairSteps(aX0, aX1, zTop, zMid, yTop, yMid, yMid - 0.3);
    rectBox("steelDark", x0, bX1, yMid - 0.3, yMid, zMid - land, zMid);
    stairSteps(bX0, bX1, zMid, zTop, yMid, yBot, yBot - 0.1);
    // Spindel (verhindert Seitwärts-Sturz zwischen den Läufen)
    rectBox("steelDark", aX1, bX0, yBot, yTop + 1.1, zMid - land, zTop);
    return { aX0, aX1, bX0, bX1, zMid, zBack: zMid - land };
  };

  // ------------------------------------------------------------------ Rumpf
  {
    const profile: [number, number][] = [
      [1, 3.0],
      [1, -2.5],
      [0.985, -3.6],
      [0.94, -4.6],
      [0.85, -5.5],
      [0.68, -6.2],
      [0.4, -6.6],
      [0, -6.7],
    ];
    const P = profile.length;
    const stations: number[] = [];
    for (let z = Z_STERN; z <= 52; z += 2) stations.push(z);
    for (let z = 53; z < Z_BOW; z += 1) stations.push(z);
    stations.push(Z_BOW - 0.05);
    const pos: number[] = [],
      col: number[] = [],
      uv: number[] = [],
      idx: number[] = [];
    const ringSize = P * 2;
    stations.forEach((z, si) => {
      const hw = Math.max(hullHalfWidth(z), 0.04);
      const rise = z > 40 ? Math.pow((z - 40) / 30, 2) * 4.5 : 0;
      const pts: [number, number][] = [];
      for (let j = 0; j < P; j++) {
        const [u, y0] = profile[j];
        const y = y0 < -2 ? y0 + rise * Math.min(1, (-2 - y0) / 4.7) : y0;
        pts.push([u * hw, y]);
      }
      let arc = 0;
      for (let k = 0; k < ringSize; k++) {
        const j = k < P ? k : ringSize - 1 - k;
        const sgn = k < P ? 1 : -1;
        const [x, y] = pts[j];
        pos.push(sgn * x, y, z);
        if (k > 0) {
          const pj = (k - 1) < P ? k - 1 : ringSize - 1 - (k - 1);
          const psg = k - 1 < P ? 1 : -1;
          arc += Math.hypot(sgn * x - psg * pts[pj][0], y - pts[pj][1]);
        }
        uv.push(z / 8, arc / 8);
        if (y > -0.35) col.push(0.62, 0.64, 0.68);
        else if (y > -1.0) col.push(0.8, 0.8, 0.82);
        else col.push(0.75, 0.22, 0.17);
      }
      if (si > 0) {
        const a = (si - 1) * ringSize,
          b = si * ringSize;
        for (let k = 0; k < ringSize - 1; k++) {
          idx.push(a + k, b + k, a + k + 1, a + k + 1, b + k, b + k + 1);
        }
      }
    });
    // Heckspiegel
    const base = pos.length / 3;
    pos.push(0, -2, Z_STERN);
    col.push(0.6, 0.6, 0.62);
    uv.push(0, 0);
    for (let k = 0; k < ringSize - 1; k++) idx.push(base, k + 1, k);
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
    g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    g.computeVertexNormals();
    geoms.push(g);
    const m = new THREE.Mesh(g, std({ map: tex.hull, vertexColors: true, roughness: 0.65, metalness: 0.35, side: THREE.DoubleSide }));
    m.castShadow = true;
    m.receiveShadow = true;
    group.add(m);
    // Schiffsname
    const nameTex = textTexture("NORDWIND", 512, 96, null, "#f2f2f2", "bold 78px Arial, sans-serif");
    for (const s of [1, -1]) {
      const p = new THREE.Mesh(new THREE.PlaneGeometry(14, 2.1), new THREE.MeshBasicMaterial({ map: nameTex, transparent: true, side: THREE.DoubleSide }));
      p.position.set(s * (HULL_HW + 0.03), 1.25, 38);
      p.rotation.y = s * Math.PI / 2;
      group.add(p);
    }
    // Wasserlinie-Streifen & Tiefgangsmarken sind im Vertex-Color enthalten
  }

  // ------------------------------------------------------------------ Deck
  const ZB0 = 52; // Bugbeginn
  const engineHole: [number, number, number, number] = [-1.6, 1.6, -64.6, -58.0];
  const holdHole: [number, number, number, number] = [-9.35, -6.05, 18.5, 25.5];
  slab(-HULL_HW, HULL_HW, Z_STERN, ZB0, DECK_Y, 0.3, "deck", [engineHole, holdHole]);
  // Bugdeck als Polygon
  {
    const shape = new THREE.Shape();
    const zs: number[] = [];
    for (let z = ZB0; z <= Z_BOW - 0.05; z += 1) zs.push(z);
    zs.push(Z_BOW - 0.05);
    shape.moveTo(-HULL_HW, ZB0);
    zs.forEach((z) => shape.lineTo(-hullHalfWidth(z), z));
    for (let i = zs.length - 1; i >= 0; i--) shape.lineTo(hullHalfWidth(zs[i]), zs[i]);
    shape.lineTo(HULL_HW, ZB0);
    shape.lineTo(-HULL_HW, ZB0);
    const eg = new THREE.ExtrudeGeometry(shape, { depth: 0.3, bevelEnabled: false });
    eg.rotateX(Math.PI / 2);
    eg.translate(0, DECK_Y, 0);
    const uv = eg.attributes.uv as THREE.BufferAttribute;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) / 2.5, uv.getY(i) / 2.5);
    geoms.push(eg);
    const bm = new THREE.Mesh(eg, mats.deck);
    bm.receiveShadow = true;
    bm.castShadow = true;
    group.add(bm);
    // Kollision Bugdeck + Reling (gestuft)
    for (let z = ZB0; z < Z_BOW - 0.05; z += 1) {
      const z1 = Math.min(z + 1, Z_BOW);
      const hw = Math.max(hullHalfWidth(z1), 0.2);
      colOnly(0, DECK_Y - 0.5, (z + z1) / 2, hw * 2, 1.0, 1.0, "wall");
      for (const s of [-1, 1]) colOnly(s * (hw + 1.5 - 0.2), DECK_Y + 1.5, (z + z1) / 2, 3, 3.0, 1.0, "rail");
    }
    colOnly(0, DECK_Y + 1.5, Z_BOW + 0.6, 6, 3.0, 1.2, "rail");
    // sichtbare Bug-Reling
    for (const s of [-1, 1]) {
      let prev: [number, number] | null = null;
      for (let z = ZB0; z <= Z_BOW - 2; z += 2) {
        const p: [number, number] = [s * (hullHalfWidth(z) - 0.2), z];
        B.box("yellow", p[0], DECK_Y + 0.52, p[1], 0.06, 1.04, 0.06);
        if (prev) {
          const dx = p[0] - prev[0],
            dz = p[1] - prev[1];
          const L = Math.hypot(dx, dz);
          const ang = Math.atan2(dx, dz);
          B.box("yellow", (p[0] + prev[0]) / 2, DECK_Y + 1.04, (p[1] + prev[1]) / 2, 0.06, 0.06, L, ang);
          B.box("yellow", (p[0] + prev[0]) / 2, DECK_Y + 0.55, (p[1] + prev[1]) / 2, 0.04, 0.04, L, ang);
        }
        prev = p;
      }
    }
  }

  // Seitenreling mit Lücken an den Rettungsboot-Stationen
  const GATE_Z0 = -36.5,
    GATE_Z1 = -32.5;
  for (const s of [-1, 1]) {
    const x = s * (HULL_HW - 0.2);
    rail(x - 0.1, x + 0.1, Z_STERN + 0.2, GATE_Z0, DECK_Y);
    rail(x - 0.1, x + 0.1, GATE_Z1, ZB0, DECK_Y);
  }
  rail(-HULL_HW + 0.1, HULL_HW - 0.1, Z_STERN + 0.15, Z_STERN + 0.25, DECK_Y);

  // ------------------------------------------------------------------ Rumpfinneres
  const BZ = { stern: -69.5, b0: -39, b1: -8, b2: 26, b3: 57 };
  const COMP_DEF = [
    { id: "engine", name: "Engine Room", z0: -69.5, z1: -39.25 },
    { id: "hold3", name: "Cargo Hold 3", z0: -38.75, z1: -8.25 },
    { id: "hold2", name: "Cargo Hold 2", z0: -7.75, z1: 25.75 },
    { id: "hold1", name: "Cargo Hold 1", z0: 26.25, z1: 56.75 },
  ];
  // innere Bordwände (Doppelhülle)
  for (const s of [-1, 1]) {
    rectBox("steelDark", s > 0 ? WI : -10.9, s > 0 ? 10.9 : -WI, FLOOR_Y - 0.3, CEIL_Y, BZ.stern, BZ.b3 + 0.25);
  }
  // Boden
  rectBox("steelDark", -WI, WI, FLOOR_Y - 0.4, FLOOR_Y, BZ.stern, BZ.b3 + 0.25);
  // Heckwand
  rectBox("steelDark", -HULL_HW, HULL_HW, FLOOR_Y - 1.6, CEIL_Y, Z_STERN, BZ.stern);
  // Bug massiv
  colOnly(0, -2, 64, 22, 10, 14, "wall");
  rectBox("steel", -WI, WI, FLOOR_Y, CEIL_Y, BZ.b3 + 0.25, BZ.b3 + 0.6, false);
  // Schotten
  for (const zc of [BZ.b0, BZ.b1, BZ.b2]) {
    wall("x", zc, -WI, WI, FLOOR_Y, CEIL_Y, 0.5, "steel", [{ c: 0, w: 1.5, kind: "sdoor", hinge: -1, name: "Watertight Bulkhead", bulkhead: true }], true);
  }
  wall("x", BZ.b3, -WI, WI, FLOOR_Y, CEIL_Y, 0.5, "steel");
  // Decke der Räume wird durch das Deck gebildet. Decken-Unterseite sichtbar (steel)

  const compartments: Compartment[] = COMP_DEF.map((c, i) => {
    const min = v3(-WI, FLOOR_Y, c.z0),
      max = v3(WI, CEIL_Y, c.z1);
    const volume = (max.x - min.x) * (max.y - min.y) * (max.z - min.z) * 0.78;
    const planes = Array.from({ length: 6 }, () => new THREE.Plane());
    const wm = new THREE.Mesh(
      new THREE.PlaneGeometry(WI * 2 + 2, c.z1 - c.z0 + 2),
      new THREE.MeshStandardMaterial({
        color: 0x1c6478,
        transparent: true,
        opacity: 0.78,
        roughness: 0.15,
        metalness: 0.1,
        side: THREE.DoubleSide,
        depthWrite: false,
        clippingPlanes: planes,
      }),
    );
    wm.rotation.x = -Math.PI / 2;
    wm.visible = false;
    wm.renderOrder = 5;
    waterGroup.add(wm);
    zones.push(new THREE.Box3(min.clone().add(v3(-0.5, -1, 0)), max.clone().add(v3(0.5, 0.5, 0))));
    return { id: c.id, name: c.name, min, max, volume, water: 0, holes: [], planes, waterMesh: wm, fill: 0, level: FLOOR_Y, worldLevel: -99, sideBias: 0, flow: 0 };
    void i;
  });

  // ---------------------------------------------------- Maschinenraum
  {
    // Boden-Gitter Optik
    floorPad("grate", -WI, WI, BZ.stern, -39.25, FLOOR_Y);
    // Hauptmotor
    sbox("engine", 0, -2.75, -49.5, 6.4, 4.5, 11);
    colOnly(0, 0.3, -50, 1.8, 1.6, 10.5);
    B.box("steelDark", 0, -0.45, -49.5, 6.0, 0.15, 10.6);
    const pistons: THREE.Mesh[] = [];
    for (let i = 0; i < 6; i++) {
      const z = -54.2 + i * 1.7;
      B.cyl("engineRed", 0, 0.3, z, 0.7, 1.6, "y", 16);
      B.cyl("chrome", 0, 1.15, z, 0.45, 0.12, "y", 12);
      const p = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.9, 10), mats.chrome);
      geoms.push(p.geometry);
      p.position.set(0, 1.6, z);
      p.castShadow = true;
      group.add(p);
      pistons.push(p);
      // seitliche Rohre
      B.cyl("steelDark", 2.2, -1.2, z, 0.16, 2.4, "y", 8);
      B.cyl("steelDark", -2.2, -1.2, z, 0.16, 2.4, "y", 8);
    }
    animated.push((t) => {
      pistons.forEach((p, i) => (p.position.y = 1.5 + 0.33 * Math.sin(t * 7 + i * 1.047)));
    });
    // Schwungrad
    const fly = new THREE.Group();
    fly.position.set(0, -2.4, -43.4);
    const wheelG = new THREE.CylinderGeometry(1.7, 1.7, 0.35, 28);
    wheelG.rotateX(Math.PI / 2);
    geoms.push(wheelG);
    const wheel = new THREE.Mesh(wheelG, mats.steelDark);
    wheel.castShadow = true;
    fly.add(wheel);
    for (let i = 0; i < 4; i++) {
      const sp = new THREE.Mesh(new THREE.BoxGeometry(3.3, 0.25, 0.4), i % 2 ? mats.yellow : mats.red);
      geoms.push(sp.geometry);
      sp.rotation.z = (i * Math.PI) / 4;
      fly.add(sp);
    }
    group.add(fly);
    animated.push((_t, dt) => (fly.rotation.z -= dt * 5));
    colOnly(0, -3, -43.4, 3.6, 4, 0.7);
    // Generatoren
    for (const z of [-51, -46.5]) {
      sbox("engineRed", 6.8, -3.9, z, 2.4, 2.2, 3.4);
      B.cyl("steelDark", 6.8, -2.6, z, 0.8, 0.5, "x", 12);
      B.box("ledGreen", 5.58, -3.2, z - 1.2, 0.04, 0.12, 0.12);
      B.box("ledRed", 5.58, -3.2, z + 1.2, 0.04, 0.12, 0.12);
    }
    // Tanks
    for (const s of [-1, 1]) {
      B.cyl("steel", s * 7.6, -3.3, -63, 1.6, 7, "z", 20);
      colOnly(s * 7.6, -3.4, -63, 3.2, 3.4, 7);
      B.box("steelDark", s * 7.6, -4.9, -60.5, 0.4, 0.2, 0.4);
      B.box("steelDark", s * 7.6, -4.9, -65.5, 0.4, 0.2, 0.4);
    }
    // Rohre
    for (const x of [-6.5, -3, 3, 6.5]) {
      B.cyl("steelDark", x, 2.15, -54, 0.14, 30, "z", 8);
      for (let z = -66; z < -41; z += 5) B.box("steel", x, 2.15, z, 0.3, 0.3, 0.12);
    }
    B.cyl("rust", -8.6, 0.8, -56, 0.12, 5, "y", 8);
    // Schaltschränke
    for (let i = 0; i < 4; i++) {
      const z = -48 + i * 2.4;
      sbox("steelDark", 9.15, -3.4, z, 0.7, 3.2, 1.4);
      B.box("ledGreen", 8.78, -2.6, z - 0.4, 0.04, 0.1, 0.1);
      B.box(i % 2 ? "ledRed" : "ledGreen", 8.78, -2.6, z + 0.4, 0.04, 0.1, 0.1);
      B.box("screenAmber", 8.78, -3.3, z, 0.04, 0.3, 0.5);
    }
    // Treppe von der Brücke / dem Leitstand
    uStair(-1.6, 1.45, -58.0, DECK_Y, -1.0, FLOOR_Y);
    // Geländer um die Öffnung
    rail(-1.65, -1.55, -64.6, -58.0, DECK_Y);
    rail(1.55, 1.65, -64.6, -58.0, DECK_Y);
    rail(-1.6, 1.6, -64.65, -64.55, DECK_Y);
    rail(0.15, 1.6, -58.05, -57.95, DECK_Y);
    rail(-0.15, 0.15, -64.6, -58.0, DECK_Y, false);
    // Lampen
    [-66, -58, -50, -44, -41].forEach((z, i) => {
      addLamp(-4, 2.4, z, 0);
      addLamp(4, 2.4, z, 0);
      void i;
    });
    // Rippen
    for (let z = -68; z < -40; z += 3) for (const s of [-1, 1]) B.box("steelDark", s * (WI - 0.08), -1.1, z, 0.16, 7.7, 0.35);
    // Fässer
    for (const [x, z] of [
      [-8.6, -42.2],
      [-8.6, -41.2],
      [-8.7, -55],
      [3.9, -41.4],
    ] as [number, number][])
      addBarrel(x, FLOOR_Y, z);
    markers.push(makeMarker("m_engine", "Engine Room", -9.0, FLOOR_Y, -48));
    guardSpawns.push({ name: "engine", pos: v3(-4.8, FLOOR_Y, -55), patrol: [v3(-4.8, FLOOR_Y, -56), v3(-4.8, FLOOR_Y, -42)] });
  }

  // ---------------------------------------------------- Container
  const cPalette = [0xb33a2e, 0x2f5d8a, 0x3c7a4a, 0xd9a13a, 0xe0e0e0, 0x8a8f94, 0x6b3f2a, 0x0c8c9c, 0xc25a1c];
  const inst20: { x: number; y: number; z: number; c: number }[] = [];
  const inst40: { x: number; y: number; z: number; c: number }[] = [];
  const CH = 2.5;
  function stack(x: number, baseY: number, z0: number, len: number, heights: number) {
    const col = cPalette[Math.floor(rnd() * cPalette.length)];
    for (let j = 0; j < heights; j++) {
      const item = { x, y: baseY + CH / 2 + j * CH, z: z0 + len / 2, c: col };
      (len > 8 ? inst40 : inst20).push(item);
    }
    colOnly(x, baseY + (CH * heights) / 2, z0 + len / 2, 2.44, CH * heights, len, "container");
  }
  // Deck-Container
  const deckZones: [number, number][] = [
    [-35.5, -10.5],
    [-5, 22.5],
    [28.5, 54],
  ];
  const deckCols = [-6, -3.6, -1.2, 1.2, 3.6, 6];
  for (const [zs] of deckZones) {
    for (const x of deckCols) {
      for (let k = 0; k < 2; k++) {
        if (rnd() < 0.22) continue;
        // Lücke im Container-Block nicht über Treppenöffnung
        const z0 = zs + k * 12.6;
        if (x < -4.5 && z0 + 12.2 > holdHole[2] - 1 && z0 < holdHole[3] + 4) continue;
        stack(x, DECK_Y, z0, 12.19, 1 + Math.floor(rnd() * 3));
      }
    }
  }
  // Laderaum-Container
  const holdMarkers = [
    { hold: "hold3", side: 1, z: -24 },
    { hold: "hold2", side: 1, z: 8 },
    { hold: "hold1", side: -1, z: 42 },
  ];
  const holdCols = [-7.9, -5.4, 5.4, 7.9];
  COMP_DEF.slice(1).forEach((c) => {
    const mk = holdMarkers.find((m) => m.hold === c.id)!;
    for (const x of holdCols) {
      for (let k = 0; k < 6; k++) {
        const zs = c.z0 + 0.9 + k * 6.55;
        if (zs + 6.06 > c.z1 - 0.3) break;
        const zc = zs + 3.03;
        if (Math.sign(x) === mk.side && Math.abs(zc - mk.z) < 6.5) continue;
        if (c.id === "hold2" && x < 0 && zs + 6.06 > 17 && zs < 26) continue;
        if (rnd() < 0.3) continue;
        stack(x, FLOOR_Y, zs, 6.06, 1 + Math.floor(rnd() * 3));
      }
    }
  });

  // ---------------------------------------------------- Laderäume
  COMP_DEF.slice(1).forEach((c, hi) => {
    floorPad("steel", -WI, WI, c.z0, c.z1, FLOOR_Y);
    for (let z = c.z0 + 1.5; z < c.z1; z += 3) for (const s of [-1, 1]) B.box("steelDark", s * (WI - 0.08), -1.1, z, 0.16, 7.7, 0.35);
    for (let z = c.z0 + 4; z < c.z1 - 2; z += 7) {
      addLamp(0, 2.45, z, hi + 1);
      addLamp(-5.5, 2.45, z + 3, hi + 1);
      addLamp(5.5, 2.45, z + 3, hi + 1);
    }
    // gelbe Gangmarkierung
    B.box("yellow", -3.9, FLOOR_Y + 0.025, (c.z0 + c.z1) / 2, 0.12, 0.02, c.z1 - c.z0 - 1);
    B.box("yellow", 3.9, FLOOR_Y + 0.025, (c.z0 + c.z1) / 2, 0.12, 0.02, c.z1 - c.z0 - 1);
    const mk = holdMarkers.find((m) => m.hold === c.id)!;
    markers.push(makeMarker("m_" + c.id, c.name, mk.side * 9.0, FLOOR_Y, mk.z));
  });
  // Laderaum 2: Treppe + Gitter-Tor
  {
    const st = uStair(-9.35, 1.5, 25.5, DECK_Y, -1.0, FLOOR_Y);
    void st;
    rail(-9.45, -9.25, 18.5, 27.6, DECK_Y); // West
    rail(-7.85, -7.55, 18.5, 27.6, DECK_Y); // Spindel
    rail(-6.15, -5.95, 18.5, 25.5, DECK_Y); // Ost
    rail(-7.55, -6.05, 25.4, 25.6, DECK_Y); // Nordkante B
    rail(-9.35, -6.05, 18.4, 18.6, DECK_Y); // Süd
    makeDoor("x", 27.6, DECK_Y, { c: -8.6, w: 1.5, kind: "door", hinge: -1, key: "blue", name: "Cargo Hold 2 Gate" });
    // Container-Fläche unter dem Tor frei (kein Stapel dort)
    for (const z of [22, 25]) addLamp(-8.0, 2.45, z, 2);
    addBarrel(-5.0, FLOOR_Y, 20.5);
    // TNT-Kisten
    addPickup("tnt", 2, -2.0, FLOOR_Y, 12, "TNT crate");
    addPickup("tnt", 2, 3.0, FLOOR_Y, -30, "TNT crate");
    addPickup("ammo_rifle", 30, -3.0, FLOOR_Y, 40, "Rifle ammo");
    addPickup("medkit", 50, 1.5, FLOOR_Y, -14, "Medkit");
    guardSpawns.push({ name: "hold3", pos: v3(0, FLOOR_Y, -30), patrol: [v3(0, FLOOR_Y, -34), v3(0, FLOOR_Y, -12)] });
    guardSpawns.push({ name: "hold1", pos: v3(0, FLOOR_Y, 40), patrol: [v3(0, FLOOR_Y, 30), v3(0, FLOOR_Y, 54)] });
    for (const [x, z] of [[3.3, -27], [-3.3, 17], [3.3, 43]] as [number, number][]) addBarrel(x, FLOOR_Y, z);
  }

  // ---------------------------------------------------- Aufbauten
  const LV = [3.0, 6.2, 9.4, 12.6];
  const SX = 8.85,
    SZ0 = -65.85,
    SZ1 = -44.15;
  const stairZ0 = -52,
    stairZ1 = -48.4;
  const holeA: [number, number, number, number] = [-1.6, -0.15, stairZ0, stairZ1];
  const holeB: [number, number, number, number] = [0.15, 1.6, stairZ0, stairZ1];
  // Decken
  slab(-9, 9, -66, -44, LV[1], 0.2, "steel", [holeA]);
  slab(-9, 9, -66, -44, LV[2], 0.2, "steel", [holeB]);
  slab(-9, 9, -66, -44, LV[3], 0.2, "steel", [holeA]);
  slab(-9, 9, -52.2, -44, LV[3] + 3.2, 0.2, "steel");
  // Treppen
  stairSteps(-1.6, -0.15, stairZ0, stairZ1, LV[0], LV[1], LV[0] - 0.1); // A
  stairSteps(0.15, 1.6, stairZ1, stairZ0, LV[1], LV[2], LV[1] - 0.1); // B
  stairSteps(-1.6, -0.15, stairZ0, stairZ1, LV[2], LV[3], LV[2] - 0.1); // A
  rectBox("steelDark", -0.15, 0.15, LV[0], LV[3] + 1.0, stairZ0, stairZ1);

  const roomWindowsSide = (_yb: number, cs: number[]): Opening[] => cs.map((c) => ({ c, w: 2.0, kind: "window" as const }));

  // Aufbau-Zonen für Innenbeleuchtung
  for (let n = 0; n < 3; n++) zones.push(new THREE.Box3(v3(-9, LV[n], -66), v3(9, LV[n + 1], -44)));
  zones.push(new THREE.Box3(v3(-9, LV[3], -52.3), v3(9, LV[3] + 3.2, -44)));

  // Ebene 0
  {
    const y0 = LV[0],
      y1 = LV[1] - 0.2;
    wall("x", SZ1, -9, 9, y0, y1, 0.3, "wall", [
      { c: 0, w: 1.5, kind: "door", hinge: -1, name: "Main Entrance" },
      { c: -5.5, w: 2.2, kind: "window" },
      { c: 5.5, w: 2.2, kind: "window" },
    ]);
    wall("x", SZ0, -9, 9, y0, y1, 0.3, "wall", [
      { c: -5, w: 2.2, kind: "window" },
      { c: 5, w: 2.2, kind: "window" },
    ]);
    for (const s of [-1, 1]) {
      wall("z", s * SX, -66, -44, y0, y1, 0.3, "wall", [
        { c: -47, w: 1.2, kind: "door", hinge: s > 0 ? 1 : -1, name: "Side Entrance" },
        ...roomWindowsSide(y0, [-54, -61]),
      ]);
      wall("z", s * 1.7, -57.2, -44.15, y0, y1, 0.2, "wallBlue", [
        { c: -53.6, w: 1.0, kind: "door", hinge: s > 0 ? -1 : 1, name: "Door" },
        { c: -47, w: 1.0, kind: "door", hinge: s > 0 ? 1 : -1, name: "Door" },
      ]);
    }
    wall("x", -57.2, -8.85, 8.85, y0, y1, 0.2, "wallBlue", [{ c: 0, w: 1.4, kind: "door", hinge: -1, key: "red", name: "Engine Control Room" }]);
    wall("x", -50, -8.85, -1.8, y0, y1, 0.2, "wall");
    wall("x", -50, 1.8, 8.85, y0, y1, 0.2, "wall");
    // Böden
    padH("tile", -8.7, 8.7, -65.7, -57.3, y0, [engineHole]);
    floorPad("tile", -1.6, 1.6, -57, -44.3, y0);
    floorPad("wood", -8.7, -1.8, -49.9, -44.3, y0);
    floorPad("carpet", 1.8, 8.7, -49.9, -44.3, y0);
    floorPad("tile", -8.7, -1.8, -57, -50.1, y0);
    floorPad("tile", 1.8, 8.7, -57, -50.1, y0);
    // Leitstand: Konsolen
    sbox("steelDark", -6, y0 + 0.5, -64.5, 5, 1.0, 1.0);
    B.box("screen", -6, y0 + 1.25, -64.6, 4.2, 0.5, 0.05);
    B.box("black", -6, y0 + 1.25, -64.58, 4.4, 0.6, 0.04);
    sbox("steelDark", 6, y0 + 0.5, -64.5, 5, 1.0, 1.0);
    B.box("screenAmber", 6, y0 + 1.25, -64.6, 4.2, 0.5, 0.05);
    sbox("steelDark", -8.2, y0 + 0.9, -60.5, 0.8, 1.8, 3.0);
    sbox("steelDark", 8.2, y0 + 0.9, -60.5, 0.8, 1.8, 3.0);
    B.box("ledGreen", -7.78, y0 + 1.5, -60, 0.04, 0.1, 0.1);
    B.box("ledRed", 7.78, y0 + 1.5, -61, 0.04, 0.1, 0.1);
    rail(-4.0, -1.7, -58.5, -58.4, y0, false);
    // Lampen
    for (const z of [-62, -54, -48]) addLamp(0, y0 + 2.9, z, -1);
    for (const s of [-1, 1]) for (const z of [-53.6, -47]) addLamp(s * 5.2, y0 + 2.9, z, -1);
    addLamp(-5, y0 + 2.9, -62, -1);
    addLamp(5, y0 + 2.9, -62, -1);
    furnish("mess", -1, -50, -44.15, y0);
    furnish("galley", -1, -57.2, -50, y0);
    furnish("lounge", 1, -50, -44.15, y0);
    furnish("workshop", 1, -57.2, -50, y0);
    addPickup("medkit", 50, -6, y0, -55, "Medkit");
    addPickup("ammo_pistol", 24, 7.5, y0, -47, "Pistol ammo");
    guardSpawns.push({ name: "lobby", pos: v3(0.9, y0, -47), patrol: [v3(0.9, y0, -55), v3(0.9, y0, -46)] });
  }
  // Ebenen 1 & 2
  for (const n of [1, 2]) {
    const y0 = LV[n],
      y1 = LV[n + 1] - 0.2;
    wall("x", SZ1, -9, 9, y0, y1, 0.3, "wall", [
      { c: -5.5, w: 2.2, kind: "window" },
      { c: 5.5, w: 2.2, kind: "window" },
    ]);
    wall("x", SZ0, -9, 9, y0, y1, 0.3, "wall", [{ c: 0, w: 2.2, kind: "window" }]);
    for (const s of [-1, 1]) {
      wall("z", s * SX, -66, -44, y0, y1, 0.3, "wall", roomWindowsSide(y0, [-62, -54, -47]));
      wall("z", s * 1.7, SZ0, -44.15, y0, y1, 0.2, "wallBlue", [
        { c: -62, w: 1.0, kind: "door", hinge: s > 0 ? -1 : 1, name: "Cabin Door" },
        { c: -54, w: 1.0, kind: "door", hinge: s > 0 ? -1 : 1, name: "Cabin Door" },
        { c: -47, w: 1.0, kind: "door", hinge: s > 0 ? 1 : -1, name: "Cabin Door" },
      ]);
    }
    for (const z of [-58, -50]) {
      wall("x", z, -8.85, -1.8, y0, y1, 0.2, "wall");
      wall("x", z, 1.8, 8.85, y0, y1, 0.2, "wall");
    }
    padH("carpet", -1.6, 1.6, -65.7, -44.3, y0, [n === 1 ? holeA : holeB]);
    floorPad("wood", -8.7, -1.8, -65.7, -44.3, y0);
    floorPad("wood", 1.8, 8.7, -65.7, -44.3, y0);
    for (const z of [-62, -54, -47.5]) addLamp(0, y0 + 2.9, z, -1);
    for (const s of [-1, 1]) for (const z of [-62, -54, -47]) addLamp(s * 5.2, y0 + 2.9, z, -1);
    const zr: [number, number][] = [
      [-65.85, -58],
      [-58, -50],
      [-50, -44.15],
    ];
    for (const s of [-1, 1] as const)
      zr.forEach(([za, zb], i) => {
        const kind = n === 1 && s === 1 && i === 2 ? "medbay" : n === 2 && s === 1 && i === 1 ? "storage" : n === 2 && s === -1 && i === 2 ? "office" : "cabin";
        furnish(kind, s, za, zb, y0);
      });
    // Brüstung der Treppenöffnung (Spindelgeländer)
  }
  // Pickups in Kabinen
  addPickup("key_blue", 1, 8.5, LV[1] + 0.8, -51.2, "Blue Access Card");
  addPickup("weapon_shotgun", 8, -8.5, LV[2] + 0.8, -59.6, "Shotgun");
  addPickup("ammo_shotgun", 10, -8.5, LV[2] + 0.8, -58.9, "Shotgun shells");
  addPickup("ammo_pistol", 24, 8.5, LV[2] + 0.8, -45.35, "Pistol ammo");
  addPickup("armor", 50, -6.2, LV[1], -47, "Body armor");
  guardSpawns.push({ name: "deck1", pos: v3(0, LV[1], -60), patrol: [v3(0, LV[1], -63), v3(0, LV[1], -55)] });

  // Brücke (Ebene 3)
  {
    const y0 = LV[3],
      y1 = y0 + 3.0;
    wall("x", SZ1, -9, 9, y0, y1, 0.3, "wall", [-7.25, -4.35, -1.45, 1.45, 4.35, 7.25].map((c) => ({ c, w: 2.4, kind: "window" as const, sill: 0.9, top: 2.6 })));
    for (const s of [-1, 1]) wall("z", s * SX, -52.2, -44, y0, y1, 0.3, "wall", [-50.2, -46.8].map((c) => ({ c, w: 2.4, kind: "window" as const, sill: 0.9, top: 2.6 })));
    wall("x", -52.2, -9, 9, y0, y1, 0.2, "wall", [
      { c: 5.5, w: 1.2, kind: "door", hinge: -1, name: "Bridge Door" },
      { c: -5.5, w: 2.4, kind: "window" },
    ]);
    padH("carpet", -8.7, 8.7, -52, -44.3, y0, [holeA]);
    // Konsole vor den Fenstern
    sbox("steelDark", 0, y0 + 0.55, -45.3, 13.5, 1.1, 0.9);
    B.box("black", 0, y0 + 1.15, -45.5, 13.3, 0.08, 0.7);
    for (let i = -5; i <= 5; i += 2) {
      B.box("screen", i * 1.2, y0 + 1.42, -45.55, 1.2, 0.5, 0.06, 0, 2);
      B.box("black", i * 1.2, y0 + 1.42, -45.5, 1.3, 0.58, 0.04);
    }
    // Steuerrad
    const wheelG = new THREE.TorusGeometry(0.4, 0.04, 8, 20);
    geoms.push(wheelG);
    const wh = new THREE.Mesh(wheelG, mats.wood);
    wh.position.set(0, y0 + 1.5, -46.2);
    group.add(wh);
    animated.push((t) => (wh.rotation.z = Math.sin(t * 0.4) * 0.6));
    // Kartentisch
    sbox("wood", -5.5, y0 + 0.5, -49.6, 2.4, 1.0, 1.4);
    B.box("sheet", -5.5, y0 + 1.02, -49.6, 2.2, 0.03, 1.2);
    sbox("steelDark", 6.2, y0 + 0.55, -49, 2.2, 1.1, 1.0);
    B.box("screenAmber", 6.2, y0 + 1.3, -49.1, 1.8, 0.4, 0.05);
    // Kapitänsstuhl
    B.box("black", 0, y0 + 0.4, -48, 0.7, 0.8, 0.7);
    B.box("black", 0, y0 + 1.0, -48.3, 0.7, 0.8, 0.12);
    // Radar-Konsole mit rotierendem Strahl
    const sweep = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.01, 0.3), new THREE.MeshBasicMaterial({ color: 0xaaffaa }));
    geoms.push(sweep.geometry);
    const sweepG = new THREE.Group();
    sweepG.position.set(-2.9, y0 + 1.2, -49.5);
    sweep.position.z = -0.15;
    sweepG.add(sweep);
    const rdisc = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 0.05, 20), new THREE.MeshBasicMaterial({ color: 0x0a3a1a }));
    geoms.push(rdisc.geometry);
    rdisc.position.set(-2.9, y0 + 1.15, -49.5);
    group.add(rdisc);
    sbox("steelDark", -2.9, y0 + 0.55, -49.5, 1.0, 1.1, 1.0);
    sweep.position.set(0, 0, -0.2);
    group.add(sweepG);
    sweepG.position.y = y0 + 1.19;
    animated.push((_t, dt) => (sweepG.rotation.y += dt * 3));
    for (const x of [-6, 0, 6]) addLamp(x, y0 + 2.9, -47.5, -1);
    addLamp(-6, y0 + 2.9, -50.5, -1);
    addLamp(6, y0 + 2.9, -50.5, -1);
    addPickup("key_red", 1, -5.5, y0 + 1.05, -49.6, "Red Access Card");
    addPickup("weapon_rifle", 30, 6.2, y0 + 1.1, -48.7, "Assault Rifle");
    addPickup("ammo_rifle", 30, 6.6, y0 + 1.1, -49.4, "Rifle ammo");
    guardSpawns.push({ name: "bridge", pos: v3(2, y0, -47), patrol: [v3(-3, y0, -47.5), v3(4, y0, -48.5)] });
  }

  // Dach: Geländer, Schornstein, Mast
  {
    const y0 = LV[3];
    rail(-9, -8.7, -66, -52.3, y0);
    rail(8.7, 9, -66, -52.3, y0);
    rail(-9, 9, -66, -65.7, y0);
    // Schornstein
    const fy = y0;
    B.cyl("black", 0, fy + 1.0, -59.5, 3.0, 2, "y", 24);
    B.cyl("red", 0, fy + 3.4, -59.5, 2.6, 2.8, "y", 24, 2.7);
    B.cyl("white", 0, fy + 5.2, -59.5, 2.5, 0.8, "y", 24, 2.5);
    B.cyl("black", 0, fy + 6.4, -59.5, 2.5, 1.6, "y", 24);
    colOnly(0, fy + 3, -59.5, 6, 6, 6);
    // Lüfter
    for (const [x, z] of [
      [-6.5, -63],
      [6.5, -63],
      [-6.5, -56],
    ] as [number, number][]) {
      B.cyl("steelDark", x, fy + 0.6, z, 0.4, 1.2, "y", 10);
      B.cyl("red", x, fy + 1.4, z, 0.65, 0.4, "y", 10, 0.3);
      colOnly(x, fy + 0.8, z, 1.0, 1.6, 1.0);
    }
    // Mast & Radar auf dem Brückendach
    const ry = LV[3] + 3.2 + 0.2;
    B.cyl("steelDark", 0, ry + 2, -48, 0.12, 4, "y", 8);
    B.box("white", 0, ry + 2.2, -48, 1.4, 0.06, 0.06);
    const radar = new THREE.Group();
    radar.position.set(0, ry + 4.2, -48);
    const bar = new THREE.Mesh(new THREE.BoxGeometry(3, 0.2, 0.3), mats.steel);
    geoms.push(bar.geometry);
    bar.castShadow = true;
    radar.add(bar);
    group.add(radar);
    animated.push((_t, dt) => (radar.rotation.y += dt * 2.2));
    // Positionslichter
    const mk = (c: number, x: number, y: number, z: number) => {
      const m = new THREE.Mesh(new THREE.SphereGeometry(0.16, 8, 6), new THREE.MeshBasicMaterial({ color: c }));
      geoms.push(m.geometry);
      m.position.set(x, y, z);
      group.add(m);
      navLights.push(m);
      return m;
    };
    mk(0xff2020, -9.2, LV[3] + 2.3, -46);
    mk(0x20ff40, 9.2, LV[3] + 2.3, -46);
    mk(0xffffff, 0, ry + 4.1 + 0.9, -48);
    mk(0xffffff, 0, DECK_Y + 6, 66);
    // Warnleuchten (Alarm)
    for (const [x, z] of [
      [-8.2, -45],
      [8.2, -45],
      [0, -62],
    ] as [number, number][]) {
      const m = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, 0.2, 10), warnLightMat);
      geoms.push(m.geometry);
      m.position.set(x, LV[0] + 3.0, z);
      m.visible = false;
      group.add(m);
      alarmLights.push(m);
    }
    for (const [x, y, z] of [
      [-9.4, LV[3], -45],
      [9.4, LV[3], -45],
    ] as [number, number, number][]) {
      const m = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, 0.2, 10), warnLightMat);
      geoms.push(m.geometry);
      m.position.set(x, y + 3.4, z);
      m.visible = false;
      group.add(m);
      alarmLights.push(m);
    }
  }

  // ---------------------------------------------------- Deck Details
  {
    // Krane
    for (const z of [-7.75, 25.9]) {
      sbox("steelDark", 0, DECK_Y + 2.5, z, 1.8, 5, 1.8);
      B.cyl("yellow", 0, DECK_Y + 2.5, z, 0.8, 5, "y", 14);
      const crane = new THREE.Group();
      crane.position.set(0, DECK_Y + 5.4, z);
      const cab = new THREE.Mesh(new THREE.BoxGeometry(1.8, 1.6, 2.2), mats.yellow);
      geoms.push(cab.geometry);
      cab.castShadow = true;
      crane.add(cab);
      const boom = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 17), mats.yellow);
      geoms.push(boom.geometry);
      boom.castShadow = true;
      boom.position.set(0, 4.6, 7.4);
      boom.rotation.x = -0.55;
      crane.add(boom);
      const cable = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 8, 5), mats.black);
      geoms.push(cable.geometry);
      cable.position.set(0, 4.6, 14.4);
      crane.add(cable);
      const hook = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.5, 0.4), mats.red);
      geoms.push(hook.geometry);
      hook.position.set(0, 0.2, 14.4);
      crane.add(hook);
      group.add(crane);
      const off = z * 0.3;
      animated.push((t) => {
        crane.rotation.y = Math.sin(t * 0.12 + off) * 0.55;
      });
    }
    // Bug: Ankerwinde, Mast
    sbox("steelDark", 0, DECK_Y + 0.6, 61, 3.0, 1.2, 2.2);
    B.cyl("black", 0, DECK_Y + 1.0, 61, 0.7, 2.6, "x", 14);
    B.cyl("steel", 0, DECK_Y + 4, 64.5, 0.15, 8, "y", 8);
    B.box("steel", 0, DECK_Y + 6.4, 64.5, 2.2, 0.08, 0.08);
    colOnly(0, DECK_Y + 1, 64.5, 0.5, 2, 0.5);
    // Flagge am Heck
    B.cyl("steel", 0, DECK_Y + 3, Z_STERN + 1.2, 0.05, 6, "y", 6);
    const flag = new THREE.Mesh(new THREE.PlaneGeometry(1.8, 1.1, 8, 2), new THREE.MeshBasicMaterial({ map: textTexture("", 64, 40, "#c0392b", "#fff"), side: THREE.DoubleSide }));
    geoms.push(flag.geometry);
    flag.position.set(0, DECK_Y + 5.2, Z_STERN + 1.2);
    flag.rotation.y = Math.PI / 2;
    flag.translateX(0.9);
    group.add(flag);
    const fp = flag.geometry.attributes.position as THREE.BufferAttribute;
    const fp0 = Float32Array.from(fp.array as Float32Array);
    animated.push((t) => {
      for (let i = 0; i < fp.count; i++) {
        const x = fp0[i * 3];
        fp.setZ(i, Math.sin(t * 5 + x * 3) * 0.12 * (x + 0.9));
      }
      fp.needsUpdate = true;
    });
    // Poller, Rettungsringe, Lüfter
    for (let z = -64; z < 50; z += 14)
      for (const s of [-1, 1]) {
        B.cyl("black", s * 10.4, DECK_Y + 0.25, z, 0.16, 0.5, "y", 8);
        B.cyl("black", s * 10.4, DECK_Y + 0.55, z, 0.24, 0.14, "y", 8);
      }
    for (const [x, z] of [
      [10.8, -20],
      [-10.8, 6],
      [10.8, 40],
    ] as [number, number][]) {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.34, 0.1, 8, 16), mats.orange);
      geoms.push(ring.geometry);
      ring.position.set(x, DECK_Y + 0.75, z);
      ring.rotation.y = Math.PI / 2;
      group.add(ring);
    }
    // Deck-Lampen auf Masten
    for (let z = -40; z <= 50; z += 18)
      for (const s of [-1, 1]) {
        B.cyl("steel", s * 10.5, DECK_Y + 2.2, z, 0.05, 4.4, "y", 6);
        B.box("lamp", s * 10.3, DECK_Y + 4.35, z, 0.5, 0.08, 0.3);
        lamps.push({ pos: v3(s * 10.2, DECK_Y + 4.1, z), zone: -1 });
      }
    // Luken-Markierungen
    for (const [za, zb] of deckZones) {
      B.box("yellow", 0, DECK_Y + 0.016, za - 0.4, 15.2, 0.014, 0.1);
      B.box("yellow", 0, DECK_Y + 0.016, zb + 0.4, 15.2, 0.014, 0.1);
    }
    // Fässer & Kisten an Deck
    for (const [x, z] of [
      [9.5, -30],
      [9.6, -28.9],
      [-9.6, -2],
      [-9.5, 14],
      [9.4, 48],
      [-9.5, 50],
      [9.5, 27],
      [-9.6, -41],
      [9.6, -42],
    ] as [number, number][])
      addBarrel(x, DECK_Y, z);
    for (const [x, z, loot] of [
      [9.4, -20, "ammo_pistol"],
      [-9.4, 30, "ammo_shotgun"],
      [9.4, 9, "ammo_rifle"],
      [-9.2, -22, "medkit"],
      [9.1, 36, "tnt"],
    ] as [number, number, PickupType][]) {
      addCrate(x, DECK_Y, z, loot);
    }
    addPickup("tnt", 2, 9.3, DECK_Y, -38, "TNT crate");
    guardSpawns.push({ name: "stb", pos: v3(9.2, DECK_Y, 4), patrol: [v3(9.2, DECK_Y, 4), v3(9.2, DECK_Y, 30), v3(9.2, DECK_Y, 48)] });
    guardSpawns.push({ name: "port", pos: v3(-9.2, DECK_Y, 40), patrol: [v3(-9.2, DECK_Y, 40), v3(-9.2, DECK_Y, 0), v3(-9.2, DECK_Y, -36)] });
    guardSpawns.push({ name: "bow", pos: v3(0, DECK_Y, 56), patrol: [v3(-2.5, DECK_Y, 58), v3(2.5, DECK_Y, 56)] });
    // Aufstellfläche achtern
    B.box("yellow", 0, DECK_Y + 0.016, -67, 8, 0.014, 0.2);
  }

  // ---------------------------------------------------- Rettungsboote
  for (const s of [-1, 1]) {
    const px0 = s > 0 ? HULL_HW : HULL_HW + 1.9,
      px1 = s > 0 ? HULL_HW + 1.9 : HULL_HW;
    const x0 = Math.min(px0, px1) * (s > 0 ? 1 : 1);
    void x0;
    const xa = s > 0 ? 10.9 : -12.9,
      xb = s > 0 ? 12.9 : -10.9;
    // Plattform
    sbox("deck", (xa + xb) / 2, DECK_Y - 0.15, (GATE_Z0 + GATE_Z1) / 2, xb - xa, 0.3, GATE_Z1 - GATE_Z0);
    const ox = s * 12.8;
    rail(ox - 0.1, ox + 0.1, GATE_Z0, GATE_Z1, DECK_Y, true, "red");
    rail(Math.min(xa, xb), Math.max(xa, xb), GATE_Z0 - 0.1, GATE_Z0 + 0.1, DECK_Y, true, "red");
    rail(Math.min(xa, xb), Math.max(xa, xb), GATE_Z1 - 0.1, GATE_Z1 + 0.1, DECK_Y, true, "red");
    // Davits
    for (const z of [-37.2, -31.8]) {
      B.box("steelDark", s * 11.1, DECK_Y + 2.6, z, 0.3, 5.2, 0.3);
      B.box("steelDark", s * 13.1, DECK_Y + 5.1, z, 4.3, 0.3, 0.3);
      B.box("black", s * 14.6, DECK_Y + 3.6, z, 0.04, 2.8, 0.04);
    }
    // Boot
    const bg = new THREE.Group();
    const hullG = new THREE.SphereGeometry(1, 20, 12, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2);
    geoms.push(hullG);
    const hm = new THREE.Mesh(hullG, mats.orange);
    hm.scale.set(1.3, 1.1, 4.2);
    hm.castShadow = true;
    bg.add(hm);
    const rim = new THREE.Mesh(new THREE.BoxGeometry(2.7, 0.08, 8.5), mats.white);
    geoms.push(rim.geometry);
    bg.add(rim);
    const canopy = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.3, 5, 12, 1, false, 0, Math.PI), mats.orange);
    geoms.push(canopy.geometry);
    canopy.rotation.z = Math.PI / 2;
    canopy.rotation.y = Math.PI / 2;
    canopy.rotation.x = 0;
    canopy.position.set(0, 0.05, -0.4);
    canopy.scale.set(1, 1, 0.9);
    bg.add(canopy);
    const wnd = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.4, 0.05), mats.screen);
    geoms.push(wnd.geometry);
    wnd.position.set(0, 0.7, 2.2);
    bg.add(wnd);
    bg.position.set(s * 14.6, DECK_Y + 0.9, -34.5);
    group.add(bg);
    lifeboats.push({ group: bg, zone: v3(s * 11.9, DECK_Y, -34.5), side: s, launched: false, lowerParts: [] });
    addLamp(s * 12, DECK_Y + 3.0, -34.5, -1, false);
  }

  // ---------------------------------------------------- Ende: Merges
  B.build(group, geoms);

  // Instanced Container
  const mkInst = (list: typeof inst20, len: number) => {
    if (!list.length) return;
    const g = boxGeo(2.44, CH, len, 2.5);
    geoms.push(g);
    const m = new THREE.InstancedMesh(g, std({ map: tex.container, roughness: 0.55, metalness: 0.5 }), list.length);
    const mt = new THREE.Matrix4();
    const c = new THREE.Color();
    list.forEach((it, i) => {
      mt.makeTranslation(it.x, it.y, it.z);
      m.setMatrixAt(i, mt);
      c.setHex(it.c);
      m.setColorAt(i, c);
    });
    m.instanceMatrix.needsUpdate = true;
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
    m.castShadow = true;
    m.receiveShadow = true;
    group.add(m);
  };
  mkInst(inst20, 6.06);
  mkInst(inst40, 12.19);

  // Hüllen-Bounding für Out-of-bounds Prüfung
  const spawn = v3(0, DECK_Y, -69);

  // ------------------------------------------------------------------ Funktionen (hoisted)
  function makeMarker(id: string, name: string, x: number, y: number, z: number): Marker {
    const g = new THREE.Group();
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(1.1, 1.4, 32),
      new THREE.MeshBasicMaterial({ color: 0xff8a1a, transparent: true, opacity: 0.85, side: THREE.DoubleSide, depthWrite: false }),
    );
    ring.rotation.x = -Math.PI / 2;
    const cross = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 0.14), new THREE.MeshBasicMaterial({ color: 0xff8a1a, transparent: true, opacity: 0.85, depthWrite: false }));
    cross.rotation.x = -Math.PI / 2;
    cross.rotation.z = Math.PI / 4;
    const cross2 = cross.clone();
    cross2.rotation.z = -Math.PI / 4;
    const beam = new THREE.Mesh(
      new THREE.CylinderGeometry(1.2, 1.2, 3.2, 20, 1, true),
      new THREE.MeshBasicMaterial({ color: 0xff8a1a, transparent: true, opacity: 0.12, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending }),
    );
    beam.position.y = 1.6;
    g.add(ring, cross, cross2, beam);
    g.position.set(x, y + 0.04, z);
    group.add(g);
    geoms.push(ring.geometry, cross.geometry, beam.geometry);
    animated.push((t) => {
      const s = 1 + Math.sin(t * 3) * 0.06;
      ring.scale.set(s, s, s);
      (beam.material as THREE.MeshBasicMaterial).opacity = 0.1 + Math.sin(t * 3) * 0.04;
    });
    return { id, name, pos: v3(x, y, z), radius: 3.4, mesh: g, armed: false };
  }

  function addBarrel(x: number, y: number, z: number) {
    const g = new THREE.CylinderGeometry(0.32, 0.32, 0.95, 14);
    geoms.push(g);
    const m = new THREE.Mesh(g, mats.red);
    m.position.set(x, y + 0.475, z);
    m.castShadow = true;
    m.receiveShadow = true;
    group.add(m);
    for (const dy of [-0.3, 0.3]) {
      const ring = new THREE.Mesh(new THREE.CylinderGeometry(0.335, 0.335, 0.05, 14), mats.black);
      geoms.push(ring.geometry);
      ring.position.y = dy;
      m.add(ring);
    }
    const label = new THREE.Mesh(new THREE.CylinderGeometry(0.325, 0.325, 0.22, 14, 1, true, 0, Math.PI), mats.yellow);
    geoms.push(label.geometry);
    m.add(label);
    const col = world.addCentered(x, y + 0.475, z, 0.64, 0.95, 0.64, "barrel");
    const b: Barrel = { mesh: m, collider: col, hp: 30, dead: false, pos: v3(x, y + 0.5, z), explosive: true, fuse: 0 };
    col.owner = b;
    barrels.push(b);
  }

  function addCrate(x: number, y: number, z: number, loot?: PickupType) {
    const g = new THREE.BoxGeometry(0.9, 0.9, 0.9);
    geoms.push(g);
    const m = new THREE.Mesh(g, mats.wood);
    m.position.set(x, y + 0.45, z);
    m.rotation.y = rnd() * 0.8;
    m.castShadow = true;
    m.receiveShadow = true;
    group.add(m);
    const col = world.addCentered(x, y + 0.45, z, 1.0, 0.9, 1.0, "crate");
    const c: Crate = { mesh: m, collider: col, hp: 25, dead: false, pos: v3(x, y + 0.45, z), loot };
    col.owner = c;
    crates.push(c);
  }

  function addPickup(type: PickupType, amount: number, x: number, y: number, z: number, label: string) {
    const g = new THREE.Group();
    const keyCol = type === "key_red" ? 0xff3030 : 0x3a80ff;
    const add = (geo: THREE.BufferGeometry, mat: THREE.Material, px = 0, py = 0, pz = 0) => {
      geoms.push(geo);
      const m = new THREE.Mesh(geo, mat);
      m.position.set(px, py, pz);
      m.castShadow = true;
      g.add(m);
      return m;
    };
    let lift = 0.3;
    if (type === "key_red" || type === "key_blue") {
      add(new THREE.BoxGeometry(0.34, 0.03, 0.22), new THREE.MeshStandardMaterial({ color: keyCol, emissive: keyCol, emissiveIntensity: 0.6 }));
      add(new THREE.BoxGeometry(0.08, 0.035, 0.18), mats.chrome, -0.1, 0, 0);
      add(new THREE.BoxGeometry(0.3, 0.036, 0.04), mats.white, 0, 0, 0.06);
      lift = 0.35;
    } else if (type === "medkit") {
      add(new THREE.BoxGeometry(0.5, 0.3, 0.32), mats.white);
      add(new THREE.BoxGeometry(0.28, 0.32, 0.08), mats.red, 0, 0, 0.0);
      add(new THREE.BoxGeometry(0.08, 0.32, 0.28), mats.red, 0, 0, 0.0);
    } else if (type === "tnt") {
      for (let i = 0; i < 3; i++) add(new THREE.CylinderGeometry(0.07, 0.07, 0.42, 8), mats.red, (i - 1) * 0.15, 0, 0);
      add(new THREE.BoxGeometry(0.5, 0.06, 0.1), mats.black, 0, 0, 0);
      add(new THREE.CylinderGeometry(0.01, 0.01, 0.2, 4), mats.black, 0, 0.3, 0);
    } else if (type === "armor") {
      add(new THREE.BoxGeometry(0.5, 0.55, 0.16), new THREE.MeshStandardMaterial({ color: 0x2c3a4a, roughness: 0.8 }));
      add(new THREE.BoxGeometry(0.4, 0.12, 0.18), mats.black, 0, 0.1, 0);
    } else if (type.startsWith("weapon")) {
      add(new THREE.BoxGeometry(0.1, 0.12, 0.9), mats.black);
      add(new THREE.BoxGeometry(0.08, 0.1, 0.35), mats.wood, 0, -0.02, -0.5);
      add(new THREE.CylinderGeometry(0.03, 0.03, 0.5, 8), mats.steelDark, 0, 0.03, 0.55).rotation.x = Math.PI / 2;
    } else {
      const col = type === "ammo_pistol" ? 0xc9a227 : type === "ammo_shotgun" ? 0xb02a22 : 0x4a6a3a;
      add(new THREE.BoxGeometry(0.4, 0.22, 0.26), new THREE.MeshStandardMaterial({ color: col, roughness: 0.7 }));
      add(new THREE.BoxGeometry(0.42, 0.05, 0.28), mats.black, 0, 0.09, 0);
    }
    // Leuchtsäule
    const beamCol = type.startsWith("key") ? keyCol : type === "medkit" ? 0x44ff88 : type === "tnt" ? 0xff7722 : 0xffee88;
    const beam = new THREE.Mesh(
      new THREE.CylinderGeometry(0.16, 0.16, 1.4, 10, 1, true),
      new THREE.MeshBasicMaterial({ color: beamCol, transparent: true, opacity: 0.16, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }),
    );
    geoms.push(beam.geometry);
    beam.position.y = 0.7 - lift;
    g.add(beam);
    g.position.set(x, y + lift + 0.05, z);
    group.add(g);
    const p: Pickup = { type, mesh: g, pos: v3(x, y + 0.5, z), taken: false, amount: opts.sandbox && !type.startsWith("key") ? amount * 2 : amount, label, phase: rnd() * 6 };
    pickups.push(p);
    const base = g.position.y;
    animated.push((t) => {
      if (p.taken) return;
      g.rotation.y = t * 1.4 + p.phase;
      g.position.y = base + Math.sin(t * 2 + p.phase) * 0.05;
      beam.rotation.y = -g.rotation.y;
    });
  }

  function furnish(kind: string, side: number, z0: number, z1: number, y: number) {
    const s = side;
    const cz = (z0 + z1) / 2;
    const oX = s * 8.5; // an der Außenwand
    const iX = s * 2.0; // nahe Flur
    const bed = (x: number, z: number, dirZ = 1) => {
      sbox("wood", x, y + 0.3, z, 0.95, 0.6, 2.0 * dirZ > 0 ? 2.0 : 2.0);
      B.box("fabric", x, y + 0.66, z + 0.1, 0.9, 0.14, 1.7);
      B.box("sheet", x, y + 0.72, z - 0.8, 0.5, 0.1, 0.35);
    };
    const desk = (x: number, z: number) => {
      sbox("wood", x, y + 0.4, z, 0.7, 0.8, 1.4);
      B.box("black", x - s * 0.1, y + 0.9, z, 0.04, 0.3, 0.4);
      const chairX = x - s * 0.9;
      B.box("black", chairX, y + 0.45, z, 0.45, 0.06, 0.45);
      B.box("black", chairX - s * 0.2, y + 0.75, z, 0.06, 0.6, 0.45);
      B.cyl("steelDark", chairX, y + 0.22, z, 0.04, 0.44, "y", 6);
    };
    const locker = (x: number, z: number) => {
      sbox("steelDark", x, y + 0.95, z, 0.55, 1.9, 0.8);
      B.box("black", x - s * 0.28, y + 1.3, z, 0.02, 0.1, 0.5);
    };
    if (kind === "cabin") {
      bed(oX - 0.0, z0 + 1.4);
      desk(oX + 0.0, z1 - 1.2);
      locker(iX + 0.1, z0 + 0.6);
      B.box("blue", s * 5.2, y + 0.016, cz, 2, 0.02, 3, 0, 2);
      B.box("white", s * 8.5, y + 1.5, z0 + 0.5, 0.04, 0.5, 0.7);
      B.box("red", s * 8.69, y + 1.7, cz, 0.03, 0.6, 0.9);
    } else if (kind === "medbay") {
      bed(oX, z0 + 1.4);
      bed(oX, z0 + 3.4);
      locker(iX + 0.1, z1 - 0.6);
      sbox("white", s * 5.5, y + 0.45, cz, 1.0, 0.9, 2.0);
      B.box("red", s * 5.5, y + 0.92, cz, 0.6, 0.02, 0.15);
      B.box("red", s * 5.5, y + 0.92, cz, 0.15, 0.02, 0.6);
    } else if (kind === "office") {
      desk(oX, cz);
      sbox("steelDark", s * 7.8, y + 1.0, z1 - 0.5, 1.8, 2.0, 0.5);
      sbox("wood", s * 5, y + 0.4, cz, 1.2, 0.8, 1.2);
      B.box("sheet", s * 5, y + 0.82, cz, 1.0, 0.02, 1.0);
    } else if (kind === "storage") {
      for (let i = 0; i < 3; i++) sbox("steelDark", s * 8.3, y + 1.0, z0 + 1.2 + i * 2.0, 0.6, 2.0, 1.6);
      addCrate(s * 5.5, y, cz - 1);
      addCrate(s * 5.5, y, cz + 1);
      addCrate(s * 6.6, y, cz);
    } else if (kind === "mess") {
      for (const dz of [-1.6, 1.6]) {
        sbox("wood", s * 5, y + 0.4, cz + dz, 3.2, 0.8, 0.9);
        for (const dx of [-1, 1]) B.box("black", s * 5 + dx * 0.0, y + 0.22, cz + dz + dx * 0.75, 3.0, 0.44, 0.3);
      }
      sbox("steel", oX, y + 0.5, z0 + 1.2, 0.8, 1.0, 1.6);
      B.box("black", oX, y + 1.02, z0 + 1.2, 0.7, 0.04, 1.5);
    } else if (kind === "galley") {
      sbox("steel", oX, y + 0.5, z0 + 3.4, 0.8, 1.0, 5.4);
      B.cyl("chrome", oX, y + 1.2, z0 + 2, 0.22, 0.4, "y", 12);
      B.cyl("chrome", oX, y + 1.2, z0 + 3, 0.18, 0.3, "y", 12);
      sbox("steelDark", s * 5.6, y + 0.45, cz, 1.4, 0.9, 1.6);
      B.box("black", s * 5.6, y + 0.92, cz, 1.3, 0.02, 1.5);
      sbox("steel", s * 4, y + 0.9, z1 - 0.5, 1.0, 1.8, 0.6);
    } else if (kind === "lounge") {
      sbox("fabric", oX, y + 0.35, z0 + 1.5, 0.9, 0.7, 1.8);
      sbox("fabric", s * 5.6, y + 0.35, z0 + 0.7, 2.4, 0.7, 0.9);
      sbox("wood", s * 5.4, y + 0.25, cz + 0.4, 1.0, 0.5, 1.0);
      B.box("black", oX + s * 0.1, y + 1.5, cz + 1.6, 0.06, 0.8, 1.3);
      B.box("screen", oX, y + 1.5, cz + 1.6, 0.02, 0.7, 1.2);
      B.cyl("green", s * 3.0, y + 0.45, z1 - 0.6, 0.3, 0.9, "y", 8);
    } else if (kind === "workshop") {
      sbox("steelDark", oX, y + 0.5, z0 + 3.5, 0.9, 1.0, 5.2);
      B.box("wood", oX, y + 1.02, z0 + 3.5, 0.9, 0.05, 5.2);
      sbox("red", iX + 0.4, y + 0.9, z1 - 0.6, 0.6, 1.8, 0.9);
      B.cyl("steelDark", s * 5.5, y + 0.6, cz, 0.4, 1.2, "y", 10);
      addBarrel(s * 6.8, y, z0 + 0.8);
    }
  }

  const dispose = () => {
    geoms.forEach((g) => g.dispose());
    Object.values(mats).forEach((m) => m.dispose());
    glassMat.dispose();
    heavyDoorMat.dispose();
    compartments.forEach((c) => {
      (c.waterMesh.material as THREE.Material).dispose();
      c.waterMesh.geometry.dispose();
    });
  };

  return {
    group,
    waterGroup,
    world,
    doors,
    glass,
    pickups,
    barrels,
    crates,
    lamps,
    lampMat,
    zones,
    compartments,
    markers,
    lifeboats,
    guardSpawns,
    animated,
    funnelTop: v3(0, LV[3] + 8.2, -59.5),
    spawn,
    holeGroup: new THREE.Group(),
    navLights,
    alarmLights,
    warnLightMat,
    dispose,
  };
}
