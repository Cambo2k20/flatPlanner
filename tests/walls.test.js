import { describe, expect, it } from 'vitest';
import { blankFlat, sampleFlat } from '../src/core/sample-flat.js';
import { computeWalls } from '../src/core/walls.js';
import { inRoom, normalizeFlat, roomEdges, roomPolygon } from '../src/core/flat-model.js';
import { createWorld } from '../src/core/placement.js';

function checkInvariants(flat) {
  const walls = computeWalls(flat);
  // no wall box sits inside a room
  for (const b of walls.boxes) {
    const cx = (b.x0 + b.x1) / 2, cz = (b.z0 + b.z1) / 2;
    for (const r of flat.rooms) expect(inRoom(r, cx, cz, 0.0005)).toBe(false);
  }
  // boxes never overlap each other
  for (let i = 0; i < walls.boxes.length; i++) for (let j = i + 1; j < walls.boxes.length; j++) {
    const a = walls.boxes[i], b = walls.boxes[j];
    const ox = Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0), oz = Math.min(a.z1, b.z1) - Math.max(a.z0, b.z0);
    expect(ox > 1e-6 && oz > 1e-6).toBe(false);
  }
  // every wall of every room is backed by a box whose face knows which wall it is
  for (const r of flat.rooms) {
    for (const e of roomEdges(r)) {
      const dir = e.n.z > 0.5 ? 's' : e.n.z < -0.5 ? 'n' : e.n.x > 0.5 ? 'e' : 'w';
      for (let u = 0.01; u < e.len - 0.005; u += 0.05) {
        const p = { x: e.a.x + e.d.x * u - e.n.x * 0.001, z: e.a.z + e.d.z * u - e.n.z * 0.001 };
        const b = walls.boxes.find((q) => p.x >= q.x0 && p.x <= q.x1 && p.z >= q.z0 && p.z <= q.z1);
        expect(b, `${r.id} edge ${e.i} at ${u.toFixed(2)}`).toBeTruthy();
        expect(b.faces[dir]).toMatchObject({ kind: 'room', room: r.id, edge: e.i });
      }
    }
  }
  return walls;
}

describe('sample flat', () => {
  const flat = sampleFlat();

  it('keeps every room, door, window and fitting', () => {
    expect(flat.rooms.map((r) => r.id)).toEqual(['lounge', 'kitchen', 'hall', 'shower', 'bedMain', 'bedSmall']);
    expect(flat.openings).toHaveLength(10);
    expect(flat.fixtures).toHaveLength(9);
    expect(roomPolygon(flat.rooms[0])).toHaveLength(6);
  });

  it('builds consistent walls', () => { checkInvariants(flat); });

  it('finds how thick the wall is behind each door and window, and what is on the other side', () => {
    const walls = computeWalls(flat);
    const by = Object.fromEntries(walls.openings.map((o) => [o.id, o]));
    const expectOp = (id, t, far) => { expect(by[id].ok).toBe(true); expect(by[id].t).toBeCloseTo(t, 3); expect(by[id].farRoom).toBe(far); };
    expectOp('w-lounge', 0.25, null);
    expectOp('o-kitchen', 0.20, 'kitchen');
    expectOp('d-lounge', 0.12, 'hall');
    expectOp('w-kitchen', 0.25, null);
    expectOp('d-front', 0.25, null);
    expectOp('d-shower', 0.10, 'shower');
    expectOp('d-bedMain', 0.10, 'hall');
    expectOp('d-bedSmall', 0.10, 'hall');
    expectOp('w-bedMain', 0.25, null);
    expectOp('w-bedSmall', 0.25, null);
  });

  it('names doors by the room they open into', () => {
    const world = createWorld(flat, computeWalls(flat));
    const labels = world.DOORS.filter((d) => d.label).map((d) => d.label).sort();
    expect(labels).toEqual(['the front door', 'the lounge door', 'the main bedroom door', 'the second bedroom door', 'the shower room door']);
  });

  it('turns fittings into cut-outs and lets you walk through doorways', () => {
    const world = createWorld(flat, computeWalls(flat));
    expect(world.ROOMS.kitchen.cuts.filter((c) => c.fixture)).toHaveLength(2);
    expect(world.walkable(1.7, 2.0)).toBe(true);     // middle of the lounge
    expect(world.walkable(0.6, 4.40)).toBe(true);    // the lounge doorway
    expect(world.walkable(0.6, -1.5)).toBe(true);    // kitchen floor
    expect(world.walkable(-0.55, -3.3)).toBe(false); // inside the kitchen units
  });

  it('keeps furniture in its room and pushes it out of fittings', () => {
    const world = createWorld(flat, computeWalls(flat));
    const sofa = { id: 's', shape: 'sofa', x: 0.2, z: 3.8, w: 2.1, d: 0.92, h: 0.85, elev: 0, rot: 0, room: '' };
    world.resolve(sofa, false);
    expect(sofa.room).toBe('lounge');
    expect(sofa.x - 1.05).toBeGreaterThanOrEqual(-1e-6);
    const chair = { id: 'c', shape: 'diningChair', x: -0.5, z: -3.3, w: 0.45, d: 0.52, h: 0.88, elev: 0, rot: 0, room: 'kitchen' };
    world.resolve(chair, false);
    const cut = world.ROOMS.kitchen.cuts.find((c) => c.fixture === 'f-kit-n');
    expect(chair.z - 0.26).toBeGreaterThanOrEqual(cut.r[3] - 1e-6);
  });
});

