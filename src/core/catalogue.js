/* Your catalogue of furnishings: the things you own or want to buy, with their real
   sizes. Flats place items from here. */
import { ITEM_ROOMS, SHAPES, isShape } from './shapes.js';
import { clamp, hexOr, numOr, str, uid } from './util.js';

/* The starter set, the same pieces the original 3D planner offered. They start as
   examples (typical sizes, not things you own). The ids stay stable so layouts made with
   the old planner can find them again. */
const STARTER = [
  ['sofa3', 'sofa', '3-seat sofa', 'Seating', 2.10, 0.92, 0.85, '#5f6b73'],
  ['sofa2', 'sofa', '2-seat sofa', 'Seating', 1.65, 0.90, 0.85, '#8a7f6e'],
  ['cornerSofa', 'cornerSofa', 'Corner sofa', 'Seating', 2.60, 1.70, 0.85, '#e2b53e'],
  ['armchair', 'armchair', 'Armchair', 'Seating', 0.82, 0.86, 0.88, '#2f5d62'],
  ['ottoman', 'ottoman', 'Footstool', 'Seating', 0.60, 0.45, 0.42, '#b9a58a'],
  ['diningChair', 'diningChair', 'Dining chair', 'Seating', 0.45, 0.52, 0.88, '#3b3f44'],
  ['officeChair', 'officeChair', 'Desk chair', 'Seating', 0.62, 0.62, 1.05, '#2d2f33'],
  ['bedDouble', 'bed', 'Double bed', 'Beds', 1.45, 2.05, 1.00, '#8d949a'],
  ['bedKing', 'bed', 'King bed', 'Beds', 1.65, 2.15, 1.05, '#d9cfbf'],
  ['bedSingle', 'bed', 'Single bed', 'Beds', 1.00, 2.00, 0.90, '#c49a6c'],
  ['bedside', 'drawers', 'Bedside table', 'Storage', 0.45, 0.40, 0.50, '#c49a6c'],
  ['chest', 'drawers', 'Chest of drawers', 'Storage', 0.80, 0.45, 0.85, '#e8e2d6'],
  ['wardrobe', 'wardrobe', 'Wardrobe', 'Storage', 1.00, 0.60, 2.00, '#f0ede6'],
  ['coffeeTable', 'coffeeTable', 'Coffee table', 'Tables', 1.10, 0.60, 0.45, '#8b5e3c'],
  ['sideTable', 'sideTable', 'Side table', 'Tables', 0.45, 0.45, 0.55, '#c19a6b'],
  ['diningTable', 'diningTable', 'Dining table', 'Tables', 1.20, 0.80, 0.75, '#b98a5a'],
  ['desk', 'desk', 'Desk', 'Tables', 1.20, 0.60, 0.75, '#d9c7ae'],
  ['tvUnit', 'tvUnit', 'TV unit', 'Storage', 1.60, 0.40, 0.52, '#7b5b3e'],
  ['sideboard', 'sideboard', 'Sideboard', 'Storage', 1.60, 0.45, 0.80, '#e8e2d6'],
  ['bookcase', 'bookcase', 'Bookcase', 'Storage', 0.80, 0.30, 1.80, '#6e4f37'],
  ['cubeUnit', 'cubeUnit', 'Cube shelf', 'Storage', 0.77, 0.39, 0.77, '#f2f0eb'],
  ['wallShelf', 'wallShelf', 'Wall shelf', 'Storage', 0.80, 0.20, 0.03, '#b98a5a'],
  ['tv', 'tv', 'TV, 55 inch', 'Electronics', 1.23, 0.25, 0.78, '#18191c'],
  ['monitor', 'monitor', 'Computer monitor, 24 inch', 'Electronics', 0.54, 0.19, 0.41, '#232528'],
  ['shoeCabinet', 'sideboard', 'Shoe cabinet', 'Storage', 0.80, 0.30, 1.00, '#f0ede6', 'hall'],
  ['sofaBed', 'sofa', 'Sofa bed', 'Seating', 1.90, 0.90, 0.85, '#6f7a80'],
  ['microwave', 'microwave', 'Microwave', 'Appliances', 0.44, 0.34, 0.26, '#c3c7cb'],
  ['floorLamp', 'floorLamp', 'Floor lamp', 'Lighting', 0.40, 0.40, 1.60, '#e8dfcf'],
  ['rug', 'rug', 'Rug', 'Decor', 2.00, 1.40, 0.012, '#b7a796'],
  ['plant', 'plant', 'Plant', 'Decor', 0.40, 0.40, 1.00, '#d9d3c7'],
  ['art', 'art', 'Picture', 'Decor', 0.60, 0.03, 0.80, '#d66b4a'],
  ['box', 'box', 'Custom block', 'Anything else', 1.00, 0.50, 0.75, '#9aa5ab'],
];

export const STARTER_PREFIX = 'starter-';
const STARTER_NOTE = 'A typical size. Change it to match yours.';
const STARTER_BY_ID = Object.fromEntries(STARTER.map((row) => [STARTER_PREFIX + row[0], row]));

