/* The list of flats you're looking at, and adding a new one. */
import { cloneFlat, roomPolygon } from '../core/flat-model.js';
import { backupFile, entriesFromCsv, flatFile, mergeEntries, readFile } from '../core/files.js';
import { unpackFlat } from '../core/share.js';
import { FLAT_STATUS } from '../core/palette.js';
import { blankFlat, sampleFlat } from '../core/sample-flat.js';
import { $, downloadBlob, el, money, safeUrl, selectEl, slug, str, toast } from '../core/util.js';
import { addFlat, db, findEntry, getPicture, planKey, removeFlat, saveCatalogue, setPicture, thumbKey } from '../store.js';
import { confirmDialog, field, openDialog, pickFile } from './widgets.js';

const SVG = 'http://www.w3.org/2000/svg';
const TYPE_FILL = { living: '#dccfbf', kitchen: '#c9d3d6', dining: '#dccfbf', bedroom: '#d5cfdf', bathroom: '#c6dbe0', hall: '#e3dccf', study: '#d9d6c6', storage: '#d9d9d4', other: '#dcd8cf' };

/** A small drawing of the plan, used until the flat has a picture of its own. */
export function planSvg(flat) {
  const svg = document.createElementNS(SVG, 'svg');
  if (!flat.rooms.length) { svg.setAttribute('viewBox', '0 0 16 10'); return svg; }
  let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
  for (const r of flat.rooms) { x0 = Math.min(x0, r.x); z0 = Math.min(z0, r.z); x1 = Math.max(x1, r.x + r.w); z1 = Math.max(z1, r.z + r.d); }
  const pad = Math.max(x1 - x0, z1 - z0) * 0.12;
  let w = x1 - x0 + 2 * pad, h = z1 - z0 + 2 * pad;
  // fit the card's 16:10 frame
  const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
  if (w / h < 1.6) w = h * 1.6; else h = w / 1.6;
  svg.setAttribute('viewBox', `${cx - w / 2} ${cz - h / 2} ${w} ${h}`);
  svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
  const bg = document.createElementNS(SVG, 'rect');
  Object.entries({ x: cx - w / 2, y: cz - h / 2, width: w, height: h, fill: '#e7ece9' }).forEach(([k, v]) => bg.setAttribute(k, v));
  svg.append(bg);
  for (const r of flat.rooms) {
    const p = document.createElementNS(SVG, 'polygon');
    p.setAttribute('points', roomPolygon(r).map((q) => `${q.x},${q.z}`).join(' '));
    p.setAttribute('fill', TYPE_FILL[r.type] || TYPE_FILL.other);
    p.setAttribute('stroke', '#47524f');
    p.setAttribute('stroke-width', String(Math.max(w, h) / 160));
    p.setAttribute('stroke-linejoin', 'round');
    svg.append(p);
  }
  return svg;
}

function rentText(f) {
  if (f.rent === null) return '';
  const m = money(f.rent, db.prefs.currency);
  return f.rentPeriod === 'sale' ? m : `${m} a ${f.rentPeriod}`;
}

export function flatSummary(f) {
  const items = f.design.items.length;
  let buy = 0, cost = 0;
  for (const it of f.design.items) { const e = findEntry(it.cat); if (e && e.status === 'buy') { buy++; cost += e.price || 0; } }
  return { items, buy, cost };
}

function flatCard(f) {
  const thumb = el('a', { class: 'thumb', href: `#/flat/${encodeURIComponent(f.id)}`, 'aria-label': `Open ${f.name}` }, planSvg(f));
  getPicture(thumbKey(f.id)).then((src) => {
    if (src) thumb.replaceChildren(el('img', { src, alt: '' }));
    else if (f.photos[0]) { const img = el('img', { src: f.photos[0], alt: '', referrerpolicy: 'no-referrer', onerror: () => img.replaceWith(planSvg(f)) }); thumb.replaceChildren(img); }
  });
  const { items, buy, cost } = flatSummary(f);
  const url = safeUrl(f.url);
  const meta = [
    f.address ? el('span', {}, f.address) : null,
    f.rent !== null ? el('span', {}, rentText(f)) : null,
    el('span', {}, `${f.rooms.length} ${f.rooms.length === 1 ? 'room' : 'rooms'}`),
    el('span', {}, items ? `${items} ${items === 1 ? 'thing' : 'things'} placed${buy ? `, ${buy} to buy${cost ? ` (${money(cost, db.prefs.currency)})` : ''}` : ''}` : 'Not furnished yet'),
  ];
  return el('article', { class: 'fcard' },
    thumb,
    el('div', { class: 'body' },
      el('div', { class: 'row between' }, el('h2', {}, el('a', { href: `#/flat/${encodeURIComponent(f.id)}` }, f.name)), el('span', { class: `status ${f.status}` }, FLAT_STATUS[f.status])),
      el('div', { class: 'meta' }, meta),
      el('div', { class: 'actions' },
        el('a', { class: 'btn small primary', href: `#/flat/${encodeURIComponent(f.id)}` }, 'Open'),
        url ? el('a', { class: 'btn small', href: url, target: '_blank', rel: 'noopener noreferrer' }, 'Listing ↗') : null,
        el('button', { type: 'button', class: 'btn small', onclick: () => duplicateFlat(f) }, 'Duplicate'),
        el('button', { type: 'button', class: 'btn small', onclick: () => exportFlat(f) }, 'Save file'),
        el('button', { type: 'button', class: 'btn small ghost danger', onclick: () => deleteFlat(f) }, 'Delete'))));
}

