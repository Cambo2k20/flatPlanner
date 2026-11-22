/* The data model of a flat: rooms, doors and windows, fixed fittings, and your
   decoration (paint, floors, furniture). Everything is in metres, seen from above
   with x running right (east) and z running down the screen (south).

   A room is a rectangle of its inside measurements, the figures a listing gives,
   optionally with one corner cut out to make an L. Rooms are placed with a gap
   between them; the gap is the wall. Doors and windows sit on one of a room's walls. */
import { DEFAULT_CEILING_PAINT, DEFAULT_TRIM, FLAT_STATUS, FLOORS, ROOM_TYPES } from './palette.js';
import { SHAPES, isShape } from './shapes.js';
import { clamp, hexOr, isHex, numOr, safeUrl, str, uid } from './util.js';

export const FLAT_FORMAT = 1;
export const CORNERS = { nw: 'Top left', ne: 'Top right', se: 'Bottom right', sw: 'Bottom left' };
export const OPENING_KINDS = { door: 'Door', window: 'Window', opening: 'Opening (no door)' };

/* ------------------------------------------------------------ room shapes */

/** The rectangles that make up a room: one, or two for an L-shaped room. */
export function roomRects(r) {
  const x0 = r.x, z0 = r.z, x1 = r.x + r.w, z1 = r.z + r.d, n = r.notch;
  if (!n) return [[x0, z0, x1, z1]];
  switch (n.corner) {
    case 'nw': return [[x0, z0 + n.d, x1, z1], [x0 + n.w, z0, x1, z0 + n.d]];
    case 'ne': return [[x0, z0 + n.d, x1, z1], [x0, z0, x1 - n.w, z0 + n.d]];
    case 'se': return [[x0, z0, x1, z1 - n.d], [x0, z1 - n.d, x1 - n.w, z1]];
    default: return [[x0, z0, x1, z1 - n.d], [x0 + n.w, z1 - n.d, x1, z1]]; // sw
  }
}

/** The corner cut out of an L-shaped room, as a rectangle, or null. */
export function notchRect(r) {
  const n = r.notch; if (!n) return null;
  const x0 = r.x, z0 = r.z, x1 = r.x + r.w, z1 = r.z + r.d;
  switch (n.corner) {
    case 'nw': return [x0, z0, x0 + n.w, z0 + n.d];
    case 'ne': return [x1 - n.w, z0, x1, z0 + n.d];
    case 'se': return [x1 - n.w, z1 - n.d, x1, z1];
    default: return [x0, z1 - n.d, x0 + n.w, z1];
  }
}

/** Corners of the room going clockwise on screen, starting on the top wall. */
export function roomPolygon(r) {
  const x0 = r.x, z0 = r.z, x1 = r.x + r.w, z1 = r.z + r.d, n = r.notch;
  const P = (x, z) => ({ x, z });
  if (!n) return [P(x0, z0), P(x1, z0), P(x1, z1), P(x0, z1)];
  switch (n.corner) {
    case 'nw': return [P(x0 + n.w, z0), P(x1, z0), P(x1, z1), P(x0, z1), P(x0, z0 + n.d), P(x0 + n.w, z0 + n.d)];
    case 'ne': return [P(x0, z0), P(x1 - n.w, z0), P(x1 - n.w, z0 + n.d), P(x1, z0 + n.d), P(x1, z1), P(x0, z1)];
    case 'se': return [P(x0, z0), P(x1, z0), P(x1, z1 - n.d), P(x1 - n.w, z1 - n.d), P(x1 - n.w, z1), P(x0, z1)];
    default: return [P(x0, z0), P(x1, z0), P(x1, z1), P(x0 + n.w, z1), P(x0 + n.w, z1 - n.d), P(x0, z1 - n.d)];
  }
}

/**
 * The walls around a room, one per side of its outline. Each has a start a, an end b,
 * a direction d and the normal n pointing into the room. side says where the wall is
 * relative to the room: n (top), e (right), s (bottom) or w (left).
 */
