/* Where furniture can go: keeping it inside a room and out of its fixed fittings,
   snapping it to walls, spotting overlaps, and where you can walk at eye level.
   Ported from the original planner, now driven by the flat's data. */
import { notchRect } from './flat-model.js';
import { clamp, rad } from './util.js';

export function halfExt(it) {
  const t = rad(it.rot), c = Math.abs(Math.cos(t)), s = Math.abs(Math.sin(t));
  return { hx: (c * it.w) / 2 + (s * it.d) / 2, hz: (s * it.w) / 2 + (c * it.d) / 2 };
}
export function localRectPoly(it, x0, z0, x1, z1) {
  const t = -rad(it.rot), c = Math.cos(t), s = Math.sin(t);
  return [[x0, z0], [x1, z0], [x1, z1], [x0, z1]].map(([lx, lz]) => ({ x: it.x + lx * c + lz * s, z: it.z - lx * s + lz * c }));
}
export const footprint = (it) => localRectPoly(it, -it.w / 2, -it.d / 2, it.w / 2, it.d / 2);
export const cornerSeatDepth = (it) => clamp(Math.min(it.w, it.d) * 0.5, 0.75, 1.0);
/** Convex pieces, so the L of a corner sofa doesn't claim its empty corner. */
export function footprintParts(it) {
  if (it.shape !== 'cornerSofa') return [footprint(it)];
  const sd = cornerSeatDepth(it), w = it.w / 2, d = it.d / 2;
  const long = localRectPoly(it, -w, -d, w, -d + sd);
  const short = it.mirror ? localRectPoly(it, w - sd, -d + sd, w, d) : localRectPoly(it, -w, -d + sd, -w + sd, d);
  return [long, short];
}
export function aabb(pts) {
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (const p of pts) { minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x); minZ = Math.min(minZ, p.z); maxZ = Math.max(maxZ, p.z); }
  return { minX, maxX, minZ, maxZ };
}
export const inRect = (x, z, r, m = 0) => x > r[0] - m && x < r[2] + m && z > r[1] - m && z < r[3] + m;
export function polysOverlap(A, Bp, eps = 0.004) {
  for (const P of [A, Bp]) for (let i = 0; i < P.length; i++) {
    const p = P[i], q = P[(i + 1) % P.length];
    const nx = q.z - p.z, nz = -(q.x - p.x), len = Math.hypot(nx, nz);
    if (len < 1e-9) continue;
    let a0 = Infinity, a1 = -Infinity, b0 = Infinity, b1 = -Infinity;
    for (const v of A) { const s = (v.x * nx + v.z * nz) / len; a0 = Math.min(a0, s); a1 = Math.max(a1, s); }
    for (const v of Bp) { const s = (v.x * nx + v.z * nz) / len; b0 = Math.min(b0, s); b1 = Math.max(b1, s); }
    if (a1 <= b0 + eps || b1 <= a0 + eps) return false;
  }
  return true;
}
export const partsOverlap = (A, Bs) => A.some((a) => Bs.some((b) => polysOverlap(a, b)));
export const vOverlap = (a0, a1, b0, b1) => Math.min(a1, b1) - Math.max(a0, b0) > 0.01;
export const rectPoly = (x0, z0, x1, z1) => [{ x: x0, z: z0 }, { x: x1, z: z0 }, { x: x1, z: z1 }, { x: x0, z: z1 }];