export function renderHome() {
  const grid = $('#flat-grid');
  const flats = db.flats.slice().sort((a, b) => b.updated - a.updated);
  grid.replaceChildren(
    ...flats.map(flatCard),
    el('button', { type: 'button', class: 'newcard', onclick: newFlatFlow }, el('b', {}, '+'), flats.length ? 'Add another flat' : 'Add the first flat you’re interested in'));
}

async function duplicateFlat(f) {
  const c = cloneFlat(f, { name: `${f.name} (copy)` });
  addFlat(c);
  const img = await getPicture(planKey(f.id));
  if (img) await setPicture(planKey(c.id), img);
  renderHome();
  toast(`Made a copy of ${f.name}.`);
}

export async function exportFlat(f) {
  const img = await getPicture(planKey(f.id));
  const data = JSON.stringify(flatFile(f, db.catalogue, img), null, 1);
  downloadBlob(`${slug(f.name)}.flat.json`, new Blob([data], { type: 'application/json' }));
}

async function deleteFlat(f) {
  const ok = await confirmDialog({ title: `Delete ${f.name}?`, text: 'Its plan and furnishing go. Your catalogue stays as it is.', ok: 'Delete flat', danger: true });
  if (!ok) return;
  removeFlat(f.id);
  renderHome();
  toast(`Deleted ${f.name}.`);
}

/** Ask for the listing's details and where to start from, then open the new flat. */
export function newFlatFlow() {
  return openDialog((form, close) => {
    const name = el('input', { type: 'text', maxlength: 80, placeholder: 'e.g. 2-bed on Elm Street', autofocus: true });
    const address = el('input', { type: 'text', maxlength: 200 });
    const url = el('input', { type: 'url', maxlength: 500, placeholder: 'https://' });
    const rent = el('input', { type: 'number', min: 0, step: 'any' });
    const period = selectEl([['month', 'a month'], ['week', 'a week'], ['sale', 'to buy']], 'month');
    const starts = [
      ['blank', 'A blank plan', 'One room to start. Add the rest from the listing’s floorplan.'],
      ['sample', 'The two-bedroom flat from the original 3D planner', 'Ready to furnish.'],
    ];
    if (db.flats.length) starts.push(['copy', 'A copy of one of your flats', 'Same rooms and furniture, new listing details.']);
    let start = 'blank';
    const copyOf = selectEl(db.flats.map((f) => [f.id, f.name]), db.flats[0] ? db.flats[0].id : '');
    const copyWrap = field('Which flat', copyOf); copyWrap.hidden = true;
    const choice = el('div', { class: 'choice', role: 'radiogroup', 'aria-label': 'Start from' },
      starts.map(([v, label, hint]) => {
        const r = el('input', { type: 'radio', name: 'start', value: v, checked: v === start });
        r.addEventListener('change', () => { start = v; copyWrap.hidden = v !== 'copy'; });
        return el('label', {}, r, el('span', {}, label), el('small', {}, hint));
      }));
    const create = () => {
      const details = {
        name: name.value.trim() || 'New flat', address: address.value.trim(), url: url.value.trim(),
        rent: rent.value === '' ? null : +rent.value, rentPeriod: period.value, status: 'interested', created: Date.now(), updated: Date.now(),
      };
      let flat;
      if (start === 'sample') flat = sampleFlat({}, details);
      else if (start === 'copy') { const src = db.flats.find((f) => f.id === copyOf.value); flat = src ? cloneFlat(src, details) : blankFlat(details); }
      else flat = blankFlat(details);
      addFlat(flat);
      close(flat);
      location.hash = `#/flat/${encodeURIComponent(flat.id)}${start === 'blank' ? '/layout' : ''}`;
    };
    form.append(
      el('h2', {}, 'Add a flat'),
      field('Name', name),
      field('Address', address),
      field('Listing link', url, 'Optional. Kept with the flat so you can get back to it.'),
      el('div', { class: 'fields2' }, el('label', { class: 'f' }, 'Rent or price', el('span', { class: 'inp' }, db.prefs.currency || '£', rent)), field('Per', period)),
      el('div', { class: 'block', style: { gap: '6px' } }, el('span', { class: 'lbl' }, 'Start from'), choice, copyWrap),
      el('div', { class: 'foot-btns' },
        el('button', { type: 'button', class: 'btn', onclick: () => close() }, 'Cancel'),
        el('button', { type: 'button', class: 'btn primary', onclick: create }, 'Add flat')),
    );
  });
}