export function roomEdges(r) {
  const P = roomPolygon(r);
  return P.map((a, i) => {
    const b = P[(i + 1) % P.length];
    const len = Math.hypot(b.x - a.x, b.z - a.z) || 1e-9;
    const d = { x: (b.x - a.x) / len, z: (b.z - a.z) / len };
    const n = { x: -d.z, z: d.x };
    const side = n.z > 0.5 ? 'n' : n.z < -0.5 ? 's' : n.x > 0.5 ? 'w' : 'e';
    const axis = Math.abs(d.x) > 0.5 ? 'x' : 'z';
    return {
      i, a, b, d, n, len, side, axis,
      coord: axis === 'x' ? a.z : a.x,
      lo: axis === 'x' ? Math.min(a.x, b.x) : Math.min(a.z, b.z),
      hi: axis === 'x' ? Math.max(a.x, b.x) : Math.max(a.z, b.z),
    };
  });
}

const SIDE_NAME = { n: 'Top', e: 'Right', s: 'Bottom', w: 'Left' };
export function edgeLabel(r, i) {
  const E = roomEdges(r), e = E[i];
  if (!e) return 'Wall';
  const same = E.filter((x) => x.side === e.side);
  let q = '';
  if (same.length > 1) {
    const other = same.find((x) => x !== e);
    q = e.axis === 'x' ? (e.lo < other.lo ? ', left part' : ', right part') : (e.lo < other.lo ? ', upper part' : ', lower part');
  }
  return `${SIDE_NAME[e.side]} wall${q}`;
}

/** Whether a wall runs against the screen's reading direction (right to left, or upwards). */
export const edgeReversed = (e) => e.d.x < -0.5 || e.d.z < -0.5;
/** Where an opening starts, measured from the left end (or top end) of its wall as seen on screen. */
export const screenOffset = (e, op) => (edgeReversed(e) ? e.len - (op.pos + op.width) : op.pos);
export const posFromScreenOffset = (e, off, width) => (edgeReversed(e) ? e.len - off - width : off);
/** The screen name of each end of a wall: [start, end]. */
export const edgeEndNames = (e) => (e.axis === 'x' ? (e.d.x > 0 ? ['left', 'right'] : ['right', 'left']) : (e.d.z > 0 ? ['top', 'bottom'] : ['bottom', 'top']));

export function inRoom(r, x, z, m = 0) {
  if (x <= r.x + m || x >= r.x + r.w - m || z <= r.z + m || z >= r.z + r.d - m) return false;
  const c = notchRect(r);
  return !(c && x > c[0] - m && x < c[2] + m && z > c[1] - m && z < c[3] + m);
}
export function roomArea(r) { const c = notchRect(r); return r.w * r.d - (c ? (c[2] - c[0]) * (c[3] - c[1]) : 0); }
/** Centre of the biggest rectangle of the room: a good spot for labels and new furniture. */
export function roomCentre(r) {
  const rs = roomRects(r).sort((a, b) => (b[2] - b[0]) * (b[3] - b[1]) - (a[2] - a[0]) * (a[3] - a[1]));
  const [x0, z0, x1, z1] = rs[0];
  return [(x0 + x1) / 2, (z0 + z1) / 2];
}
export function flatBounds(flat, pad = 0) {
  if (!flat.rooms.length) return [-2 - pad, -2 - pad, 2 + pad, 2 + pad];
  let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
  for (const r of flat.rooms) { x0 = Math.min(x0, r.x); z0 = Math.min(z0, r.z); x1 = Math.max(x1, r.x + r.w); z1 = Math.max(z1, r.z + r.d); }
  return [x0 - pad, z0 - pad, x1 + pad, z1 + pad];
}

export const roomType = (r) => ROOM_TYPES[r && r.type] || ROOM_TYPES.other;
export const findRoom = (flat, id) => flat.rooms.find((r) => r.id === id) || null;