describe('other layouts', () => {
  it('handles a blank flat', () => { const w = checkInvariants(blankFlat()); expect(w.openings.every((o) => o.ok)).toBe(true); });

  it('handles rooms that touch, rooms far apart and every corner cut', () => {
    for (const corner of ['nw', 'ne', 'se', 'sw']) {
      checkInvariants(normalizeFlat({
        rooms: [
          { id: 'a', x: 0, z: 0, w: 4, d: 3, notch: { corner, w: 1.2, d: 1 } },
          { id: 'b', x: 4.1, z: 0.5, w: 2.5, d: 2 },
          { id: 'c', x: 0, z: 3.1, w: 3, d: 2 },
          { id: 'd', x: 12, z: 12, w: 2, d: 2 },
        ],
        openings: [{ room: 'a', edge: 1, kind: 'door', pos: 0.6, width: 0.8 }, { room: 'c', edge: 0, kind: 'opening', pos: 0.2, width: 1 }],
      }));
    }
  });

  it('keeps a door to the depth of its own wall when it meets the end of another wall', () => {
    // a door on the living room's bottom wall, partly above the bathroom's outside wall
    const flat = normalizeFlat({
      outerWall: 0.25,
      rooms: [{ id: 'liv', x: 0, z: 0, w: 4.2, d: 3.6 }, { id: 'bath', x: 0, z: 3.7, w: 3, d: 3 }],
      openings: [{ id: 'd', room: 'liv', edge: 2, kind: 'door', pos: 0.3, width: 0.8 }],
    });
    const walls = checkInvariants(flat);
    const o = walls.openings.find((x) => x.id === 'd');
    expect(o.ok).toBe(true);
    expect(o.t).toBeCloseTo(0.25, 3);
    expect(o.farRoom).toBe(null);
    const holes = walls.boxes.filter((b) => b.opening === 'd');
    for (const b of holes) expect(b.z1).toBeLessThanOrEqual(3.6 + 0.25 + 1e-6);
  });

  it('copes with no rooms at all', () => {
    const w = computeWalls(normalizeFlat({}));
    expect(w.boxes).toEqual([]);
  });
});

it('cuts both sides of a notched corner and keeps a single diagonal door', async () => {
  const { doorwayFrame } = await import('../src/core/walls.js');
  const flat = normalizeFlat({ rooms: [
    { id: 'room', x: 0, z: 0, w: 3, d: 4, notch: { corner: 'nw', w: 1, d: 1 } },
    { id: 'hall', x: 0, z: 0, w: 0.9, d: 0.9 },
  ], openings: [{ id: 'door', kind: 'door', room: 'room', edge: 4, cornerDoor: true }] });
  const walls = computeWalls(flat), door = walls.openings.find((o) => o.id === 'door');
  expect(door.ok).toBe(true);
  expect(walls.openings.find((o) => o.companion === door.id).ok).toBe(true);
  const frame = doorwayFrame(door);
  expect(frame.A).toEqual({ x: 0, z: 1 });
  expect(frame.A.x + frame.d.x * frame.u1).toBeCloseTo(1);
  expect(frame.A.z + frame.d.z * frame.u1).toBeCloseTo(0);
  const insideCorner = walls.boxes.filter((b) => b.x0 >= 0 && b.x1 <= 1 && b.z0 >= 0 && b.z1 <= 1);
  expect(insideCorner.length).toBeGreaterThan(0);
  expect(insideCorner.every((b) => b.opening)).toBe(true);
});
