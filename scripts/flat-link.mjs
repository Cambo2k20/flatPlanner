#!/usr/bin/env node
/* Turns a flat description into a link that adds it to the planner.

     node scripts/flat-link.mjs flat.json [--base https://cambo2k20.github.io/flatPlanner/] [--out flat.flat.json]

   flat.json is either a flat (the same fields as in a saved flat file) or a whole flat
   file. Rooms, doors, windows and fittings are checked the way the app builds them:
   every door and window must sit in a wall. Prints a summary and the link. With --out,
   also writes a flat file you can open with "Open a file". */
import fs from 'node:fs';
import { flatFile } from '../src/core/files.js';
import { normalizeFlat, roomArea } from '../src/core/flat-model.js';
import { computeWalls } from '../src/core/walls.js';
import { flatLink } from '../src/core/share.js';

const args = process.argv.slice(2);
const opt = (name, fallback) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : fallback; };
const input = args.find((a, i) => !a.startsWith('--') && !(i > 0 && args[i - 1].startsWith('--')));
if (!input) { console.error('usage: node scripts/flat-link.mjs flat.json [--base URL] [--out file]'); process.exit(2); }
const base = opt('--base', 'https://cambo2k20.github.io/flatPlanner/');

const raw = JSON.parse(fs.readFileSync(input, 'utf8'));
const given = raw.flat || raw;
const flat = normalizeFlat(given);

let problems = 0;
const dropped = (given.openings || []).length - flat.openings.length;
if (dropped) { problems++; console.log(`! ${dropped} door(s) or window(s) were dropped: their room or wall doesn't exist`); }
const droppedFx = (given.fixtures || []).length - flat.fixtures.length;
if (droppedFx) { problems++; console.log(`! ${droppedFx} fitting(s) were dropped: unknown shape`); }
const walls = computeWalls(flat);
const names = Object.fromEntries(flat.rooms.map((r) => [r.id, r.name]));
console.log(`${flat.name}${flat.address ? ` · ${flat.address}` : ''}`);
for (const r of flat.rooms) console.log(`  ${r.name.padEnd(16)} ${Math.round(r.w * 100)} × ${Math.round(r.d * 100)} cm  ${roomArea(r).toFixed(1)} m²${r.notch ? `  (${r.notch.corner} corner cut ${Math.round(r.notch.w * 100)} × ${Math.round(r.notch.d * 100)})` : ''}`);
for (const o of walls.openings) {
  const from = names[o.room], to = o.farRoom ? names[o.farRoom] : 'outside';
  if (!o.ok) { problems++; console.log(`! ${o.kind} ${o.id} on the ${from} has no wall behind it: move the rooms so a wall's width separates them`); }
  else console.log(`  ${o.kind.padEnd(8)} ${from} → ${to}, ${Math.round((o.u1 - o.u0) * 100)} cm, wall ${Math.round(o.t * 100)} cm`);
}
console.log(`  ${flat.fixtures.length} fittings · ${flat.photos.length} photos · floorplan ${flat.floorplanUrl ? 'yes' : 'no'}`);

const file = flatFile(flat, []);
const out = opt('--out');
if (out) { fs.writeFileSync(out, JSON.stringify(file, null, 1)); console.log(`wrote ${out}`); }
const link = await flatLink(file, base);
console.log(`\n${link}\n`);
console.log(`link length ${link.length}${problems ? `, ${problems} problem(s) above` : ''}`);
process.exit(problems ? 1 : 0);
