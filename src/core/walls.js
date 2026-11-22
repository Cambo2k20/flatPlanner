/* Works out the walls of a flat from its rooms.

   Rooms are rectangles (or L shapes) of their inside measurements, placed with gaps
   between them. Everything within `outerWall` of a room that isn't inside a room is
   wall: the gap between two rooms becomes the wall between them, and the band around
   the outside becomes the outer walls. To find that region the plan is cut into a grid
   along every room edge, every edge ± outerWall and every door and window end, and
   each cell is classed as room, wall or outside. Wall cells are then merged into as
   few boxes as possible, each face remembering which room (and which of its walls) it
   faces, so it can take that wall's paint.

   Doors and windows sit on a room's wall. The wall cells straight behind one, until
   the next room or the outside, are tagged with it; those boxes are drawn with a hole.
   No three.js here, so this can be tested on its own. */
import { roomEdges, roomRects } from './flat-model.js';
import { clamp } from './util.js';

const TOL = 1e-3;

function uniqSorted(vals) {
  const a = vals.filter(Number.isFinite).sort((p, q) => p - q), out = [];
  for (const v of a) if (!out.length || v - out[out.length - 1] > TOL) out.push(v);
  return out;
}
function indexNear(arr, v) {
  let lo = 0, hi = arr.length - 1;
  while (lo <= hi) {
    const m = (lo + hi) >> 1;
    if (arr[m] < v - 2 * TOL) lo = m + 1; else if (arr[m] > v + 2 * TOL) hi = m - 1; else return m;
  }
  return -1;
}

// Signed inset in metres: positive moves the end jamb into the room, negative the start.
export function doorwayFrame(o) {
  const inset = o.op.jambInset || 0;
  if (!inset) return o;
  const start = Math.max(0, -inset), width = o.u1 - o.u0;
  const len = Math.hypot(width, inset);
  const d = { x: (width * o.d.x + inset * o.n.x) / len, z: (width * o.d.z + inset * o.n.z) / len };
  const A = { x: o.p0.x + start * o.n.x, z: o.p0.z + start * o.n.z };
  return { ...o, A, d, n: { x: -d.z, z: d.x }, u0: 0, u1: len };
}