/* ------------------------------------------------------------ decoration */
export function paintFor(flat, room, edge) {
  const wp = flat.design.wallPaint[room.id];
  return (wp && edge !== undefined && wp[edge]) || flat.design.paint[room.id] || roomType(room).paint;
}
export function floorFor(flat, room) {
  const f = flat.design.floor[room.id];
  return FLOORS[f] ? f : roomType(room).floor;
}

/* --------------------------------------------------------------- defaults */
export function newRoom(flat, over = {}) {
  const n = flat.rooms.length + 1;
  return normalizeRoom({ id: uid(), name: `Room ${n}`, type: 'other', x: 0, z: 0, w: 3, d: 3, notch: null, ...over });
}

/** A new room next to an existing one, with a wall's width between them. */
export function roomBeside(flat, r, side, over = {}) {
  const g = flat.innerWall, w = over.w || 3, d = over.d || 3;
  const pos = {
    e: { x: r.x + r.w + g, z: r.z }, w: { x: r.x - g - w, z: r.z },
    n: { x: r.x, z: r.z - g - d }, s: { x: r.x, z: r.z + r.d + g },
  }[side];
  return newRoom(flat, { w, d, ...pos, ...over, x: pos.x, z: pos.z });
}

export function openingDefaults(kind, flat) {
  const H = flat.ceiling;
  if (kind === 'window') return { kind, width: 1.2, sill: 0.9, top: Math.min(2.1, H - 0.2), sillBoard: true };
  if (kind === 'opening') return { kind, width: 1.0, sill: 0, top: Math.min(2.0, H - 0.2) };
  return { kind: 'door', width: 0.8, sill: 0, top: Math.min(2.03, H - 0.15), style: 'panel', hinge: 'start', swing: 'in' };
}

export function newOpening(flat, room, edge, kind, over = {}) {
  const e = roomEdges(room)[edge];
  const base = openingDefaults(kind, flat);
  const width = Math.min(base.width, Math.max(0.3, e.len - 0.1));
  return normalizeOpening({ id: uid(), room: room.id, edge, pos: Math.max(0, (e.len - width) / 2), ...base, width, ...over }, flat);
}

export function newFixture(flat, shape, room, over = {}) {
  const s = SHAPES[shape];
  const [cx, cz] = room ? roomCentre(room) : [0, 0];
  return normalizeFixture({
    id: uid(), shape, name: s.label, room: room ? room.id : '', x: cx, z: cz, rot: 0,
    w: s.w, d: s.d, h: s.fullHeight ? flat.ceiling : s.h, elev: s.elev || 0, color: s.color,
    fullHeight: !!s.fullHeight, opts: s.opts ? structuredClone(s.opts) : {}, ...over,
  }, flat);
}

export function newFlat(over = {}) {
  return normalizeFlat({ id: uid(), name: 'New flat', status: 'interested', created: Date.now(), updated: Date.now(), ...over });
}

/* -------------------------------------------------------------- validation */
const ROT = (v) => ((((Math.round(numOr(v, 0) * 100) / 100) % 360) + 360) % 360);

export function normalizeRoom(r) {
  const w = clamp(numOr(r && r.w, 3), 0.4, 40), d = clamp(numOr(r && r.d, 3), 0.4, 40);
  let notch = null;
  if (r && r.notch && CORNERS[r.notch.corner] && w > 0.7 && d > 0.7) {
    notch = { corner: r.notch.corner, w: clamp(numOr(r.notch.w, w / 2), 0.1, w - 0.3), d: clamp(numOr(r.notch.d, d / 2), 0.1, d - 0.3) };
  }
  return {
    id: str(r && r.id, 40) || uid(),
    name: str(r && r.name, 50) || 'Room',
    type: ROOM_TYPES[r && r.type] ? r.type : 'other',
    x: numOr(r && r.x, 0), z: numOr(r && r.z, 0), w, d, notch,
  };
}

