#!/usr/bin/env node
/* Reads a saved Rightmove property page and prints what a flat needs, as JSON:
   address, price, bedrooms, rooms with their listed sizes, floorplan and photo
   addresses, and the description.

     curl -s -A "Mozilla/5.0" https://www.rightmove.co.uk/properties/<id> -o page.html
     node scripts/rightmove-listing.mjs page.html > listing.json

   Rightmove keeps the page's data in window.__PAGE_MODEL (older pages: PAGE_MODEL).
   Newer pages pack it as {"data": "<json>", "encoding": "on"}: a flat array in which
   every object's values are indexes of other entries. */
import fs from 'node:fs';

const html = fs.readFileSync(process.argv[2], 'utf8');
const m = html.match(/window\.(?:__)?PAGE_MODEL\s*=\s*/);
if (!m) { console.error('No PAGE_MODEL on this page: is it a Rightmove property page?'); process.exit(1); }

function readJsonAt(text, start) { // the first complete JSON value starting at `start`
  let depth = 0, inStr = false, esc = false;
  for (let i = start; i < text.length; i++) {
    const c = text[i];
    if (inStr) { if (esc) esc = false; else if (c === '\\') esc = true; else if (c === '"') inStr = false; continue; }
    if (c === '"') inStr = true;
    else if (c === '{' || c === '[') depth++;
    else if (c === '}' || c === ']') { depth--; if (depth === 0) return JSON.parse(text.slice(start, i + 1)); }
  }
  throw new Error('Unfinished PAGE_MODEL');
}
let model = readJsonAt(html, m.index + m[0].length);
if (model && model.encoding && typeof model.data === 'string') {
  const arr = JSON.parse(model.data), memo = new Map();
  const h = (i) => {
    if (typeof i !== 'number' || i < 0) return null;
    if (memo.has(i)) return memo.get(i);
    const v = arr[i];
    if (Array.isArray(v)) { const out = []; memo.set(i, out); for (const x of v) out.push(h(x)); return out; }
    if (v && typeof v === 'object') { const out = {}; memo.set(i, out); for (const [k, x] of Object.entries(v)) out[k] = h(x); return out; }
    return v;
  };
  model = h(0);
}
const pd = model.propertyData;
if (!pd) { console.error('No propertyData in PAGE_MODEL'); process.exit(1); }
const strip = (s) => String(s || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
const out = {
  id: pd.id,
  url: `https://www.rightmove.co.uk/properties/${pd.id}`,
  address: pd.address && pd.address.displayAddress,
  price: pd.prices && pd.prices.primaryPrice,
  transaction: pd.transactionType,
  type: pd.propertySubType,
  bedrooms: pd.bedrooms, bathrooms: pd.bathrooms,
  floor: pd.entranceFloor && pd.entranceFloor.displayText,
  sizings: pd.sizings,
  keyFeatures: pd.keyFeatures,
  rooms: (pd.rooms || []).map((r) => ({ name: r.name, dimension: r.dimension, description: strip(r.description) })),
  floorplans: (pd.floorplans || []).map((f) => f.url),
  photos: (pd.images || []).map((i) => i.url),
  description: strip(pd.text && pd.text.description),
};
console.log(JSON.stringify(out, null, 1));
