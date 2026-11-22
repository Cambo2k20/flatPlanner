/* The 3D shapes the planner can draw. A catalogue item picks one of these and gives
   it real dimensions; fittings (kitchen units, toilets, radiators…) belong to a flat
   rather than to your catalogue. Sizes are in metres. */

export const SHAPES = {
  // ---- furniture
  sofa: { label: 'Sofa', group: 'Seating', w: 2.10, d: 0.92, h: 0.85, color: '#5f6b73' },
  cornerSofa: { label: 'Corner sofa', group: 'Seating', w: 2.60, d: 1.70, h: 0.85, color: '#e2b53e', mirrorable: true },
  armchair: { label: 'Armchair', group: 'Seating', w: 0.82, d: 0.86, h: 0.88, color: '#2f5d62' },
  ottoman: { label: 'Footstool or pouffe', group: 'Seating', w: 0.60, d: 0.45, h: 0.42, color: '#b9a58a' },
  diningChair: { label: 'Dining chair', group: 'Seating', w: 0.45, d: 0.52, h: 0.88, color: '#3b3f44' },
  officeChair: { label: 'Desk chair', group: 'Seating', w: 0.62, d: 0.62, h: 1.05, color: '#2d2f33' },
  bed: { label: 'Bed', group: 'Bedroom', w: 1.45, d: 2.05, h: 1.00, color: '#8d949a' },
  drawers: { label: 'Drawers or bedside table', group: 'Bedroom', w: 0.80, d: 0.45, h: 0.85, color: '#e8e2d6' },
  wardrobe: { label: 'Wardrobe', group: 'Bedroom', w: 1.00, d: 0.60, h: 2.00, color: '#f0ede6' },
  coffeeTable: { label: 'Coffee table', group: 'Tables', w: 1.10, d: 0.60, h: 0.45, color: '#8b5e3c' },
  sideTable: { label: 'Round side table', group: 'Tables', w: 0.45, d: 0.45, h: 0.55, color: '#c19a6b' },
  diningTable: { label: 'Dining table', group: 'Tables', w: 1.20, d: 0.80, h: 0.75, color: '#b98a5a' },
  desk: { label: 'Desk', group: 'Tables', w: 1.20, d: 0.60, h: 0.75, color: '#d9c7ae' },
  tvUnit: { label: 'TV unit', group: 'Storage', w: 1.60, d: 0.40, h: 0.52, color: '#7b5b3e' },
  sideboard: { label: 'Sideboard', group: 'Storage', w: 1.60, d: 0.45, h: 0.80, color: '#e8e2d6' },
  bookcase: { label: 'Bookcase', group: 'Storage', w: 0.80, d: 0.30, h: 1.80, color: '#6e4f37' },
  cubeUnit: { label: 'Cube shelf', group: 'Storage', w: 0.77, d: 0.39, h: 0.77, color: '#f2f0eb' },
  wallShelf: { label: 'Wall shelf', group: 'Storage', w: 0.80, d: 0.20, h: 0.03, elev: 1.40, color: '#b98a5a', wall: true },
  tv: { label: 'TV', group: 'Screen and lights', w: 1.23, d: 0.25, h: 0.78, color: '#18191c' },
  floorLamp: { label: 'Floor lamp', group: 'Screen and lights', w: 0.40, d: 0.40, h: 1.60, color: '#e8dfcf' },
  rug: { label: 'Rug', group: 'Decor', w: 2.00, d: 1.40, h: 0.012, color: '#b7a796', flat: true },
  plant: { label: 'Plant', group: 'Decor', w: 0.40, d: 0.40, h: 1.00, color: '#d9d3c7' },
  art: { label: 'Picture or mirror', group: 'Decor', w: 0.60, d: 0.03, h: 0.80, elev: 1.25, color: '#d66b4a', wall: true },
  box: { label: 'Block (anything else)', group: 'Anything else', w: 1.00, d: 0.50, h: 0.75, color: '#9aa5ab' },

  // ---- fixed fittings, part of a flat
  kitchenUnits: { label: 'Kitchen base units', group: 'Kitchen', fitting: true, w: 2.40, d: 0.60, h: 0.92, color: '#b98b5c', opts: { sink: 0.5, hob: null, splash: 0.12 } },
  wallUnits: { label: 'Kitchen wall cupboards', group: 'Kitchen', fitting: true, w: 1.80, d: 0.35, h: 0.72, elev: 1.45, color: '#b98b5c', wall: true },
  fridge: { label: 'Fridge freezer', group: 'Kitchen', fitting: true, w: 0.60, d: 0.65, h: 1.80, color: '#e9eaeb' },
  toilet: { label: 'Toilet', group: 'Bathroom', fitting: true, w: 0.38, d: 0.68, h: 0.80, color: '#f7f7f5' },
  vanity: { label: 'Basin unit', group: 'Bathroom', fitting: true, w: 0.60, d: 0.45, h: 0.85, color: '#f4f4f2', opts: { basin: 0.5 } },
  bath: { label: 'Bath', group: 'Bathroom', fitting: true, w: 1.70, d: 0.70, h: 0.55, color: '#f7f7f5' },
  shower: { label: 'Shower', group: 'Bathroom', fitting: true, w: 0.90, d: 0.90, h: 2.00, color: '#f7f7f5' },
  radiator: { label: 'Radiator', group: 'Heating and built-ins', fitting: true, w: 0.80, d: 0.10, h: 0.60, elev: 0.14, color: '#f1f0ec', wall: true },
  builtInWardrobe: { label: 'Built-in wardrobe', group: 'Heating and built-ins', fitting: true, w: 1.20, d: 0.60, h: 2.40, color: '#f1efea', fullHeight: true },
  boxing: { label: 'Boxing, ledge or chimney breast', group: 'Heating and built-ins', fitting: true, w: 0.60, d: 0.30, h: 1.00, color: '#e8e4dc', opts: { cap: null } },
};

export const FURNITURE_SHAPES = Object.keys(SHAPES).filter((k) => !SHAPES[k].fitting);
export const FITTING_SHAPES = Object.keys(SHAPES).filter((k) => SHAPES[k].fitting);
export const isShape = (k) => typeof k === 'string' && Object.prototype.hasOwnProperty.call(SHAPES, k);

export const CATEGORIES = ['Seating', 'Bedroom', 'Tables', 'Storage', 'Screen and lights', 'Decor', 'Anything else'];