export function normalizeOpening(o, flat) {
  const room = findRoom(flat, o && o.room);
  if (!room) return null;
  const edges = roomEdges(room);
  const edge = clamp(Math.round(numOr(o.edge, 0)), 0, edges.length - 1), e = edges[edge];
  const kind = OPENING_KINDS[o.kind] ? o.kind : 'door';
  const H = flat.ceiling, def = openingDefaults(kind, flat);
  const width = clamp(numOr(o.width, def.width), 0.2, Math.max(0.2, e.len));
  const pos = clamp(numOr(o.pos, 0), 0, Math.max(0, e.len - width));
  const sill = kind === 'window' ? clamp(numOr(o.sill, def.sill), 0, H - 0.3) : 0;
  const top = clamp(numOr(o.top, def.top), sill + 0.2, H);
  return {
    id: str(o.id, 40) || uid(), room: room.id, edge, pos, width, kind, sill, top,
    style: o.style === 'glazed' ? 'glazed' : 'panel',
    hinge: o.hinge === 'end' ? 'end' : 'start',
    ...(kind === 'door' && room.notch && o.cornerDoor === true ? { cornerDoor: true } : {}),
    ...(kind === 'door' && Number.isFinite(o.jambInset) && o.jambInset
      ? { jambInset: clamp(o.jambInset, -width, width) } : {}),
    swing: o.swing === 'out' ? 'out' : 'in',
    sillBoard: kind === 'window' ? o.sillBoard !== false : false,
    frameLift: clamp(numOr(o.frameLift, 0), 0, 0.2),
  };
}

export function normalizeFixture(f, flat) {
  if (!f || !isShape(f.shape) || !SHAPES[f.shape].fitting) return null;
  const s = SHAPES[f.shape];
  const fullHeight = f.fullHeight !== undefined ? !!f.fullHeight : !!s.fullHeight;
  const opts = {};
  for (const [k, v] of Object.entries({ ...(s.opts || {}), ...((f.opts && typeof f.opts === 'object') ? f.opts : {}) })) {
    if (v === null || typeof v === 'boolean') opts[k] = v;
    else if (typeof v === 'number' && Number.isFinite(v)) opts[k] = v;
    else if (isHex(v)) opts[k] = v.toLowerCase();
  }
  return {
    id: str(f.id, 40) || uid(), shape: f.shape, name: str(f.name, 60) || s.label,
    room: str(f.room, 40), x: numOr(f.x, 0), z: numOr(f.z, 0), rot: ROT(f.rot),
    w: clamp(numOr(f.w, s.w), 0.02, 8), d: clamp(numOr(f.d, s.d), 0.01, 8),
    h: fullHeight ? flat.ceiling : clamp(numOr(f.h, s.h), 0.005, flat.ceiling),
    elev: clamp(numOr(f.elev, s.elev || 0), 0, flat.ceiling - 0.01),
    color: hexOr(f.color, s.color), mirror: !!f.mirror, fullHeight, opts,
  };
}

export function normalizeItem(i) {
  if (!i || !isShape(i.shape) || SHAPES[i.shape].fitting) return null;
  const s = SHAPES[i.shape];
  return {
    id: str(i.id, 40) || uid(), cat: str(i.cat, 60), shape: i.shape, name: str(i.name, 80) || s.label,
    w: clamp(numOr(i.w, s.w), 0.02, 6), d: clamp(numOr(i.d, s.d), 0.01, 6), h: clamp(numOr(i.h, s.h), 0.005, 3),
    color: hexOr(i.color, s.color), wall: !!i.wall,
    x: numOr(i.x, 0), z: numOr(i.z, 0), rot: ROT(i.rot), elev: clamp(numOr(i.elev, 0), 0, 3.5),
    mirror: !!i.mirror, room: str(i.room, 40),
  };
}

