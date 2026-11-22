/* The catalogue screen, and the dialog for adding or editing one of your items. */
import { dimsText, entryLook, newEntry, normalizeEntry, STATUS } from '../core/catalogue.js';
import { catalogueFile, entriesFromCsv, entriesToCsv, mergeEntries, readFile } from '../core/files.js';
import { FABRICS } from '../core/palette.js';
import { CATEGORIES, FURNITURE_SHAPES, SHAPES } from '../core/shapes.js';
import { $, $$, cm, downloadBlob, el, fileToImageDataUrl, money, toast } from '../core/util.js';
import { db, saveCatalogue, saveFlats, usageCounts } from '../store.js';
import { itemPreview, queuePreview } from '../three/preview.js';
import { confirmDialog, field, openDialog, pickFile, swatchRow } from './widgets.js';

const view = { q: '', status: 'all', cat: '' };

export const categoriesInUse = () => [...new Set([...CATEGORIES, ...db.catalogue.map((e) => e.category)])].filter(Boolean);

/** After an item changes, update every flat it is placed in. */
export function applyEntryToFlats(entry) {
  let n = 0;
  for (const f of db.flats) for (const it of f.design.items) if (it.cat === entry.id) { Object.assign(it, entryLook(entry)); n++; }
  if (n) saveFlats();
  return n;
}

export function saveEntry(entry) {
  const i = db.catalogue.findIndex((e) => e.id === entry.id);
  if (i >= 0) db.catalogue[i] = entry; else db.catalogue.push(entry);
  saveCatalogue();
  applyEntryToFlats(entry);
}

export async function deleteEntry(entry) {
  const used = usageCounts().get(entry.id) || 0;
  const ok = await confirmDialog({
    title: `Delete ${entry.name}?`,
    text: used ? `It’s placed ${used === 1 ? 'once' : `${used} times`} in your flats. It stays where it is there, but you won’t be able to add it again.` : 'It isn’t placed in any of your flats.',
    ok: 'Delete', danger: true,
  });
  if (!ok) return false;
  db.catalogue = db.catalogue.filter((e) => e.id !== entry.id);
  saveCatalogue();
  return true;
}

/**
 * Add or edit an item. Resolves with { action: 'save' | 'add' | 'delete', entry }, or
 * undefined if cancelled. inFlat adds a "Save and add to this flat" button.
 */
