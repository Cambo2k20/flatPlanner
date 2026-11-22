/* Small reusable bits of interface: dialogs, colour swatches, number fields. */
import { cm, el } from '../core/util.js';

/**
 * Show the shared <dialog>. render(form, close) fills it in; close(value) shuts it and
 * resolves the returned promise with value (undefined if dismissed with Escape).
 */
export function openDialog(render, { wide = false } = {}) {
  const dlg = document.getElementById('dlg');
  if (dlg.open) dlg.close();
  return new Promise((resolve) => {
    let result;
    const close = (v) => { result = v; dlg.close(); };
    const form = el('form', { method: 'dialog', novalidate: true });
    form.addEventListener('submit', (e) => e.preventDefault());
    // let dialogs pass optional parts as null, like el() does
    const append = form.append.bind(form);
    form.append = (...kids) => append(...kids.flat(Infinity).filter((k) => k !== null && k !== undefined && k !== false));
    dlg.replaceChildren(form);
    dlg.style.width = wide ? 'min(720px, calc(100vw - 24px))' : '';
    render(form, close);
    dlg.onclose = () => { dlg.onclose = null; resolve(result); };
    dlg.showModal();
    const first = form.querySelector('[autofocus]') || form.querySelector('input:not([type=hidden]), select, textarea');
    if (first) first.focus();
  });
}

export function confirmDialog({ title, text, ok = 'OK', danger = false, cancel = 'Cancel' }) {
  return openDialog((form, close) => {
    form.append(
      el('h2', {}, title),
      text ? el('p', { class: 'lead' }, text) : null,
      el('div', { class: 'foot-btns' },
        el('button', { type: 'button', class: 'btn', onclick: () => close(false) }, cancel),
        el('button', { type: 'button', class: `btn ${danger ? 'danger' : 'primary'}`, onclick: () => close(true), autofocus: true }, ok)),
    );
  }).then((v) => !!v);
}

/** Colour swatches plus a "+" that opens the system colour picker. onPick(colour, live). */
export function swatchRow(list, current, onPick, customLabel = 'Pick any colour') {
  const box = el('div', { class: 'swatches' });
  for (const [c, name] of list) {
    box.append(el('button', {
      type: 'button', class: 'sw', style: { background: c }, title: name, 'aria-label': name,
      'aria-pressed': String(c.toLowerCase() === String(current).toLowerCase()), onclick: () => onPick(c, false),
    }));
  }
  const inp = el('input', { type: 'color', value: current, 'aria-label': customLabel });
  inp.addEventListener('input', () => onPick(inp.value, true));
  inp.addEventListener('change', () => onPick(inp.value, false));
  box.append(el('label', { class: 'sw-custom', title: customLabel }, '+', inp));
  return box;
}

/** A labelled number field in centimetres. onChange gets metres. */
export function cmField(label, metres, onChange, { min = 1, max = 2000, hint = '', step = 1, id } = {}) {
  const input = el('input', { type: 'number', min, max, step, inputmode: 'numeric', value: String(cm(metres)), id });
  input.addEventListener('change', () => {
    const v = parseFloat(input.value);
    if (!Number.isFinite(v)) { input.value = String(cm(metres)); return; }
    onChange(Math.min(max, Math.max(min, v)) / 100);
  });
  return el('label', { class: 'f' }, label, el('span', { class: 'inp' }, input, ' cm'), hint ? el('span', { class: 'hint' }, hint) : null);
}

export function field(label, control, hint) {
  return el('label', { class: 'f' }, label, control, hint ? el('span', { class: 'hint' }, hint) : null);
}

/** Pick a file with the shared hidden input. Resolves with the File, or null. */
export function pickFile(accept) {
  const input = document.getElementById('file-any');
  return new Promise((resolve) => {
    input.accept = accept || '.json,.csv';
    input.value = '';
    const done = () => { input.removeEventListener('change', done); resolve(input.files && input.files[0] ? input.files[0] : null); };
    input.addEventListener('change', done);
    input.click();
  });
}
