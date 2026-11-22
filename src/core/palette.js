/* Colours, finishes and room types. Plain data: no three.js here. */

export const PAINTS = [
  ['#e8e4dc', 'Off-white'], ['#f6f5f1', 'White'], ['#d8d2c6', 'Greige'], ['#c1cbc0', 'Sage'],
  ['#a9b9c5', 'Blue-grey'], ['#e5d1b4', 'Sand'], ['#c79f82', 'Clay'], ['#22566a', 'Teal'],
  ['#2b394e', 'Navy'], ['#3c4a3a', 'Forest'], ['#6b3a3a', 'Oxblood'], ['#3a3b3e', 'Charcoal'],
];

export const FABRICS = [
  ['#e2b53e', 'Mustard'], ['#2f5d62', 'Teal'], ['#1f3a5f', 'Navy'], ['#3b3f44', 'Charcoal'],
  ['#8d949a', 'Grey'], ['#d9cfbf', 'Oatmeal'], ['#b5654a', 'Rust'], ['#6b7a4b', 'Olive'],
  ['#d8a7a0', 'Blush'], ['#f3f0ea', 'White'], ['#7b5b3e', 'Walnut'], ['#c49a6c', 'Oak'],
];

export const TRIMS = [['#c27d42', 'Pine'], ['#f3f1ec', 'White'], ['#d4b58d', 'Light oak'], ['#6f4b33', 'Walnut'], ['#7d8387', 'Grey']];

export const FLOORS = {
  oak: { label: 'Oak', swatch: '#c39466', tones: ['#c39466', '#bb8b5c', '#c99d70', '#bf9062', '#cca476', '#b78658'] },
  lightOak: { label: 'Light oak', swatch: '#dcbf96', tones: ['#dcbf96', '#d3b386', '#e3c9a3', '#d8ba8f', '#cfae80'] },
  walnut: { label: 'Walnut', swatch: '#6e4a32', tones: ['#6e4a32', '#5f3f2a', '#7a543a', '#664530', '#573926'] },
  greyOak: { label: 'Grey oak', swatch: '#a9a29a', tones: ['#a9a29a', '#9d968d', '#b3ada5', '#a39b91', '#958e85'] },
  carpetOat: { label: 'Oatmeal carpet', swatch: '#cbbfae', carpet: '#cbbfae' },
  carpetGrey: { label: 'Grey carpet', swatch: '#8e9195', carpet: '#8e9195' },
  tileDark: { label: 'Dark tiles', swatch: '#4b5056', tile: { grout: '#3d4247', base: [72, 76, 81], spread: 16, size: 0.6 } },
  tileLight: { label: 'Light tiles', swatch: '#d8d8d4', tile: { grout: '#b9b9b4', base: [214, 214, 210], spread: 10, size: 0.45 } },
};

export const ROOM_TYPES = {
  living: { label: 'Living room', paint: '#e8e4dc', floor: 'oak' },
  kitchen: { label: 'Kitchen', paint: '#ebe8e2', floor: 'tileDark', noSkirt: true },
  dining: { label: 'Dining room', paint: '#e8e4dc', floor: 'oak' },
  bedroom: { label: 'Bedroom', paint: '#e7e4de', floor: 'carpetOat' },
  bathroom: { label: 'Bathroom', paint: '#eceeed', floor: 'tileDark', noSkirt: true, noCove: true, gloss: true },
  hall: { label: 'Hall or landing', paint: '#ebe7e0', floor: 'oak' },
  study: { label: 'Study', paint: '#e8e4dc', floor: 'oak' },
  storage: { label: 'Cupboard or utility', paint: '#ebe8e2', floor: 'oak' },
  other: { label: 'Other', paint: '#e8e4dc', floor: 'oak' },
};

export const FLAT_STATUS = {
  interested: 'Interested',
  viewing: 'Viewing booked',
  viewed: 'Viewed',
  applied: 'Applied',
  no: 'Not for me',
};

export const DEFAULT_CEILING_PAINT = '#f5f3ef';
export const DEFAULT_TRIM = '#c27d42';