export function itemDialog(entry, { isNew = false, inFlat = false } = {}) {
  const e = structuredClone(entry);
  let sizeTouched = !isNew;
  const currency = db.prefs.currency || '£';
  return openDialog((form, close) => {
    const name = el('input', { type: 'text', value: e.name === SHAPES[e.shape].label && isNew ? '' : e.name, maxlength: 80, placeholder: SHAPES[e.shape].label, autofocus: true });
    const groups = [...new Set(FURNITURE_SHAPES.map((k) => SHAPES[k].group))];
    const shapeSel = el('select', {}, groups.map((g) => el('optgroup', { label: g }, FURNITURE_SHAPES.filter((k) => SHAPES[k].group === g).map((k) => el('option', { value: k }, SHAPES[k].label)))));
    shapeSel.value = e.shape;
    const catList = el('datalist', { id: 'dl-cats' }, categoriesInUse().map((c) => el('option', { value: c })));
    const category = el('input', { type: 'text', value: e.category, list: 'dl-cats', maxlength: 40 });
    const num = (m, min, max) => el('input', { type: 'number', min, max, step: 1, inputmode: 'numeric', value: String(cm(m)) });
    const wIn = num(e.w, 2, 600), dIn = num(e.d, 1, 600), hIn = num(e.h, 1, 300), elevIn = num(e.elev, 0, 280);
    for (const i of [wIn, dIn, hIn]) i.addEventListener('input', () => { sizeTouched = true; });
    const wall = el('input', { type: 'checkbox', checked: e.wall });
    const colourBox = el('div');
    const paintColours = () => colourBox.replaceChildren(swatchRow(FABRICS, e.color, (c) => { e.color = c; paintColours(); }, 'Pick any colour'));
    paintColours();
    const status = el('div', { class: 'seg', role: 'group', 'aria-label': 'Status' });
    const qty = el('input', { type: 'number', min: 1, max: 99, step: 1, value: String(e.qty) });
    const qtyField = field('How many you have', qty);
    const paintStatus = () => {
      status.replaceChildren(...Object.entries(STATUS).map(([k, label]) => el('button', { type: 'button', 'aria-pressed': String(e.status === k), onclick: () => { e.status = k; paintStatus(); } }, label)));
      qtyField.hidden = e.status !== 'owned';
    };
    paintStatus();
    const price = el('input', { type: 'number', min: 0, step: 'any', value: e.price ?? '', placeholder: '0' });
    const url = el('input', { type: 'url', value: e.url, placeholder: 'https://', maxlength: 500 });
    const notes = el('textarea', { maxlength: 1000, rows: 3 }, e.notes);
    const prev = el('span', { class: 'ph-prev' });
    const paintPhoto = () => prev.replaceChildren(e.photo ? el('img', { src: e.photo, alt: '' }) : 'No photo');
    paintPhoto();
    const photoIn = el('input', { type: 'file', accept: 'image/*', hidden: true });
    photoIn.addEventListener('change', async () => {
      const f = photoIn.files && photoIn.files[0]; if (!f) return;
      try { e.photo = (await fileToImageDataUrl(f, 480)).dataUrl; paintPhoto(); removePhoto.hidden = false; }
      catch { toast('That file isn’t a picture this browser can read.'); }
    });
    const removePhoto = el('button', { type: 'button', class: 'btn small ghost', hidden: !e.photo, onclick: () => { e.photo = ''; paintPhoto(); removePhoto.hidden = true; } }, 'Remove');

    shapeSel.addEventListener('change', () => {
      const old = SHAPES[e.shape], s = SHAPES[shapeSel.value];
      if (!category.value || category.value === old.group) category.value = s.group;
      if (!sizeTouched) {
        wIn.value = cm(s.w); dIn.value = cm(s.d); hIn.value = cm(s.h); elevIn.value = cm(s.elev || 0);
        wall.checked = !!s.wall; e.color = s.color; paintColours();
      }
      name.placeholder = s.label;
      e.shape = shapeSel.value;
    });

    const preview = el('img', { class: 'shot', alt: '' });
    const refreshPreview = () => { const url = itemPreview(collect()); if (url) preview.src = url; };
    for (const i of [wIn, dIn, hIn]) i.addEventListener('change', refreshPreview);
    shapeSel.addEventListener('change', refreshPreview);
    colourBox.addEventListener('click', () => setTimeout(refreshPreview, 0));
    colourBox.addEventListener('change', refreshPreview);
    photoIn.addEventListener('change', () => setTimeout(refreshPreview, 300));
    const collect = () => normalizeEntry({
      ...e, name: name.value.trim() || SHAPES[shapeSel.value].label, shape: shapeSel.value, category: category.value.trim(),
      w: +wIn.value / 100, d: +dIn.value / 100, h: +hIn.value / 100, elev: +elevIn.value / 100, wall: wall.checked,
      qty: +qty.value || 1, price: price.value === '' ? null : +price.value, url: url.value.trim(), notes: notes.value.trim(),
    });
    const finish = (action) => close({ action, entry: collect() });

    form.append(
      el('div', { class: 'dlg-head' },
        el('div', { class: 'stack', style: { flex: 1 } }, el('h2', {}, isNew ? 'Add to your catalogue' : 'Edit item'), field('Name', name)),
        el('div', { class: 'dlg-shot' }, preview)),
      el('div', { class: 'fields2' }, field('3D shape', shapeSel, 'How it’s drawn'), field('Group', category)), catList,
      el('div', { class: 'fields3' },
        el('label', { class: 'f' }, 'Width', el('span', { class: 'inp' }, wIn, ' cm')),
        el('label', { class: 'f' }, 'Depth', el('span', { class: 'inp' }, dIn, ' cm')),
        el('label', { class: 'f' }, 'Height', el('span', { class: 'inp' }, hIn, ' cm'))),
      el('div', { class: 'fields2' },
        el('label', { class: 'f' }, 'Off the floor', el('span', { class: 'inp' }, elevIn, ' cm'), el('span', { class: 'hint' }, 'For shelves and pictures')),
        el('div', { class: 'checks', style: { alignContent: 'center' } }, el('label', {}, wall, 'Hangs on a wall'))),
      el('div', { class: 'block', style: { gap: '6px' } }, el('span', { class: 'lbl' }, 'Colour'), colourBox),
      el('div', { class: 'block', style: { gap: '6px' } }, el('span', { class: 'lbl' }, 'Status'), status),
      el('div', { class: 'fields2' }, qtyField, el('label', { class: 'f' }, 'Price', el('span', { class: 'inp' }, currency, price))),
      field('Shop link', url),
      el('div', { class: 'f' }, 'Photo', el('div', { class: 'photo-row' }, prev,
        el('button', { type: 'button', class: 'btn small', onclick: () => photoIn.click() }, 'Choose a photo'), removePhoto, photoIn)),
      field('Notes', notes),
      el('div', { class: 'foot-btns' },
        !isNew ? el('button', { type: 'button', class: 'btn danger left', onclick: () => close({ action: 'delete', entry: e }) }, 'Delete') : null,
        el('button', { type: 'button', class: 'btn', onclick: () => close() }, 'Cancel'),
        el('button', { type: 'button', class: `btn ${inFlat ? '' : 'primary'}`, onclick: () => finish('save') }, isNew ? 'Save' : 'Save changes'),
        inFlat && isNew ? el('button', { type: 'button', class: 'btn primary', onclick: () => finish('add') }, 'Save and add to this flat') : null),
    );
    refreshPreview();
  }, { wide: true });
}