export function normalizeFlat(f) {
  f = f && typeof f === 'object' ? f : {};
  const flat = {
    format: FLAT_FORMAT,
    id: str(f.id, 40) || uid(),
    name: str(f.name, 80) || 'Untitled flat',
    address: str(f.address, 200),
    url: str(f.url, 500),
    rent: f.rent !== '' && f.rent !== null && f.rent !== undefined && Number.isFinite(+f.rent) ? Math.max(0, +f.rent) : null,
    rentPeriod: f.rentPeriod === 'week' ? 'week' : f.rentPeriod === 'sale' ? 'sale' : 'month',
    status: FLAT_STATUS[f.status] ? f.status : 'interested',
    notes: str(f.notes, 5000),
    // web addresses from the listing: its photos, and its floorplan picture
    photos: [...new Set((Array.isArray(f.photos) ? f.photos : []).map((u) => safeUrl(u)).filter((u) => u.startsWith('https:')))].slice(0, 40),
    floorplanUrl: (() => { const u = safeUrl(f.floorplanUrl); return u.startsWith('https:') ? u : ''; })(),
    created: numOr(f.created, Date.now()),
    updated: numOr(f.updated, Date.now()),
    ceiling: clamp(numOr(f.ceiling, 2.4), 2.0, 4.0),
    outerWall: clamp(numOr(f.outerWall, 0.25), 0.1, 0.6),
    innerWall: clamp(numOr(f.innerWall, 0.10), 0.05, 0.4),
    rooms: [], openings: [], fixtures: [],
    design: { paint: {}, wallPaint: {}, floor: {}, ceiling: DEFAULT_CEILING_PAINT, trim: DEFAULT_TRIM, items: [] },
    underlay: null,
  };
  const seen = new Set();
  for (const r of Array.isArray(f.rooms) ? f.rooms : []) {
    const room = normalizeRoom(r);
    if (seen.has(room.id)) room.id = uid();
    seen.add(room.id); flat.rooms.push(room);
  }
  for (const o of Array.isArray(f.openings) ? f.openings : []) { const op = normalizeOpening(o, flat); if (op) flat.openings.push(op); }
  for (const x of Array.isArray(f.fixtures) ? f.fixtures : []) { const fx = normalizeFixture(x, flat); if (fx) flat.fixtures.push(fx); }
  const d = f.design && typeof f.design === 'object' ? f.design : {};
  const ids = new Set(flat.rooms.map((r) => r.id));
  for (const [k, v] of Object.entries(d.paint || {})) if (ids.has(k) && isHex(v)) flat.design.paint[k] = v.toLowerCase();
  for (const [k, v] of Object.entries(d.wallPaint || {})) {
    if (!ids.has(k) || !v || typeof v !== 'object') continue;
    const m = {};
    for (const [e, c] of Object.entries(v)) if (isHex(c) && /^\d+$/.test(e)) m[e] = c.toLowerCase();
    if (Object.keys(m).length) flat.design.wallPaint[k] = m;
  }
  for (const [k, v] of Object.entries(d.floor || {})) if (ids.has(k) && FLOORS[v]) flat.design.floor[k] = v;
  flat.design.ceiling = hexOr(d.ceiling, DEFAULT_CEILING_PAINT);
  flat.design.trim = hexOr(d.trim, DEFAULT_TRIM);
  for (const i of Array.isArray(d.items) ? d.items : []) { const it = normalizeItem(i); if (it) flat.design.items.push(it); }
  const u = f.underlay;
  if (u && typeof u === 'object') {
    flat.underlay = {
      show: u.show !== false, x: numOr(u.x, 0), z: numOr(u.z, 0), width: clamp(numOr(u.width, 10), 0.5, 200),
      aspect: clamp(numOr(u.aspect, 0.75), 0.05, 20), rot: [0, 90, 180, 270].includes(+u.rot) ? +u.rot : 0,
      opacity: clamp(numOr(u.opacity, 0.6), 0.1, 1),
    };
  }
  return flat;
}

/** A copy of a flat with new ids for the flat itself, ready to save as another flat. */
export function cloneFlat(flat, over = {}) {
  const c = structuredClone(flat);
  return normalizeFlat({ ...c, id: uid(), created: Date.now(), updated: Date.now(), ...over });
}