export function starterCatalogue() {
  const now = Date.now();
  return STARTER.map(([kind, shape, name, category, w, d, h, color, room], i) => normalizeEntry({
    id: STARTER_PREFIX + kind, name, category, shape, w, d, h, color, ...(room === undefined ? {} : { room }),
    elev: SHAPES[shape].elev || 0, wall: !!SHAPES[shape].wall, status: 'example', qty: 1,
    notes: STARTER_NOTE, starter: true, created: now + i, v: ENTRY_VERSION,
  }));
}

export const STATUS = { owned: 'I own this', buy: 'Want to buy', example: 'Example' };

/** The version of an entry's fields. 2: groups say what a thing is, rooms are separate,
    and untouched starters are examples. Older entries are upgraded as they load. */
export const ENTRY_VERSION = 2;

export function newEntry(shape = 'box', over = {}) {
  const s = SHAPES[shape] || SHAPES.box;
  return normalizeEntry({
    id: uid(), name: '', category: s.group, room: s.room || '', shape, w: s.w, d: s.d, h: s.h, elev: s.elev || 0,
    wall: !!s.wall, color: s.color, status: 'owned', qty: 1, price: null, url: '', notes: '', photo: '', created: Date.now(), v: ENTRY_VERSION, ...over,
  });
}

/* Upgrading an entry saved before version 2. The old groups mixed rooms in: "Bedroom"
   and "Screen and lights". A starter you never changed becomes an example. */
function upgrade(e, shape) {
  const s = SHAPES[shape];
  let { category, room, status } = e;
  if (category === 'Bedroom') { category = s.group; if (room === undefined) room = 'bedroom'; }
  else if (category === 'Screen and lights') category = s.group === 'Lighting' ? 'Lighting' : 'Electronics';
  const row = STARTER_BY_ID[e.id];
  const close = (a, b) => Math.abs(+a - b) < 0.0015;
  if (row && e.starter && status !== 'buy' && (e.qty === undefined || +e.qty === 1) && (e.price === null || e.price === undefined || e.price === '')
    && !e.url && !e.photo && (e.notes || '') === STARTER_NOTE && e.name === row[2] && e.shape === row[1]
    && close(e.w, row[4]) && close(e.d, row[5]) && close(e.h, row[6]) && String(e.color).toLowerCase() === row[7]) status = 'example';
  return { ...e, category, room, status };
}

export function normalizeEntry(e) {
  const shape = isShape(e && e.shape) && !SHAPES[e.shape].fitting ? e.shape : 'box';
  const s = SHAPES[shape];
  if (e && !(e.v >= ENTRY_VERSION)) e = upgrade(e, shape);
  const price = e && e.price !== '' && e.price !== null && e.price !== undefined && Number.isFinite(+e.price) ? Math.max(0, +e.price) : null;
  const room = e && typeof e.room === 'string' ? (Object.hasOwn(ITEM_ROOMS, e.room) ? e.room : '') : (s.room || '');
  return {
    id: str(e && e.id, 60) || uid(),
    name: str(e && e.name, 80) || s.label,
    category: str(e && e.category, 40) || s.group,
    room,
    shape,
    w: clamp(numOr(e && e.w, s.w), 0.02, 6),
    d: clamp(numOr(e && e.d, s.d), 0.01, 6),
    h: clamp(numOr(e && e.h, s.h), 0.005, 3),
    elev: clamp(numOr(e && e.elev, s.elev || 0), 0, 2.8),
    wall: e && e.wall !== undefined ? !!e.wall : !!s.wall,
    color: hexOr(e && e.color, s.color),
    status: e && (e.status === 'buy' || e.status === 'example') ? e.status : 'owned',
    qty: clamp(Math.round(numOr(e && e.qty, 1)), 1, 99),
    price,
    url: str(e && e.url, 500),
    notes: str(e && e.notes, 1000),
    photo: typeof (e && e.photo) === 'string' && e.photo.startsWith('data:image/') ? e.photo : '',
    starter: !!(e && e.starter),
    created: numOr(e && e.created, Date.now()),
    v: ENTRY_VERSION,
  };
}

/* Where a new item goes when you're looking at the whole flat: the biggest room of the
   type it's meant for, then a close match, then the living room, then the biggest room. */
const ROOM_FALLBACK = { dining: ['kitchen'], kitchen: ['dining'], study: [], hall: [] };
export function roomForEntry(rooms, entry, area) {
  const bySize = rooms.slice().sort((a, b) => area(b) - area(a));
  const want = entry && entry.room;
  for (const t of [...(want ? [want, ...(ROOM_FALLBACK[want] || [])] : []), 'living']) {
    const r = bySize.find((x) => x.type === t);
    if (r) return r;
  }
  return bySize[0] || null;
}

/** The fields a placed item copies from its catalogue entry. */
export function entryLook(e) {
  return { shape: e.shape, name: e.name, w: e.w, d: e.d, h: e.h, color: e.color, wall: e.wall };
}

export const dimsText = (e) => (SHAPES[e.shape]?.flat ? `${Math.round(e.w * 100)} × ${Math.round(e.d * 100)} cm` : `${Math.round(e.w * 100)} × ${Math.round(e.d * 100)} × ${Math.round(e.h * 100)} cm`);