/** Door swings (for the floor arcs and overlap checks) and the passage through each doorway. */
export function doorInfos(flat, walls) {
  const out = [], names = Object.fromEntries(flat.rooms.map((r) => [r.id, r.name]));
  let outside = 0;
  for (const o of walls.openings) {
    if (!o.ok || o.kind === 'window') continue;
    const t = o.t;
    const P = (u, off) => ({ x: o.A.x + o.d.x * u + o.n.x * off, z: o.A.z + o.d.z * u + o.n.z * off });
    const ends = [P(o.u0 + 0.12, 0.32), P(o.u1 - 0.12, 0.32), P(o.u0 + 0.12, -t - 0.32), P(o.u1 - 0.12, -t - 0.32)];
    const pass = [Math.min(...ends.map((p) => p.x)), Math.min(...ends.map((p) => p.z)), Math.max(...ends.map((p) => p.x)), Math.max(...ends.map((p) => p.z))];
    if (o.kind === 'opening') { out.push({ id: o.id, pass }); continue; }
    const side = o.op.swing === 'out' ? -1 : 1;
    const uh = o.op.hinge === 'start' ? o.u0 + 0.02 : o.u1 - 0.02, faceOff = side > 0 ? 0 : -t;
    const hp = P(uh, faceOff);
    const cd = o.op.hinge === 'start' ? { x: o.d.x, z: o.d.z } : { x: -o.d.x, z: -o.d.z };
    const od = { x: o.n.x * side, z: o.n.z * side };
    const r = o.u1 - o.u0 - 0.046, poly = [{ x: hp.x, z: hp.z }];
    for (let i = 0; i <= 10; i++) {
      const a = (i / 10) * (Math.PI / 2);
      poly.push({ x: hp.x + r * (Math.cos(a) * cd.x + Math.sin(a) * od.x), z: hp.z + r * (Math.cos(a) * cd.z + Math.sin(a) * od.z) });
    }
    const into = side > 0 ? o.room : o.farRoom;
    let label;
    if (!o.farRoom) label = outside++ ? 'the outside door' : 'the front door';
    else label = `the ${(names[into] || 'room').toLowerCase()} door`;
    out.push({ id: o.id, label, poly, pass, into });
  }
  return out;
}

/**
 * Everything placement needs to know about one flat. Rebuild it whenever rooms,
 * doors, windows or fittings change.
 */
