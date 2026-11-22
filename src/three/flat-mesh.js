/* Turns a flat's data and its computed walls into 3D: walls (each in three heights so
   the view can cut away the ones in front), floors, ceilings, skirting, coving, doors,
   windows and the door swings drawn on the floor. */
import * as THREE from 'three';
import { floorFor, paintFor, roomCentre, roomEdges, roomPolygon, roomType } from '../core/flat-model.js';
import { RB } from './furniture.js';
import { floorMat, roomMats, wallMat } from './materials.js';

export const PLAN_CUT = 1.2; // the top view, and walls of rooms you aren't looking at, are sliced at 1.2 m like an architect's plan
const STUB = 0.1;

function polyGeo(pts, ceiling) {
  const s = new THREE.Shape(pts.map((p) => new THREE.Vector2(p.x, ceiling ? p.z : -p.z)));
  const geom = new THREE.ShapeGeometry(s);
  geom.rotateX(ceiling ? Math.PI / 2 : -Math.PI / 2);
  return geom;
}
const rectPts = (x0, z0, x1, z1) => [{ x: x0, z: z0 }, { x: x1, z: z0 }, { x: x1, z: z1 }, { x: x0, z: z1 }];

function coveGeometry(len) {
  const s = new THREE.Shape();
  s.moveTo(0, 0); s.lineTo(0.1, 0); s.lineTo(0.1, -0.012); s.quadraticCurveTo(0.018, -0.02, 0.012, -0.1); s.lineTo(0, -0.1); s.lineTo(0, 0);
  return new THREE.ExtrudeGeometry(s, { depth: len, bevelEnabled: false, curveSegments: 8 });
}
function subtractRanges([a, b], gaps) {
  let segs = [[a, b]];
  for (const [g0, g1] of gaps) {
    const next = [];
    for (const [s0, s1] of segs) { if (g1 <= s0 || g0 >= s1) next.push([s0, s1]); else { if (g0 > s0) next.push([s0, g0]); if (g1 < s1) next.push([g1, s1]); } }
    segs = next;
  }
  return segs.filter(([s0, s1]) => s1 - s0 > 0.01);
}

/** A group laid out along a wall: local x runs along the wall, local +z points into the room. */
function edgeFrame(A, d) {
  const g = new THREE.Group();
  g.position.set(A.x, 0, A.z);
  g.rotation.y = Math.atan2(-d.z, d.x);
  return g;
}

function buildWindow(o, t) {
  const grp = new THREE.Group(); grp.name = 'Window';
  const yb = o.y0 + (o.frameLift || 0), w = o.u1 - o.u0, h = o.y1 - yb, cx = (o.u0 + o.u1) / 2, cy = (yb + o.y1) / 2;
  const fz = -t + Math.min(0.06, t / 2), fw = 0.06, fd = Math.min(0.07, t), F = roomMats.frame;
  grp.add(RB(w, fw, fd, F, cx, o.y1 - fw / 2, fz));
  grp.add(RB(w, fw, fd, F, cx, yb + fw / 2, fz));
  grp.add(RB(fw, h, fd, F, o.u0 + fw / 2, cy, fz));
  grp.add(RB(fw, h, fd, F, o.u1 - fw / 2, cy, fz));
  if (w > 0.9) grp.add(RB(0.05, h - 2 * fw, fd * 0.8, F, cx, cy, fz));
  const glass = new THREE.Mesh(new THREE.PlaneGeometry(Math.max(0.01, w - 2 * fw), Math.max(0.01, h - 2 * fw)), roomMats.glass);
  glass.position.set(cx, cy, fz); glass.renderOrder = 2; grp.add(glass);
  if (o.sillBoard) { const dep = Math.max(0.04, t - 0.095 + 0.03); grp.add(RB(w + 0.06, 0.025, dep, F, cx, o.y0 + 0.0125, 0.03 - dep / 2)); }
  return grp;
}

