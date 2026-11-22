import { describe, expect, it } from 'vitest';
import { newEntry, normalizeEntry, roomForEntry, starterCatalogue } from '../src/core/catalogue.js';
import { entriesFromCsv, entriesToCsv } from '../src/core/files.js';

/* An entry as saved before version 2: no room, no v, starters marked as owned. */
const oldStarter = (over = {}) => ({
  id: 'starter-bedKing', name: 'King bed', category: 'Bedroom', shape: 'bed', w: 1.65, d: 2.15, h: 1.05, elev: 0, wall: false,
  color: '#d9cfbf', status: 'owned', qty: 1, price: null, url: '', notes: 'A typical size. Change it to match yours.', photo: '', starter: true, created: 1, ...over,
});

describe('catalogue', () => {
  it('starts with examples, grouped by what they are and tagged with a room', () => {
    const cat = starterCatalogue();
    expect(cat.every((e) => e.status === 'example')).toBe(true);
    const by = Object.fromEntries(cat.map((e) => [e.id.replace('starter-', ''), e]));
    expect(by.bedDouble).toMatchObject({ category: 'Beds', room: 'bedroom' });
    expect(by.wardrobe).toMatchObject({ category: 'Storage', room: 'bedroom' });
    expect(by.tv).toMatchObject({ category: 'Electronics', room: 'living' });
    expect(by.floorLamp.category).toBe('Lighting');
    expect(by.desk.room).toBe('study');
    expect(by.plant.room).toBe('');
    expect(cat.some((e) => e.category === 'Bedroom' || e.category === 'Screen and lights')).toBe(false);
  });

  it('turns an untouched old starter into an example and moves it out of "Bedroom"', () => {
    const e = normalizeEntry(oldStarter());
    expect(e).toMatchObject({ status: 'example', category: 'Beds', room: 'bedroom', v: 2 });
  });

  it('keeps an old starter you changed as yours', () => {
    expect(normalizeEntry(oldStarter({ w: 1.8 })).status).toBe('owned');
    expect(normalizeEntry(oldStarter({ qty: 2 })).status).toBe('owned');
    expect(normalizeEntry(oldStarter({ notes: 'Ours, from IKEA' })).status).toBe('owned');
    expect(normalizeEntry(oldStarter({ status: 'buy' })).status).toBe('buy');
  });

  it('upgrades only once, so you can mark an example as yours', () => {
    const upgraded = normalizeEntry(oldStarter());
    const mine = normalizeEntry({ ...upgraded, status: 'owned' });
    expect(normalizeEntry(mine).status).toBe('owned');
    expect(normalizeEntry({ ...upgraded, category: 'Bedroom' }).category).toBe('Bedroom');
  });

  it('upgrades old groups on your own items, and leaves your own groups alone', () => {
    expect(normalizeEntry({ name: 'Bedside', shape: 'drawers', category: 'Bedroom' })).toMatchObject({ category: 'Storage', room: 'bedroom' });
    expect(normalizeEntry({ name: 'Lamp', shape: 'floorLamp', category: 'Screen and lights' }).category).toBe('Lighting');
    expect(normalizeEntry({ name: 'Monitor', shape: 'tv', category: 'Screen and lights' }).category).toBe('Electronics');
    expect(normalizeEntry({ name: 'Mic', shape: 'box', category: 'Streaming kit' })).toMatchObject({ category: 'Streaming kit', room: '' });
    expect(normalizeEntry({ name: 'Sofa', shape: 'sofa', room: 'nowhere' }).room).toBe('');
  });

  it('gives new items the room their shape usually goes in', () => {
    expect(newEntry('bed').room).toBe('bedroom');
    expect(newEntry('desk').room).toBe('study');
    expect(newEntry('box').room).toBe('');
  });

  it('picks the room a new item goes in', () => {
    const area = (r) => r.a;
    const rooms = [
      { id: 'liv', type: 'living', a: 16 }, { id: 'b1', type: 'bedroom', a: 12 }, { id: 'b2', type: 'bedroom', a: 9 },
      { id: 'kit', type: 'kitchen', a: 7 }, { id: 'hall', type: 'hall', a: 5 },
    ];
    expect(roomForEntry(rooms, { room: 'bedroom' }, area).id).toBe('b1');
    expect(roomForEntry(rooms, { room: 'dining' }, area).id).toBe('kit');
    expect(roomForEntry(rooms, { room: 'study' }, area).id).toBe('liv');
    expect(roomForEntry(rooms, { room: 'hall' }, area).id).toBe('hall');
    expect(roomForEntry(rooms, { room: '' }, area).id).toBe('liv');
    expect(roomForEntry(rooms, null, area).id).toBe('liv');
    expect(roomForEntry([{ id: 'studio', type: 'other', a: 30 }, { id: 'bath', type: 'bathroom', a: 4 }], { room: 'bedroom' }, area).id).toBe('studio');
    expect(roomForEntry([], { room: 'bedroom' }, area)).toBe(null);
  });

  it('reads a microwave from a spreadsheet and puts it at worktop height', () => {
    const [m] = entriesFromCsv('name,shape,width_cm,depth_cm,height_cm,status,price\nMorphy Richards 20L,microwave,44,34,26,want to buy,45\n');
    expect(m).toMatchObject({ shape: 'microwave', category: 'Appliances', room: 'kitchen', status: 'buy', price: 45 });
    expect(m.elev).toBeCloseTo(0.92);
  });

  it('reads a desk on drawer units from a spreadsheet', () => {
    const [d] = entriesFromCsv('name,shape,width_cm,depth_cm,height_cm,status\nMy desk,Desk on drawer units,140,60,75,own\n');
    expect(d).toMatchObject({ shape: 'drawerDesk', category: 'Tables', room: 'study', w: 1.4, d: 0.6, h: 0.75, status: 'owned' });
  });

  it('reads a PC tower from a spreadsheet', () => {
    const [pc] = entriesFromCsv('name,shape,width_cm,depth_cm,height_cm,status\nMy PC,PC tower,23.1,45,46.3,own\n');
    expect(pc).toMatchObject({ shape: 'pcTower', category: 'Electronics', room: 'study', status: 'owned' });
    expect(pc.w).toBeCloseTo(0.231); expect(pc.h).toBeCloseTo(0.463);
  });

  it('keeps rooms and examples through a spreadsheet', () => {
    const cat = [newEntry('bed', { name: 'Our bed' }), newEntry('box', { name: 'Bike', room: 'hall' }), newEntry('plant', { name: 'Fern', room: '' }), ...starterCatalogue().slice(0, 1)];
    const back = entriesFromCsv(entriesToCsv(cat));
    expect(back.map((e) => e.room)).toEqual(['bedroom', 'hall', '', 'living']);
    expect(back.map((e) => e.status)).toEqual(['owned', 'owned', 'owned', 'example']);
    const typed = entriesFromCsv('name,shape,room,status\nDesk,desk,Bedroom,own\nShelf,bookcase,,own\n');
    expect(typed.map((e) => e.room)).toEqual(['bedroom', '']);
  });
});