/** Open the item dialog and apply the result. Returns the saved entry and what to do with it. */
export async function editEntryFlow(entry, opts = {}) {
  const res = await itemDialog(entry, opts);
  if (!res) return null;
  if (res.action === 'delete') { return (await deleteEntry(entry)) ? { action: 'delete', entry } : null; }
  saveEntry(res.entry);
  toast(opts.isNew ? `Added ${res.entry.name} to your catalogue.` : `Saved ${res.entry.name}.`);
  return res;
}

/* ------------------------------------------------------------ the screen */
function card(e, used) {
  const currency = db.prefs.currency || '£';
  const blob = el('span', { class: 'blob', style: { background: e.color } });
  const pic = el('div', { class: 'pic' },
    e.photo ? el('img', { src: e.photo, alt: '' }) : blob,
    e.status === 'buy' ? el('span', { class: 'status tag' }, 'To buy') : null);
  if (!e.photo) {
    const shot = el('img', { class: 'shot', alt: '', hidden: true, onload: () => blob.remove() });
    pic.prepend(shot);
    queuePreview(e, shot);
  }
  const bits = [e.category];
  if (e.price !== null) bits.push(money(e.price, currency));
  if (e.status === 'owned' && e.qty > 1) bits.push(`${e.qty} owned`);
  bits.push(used ? (used === 1 ? 'Placed once' : `Placed ${used} times`) : 'Not placed yet');
  const b = el('button', { type: 'button', class: 'icard', onclick: async () => { await editEntryFlow(e); renderCatalogue(); } },
    pic,
    el('div', { class: 'body' },
      el('span', { class: 'nm' }, e.name),
      el('span', { class: 'dims' }, dimsText(e)),
      el('span', { class: 'line' }, bits.join(' · '))));
  return b;
}