function buildDoor(o, t) {
  const grp = new THREE.Group(); grp.name = o.label ? o.label.replace(/^the /, '').replace(/^./, (c) => c.toUpperCase()) : 'Door';
  if (o.kind === 'opening') return grp; // a plain opening, like the original kitchen one
  const T = roomMats.trim;
  const w = o.u1 - o.u0, h = o.y1, lin = 0.02, cx = (o.u0 + o.u1) / 2;
  grp.add(RB(lin, h, t, T, o.u0 + lin / 2, h / 2, -t / 2));
  grp.add(RB(lin, h, t, T, o.u1 - lin / 2, h / 2, -t / 2));
  grp.add(RB(w, lin, t, T, cx, h - lin / 2, -t / 2));
  const aw = 0.07, ad = 0.015;
  for (const z of [ad / 2, -t - ad / 2]) {
    grp.add(RB(aw, h + aw - lin, ad, T, o.u0 + lin - aw / 2, (h + aw - lin) / 2, z));
    grp.add(RB(aw, h + aw - lin, ad, T, o.u1 - lin + aw / 2, (h + aw - lin) / 2, z));
    grp.add(RB(w - 2 * lin + 2 * aw, aw, ad, T, cx, h - lin + aw / 2, z));
  }
  const lw = w - 2 * lin - 0.006, lh = h - lin - 0.012, lt = 0.04;
  const leafZ = o.side > 0 ? -Math.min(0.035, t / 2) : -t + Math.min(0.035, t / 2);
  const leaf = new THREE.Group(); leaf.position.set(cx, 0.008 + lh / 2, leafZ); grp.add(leaf);
  if (o.style === 'glazed') {
    leaf.add(RB(0.1, lh, lt, T, -lw / 2 + 0.05, 0, 0)); leaf.add(RB(0.1, lh, lt, T, lw / 2 - 0.05, 0, 0));
    leaf.add(RB(lw - 0.2, 0.1, lt, T, 0, lh / 2 - 0.05, 0)); leaf.add(RB(lw - 0.2, 0.2, lt, T, 0, -lh / 2 + 0.1, 0));
    const gw = lw - 0.2, gh = lh - 0.3, gy = 0.05;
    leaf.add(RB(0.025, gh, lt * 0.7, T, 0, gy, 0));
    for (let k = 1; k < 5; k++) leaf.add(RB(gw, 0.025, lt * 0.7, T, 0, gy - gh / 2 + (k * gh) / 5, 0));
    const gl = new THREE.Mesh(new THREE.PlaneGeometry(gw, gh), roomMats.doorGlass); gl.position.set(0, gy, 0); gl.renderOrder = 2; leaf.add(gl);
  } else {
    leaf.add(RB(lw, lh, lt, T, 0, 0, 0));
    const pw = (lw - 0.3) / 2, ph = (lh - 0.45) / 2;
    for (const sz of [1, -1]) for (const px of [-1, 1]) for (const py of [-1, 1]) leaf.add(RB(pw, ph, 0.008, T, px * (pw / 2 + 0.05), py * (ph / 2 + 0.06) + 0.02, sz * (lt / 2 + 0.003)));
  }
  const handleSide = o.hinge === 'u0' ? 1 : -1;
  const hy = 1.0 - (0.008 + lh / 2), hx = handleSide * (lw / 2 - 0.065);
  for (const sz of [1, -1]) {
    const rose = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.012, 20), roomMats.chrome); rose.rotation.x = Math.PI / 2; rose.position.set(hx, hy, sz * (lt / 2 + 0.006)); leaf.add(rose);
    leaf.add(RB(0.12, 0.018, 0.018, roomMats.chrome, hx - handleSide * 0.055, hy, sz * (lt / 2 + 0.05)));
    leaf.add(RB(0.018, 0.018, 0.05, roomMats.chrome, hx, hy, sz * (lt / 2 + 0.03)));
  }
  return grp;
}

const pickMat = new THREE.MeshBasicMaterial({ visible: false });
export const swingFill = new THREE.MeshBasicMaterial({ color: '#1d5866', transparent: true, opacity: 0.12, depthWrite: false });
export const swingLine = new THREE.LineBasicMaterial({ color: '#1d5866', transparent: true, opacity: 0.55 });
function buildSwing(P) {
  const grp = new THREE.Group();
  const shape = new THREE.Shape(P.map((p) => new THREE.Vector2(p.x, -p.z)));
  const m = new THREE.Mesh(new THREE.ShapeGeometry(shape, 16).rotateX(-Math.PI / 2), swingFill); m.position.y = 0.004; m.renderOrder = 1; grp.add(m);
  const lineGeo = new THREE.BufferGeometry().setFromPoints([...P.slice(1).map((p) => new THREE.Vector3(p.x, 0.006, p.z)), new THREE.Vector3(P[0].x, 0.006, P[0].z)]);
  grp.add(new THREE.Line(lineGeo, swingLine));
  return grp;
}

