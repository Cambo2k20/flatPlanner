import { describe, expect, it } from 'vitest';
import { starterCatalogue } from '../src/core/catalogue.js';
import { entriesFromCsv, entriesToCsv, flatFile, readFile } from '../src/core/files.js';
import { sampleFlat } from '../src/core/sample-flat.js';

const legacy = {
  app: 'flat-3d-planner', version: 2,
  state: {
    room: { W: 3.5, D: 4.1, H: 2.45, paint: { north: '#f6f5f1', east: '#2b394e', south: '#f6f5f1', west: '#c1cbc0', ceiling: '#f5f3ef', kitchen: '#ebe8e2', hall: '#ebe7e0', bedMain: '#a9b9c5', bedSmall: '#e7e4de', shower: '#eceeed' }, trim: '#f3f1ec', floor: 'walnut', floorBed: 'carpetGrey' },
    items: [
      { id: 'a1', type: 'sofa', kind: 'sofa3', name: '', x: 2, z: 3, rot: 180, w: 2.1, d: 0.92, h: 0.85, elev: 0, color: '#5f6b73', room: 'lounge' },
      { id: 'a2', type: 'cornerSofa', kind: 'cornerSofa', name: 'Our corner sofa', x: 2.5, z: 2.6, rot: 90, w: 2.75, d: 1.75, h: 0.85, elev: 0, color: '#e2b53e', mirror: true, room: 'lounge' },
      { id: 'a3', type: 'bed', kind: 'bedKing', name: '', x: 1.5, z: 8, rot: 0, w: 1.65, d: 2.15, h: 1.05, elev: 0, color: '#d9cfbf', room: 'bedMain' },
      { id: 'a4', type: 'bed', kind: 'bedKing', name: '', x: -1.2, z: 8, rot: 0, w: 1.65, d: 2.15, h: 1.05, elev: 0, color: '#d9cfbf', room: 'bedSmall' },
      { id: 'bad', type: 'spaceship', x: 0, z: 0 },
    ],
  },
};

describe('files', () => {
  it('opens a layout saved by the original planner', () => {
    const cat = starterCatalogue();
    const { kind, flats, entries } = readFile(legacy, cat);
    expect(kind).toBe('legacy');
    const f = flats[0];
    expect(f.rooms[0].w).toBeCloseTo(3.5);
    expect(f.rooms[0].d).toBeCloseTo(4.35);
    expect(f.ceiling).toBeCloseTo(2.45);
    expect(f.design.paint.lounge).toBe('#f6f5f1');
    expect(f.design.wallPaint.lounge).toEqual({ 1: '#2b394e', 5: '#c1cbc0' });
    expect(f.design.paint.bedMain).toBe('#a9b9c5');
    expect(f.design.floor.lounge).toBe('walnut');
    expect(f.design.floor.bedSmall).toBe('carpetGrey');
    expect(f.design.items).toHaveLength(4);
    // the unchanged starter pieces map onto the starter catalogue; the resized sofa becomes a new entry
    expect(f.design.items[0].cat).toBe('starter-sofa3');
    expect(f.design.items[2].cat).toBe('starter-bedKing');
    expect(f.design.items[3].cat).toBe('starter-bedKing');
    expect(entries).toHaveLength(1);
    expect(readFile({ state: { ...legacy.state, items: [{ ...legacy.state.items[1], name: '' }] } }, cat).entries[0].name).toBe('Corner sofa, 275 × 175');
    expect(entries[0].name).toBe('Our corner sofa');
    expect(f.design.items[1].cat).toBe(entries[0].id);
    expect(f.design.items[1].mirror).toBe(true);
  });

  it('round-trips a flat file with the catalogue items it uses', () => {
    const flat = sampleFlat();
    const cat = starterCatalogue();
    flat.design.items.push({ id: 'i1', cat: 'starter-desk', shape: 'desk', name: 'Desk', w: 1.2, d: 0.6, h: 0.75, color: '#d9c7ae', x: 1, z: 1, rot: 0, elev: 0, room: 'lounge' });
    const file = JSON.parse(JSON.stringify(flatFile(flat, cat)));
    expect(file.catalogue.map((e) => e.id)).toEqual(['starter-desk']);
    const back = readFile(file, [], new Set([flat.id]));
    expect(back.flats[0].id).not.toBe(flat.id);
    expect(back.flats[0].rooms).toHaveLength(6);
    expect(back.flats[0].design.items[0].cat).toBe('starter-desk');
  });

  it('reads and writes catalogue CSV', () => {
    const csv = 'Name,Category,Shape,Width (cm),Depth (cm),Height (cm),Colour,Status,Price,Link\n"Sofa, grey",Seating,sofa,220,95,82,#888888,own,,\nDesk,Tables,desk,140,70,74,,want to buy,"£199",https://example.com/desk\n';
    const es = entriesFromCsv(csv);
    expect(es).toHaveLength(2);
    expect(es[0]).toMatchObject({ name: 'Sofa, grey', shape: 'sofa', status: 'owned', color: '#888888' });
    expect(es[0].w).toBeCloseTo(2.2);
    expect(es[1]).toMatchObject({ name: 'Desk', shape: 'desk', status: 'buy', price: 199, url: 'https://example.com/desk' });
    const again = entriesFromCsv(entriesToCsv(es));
    expect(again.map((e) => e.name)).toEqual(['Sofa, grey', 'Desk']);
    expect(again[1].h).toBeCloseTo(0.74);
  });

  it('refuses files it does not understand', () => {
    expect(() => readFile({ hello: 1 }, [])).toThrow();
  });
});