export function createWorld(flat, walls) {
  const H = flat.ceiling;
  const ORDER = flat.rooms.map((r) => r.id);
  const ROOMS = {};
  for (const r of flat.rooms) {
    const cuts = [], nr = notchRect(r);
    if (nr) cuts.push({ r: nr, shape: true });
    ROOMS[r.id] = { id: r.id, name: r.name, bounds: [r.x, r.z, r.x + r.w, r.z + r.d], cuts };
  }
  const DOORS = doorInfos(flat, walls);

  function roomAt(x, z) {
    for (const id of ORDER) {
      const R = ROOMS[id], [x0, z0, x1, z1] = R.bounds;
      if (x >= x0 && x <= x1 && z >= z0 && z <= z1 && !R.cuts.some((c) => c.shape && inRect(x, z, c.r))) return R;
    }
    return null;
  }
  function nearestRoom(x, z) {
    let best = null, bd = Infinity;
    for (const id of ORDER) {
      const [x0, z0, x1, z1] = ROOMS[id].bounds;
      const d = Math.hypot(x - clamp(x, x0, x1), z - clamp(z, z0, z1));
      if (d < bd) { bd = d; best = ROOMS[id]; }
    }
    return best;
  }
  const roomFor = (it) => roomAt(it.x, it.z) || ROOMS[it.room] || nearestRoom(it.x, it.z);

  // fixed fittings are cut-outs of their room that furniture keeps clear of
  for (const fx of flat.fixtures) {
    const R = ROOMS[fx.room] || roomAt(fx.x, fx.z) || nearestRoom(fx.x, fx.z);
    if (!R) continue;
    const b = aabb(footprint(fx)), top = fx.elev + fx.h;
    R.cuts.push({
      r: [b.minX, b.minZ, b.maxX, b.maxZ], low: top < H - 0.05 ? top : undefined, y0: fx.elev > 0.02 ? fx.elev : undefined,
      name: 'the ' + fx.name.toLowerCase(), fixture: fx.id,
    });
  }

  const cutsFor = (R, it, noFixtures) => R.cuts.filter((c) => (c.shape || !noFixtures) && c.fixture !== it.id
    && (c.low === undefined || it.elev < c.low - 0.005) && (c.y0 === undefined || it.elev + it.h > c.y0 + 0.005));

  /** Keep an item inside its room, out of cut-outs, and (optionally) snapped to the walls. */
  function resolve(it, snap, forced, noFixtures) {
    const R = forced || roomFor(it);
    if (!R) return;
    it.room = R.id;
    const { hx, hz } = halfExt(it);
    const [bx0, bz0, bx1, bz1] = R.bounds, cuts = cutsFor(R, it, noFixtures);
    let x = it.x, z = it.z;
    const clampB = () => { x = clamp(x, bx0 + hx, Math.max(bx0 + hx, bx1 - hx)); z = clamp(z, bz0 + hz, Math.max(bz0 + hz, bz1 - hz)); };
    clampB();
    if (snap) {
      const sd = 0.07;
      const xs = [bx0, bx1, ...cuts.flatMap((c) => [c.r[0], c.r[2]])], zs = [bz0, bz1, ...cuts.flatMap((c) => [c.r[1], c.r[3]])];
      let best = sd, bx = null;
      for (const c of xs) {
        if (Math.abs(x - hx - c) < best) { best = Math.abs(x - hx - c); bx = c + hx; }
        if (Math.abs(x + hx - c) < best) { best = Math.abs(x + hx - c); bx = c - hx; }
      }
      if (bx !== null) x = bx;
      best = sd; let bz = null;
      for (const c of zs) {
        if (Math.abs(z - hz - c) < best) { best = Math.abs(z - hz - c); bz = c + hz; }
        if (Math.abs(z + hz - c) < best) { best = Math.abs(z + hz - c); bz = c - hz; }
      }
      if (bz !== null) z = bz;
      clampB();
    }
    for (let pass = 0; pass < 4; pass++) { // push out of corners that belong to other rooms, and fixed fittings
      let moved = false;
      for (const c of cuts) {
        const [cx0, cz0, cx1, cz1] = c.r;
        if (!(x + hx > cx0 + 1e-4 && x - hx < cx1 - 1e-4 && z + hz > cz0 + 1e-4 && z - hz < cz1 - 1e-4)) continue;
        // prefer a way out that doesn't land in another cut-out, like the corner of L-shaped units
        const blocked = (o) => cuts.some((q) => q !== c && o.x + hx > q.r[0] + 1e-4 && o.x - hx < q.r[2] - 1e-4 && o.z + hz > q.r[1] + 1e-4 && o.z - hz < q.r[3] - 1e-4);
        const opts = [{ x: cx0 - hx, z }, { x: cx1 + hx, z }, { x, z: cz0 - hz }, { x, z: cz1 + hz }]
          .filter((o) => o.x - hx >= bx0 - 1e-4 && o.x + hx <= bx1 + 1e-4 && o.z - hz >= bz0 - 1e-4 && o.z + hz <= bz1 + 1e-4)
          .map((o) => ({ ...o, bad: blocked(o) ? 1 : 0, dist: Math.hypot(o.x - x, o.z - z) }))
          .sort((a, b) => a.bad - b.bad || a.dist - b.dist);
        if (opts.length) { x = opts[0].x; z = opts[0].z; moved = true; }
      }
      if (!moved) break;
    }
    it.x = x; it.z = z;
  }

  /** The walls around an item in each direction, taking the room's cut-outs into account. */
  function wallLimits(it, noFixtures) {
    const R = ROOMS[it.room] || roomFor(it), b = aabb(footprint(it));
    if (!R) return { b, west: b.minX, east: b.maxX, north: b.minZ, south: b.maxZ };
    let west = R.bounds[0], east = R.bounds[2], north = R.bounds[1], south = R.bounds[3];
    for (const c of cutsFor(R, it, noFixtures)) {
      const [x0, z0, x1, z1] = c.r;
      const zOver = Math.min(b.maxZ, z1) - Math.max(b.minZ, z0) > 1e-3, xOver = Math.min(b.maxX, x1) - Math.max(b.minX, x0) > 1e-3;
      if (zOver) { if (x1 <= b.minX + 1e-3) west = Math.max(west, x1); if (x0 >= b.maxX - 1e-3) east = Math.min(east, x0); }
      if (xOver) { if (z1 <= b.minZ + 1e-3) north = Math.max(north, z1); if (z0 >= b.maxZ - 1e-3) south = Math.min(south, z0); }
    }
    return { b, west, east, north, south };
  }

  function backToWall(it, forced, noFixtures) {
    const R = forced || roomFor(it);
    if (!R) return;
    it.room = R.id;
    const L = wallLimits(it, noFixtures);
    const cands = [{ d: L.b.minX - L.west, rot: 270 }, { d: L.east - L.b.maxX, rot: 90 }, { d: L.b.minZ - L.north, rot: 0 }, { d: L.south - L.b.maxZ, rot: 180 }].sort((a, b) => a.d - b.d);
    it.rot = cands[0].rot;
    const L2 = wallLimits(it, noFixtures), { hx, hz } = halfExt(it);
    if (it.rot === 270) it.x = L2.west + hx; else if (it.rot === 90) it.x = L2.east - hx;
    else if (it.rot === 0) it.z = L2.north + hz; else it.z = L2.south - hz;
    resolve(it, false, R, noFixtures);
  }

  function obstacles() {
    const out = [];
    for (const dr of DOORS) if (dr.poly) out.push({ name: dr.label + ' swing', poly: dr.poly, y0: 0, y1: Math.min(2.05, H) });
    for (const id of ORDER) for (const c of ROOMS[id].cuts) if (c.name) out.push({ name: c.name, poly: rectPoly(...c.r), y0: c.y0 ?? 0, y1: c.low ?? H });
    return out;
  }

  function computeClashes(items) {
    const list = [], flagged = new Set(), byId = new Map();
    const add = (id, what) => { flagged.add(id); if (!byId.has(id)) byId.set(id, []); byId.get(id).push(what); };
    const solid = items.filter((i) => i.shape !== 'rug');
    const fp = new Map(solid.map((i) => [i.id, footprintParts(i)]));
    for (let a = 0; a < solid.length; a++) for (let b = a + 1; b < solid.length; b++) {
      const A = solid[a], Bi = solid[b];
      if (!vOverlap(A.elev, A.elev + A.h, Bi.elev, Bi.elev + Bi.h)) continue;
      if (partsOverlap(fp.get(A.id), fp.get(Bi.id))) { list.push([A.id, Bi.id]); add(A.id, Bi.name); add(Bi.id, A.name); }
    }
    const obs = obstacles();
    for (const it of solid) for (const o of obs) {
      if (!vOverlap(it.elev, it.elev + it.h, o.y0, o.y1)) continue;
      if (partsOverlap(fp.get(it.id), [o.poly])) { list.push([it.id, o.name]); add(it.id, o.name); }
    }
    return { list, flagged, byId };
  }

  function hitsAnything(it, items) {
    if (it.shape === 'rug') return false;
    const mine = footprintParts(it);
    for (const o of items) {
      if (o.id === it.id || o.shape === 'rug' || !vOverlap(it.elev, it.elev + it.h, o.elev, o.elev + o.h)) continue;
      if (partsOverlap(mine, footprintParts(o))) return true;
    }
    return obstacles().some((o) => vOverlap(it.elev, it.elev + it.h, o.y0, o.y1) && partsOverlap(mine, [o.poly]));
  }

  /** Find a free spot for a new item, starting from the middle of the room. */
  function placeFree(it, R, items) {
    const [x0, z0, x1, z1] = R.bounds, cx = (x0 + x1) / 2, cz = (z0 + z1) / 2, cands = [];
    for (let x = x0; x <= x1; x += 0.2) for (let z = z0; z <= z1; z += 0.2) cands.push([x, z, Math.hypot(x - cx, z - cz)]);
    cands.sort((a, b) => a[2] - b[2]);
    for (const [x, z] of cands) { it.x = x; it.z = z; resolve(it, false, R); if (roomAt(it.x, it.z) === R && !hitsAnything(it, items)) return; }
    it.x = cx; it.z = cz; resolve(it, false, R);
  }

  /** Where you can stand at eye level: inside a room and clear of its fittings, or in a doorway. */
  function walkable(x, z, m = 0.18) {
    for (const id of ORDER) {
      const R = ROOMS[id], [x0, z0, x1, z1] = R.bounds;
      if (x < x0 + m || x > x1 - m || z < z0 + m || z > z1 - m) continue;
      if (R.cuts.some((c) => (c.shape || (c.y0 ?? 0) < 1.0) && inRect(x, z, c.r, m))) continue;
      return true;
    }
    return DOORS.some((dr) => inRect(x, z, dr.pass));
  }

  return { flat, H, ORDER, ROOMS, DOORS, roomAt, nearestRoom, roomFor, cutsFor, resolve, wallLimits, backToWall, obstacles, computeClashes, hitsAnything, placeFree, walkable };
}
