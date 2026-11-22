/* Your catalogue of furnishings: the things you own or want to buy, with their real
   sizes. Flats place items from here. */
import { SHAPES, isShape } from './shapes.js';
import { clamp, hexOr, numOr, str, uid } from './util.js';

/* The starter set, the same pieces the original 3D planner offered. The ids stay
   stable so layouts made with the old planner can find them again. */
const STARTER = [
  ['sofa3', 'sofa', '3-seat sofa', 'Seating', 2.10, 0.92, 0.85, '#5f6b73'],
  ['sofa2', 'sofa', '2-seat sofa', 'Seating', 1.65, 0.90, 0.85, '#8a7f6e'],
  ['cornerSofa', 'cornerSofa', 'Corner sofa', 'Seating', 2.60, 1.70, 0.85, '#e2b53e'],
  ['armchair', 'armchair', 'Armchair', 'Seating', 0.82, 0.86, 0.88, '#2f5d62'],
  ['ottoman', 'ottoman', 'Footstool', 'Seating', 0.60, 0.45, 0.42, '#b9a58a'],
  ['diningChair', 'diningChair', 'Dining chair', 'Seating', 0.45, 0.52, 0.88, '#3b3f44'],
  ['officeChair', 'officeChair', 'Desk chair', 'Seating', 0.62, 0.62, 1.05, '#2d2f33'],
  ['bedDouble', 'bed', 'Double bed', 'Bedroom', 1.45, 2.05, 1.00, '#8d949a'],
  ['bedKing', 'bed', 'King bed', 'Bedroom', 1.65, 2.15, 1.05, '#d9cfbf'],
  ['bedSingle', 'bed', 'Single bed', 'Bedroom', 1.00, 2.00, 0.90, '#c49a6c'],
  ['bedside', 'drawers', 'Bedside table', 'Bedroom', 0.45, 0.40, 0.50, '#c49a6c'],
  ['chest', 'drawers', 'Chest of drawers', 'Bedroom', 0.80, 0.45, 0.85, '#e8e2d6'],
  ['wardrobe', 'wardrobe', 'Wardrobe', 'Bedroom', 1.00, 0.60, 2.00, '#f0ede6'],
  ['coffeeTable', 'coffeeTable', 'Coffee table', 'Tables', 1.10, 0.60, 0.45, '#8b5e3c'],
  ['sideTable', 'sideTable', 'Side table', 'Tables', 0.45, 0.45, 0.55, '#c19a6b'],
  ['diningTable', 'diningTable', 'Dining table', 'Tables', 1.20, 0.80, 0.75, '#b98a5a'],
  ['desk', 'desk', 'Desk', 'Tables', 1.20, 0.60, 0.75, '#d9c7ae'],
  ['tvUnit', 'tvUnit', 'TV unit', 'Storage', 1.60, 0.40, 0.52, '#7b5b3e'],
  ['sideboard', 'sideboard', 'Sideboard', 'Storage', 1.60, 0.45, 0.80, '#e8e2d6'],
  ['bookcase', 'bookcase', 'Bookcase', 'Storage', 0.80, 0.30, 1.80, '#6e4f37'],
  ['cubeUnit', 'cubeUnit', 'Cube shelf', 'Storage', 0.77, 0.39, 0.77, '#f2f0eb'],
  ['wallShelf', 'wallShelf', 'Wall shelf', 'Storage', 0.80, 0.20, 0.03, '#b98a5a'],
  ['tv', 'tv', 'TV, 55 inch', 'Screen and lights', 1.23, 0.25, 0.78, '#18191c'],
  ['floorLamp', 'floorLamp', 'Floor lamp', 'Screen and lights', 0.40, 0.40, 1.60, '#e8dfcf'],
  ['rug', 'rug', 'Rug', 'Decor', 2.00, 1.40, 0.012, '#b7a796'],
  ['plant', 'plant', 'Plant', 'Decor', 0.40, 0.40, 1.00, '#d9d3c7'],
  ['art', 'art', 'Picture', 'Decor', 0.60, 0.03, 0.80, '#d66b4a'],
  ['box', 'box', 'Custom block', 'Anything else', 1.00, 0.50, 0.75, '#9aa5ab'],
];

export const STARTER_PREFIX = 'starter-';

export function starterCatalogue() {
  const now = Date.now();
  return STARTER.map(([kind, shape, name, category, w, d, h, color], i) => normalizeEntry({
    id: STARTER_PREFIX + kind, name, category, shape, w, d, h, color,
    elev: SHAPES[shape].elev || 0, wall: !!SHAPES[shape].wall, status: 'owned', qty: 1,
    notes: 'A typical size. Change it to match yours.', starter: true, created: now + i,
  }));
}

export const STATUS = { owned: 'I own this', buy: 'Want to buy' };

export function newEntry(shape = 'box', over = {}) {
  const s = SHAPES[shape] || SHAPES.box;
  return normalizeEntry({
    id: uid(), name: '', category: s.group, shape, w: s.w, d: s.d, h: s.h, elev: s.elev || 0,
    wall: !!s.wall, color: s.color, status: 'owned', qty: 1, price: null, url: '', notes: '', photo: '', created: Date.now(), ...over,
  });
}

export function normalizeEntry(e) {
  const shape = isShape(e && e.shape) && !SHAPES[e.shape].fitting ? e.shape : 'box';
  const s = SHAPES[shape];
  const price = e && e.price !== '' && e.price !== null && e.price !== undefined && Number.isFinite(+e.price) ? Math.max(0, +e.price) : null;
  return {
    id: str(e && e.id, 60) || uid(),
    name: str(e && e.name, 80) || s.label,
    category: str(e && e.category, 40) || s.group,
    shape,
    w: clamp(numOr(e && e.w, s.w), 0.02, 6),
    d: clamp(numOr(e && e.d, s.d), 0.01, 6),
    h: clamp(numOr(e && e.h, s.h), 0.005, 3),
    elev: clamp(numOr(e && e.elev, s.elev || 0), 0, 2.8),
    wall: e && e.wall !== undefined ? !!e.wall : !!s.wall,
    color: hexOr(e && e.color, s.color),
    status: e && e.status === 'buy' ? 'buy' : 'owned',
    qty: clamp(Math.round(numOr(e && e.qty, 1)), 1, 99),
    price,
    url: str(e && e.url, 500),
    notes: str(e && e.notes, 1000),
    photo: typeof (e && e.photo) === 'string' && e.photo.startsWith('data:image/') ? e.photo : '',
    starter: !!(e && e.starter),
    created: numOr(e && e.created, Date.now()),
  };
}

/** The fields a placed item copies from its catalogue entry. */
export function entryLook(e) {
  return { shape: e.shape, name: e.name, w: e.w, d: e.d, h: e.h, color: e.color, wall: e.wall };
}

export const dimsText = (e) => (SHAPES[e.shape]?.flat ? `${Math.round(e.w * 100)} × ${Math.round(e.d * 100)} cm` : `${Math.round(e.w * 100)} × ${Math.round(e.d * 100)} × ${Math.round(e.h * 100)} cm`);