export function computeWalls(flat) {
  const E = flat.outerWall, rooms = flat.rooms;
  const shapes = rooms.map((r) => ({ room: r, rects: roomRects(r), edges: roomEdges(r) }));

  // ---- doors, windows and openings, as straight pieces of a room's wall
  const ops = [];
  for (const op of flat.openings) {
    const ri = rooms.findIndex((r) => r.id === op.room);
    if (ri < 0) continue;
    const e = shapes[ri].edges[op.edge];
    if (!e) continue;
    const u0 = clamp(op.pos, 0, Math.max(0, e.len - 0.05)), u1 = clamp(op.pos + op.width, u0 + 0.05, e.len);
    const P = (u) => ({ x: e.a.x + e.d.x * u, z: e.a.z + e.d.z * u });
    ops.push({
      id: op.id, op, kind: op.kind, ri, room: rooms[ri].id, edge: op.edge, e, A: e.a, d: e.d, n: e.n, u0, u1, p0: P(u0), p1: P(u1),
      y0: op.kind === 'window' ? op.sill : 0, y1: op.top, t: 0, farRoom: null, ok: false,
    });
  }

  // ---- the grid
  const xs = [], zs = [];
  for (const s of shapes) for (const [x0, z0, x1, z1] of s.rects) { xs.push(x0, x1, x0 - E, x1 + E); zs.push(z0, z1, z0 - E, z1 + E); }
  for (const o of ops) { if (o.e.axis === 'x') xs.push(o.p0.x, o.p1.x); else zs.push(o.p0.z, o.p1.z); }
  const X = uniqSorted(xs), Z = uniqSorted(zs), nx = X.length - 1, nz = Z.length - 1;
  if (nx < 1 || nz < 1) return { boxes: [], openings: ops, bounds: [-1, -1, 1, 1] };
  const at = (i, j) => i + j * nx;
  const type = new Int16Array(nx * nz); // -2 outside, -1 wall, 0+ the index of the room
  for (let j = 0; j < nz; j++) {
    const cz = (Z[j] + Z[j + 1]) / 2;
    for (let i = 0; i < nx; i++) {
      const cx = (X[i] + X[i + 1]) / 2;
      let t = -2, best = Infinity;
      for (let k = 0; k < shapes.length && t < 0; k++) {
        for (const [x0, z0, x1, z1] of shapes[k].rects) {
          const dist = Math.max(x0 - cx, 0, cx - x1, z0 - cz, cz - z1);
          if (dist === 0) { t = k; break; }
          if (dist < best) best = dist;
        }
      }
      type[at(i, j)] = t >= 0 ? t : best <= E + 1e-6 ? -1 : -2;
    }
  }

  // ---- tag the wall behind each opening, and find how thick it is there
  const tag = new Int16Array(nx * nz).fill(-1);
  ops.forEach((o, k) => {
    const e = o.e, alongX = e.axis === 'x';
    const A = alongX ? X : Z, B = alongX ? Z : X;
    const a0 = alongX ? Math.min(o.p0.x, o.p1.x) : Math.min(o.p0.z, o.p1.z);
    const a1 = alongX ? Math.max(o.p0.x, o.p1.x) : Math.max(o.p0.z, o.p1.z);
    const c0 = indexNear(A, a0), c1 = indexNear(A, a1), line = indexNear(B, e.coord);
    if (c0 < 0 || c1 <= c0 || line < 0) return;
    const out = alongX ? -e.n.z : -e.n.x, step = out < 0 ? -1 : 1, start = step < 0 ? line - 1 : line;
    const cell = (c, b) => (alongX ? at(c, b) : at(b, c));
    const inside = (b) => b >= 0 && b < (alongX ? nz : nx);
    // Walk outwards from the room through wall cells, column by column. The wall is as
    // thick as the shortest walk: a longer one is running along the end of another wall.
    let depth = Infinity, beyond = -2;
    for (let c = c0; c < c1; c++) {
      let b = start;
      while (inside(b) && type[cell(c, b)] === -1 && tag[cell(c, b)] === -1) b += step;
      const far = step < 0 ? B[b + 1] : B[b], d = b === start ? 0 : Math.abs(far - e.coord);
      if (d < depth) { depth = d; beyond = inside(b) ? type[cell(c, b)] : -2; }
    }
    if (!(depth > 0.005)) return;
    if (depth > 2 * E + TOL) { depth = E; beyond = -2; } // no room or outside within reach: treat it as an outside wall
    o.t = depth;
    o.farRoom = beyond >= 0 ? rooms[beyond].id : null;
    for (let c = c0; c < c1; c++) {
      for (let bb = start; inside(bb); bb += step) {
        const q = cell(c, bb), farEdge = step < 0 ? B[bb] : B[bb + 1];
        if (Math.abs(farEdge - e.coord) > depth + TOL || type[q] !== -1 || tag[q] !== -1) break;
        tag[q] = k;
      }
    }
    o.ok = true;
  });

  // ---- what each wall cell's faces look onto
  const edgeOf = (k, side, coord, along) => {
    for (const e of shapes[k].edges) if (e.side === side && Math.abs(e.coord - coord) < 2 * TOL && along > e.lo - TOL && along < e.hi + TOL) return e.i;
    return -1;
  };
  const label = (i, j, ni, nj, dir) => {
    if (ni < 0 || nj < 0 || ni >= nx || nj >= nz) return 'x';
    const t = type[at(ni, nj)];
    if (t === -2) return 'x';
    if (t === -1) { const a = tag[at(i, j)], b = tag[at(ni, nj)]; return a < 0 && b >= 0 ? 'j' + b : null; }
    let side, coord, along;
    if (dir === 'n') { side = 's'; coord = Z[j]; along = (X[i] + X[i + 1]) / 2; }
    else if (dir === 's') { side = 'n'; coord = Z[j + 1]; along = (X[i] + X[i + 1]) / 2; }
    else if (dir === 'w') { side = 'e'; coord = X[i]; along = (Z[j] + Z[j + 1]) / 2; }
    else { side = 'w'; coord = X[i + 1]; along = (Z[j] + Z[j + 1]) / 2; }
    return 'r' + t + ':' + edgeOf(t, side, coord, along);
  };

  // ---- merge cells into boxes: first along each row, then down the columns.
  // A face that touches another wall is hidden (null) and can join anything.
  const compat = (a, b) => a === null || b === null || a === b;
  const pick = (a, b) => (a === null ? b : a);
  const rows = [];
  for (let j = 0; j < nz; j++) {
    const runs = []; let cur = null;
    for (let i = 0; i < nx; i++) {
      if (type[at(i, j)] !== -1) { cur = null; continue; }
      const L = { n: label(i, j, i, j - 1, 'n'), s: label(i, j, i, j + 1, 's'), w: label(i, j, i - 1, j, 'w'), e: label(i, j, i + 1, j, 'e') };
      const tg = tag[at(i, j)];
      if (cur && cur.tag === tg && compat(cur.n, L.n) && compat(cur.s, L.s)) { cur.i1 = i; cur.n = pick(cur.n, L.n); cur.s = pick(cur.s, L.s); cur.e = L.e; }
      else { cur = { i0: i, i1: i, j0: j, j1: j, tag: tg, ...L }; runs.push(cur); }
    }
    rows.push(runs);
  }
  const merged = [];
  let active = new Map();
  for (let j = 0; j < nz; j++) {
    const next = new Map();
    for (const run of rows[j]) {
      const key = run.i0 * 100000 + run.i1, prev = active.get(key);
      if (prev && prev.tag === run.tag && prev.s === null && run.n === null && compat(prev.e, run.e) && compat(prev.w, run.w)) {
        prev.j1 = j; prev.s = run.s; prev.e = pick(prev.e, run.e); prev.w = pick(prev.w, run.w); next.set(key, prev);
      } else { merged.push(run); next.set(key, run); }
    }
    active = next;
  }

  const face = (l) => {
    if (l === null) return null;
    if (l === 'x') return { kind: 'ext' };
    if (l[0] === 'j') { const o = ops[+l.slice(1)]; return { kind: 'jamb', opening: o.id, room: o.room, edge: o.edge }; }
    const k = +l.slice(1, l.indexOf(':')), edge = +l.slice(l.indexOf(':') + 1);
    return { kind: 'room', room: rooms[k].id, edge };
  };
  const NORMALS = { n: [0, -1], s: [0, 1], w: [-1, 0], e: [1, 0] };
  const boxes = merged.map((b) => {
    const box = {
      x0: X[b.i0], x1: X[b.i1 + 1], z0: Z[b.j0], z1: Z[b.j1 + 1],
      faces: { n: face(b.n), s: face(b.s), e: face(b.e), w: face(b.w) },
      opening: b.tag >= 0 ? ops[b.tag].id : null, sides: [], rooms: [],
    };
    for (const dir of ['n', 's', 'w', 'e']) {
      const f = box.faces[dir];
      if (f && f.kind === 'room') {
        box.sides.push({ room: f.room, nx: NORMALS[dir][0], nz: NORMALS[dir][1] });
        if (!box.rooms.includes(f.room)) box.rooms.push(f.room);
      }
    }
    return box;
  });

  return {
    boxes,
    openings: ops.map(({ op, ri, e, p0, p1, ...o }) => ({ ...o, op, p0, p1, len: e.len })),
    bounds: [X[0], Z[0], X[nx], Z[nz]],
  };
}