/**
 * Build the flat. Returns the group plus handles the view needs: the wall pieces with
 * their three heights, floors (for picking rooms), the door and window groups (for
 * picking openings), ceilings, coving and door swings.
 */
export function buildFlatMeshes(flat, walls, world, { forExport = false } = {}) {
  const H = flat.ceiling;
  const group = new THREE.Group(); group.name = flat.name || 'Flat';
  const rooms = Object.fromEntries(flat.rooms.map((r) => [r.id, r]));
  const opById = Object.fromEntries(walls.openings.map((o) => [o.id, o]));
  const wallKey = (roomId, edge) => {
    const r = rooms[roomId];
    return wallMat(`${roomId}:${edge}`, paintFor(flat, r, edge), roomType(r).gloss);
  };
  const faceMat = (f) => {
    if (!f || f.kind === 'ext') return roomMats.ext;
    return wallKey(f.room, f.edge);
  };

  // ---- walls
  const wallGroup = new THREE.Group(); wallGroup.name = 'Walls, doors and windows'; group.add(wallGroup);
  const wallRecs = [];
  for (const box of walls.boxes) {
    const op = box.opening ? opById[box.opening] : null;
    const pieces = op ? [[0, op.y0], [op.y1, H]].filter(([a, b]) => b - a > 0.002) : [[0, H]];
    const w = box.x1 - box.x0, d = box.z1 - box.z0, cx = (box.x0 + box.x1) / 2, cz = (box.z0 + box.z1) / 2;
    const reveal = op ? wallKey(op.room, op.edge) : roomMats.ext;
    const mats = [faceMat(box.faces.e), faceMat(box.faces.w), null, null, faceMat(box.faces.s), faceMat(box.faces.n)];
    const mk = (y0, y1, top) => {
      const h = top - y0;
      const topMat = top >= H - 1e-4 || top < y1 - 1e-4 ? roomMats.cut : reveal;
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), [mats[0], mats[1], topMat, reveal, mats[4], mats[5]]);
      m.position.set(cx, y0 + h / 2, cz); m.receiveShadow = true; m.castShadow = true;
      return m;
    };
    const full = new THREE.Group(), stub = new THREE.Group(), plan = new THREE.Group();
    for (const [y0, y1] of pieces) {
      full.add(mk(y0, y1, y1));
      if (!forExport && y0 === 0) { stub.add(mk(y0, y1, Math.min(y1, STUB))); plan.add(mk(y0, y1, Math.min(y1, PLAN_CUT))); }
    }
    wallGroup.add(full); if (!forExport) wallGroup.add(stub, plan);
    wallRecs.push({ box, full, stub, plan, sides: box.sides, rooms: box.rooms, mid: { x: cx, z: cz }, opening: box.opening });
  }

  // ---- doors and windows. The visible part shows only while its wall is full height;
  // an invisible box filling the hole stays clickable in every view.
  const openingGroups = [], openingVisuals = [];
  const doorLabel = Object.fromEntries(world.DOORS.filter((d) => d.label).map((d) => [d.id, d.label]));
  for (const o of walls.openings) {
    if (!o.ok) continue;
    const fr = edgeFrame(o.A, o.d);
    const spec = {
      u0: o.u0, u1: o.u1, y0: o.y0, y1: o.y1, kind: o.kind, style: o.op.style, label: doorLabel[o.id],
      hinge: o.op.hinge === 'start' ? 'u0' : 'u1', side: o.op.swing === 'out' ? -1 : 1, sillBoard: o.op.sillBoard, frameLift: o.op.frameLift,
    };
    fr.add(o.kind === 'window' ? buildWindow(spec, o.t) : buildDoor(spec, o.t));
    fr.name = o.kind === 'window' ? 'Window' : (doorLabel[o.id] || 'Doorway');
    wallGroup.add(fr);
    openingVisuals.push({ id: o.id, group: fr });
    if (!forExport) {
      const pk = edgeFrame(o.A, o.d);
      const pick = new THREE.Mesh(new THREE.BoxGeometry(o.u1 - o.u0, o.y1 - o.y0, o.t + 0.02), pickMat);
      pick.position.set((o.u0 + o.u1) / 2, (o.y0 + o.y1) / 2, -o.t / 2); pk.add(pick);
      pk.userData.openingId = o.id;
      wallGroup.add(pk); openingGroups.push(pk);
    }
  }

  // ---- rooms: floors, ceilings, skirting, coving. Skirting and coving belong to a wall
  // of a room; they hide with the wall boxes behind them when the view cuts those away.
  const byEdge = new Map();
  for (const rec of wallRecs) for (const f of Object.values(rec.box.faces)) {
    if (!f || f.kind !== 'room') continue;
    const k = `${f.room}:${f.edge}`;
    if (!byEdge.has(k)) byEdge.set(k, []);
    if (!byEdge.get(k).includes(rec)) byEdge.get(k).push(rec);
  }
  const roomGroups = {};
  const floors = [];
  const ceilings = new THREE.Group(); ceilings.name = 'Ceilings';
  const coves = [], edgeTrims = [];
  for (const r of flat.rooms) {
    const rg = new THREE.Group(); rg.name = r.name; group.add(rg); roomGroups[r.id] = rg;
    const poly = roomPolygon(r);
    const fl = new THREE.Mesh(polyGeo(poly, false), floorMat(floorFor(flat, r)));
    fl.receiveShadow = true; fl.name = 'Floor'; fl.userData.roomId = r.id; rg.add(fl); floors.push(fl);
    const ce = new THREE.Mesh(polyGeo(poly, true), roomMats.ceiling); ce.position.y = H; ceilings.add(ce);
    const [lx, lz] = roomCentre(r);
    const lamp = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, 0.04, 28), roomMats.light); lamp.position.set(lx, H - 0.02, lz); ceilings.add(lamp);

    const T = roomType(r);
    for (const e of roomEdges(r)) {
      const gaps = [];
      for (const o of walls.openings) {
        if (!o.ok || o.kind === 'window') continue;
        if (o.room === r.id && o.edge === e.i) { gaps.push([o.u0, o.u1]); continue; }
        if (o.farRoom !== r.id) continue;
        const far = [o.p0, o.p1].map((p) => ({ x: p.x - o.n.x * o.t, z: p.z - o.n.z * o.t }));
        const along = Math.abs(o.d.x) > 0.5 ? 'x' : 'z';
        if (along !== e.axis) continue;
        const c = e.axis === 'x' ? far[0].z : far[0].x;
        if (Math.abs(c - e.coord) > 0.003) continue;
        const us = far.map((p) => (p.x - e.a.x) * e.d.x + (p.z - e.a.z) * e.d.z);
        gaps.push([Math.min(...us), Math.max(...us)]);
      }
      const fr = edgeFrame(e.a, e.d), skirt = new THREE.Group();
      fr.add(skirt);
      if (!T.noSkirt) for (const [s0, s1] of subtractRanges([0, e.len], gaps)) skirt.add(RB(s1 - s0, 0.12, 0.018, roomMats.trim, (s0 + s1) / 2, 0.06, 0.009));
      let cove = null;
      if (!T.noCove) {
        cove = new THREE.Mesh(coveGeometry(e.len), roomMats.cove);
        cove.rotation.y = -Math.PI / 2; cove.position.set(e.len, H, 0);
        fr.add(cove); coves.push(cove);
      }
      edgeTrims.push({ skirt, cove, recs: byEdge.get(`${r.id}:${e.i}`) || [] });
      rg.add(fr);
    }
  }
  group.add(ceilings);

  // ---- floors in doorways go with the room the door opens into
  for (const o of walls.openings) {
    if (!o.ok || o.kind === 'window') continue;
    const into = o.kind === 'door' ? (o.op.swing === 'out' ? o.farRoom : o.room) : (o.farRoom || o.room);
    const R = rooms[into] || rooms[o.room];
    const far = [o.p0, o.p1].map((p) => ({ x: p.x - o.n.x * o.t, z: p.z - o.n.z * o.t }));
    const xs = [o.p0.x, o.p1.x, far[0].x, far[1].x], zs = [o.p0.z, o.p1.z, far[0].z, far[1].z];
    const m = new THREE.Mesh(polyGeo(rectPts(Math.min(...xs), Math.min(...zs), Math.max(...xs), Math.max(...zs)), false), floorMat(floorFor(flat, R)));
    m.receiveShadow = true; m.name = 'Threshold'; m.userData.roomId = R.id; m.position.y = 0.0005;
    roomGroups[R.id].add(m); floors.push(m);
  }

  let swings = null;
  if (!forExport) {
    swings = new THREE.Group(); swings.name = 'Door swings'; group.add(swings);
    for (const dr of world.DOORS) if (dr.poly) swings.add(buildSwing(dr.poly));
  }
  return { group, wallRecs, openingGroups, openingVisuals, floors, ceilings, coves, edgeTrims, swings, roomGroups };
}
