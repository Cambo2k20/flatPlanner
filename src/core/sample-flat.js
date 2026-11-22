/* The two-bedroom flat from the original 3D planner, rebuilt as data. The figures
   follow the original's listing measurements, floorplan and photos. W and D are the
   lounge's width and its length to the step by the shower room; H is the ceiling. */
import { normalizeFlat } from './flat-model.js';

export const SAMPLE_DEFAULTS = { W: 3.45, D: 4.09, H: 2.40 };

export function sampleFlat({ W = SAMPLE_DEFAULTS.W, D = SAMPLE_DEFAULTS.D, H = SAMPLE_DEFAULTS.H } = {}, over = {}) {
  const Xs = 1.10, S = 0.25;                                    // the door end of the lounge is 25 cm deeper
  const kx1 = 1.50, kw = 2.29, kd = 3.43, kx0 = kx1 - kw, kz1 = -0.20, kz0 = kz1 - kd;
  const hz0 = D + S + 0.12, hz1 = hz0 + 1.30, hx1 = Xs, hx0 = Xs - 2.54;
  const bz0 = hz1 + 0.10, bz1 = bz0 + 3.89;
  const bmx0 = W - 3.53, bsx1 = bmx0 - 0.10, bsx0 = bsx1 - 2.29;
  const sx0 = Xs + 0.10, sz0 = D + 0.12, nx0 = W - 0.92, nz1 = sz0 + 2.30;
  const win1 = W - 0.18, win0 = Math.max(1.48, win1 - 1.43);
  const mainDoor0 = Math.min(bmx0 + 0.08, hx1 - 0.86);
  const smallDoor0 = Math.max(hx0 + 0.06, bsx1 - 0.90);
  const bw = W - bmx0, sw = bsx1 - bsx0;
  const radZ0 = D + S - 0.95, radZ1 = D + S - 0.10;

  const rooms = [
    { id: 'lounge', name: 'Lounge', type: 'living', x: 0, z: 0, w: W, d: D + S, notch: { corner: 'se', w: W - Xs, d: S } },
    { id: 'kitchen', name: 'Kitchen', type: 'kitchen', x: kx0, z: kz0, w: kw, d: kd },
    { id: 'hall', name: 'Hall', type: 'hall', x: hx0, z: hz0, w: hx1 - hx0, d: hz1 - hz0 },
    { id: 'shower', name: 'Shower room', type: 'bathroom', x: sx0, z: sz0, w: W - sx0, d: nz1 - sz0, notch: { corner: 'sw', w: nx0 - sx0, d: nz1 - hz1 } },
    { id: 'bedMain', name: 'Main bedroom', type: 'bedroom', x: bmx0, z: bz0, w: bw, d: bz1 - bz0, notch: { corner: 'ne', w: W - (nx0 - 0.10), d: nz1 + 0.10 - bz0 } },
    { id: 'bedSmall', name: 'Second bedroom', type: 'bedroom', x: bsx0, z: bz0, w: sw, d: bz1 - bz0 },
  ];

  // Edges run clockwise from the top wall: see roomPolygon(). Lounge: 0 window wall,
  // 1 feature wall, 2–4 the door end (with its step), 5 radiator wall.
  const openings = [
    { id: 'w-lounge', room: 'lounge', edge: 0, kind: 'window', pos: win0, width: win1 - win0, sill: 1.0, top: Math.min(2.12, H - 0.16), frameLift: 0.03, sillBoard: false },
    { id: 'o-kitchen', room: 'lounge', edge: 0, kind: 'opening', pos: 0.10, width: 1.23, top: Math.min(2.0, H - 0.25) },
    { id: 'd-lounge', room: 'lounge', edge: 4, kind: 'door', style: 'glazed', pos: 0.10, width: 0.80, top: Math.min(2.03, H - 0.15), hinge: 'end', swing: 'in' },
    { id: 'w-kitchen', room: 'kitchen', edge: 0, kind: 'window', pos: 0.245 * kw, width: 0.455 * kw, sill: 1.05, top: Math.min(2.10, H - 0.18) },
    { id: 'd-front', room: 'hall', edge: 0, kind: 'door', pos: 0.20, width: 0.82, top: Math.min(2.03, H - 0.15), hinge: 'end', swing: 'in' },
    { id: 'd-shower', room: 'hall', edge: 1, kind: 'door', pos: 0.23, width: 0.76, top: Math.min(2.03, H - 0.15), hinge: 'end', swing: 'out' },
    { id: 'd-bedMain', room: 'bedMain', edge: 0, kind: 'door', pos: mainDoor0 - bmx0, width: 0.78, top: Math.min(2.03, H - 0.15), hinge: 'start', swing: 'in' },
    { id: 'd-bedSmall', room: 'bedSmall', edge: 0, kind: 'door', pos: smallDoor0 - bsx0, width: 0.78, top: Math.min(2.03, H - 0.15), hinge: 'end', swing: 'in' },
    { id: 'w-bedMain', room: 'bedMain', edge: 4, kind: 'window', pos: 0.29 * bw, width: 0.31 * bw, sill: 0.9, top: Math.min(2.1, H - 0.2) },
    { id: 'w-bedSmall', room: 'bedSmall', edge: 2, kind: 'window', pos: 0.32 * sw, width: 0.43 * sw, sill: 0.9, top: Math.min(2.1, H - 0.2) },
  ];

  const fixtures = [
    { id: 'f-kit-n', shape: 'kitchenUnits', name: 'Kitchen units', room: 'kitchen', x: kx0 + kw / 2, z: kz0 + 0.3, rot: 0, w: kw, d: 0.6, h: 0.92, color: '#b98b5c', opts: { sink: 0.57, hob: null, splash: 0.12 } },
    { id: 'f-kit-w', shape: 'kitchenUnits', name: 'Kitchen units', room: 'kitchen', x: kx0 + 0.3, z: (kz0 + 0.6 + kz1) / 2, rot: 270, w: kd - 0.6, d: 0.6, h: 0.92, color: '#b98b5c', opts: { sink: null, hob: 0.735, splash: 0.6 } },
    { id: 'f-vanity', shape: 'vanity', name: 'Basin unit', room: 'shower', x: (sx0 + W) / 2, z: sz0 + 0.17, rot: 0, w: W - sx0, d: 0.34, h: 0.88, color: '#f4f4f2', opts: { basin: 0.62 / (W - sx0) } },
    { id: 'f-toilet', shape: 'toilet', name: 'Toilet', room: 'shower', x: W - 0.42, z: sz0 + 0.60, rot: 0, w: 0.40, d: 0.52, h: 0.46, color: '#f7f7f5' },
    { id: 'f-shower', shape: 'shower', name: 'Shower', room: 'shower', x: (nx0 + W) / 2, z: (hz1 + nz1) / 2, rot: 180, w: W - nx0, d: nz1 - hz1, h: 2.0, color: '#f7f7f5' },
    { id: 'f-radiator', shape: 'radiator', name: 'Radiator', room: 'lounge', x: 0.065, z: (radZ0 + radZ1) / 2, rot: 270, w: radZ1 - radZ0, d: 0.13, h: 0.60, elev: 0.14, color: '#f1f0ec' },
    { id: 'f-ledge', shape: 'boxing', name: 'Window ledge', room: 'lounge', x: 1.33 + (W - 1.33) / 2, z: 0.09, rot: 0, w: W - 1.33, d: 0.18, h: 1.03, color: '#e8e4dc', opts: { cap: '#1c2125' } },
    { id: 'f-ward-main', shape: 'builtInWardrobe', name: 'Built-in wardrobe', room: 'bedMain', x: bmx0 + 0.30, z: (bz0 + 1.16 + bz1) / 2, rot: 270, w: bz1 - bz0 - 1.16, d: 0.60, fullHeight: true, color: '#f1efea' },
    { id: 'f-ward-small', shape: 'builtInWardrobe', name: 'Built-in wardrobe', room: 'bedSmall', x: bsx0 + 0.54, z: bz0 + 0.40, rot: 0, w: 1.08, d: 0.80, fullHeight: true, color: '#f1efea' },
  ];

  const design = {
    paint: { lounge: '#e8e4dc', kitchen: '#ebe8e2', hall: '#ebe7e0', shower: '#eceeed', bedMain: '#e7e4de', bedSmall: '#e7e4de' },
    wallPaint: { lounge: { 1: '#22566a' } },
    floor: { lounge: 'oak', hall: 'oak', kitchen: 'tileDark', shower: 'tileDark', bedMain: 'carpetOat', bedSmall: 'carpetOat' },
    ceiling: '#f5f3ef', trim: '#c27d42', items: [],
  };

  return normalizeFlat({
    name: 'Two-bedroom flat (sample)',
    notes: 'The flat from the original 3D planner, built from the listing’s measurements, floorplan and photos. Door, window and wardrobe positions are scaled from the floorplan and photos, so allow about ±10 cm on those.',
    ceiling: H, outerWall: 0.25, innerWall: 0.10,
    rooms, openings, fixtures, design, ...over,
  });
}

/** A blank flat with one room, a door and a window, to trace a new listing from. */
export function blankFlat(over = {}) {
  return normalizeFlat({
    name: 'New flat', ceiling: 2.4, outerWall: 0.25, innerWall: 0.10,
    rooms: [{ id: 'room1', name: 'Living room', type: 'living', x: 0, z: 0, w: 4.2, d: 3.6 }],
    openings: [
      { id: 'w1', room: 'room1', edge: 0, kind: 'window', pos: 1.4, width: 1.4, sill: 0.9, top: 2.1 },
      { id: 'd1', room: 'room1', edge: 2, kind: 'door', pos: 0.3, width: 0.8, top: 2.03, hinge: 'start', swing: 'in' },
    ],
    ...over,
  });
}