export function renderCatalogue() {
  const used = usageCounts();
  const q = view.q.trim().toLowerCase();
  const cats = [...new Set(db.catalogue.map((e) => e.category))].sort((a, b) => {
    const ia = CATEGORIES.indexOf(a), ib = CATEGORIES.indexOf(b);
    return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib) || a.localeCompare(b);
  });
  if (view.cat && !cats.includes(view.cat)) view.cat = '';
  $('#c-cats').replaceChildren(
    el('button', { type: 'button', class: 'chip', 'aria-pressed': String(!view.cat), onclick: () => { view.cat = ''; renderCatalogue(); } }, 'Everything'),
    ...cats.map((c) => el('button', { type: 'button', class: 'chip', 'aria-pressed': String(view.cat === c), onclick: () => { view.cat = c; renderCatalogue(); } }, c)));
  const list = db.catalogue
    .filter((e) => (view.status === 'all' || e.status === view.status) && (!view.cat || e.category === view.cat))
    .filter((e) => !q || `${e.name} ${e.category} ${e.notes} ${SHAPES[e.shape].label}`.toLowerCase().includes(q))
    .sort((a, b) => (CATEGORIES.indexOf(a.category) + 1 || 99) - (CATEGORIES.indexOf(b.category) + 1 || 99) || a.name.localeCompare(b.name));
  const grid = $('#cat-grid');
  grid.replaceChildren(...list.map((e) => card(e, used.get(e.id) || 0)));
  if (!list.length) grid.append(el('p', { class: 'note' }, db.catalogue.length ? 'Nothing matches.' : 'Your catalogue is empty. Add the things you own or want to buy.'));
  const buy = db.catalogue.filter((e) => e.status === 'buy');
  const total = buy.reduce((s, e) => s + (e.price || 0), 0);
  $('#c-summary').textContent = `${db.catalogue.length} items${buy.length ? ` · ${buy.length} to buy${total ? `, ${money(total, db.prefs.currency)}` : ''}` : ''}`;
  $$('[data-status]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.status === view.status)));
}

export async function importCatalogueFile() {
  const f = await pickFile('.csv,.json,text/csv,application/json');
  if (!f) return 0;
  try {
    const text = await f.text();
    let entries;
    if (/\.csv$/i.test(f.name) || !text.trim().startsWith('{')) entries = entriesFromCsv(text);
    else entries = readFile(JSON.parse(text), db.catalogue).entries;
    const { catalogue, added } = mergeEntries(db.catalogue, entries);
    db.catalogue = catalogue; saveCatalogue();
    toast(added.length ? `Added ${added.length} ${added.length === 1 ? 'item' : 'items'} from ${f.name}.` : `Nothing new in ${f.name}.`);
    return added.length;
  } catch (err) {
    console.error(err);
    toast('That file isn’t a catalogue this planner can read.');
    return 0;
  }
}

export function exportCatalogue() {
  return openDialog((form, close) => {
    const date = new Date().toISOString().slice(0, 10);
    form.append(
      el('h2', {}, 'Export your catalogue'),
      el('div', { class: 'stack' },
        el('button', { type: 'button', class: 'btn wide', onclick: () => { downloadBlob(`catalogue-${date}.csv`, new Blob([entriesToCsv(db.catalogue)], { type: 'text/csv' })); close(); } },
          'As a spreadsheet', el('small', {}, '.csv, opens in Excel, Numbers or Google Sheets. Photos aren’t included.')),
        el('button', { type: 'button', class: 'btn wide', onclick: () => { downloadBlob(`catalogue-${date}.json`, new Blob([JSON.stringify(catalogueFile(db.catalogue), null, 1)], { type: 'application/json' })); close(); } },
          'As a planner file', el('small', {}, '.json, with photos, to open in this planner on another device.'))),
      el('div', { class: 'foot-btns' }, el('button', { type: 'button', class: 'btn', onclick: () => close() }, 'Cancel')));
  });
}

export function bindCatalogueScreen() {
  $('#c-search').addEventListener('input', (e) => { view.q = e.target.value; renderCatalogue(); });
  $$('[data-status]').forEach((b) => b.addEventListener('click', () => { view.status = b.dataset.status; renderCatalogue(); }));
  $('#c-new').addEventListener('click', async () => { await editEntryFlow(newEntry('sofa'), { isNew: true }); renderCatalogue(); });
  $('#c-import').addEventListener('click', async () => { await importCatalogueFile(); renderCatalogue(); });
  $('#c-export').addEventListener('click', exportCatalogue);
}