/** Open any file: a flat, a backup, a catalogue, or a layout from the original planner. */
export async function openAnyFile() {
  const f = await pickFile('.json,.csv,application/json,text/csv');
  if (!f) return;
  try {
    const text = await f.text();
    const res = /\.csv$/i.test(f.name)
      ? { flats: [], entries: entriesFromCsv(text), images: new Map() }
      : readFile(JSON.parse(text), db.catalogue, new Set(db.flats.map((x) => x.id)));
    const { catalogue, added } = mergeEntries(db.catalogue, res.entries);
    db.catalogue = catalogue; saveCatalogue();
    for (const fl of res.flats) {
      fl.updated = Date.now();
      addFlat(fl);
      const img = res.images.get(fl.id);
      if (img) await setPicture(planKey(fl.id), img);
    }
    const bits = [];
    if (res.flats.length) bits.push(`${res.flats.length} ${res.flats.length === 1 ? 'flat' : 'flats'}`);
    if (added.length) bits.push(`${added.length} catalogue ${added.length === 1 ? 'item' : 'items'}`);
    toast(bits.length ? `Opened ${str(f.name, 60)}: ${bits.join(' and ')}.` : `Nothing new in ${str(f.name, 60)}.`);
    if (res.flats.length === 1) location.hash = `#/flat/${encodeURIComponent(res.flats[0].id)}`;
    else renderHome();
  } catch (err) {
    console.error(err);
    toast('That file isn’t one this planner can read.');
  }
}

/** A link made by "Copy a link to this flat" (or by Claude from a listing): ask, then add the flat. */
export async function addFromLink(payload) {
  let res;
  try { res = readFile(await unpackFlat(payload), db.catalogue, new Set(db.flats.map((x) => x.id))); }
  catch (err) {
    console.error(err);
    history.replaceState(null, '', '#/');
    toast('That link doesn’t hold a flat this planner can read. It may have been cut short when it was copied.');
    return;
  }
  const f = res.flats[0];
  history.replaceState(null, '', '#/');
  if (!f) { toast('That link doesn’t hold a flat.'); return; }
  const same = db.flats.find((x) => x.name === f.name && x.address === f.address);
  const ok = await openDialog((form, close) => {
    const pic = el('div', { class: 'dlg-shot' }, planSvg(f));
    if (f.photos[0]) { const img = el('img', { src: f.photos[0], alt: '', referrerpolicy: 'no-referrer', onerror: () => img.replaceWith(planSvg(f)) }); pic.replaceChildren(img); }
    form.append(
      el('div', { class: 'dlg-head' },
        el('div', { class: 'stack', style: { flex: 1 } },
          el('h2', {}, 'Add this flat?'),
          el('strong', {}, f.name),
          f.address ? el('span', { class: 'muted' }, f.address) : null,
          f.rent !== null ? el('span', { class: 'muted' }, rentText(f)) : null),
        pic),
      el('p', { class: 'note' }, f.rooms.length ? `${f.rooms.length} rooms: ${f.rooms.map((r) => r.name).join(', ')}.` : 'No rooms yet.',
        f.photos.length ? ` ${f.photos.length} listing photos.` : '', f.floorplanUrl ? ' The listing’s floorplan.' : ''),
      same ? el('p', { class: 'warnline' }, `You already have a flat called “${same.name}”. This adds another one alongside it.`) : null,
      el('div', { class: 'foot-btns' },
        el('button', { type: 'button', class: 'btn', onclick: () => close(false) }, 'Cancel'),
        el('button', { type: 'button', class: 'btn primary', autofocus: true, onclick: () => close(true) }, 'Add flat')));
  });
  if (!ok) { renderHome(); return; }
  const { catalogue } = mergeEntries(db.catalogue, res.entries);
  db.catalogue = catalogue; saveCatalogue();
  f.updated = Date.now();
  addFlat(f);
  location.hash = `#/flat/${encodeURIComponent(f.id)}/layout`;
}

export async function saveBackup() {
  const images = new Map();
  for (const f of db.flats) { const img = await getPicture(planKey(f.id)); if (img) images.set(f.id, img); }
  const data = JSON.stringify(backupFile(db.flats, db.catalogue, images));
  downloadBlob(`flat-planner-backup-${new Date().toISOString().slice(0, 10)}.json`, new Blob([data], { type: 'application/json' }));
}

export function bindHome() {
  $('#h-new').addEventListener('click', newFlatFlow);
  $('#h-open').addEventListener('click', openAnyFile);
  $('#h-backup').addEventListener('click', saveBackup);
}

