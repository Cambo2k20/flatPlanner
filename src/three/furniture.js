/* Builders for every shape: furniture from your catalogue and a flat's fixed fittings.
   Each takes an item (w, d, h in metres, colour…) and returns a group whose origin is
   the middle of its footprint on the floor, front facing +z. */
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { cornerSeatDepth } from '../core/placement.js';
import { clamp, rad, rng } from '../core/util.js';
import { artTexture, fabricMat, imageTexture, legMat, metalMat, roomMats, shade, stdMat, woodMat } from './materials.js';

/* ------------------------------------------------------------ mesh helpers */
export function B(w, h, d, mat, x = 0, y = 0, z = 0, r = 0) {
  const rr = Math.min(r, w / 2 - 0.001, h / 2 - 0.001, d / 2 - 0.001);
  const g = rr > 0.003 ? new RoundedBoxGeometry(w, h, d, 2, rr) : new THREE.BoxGeometry(w, h, d);
  const m = new THREE.Mesh(g, mat); m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true; return m;
}
export function C(rt, rb, h, mat, x = 0, y = 0, z = 0, seg = 20, open = false) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg, 1, open), mat);
  m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true; return m;
}
/** A box for the building itself: receives shadows but doesn't cast them. */
export function RB(w, h, d, mat, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); m.position.set(x, y, z); m.receiveShadow = true; return m;
}
export function disposeGeo(obj) { obj.traverse((o) => { if (o.geometry) o.geometry.dispose(); }); }

function addLegs(g, w, d, legH, inset, mat = legMat()) {
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.add(B(0.04, legH, 0.04, mat, sx * (w / 2 - inset), legH / 2, sz * (d / 2 - inset)));
}
function sofaLike(it, o = {}) {
  const { w, d, h } = it; const g = new THREE.Group();
  const f = fabricMat(it.color), f2 = fabricMat(shade(it.color, 1.05));
  const legH = 0.08, armW = o.armW ?? clamp(w * 0.08, 0.12, 0.18), backD = clamp(d * 0.2, 0.14, 0.22);
  const seatTop = clamp(h * 0.53, 0.3, 0.48), armTop = clamp(h * 0.72, seatTop + 0.08, h);
  addLegs(g, w, d, legH, 0.06);
  const baseH = Math.max(0.05, seatTop - 0.14 - legH);
  g.add(B(w, baseH, d, f, 0, legH + baseH / 2, 0, 0.02));
  g.add(B(w, h - legH, backD, f, 0, legH + (h - legH) / 2, -d / 2 + backD / 2, 0.04));
  for (const s of [-1, 1]) g.add(B(armW, armTop - legH, d, f, s * (w / 2 - armW / 2), legH + (armTop - legH) / 2, 0, 0.04));
  const inner = Math.max(0.2, w - 2 * armW), n = o.seats ?? clamp(Math.round(inner / 0.6), 1, 4), cw = inner / n;
  const cd = d - backD - 0.01, bh = clamp(h - seatTop - 0.02, 0.12, 0.5);
  for (let i = 0; i < n; i++) {
    const x = -inner / 2 + cw * (i + 0.5);
    g.add(B(cw - 0.012, 0.15, cd, f2, x, seatTop - 0.075, -d / 2 + backD + cd / 2, 0.05));
    const bc = B(cw - 0.02, bh, 0.15, f2, x, seatTop + bh / 2 - 0.01, -d / 2 + backD + 0.07, 0.06); bc.rotation.x = -0.1; g.add(bc);
  }
  return g;
}

export const BUILD = {
  sofa: (it) => sofaLike(it),
  armchair: (it) => sofaLike(it, { armW: clamp(it.w * 0.2, 0.12, 0.2), seats: 1 }),
  cornerSofa(it) {
    const { w, d, h } = it; const outer = new THREE.Group(), g = new THREE.Group(); outer.add(g);
    if (it.mirror) g.scale.x = -1;
    const f = fabricMat(it.color), f2 = fabricMat(shade(it.color, 1.05));
    const sd = cornerSeatDepth(it), legH = 0.08, armW = 0.16, backD = 0.2;
    const seatTop = clamp(h * 0.53, 0.3, 0.48), armTop = clamp(h * 0.72, seatTop + 0.08, h), baseH = Math.max(0.05, seatTop - 0.14 - legH);
    const bh = clamp(h - seatTop - 0.02, 0.12, 0.5);
    g.add(B(w, baseH, sd, f, 0, legH + baseH / 2, -d / 2 + sd / 2, 0.02));
    g.add(B(sd, baseH, d - sd, f, -w / 2 + sd / 2, legH + baseH / 2, -d / 2 + sd + (d - sd) / 2, 0.02));
    g.add(B(w, h - legH, backD, f, 0, legH + (h - legH) / 2, -d / 2 + backD / 2, 0.04));
    g.add(B(backD, h - legH, d - backD, f, -w / 2 + backD / 2, legH + (h - legH) / 2, -d / 2 + backD + (d - backD) / 2, 0.04));
    g.add(B(armW, armTop - legH, sd, f, w / 2 - armW / 2, legH + (armTop - legH) / 2, -d / 2 + sd / 2, 0.04));
    g.add(B(sd, armTop - legH, armW, f, -w / 2 + sd / 2, legH + (armTop - legH) / 2, d / 2 - armW / 2, 0.04));
    const lx0 = -w / 2 + backD, lx1 = w / 2 - armW, ln = clamp(Math.round((lx1 - lx0) / 0.65), 1, 5), lcw = (lx1 - lx0) / ln, cdz = sd - backD;
    for (let i = 0; i < ln; i++) {
      const x = lx0 + lcw * (i + 0.5);
      g.add(B(lcw - 0.012, 0.15, cdz - 0.01, f2, x, seatTop - 0.075, -d / 2 + backD + cdz / 2, 0.05));
      const bc = B(lcw - 0.02, bh, 0.15, f2, x, seatTop + bh / 2 - 0.01, -d / 2 + backD + 0.07, 0.06); bc.rotation.x = -0.1; g.add(bc);
    }
    const sz0 = -d / 2 + sd, sz1 = d / 2 - armW, sn = clamp(Math.round((sz1 - sz0) / 0.65), 1, 4), scw = (sz1 - sz0) / sn, cdx = sd - backD;
    for (let i = 0; i < sn; i++) {
      const z = sz0 + scw * (i + 0.5);
      g.add(B(cdx - 0.01, 0.15, scw - 0.012, f2, -w / 2 + backD + cdx / 2, seatTop - 0.075, z, 0.05));
      const bc = B(0.15, bh, scw - 0.02, f2, -w / 2 + backD + 0.07, seatTop + bh / 2 - 0.01, z, 0.06); bc.rotation.z = 0.1; g.add(bc);
    }
    const L = legMat();
    for (const [x, z] of [[-w / 2 + 0.06, -d / 2 + 0.06], [w / 2 - 0.06, -d / 2 + 0.06], [w / 2 - 0.06, -d / 2 + sd - 0.06], [-w / 2 + 0.06, d / 2 - 0.06], [-w / 2 + sd - 0.06, d / 2 - 0.06]]) g.add(B(0.04, legH, 0.04, L, x, legH / 2, z));
    return outer;
  },
  ottoman(it) {
    const { w, d, h } = it; const g = new THREE.Group();
    addLegs(g, w, d, 0.05, 0.05);
    g.add(B(w, h - 0.05, d, fabricMat(it.color), 0, 0.05 + (h - 0.05) / 2, 0, 0.05));
    return g;
  },
  diningChair(it) {
    const { w, d, h } = it; const g = new THREE.Group(); const m = woodMat(it.color); const seatY = Math.min(0.46, h * 0.52);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.add(C(0.015, 0.013, seatY, m, sx * (w / 2 - 0.04), seatY / 2, sz * (d / 2 - 0.04), 10));
    g.add(B(w, 0.04, d - 0.02, fabricMat(shade(it.color, 1.15)), 0, seatY + 0.02, 0.01, 0.012));
    const back = B(w, h - seatY - 0.05, 0.035, m, 0, seatY + 0.04 + (h - seatY - 0.05) / 2, -d / 2 + 0.02, 0.01); back.rotation.x = -0.08; g.add(back);
    return g;
  },
  officeChair(it) {
    const { w, d, h } = it; const g = new THREE.Group(); const mm = metalMat(), f = fabricMat(it.color);
    for (let k = 0; k < 5; k++) { const a = (k * Math.PI * 2) / 5; const arm = B(0.035, 0.03, w * 0.42, mm, Math.sin(a) * w * 0.21, 0.07, Math.cos(a) * w * 0.21); arm.rotation.y = a; g.add(arm); g.add(C(0.025, 0.025, 0.04, mm, Math.sin(a) * w * 0.42, 0.025, Math.cos(a) * w * 0.42, 10)); }
    g.add(C(0.025, 0.025, 0.36, mm, 0, 0.26, 0, 12));
    g.add(B(w * 0.82, 0.08, d * 0.78, f, 0, 0.48, 0.03, 0.035));
    g.add(B(0.05, 0.22, 0.03, mm, 0, 0.6, -d * 0.36));
    g.add(B(w * 0.76, Math.max(0.2, h - 0.62), 0.07, f, 0, 0.62 + Math.max(0.2, h - 0.62) / 2, -d * 0.38, 0.03));
    return g;
  },
  bed(it) {
    const { w, d, h } = it; const g = new THREE.Group();
    const f = fabricMat(it.color), linen = fabricMat('#f2efe9'), duvet = fabricMat('#e6e0d4');
    const baseTop = 0.32, mattH = 0.22, hbD = 0.08, hbH = Math.max(baseTop + mattH + 0.15, h);
    addLegs(g, w, d - hbD, 0.06, 0.07);
    g.add(B(w, baseTop - 0.06, d - hbD, f, 0, 0.06 + (baseTop - 0.06) / 2, hbD / 2, 0.02));
    g.add(B(w, hbH, hbD, f, 0, hbH / 2, -d / 2 + hbD / 2, 0.03));
    const mw = w - 0.06, mz0 = -d / 2 + hbD + 0.02, mz1 = d / 2 - 0.03, md = mz1 - mz0;
    g.add(B(mw, mattH, md, linen, 0, baseTop + mattH / 2, (mz0 + mz1) / 2, 0.05));
    const dl = md * 0.7;
    g.add(B(mw + 0.05, 0.07, dl, duvet, 0, baseTop + mattH + 0.015, mz1 + 0.025 - dl / 2, 0.035));
    const np = w > 1.2 ? 2 : 1, pw = (mw - 0.1) / np;
    for (let i = 0; i < np; i++) g.add(B(pw - 0.05, 0.12, 0.42, linen, -mw / 2 + 0.05 + pw * (i + 0.5), baseTop + mattH + 0.06, mz0 + 0.26, 0.055));
    return g;
  },
  drawers(it) {
    const { w, d, h } = it; const g = new THREE.Group(); const m = woodMat(it.color), line = stdMat(shade(it.color, 0.6), 0.8), knob = metalMat();
    const plinth = 0.06, bodyH = h - plinth, n = clamp(Math.round(bodyH / 0.2), 1, 6);
    g.add(B(w - 0.03, plinth, d - 0.04, stdMat(shade(it.color, 0.7), 0.8), 0, plinth / 2, -0.01));
    g.add(B(w, bodyH, d, m, 0, plinth + bodyH / 2, 0, 0.005));
    for (let i = 1; i < n; i++) g.add(B(w * 0.96, 0.005, 0.006, line, 0, plinth + (bodyH * i) / n, d / 2 + 0.001));
    for (let i = 0; i < n; i++) { const kn = C(0.012, 0.012, 0.02, knob, 0, plinth + (bodyH * (i + 0.5)) / n, d / 2 + 0.01, 10); kn.rotation.x = Math.PI / 2; g.add(kn); }
    return g;
  },
  wardrobe(it) {
    const { w, d, h } = it; const g = new THREE.Group(); const m = woodMat(it.color), line = stdMat(shade(it.color, 0.6), 0.8), bar = metalMat();
    const plinth = 0.06, bodyH = h - plinth, doors = clamp(Math.round(w / 0.5), 1, 4);
    g.add(B(w - 0.03, plinth, d - 0.04, stdMat(shade(it.color, 0.7), 0.8), 0, plinth / 2, -0.01));
    g.add(B(w, bodyH, d, m, 0, plinth + bodyH / 2, 0, 0.005));
    for (let i = 1; i < doors; i++) g.add(B(0.005, bodyH * 0.97, 0.006, line, -w / 2 + (w * i) / doors, plinth + bodyH / 2, d / 2 + 0.001));
    for (let i = 0; i < doors; i++) { const x = -w / 2 + (w * (i + 0.5)) / doors + (i % 2 ? -1 : 1) * (w / doors) * 0.38; g.add(B(0.015, 0.3, 0.02, bar, x, plinth + bodyH * 0.52, d / 2 + 0.012)); }
    return g;
  },
  coffeeTable(it) {
    const { w, d, h } = it; const g = new THREE.Group(); const top = woodMat(it.color), m = metalMat();
    g.add(B(w, 0.035, d, top, 0, h - 0.0175, 0, 0.006));
    g.add(B(w - 0.06, 0.022, d - 0.06, top, 0, 0.12, 0, 0.004));
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.add(B(0.03, h - 0.035, 0.03, m, sx * (w / 2 - 0.025), (h - 0.035) / 2, sz * (d / 2 - 0.025)));
    return g;
  },
  sideTable(it) {
    const { w, d, h } = it; const g = new THREE.Group(); const m = metalMat();
    const top = C(w / 2, w / 2, 0.025, woodMat(it.color), 0, h - 0.0125, 0, 36); top.scale.z = d / w; g.add(top);
    g.add(C(0.018, 0.018, h - 0.025, m, 0, (h - 0.025) / 2, 0, 12));
    g.add(C(w * 0.3, w * 0.32, 0.02, m, 0, 0.01, 0, 28));
    return g;
  },
  diningTable(it) {
    const { w, d, h } = it; const g = new THREE.Group(); const m = woodMat(it.color);
    g.add(B(w, 0.04, d, m, 0, h - 0.02, 0, 0.006));
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.add(B(0.06, h - 0.04, 0.06, m, sx * (w / 2 - 0.07), (h - 0.04) / 2, sz * (d / 2 - 0.07)));
    return g;
  },
  desk(it) {
    const { w, d, h } = it; const g = new THREE.Group(); const m = woodMat(it.color), mm = metalMat();
    g.add(B(w, 0.03, d, m, 0, h - 0.015, 0, 0.005));
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.add(B(0.04, h - 0.03, 0.04, mm, sx * (w / 2 - 0.04), (h - 0.03) / 2, sz * (d / 2 - 0.04)));
    return g;
  },
  drawerDesk(it) {
    // A worktop resting on two five-drawer units (one if the desk is narrow), with
    // small round pads between them, cut-out drawer handles and a cable hole.
    const { w, d, h } = it; const g = new THREE.Group();
    const top = woodMat(it.color), body = stdMat('#f3f2ef', 0.7), recess = stdMat('#55585b', 0.9), line = stdMat('#d9d8d4', 0.8), pad = stdMat('#1c1d1f', 0.6);
    const topT = Math.min(0.034, h * 0.1), padH = 0.015, pedH = Math.max(0.2, h - topT - padH);
    const pw = Math.min(0.36, w * 0.4), pd = Math.min(0.58, d - 0.02), pz = d / 2 - 0.01 - pd / 2, inset = Math.min(0.04, w * 0.03);
    g.add(B(w, topT, d, top, 0, h - topT / 2, 0, 0.004));
    const hole = C(0.03, 0.03, 0.002, recess, -w / 2 + Math.min(0.12, w * 0.1), h + 0.001, 0, 24); g.add(hole);
    const xs = w >= 1.0 ? [-w / 2 + inset + pw / 2, w / 2 - inset - pw / 2] : [w / 2 - inset - pw / 2];
    const n = 5, gap = 0.004, fh = (pedH - gap * (n + 1)) / n;
    const handle = new THREE.Shape(); handle.absarc(0, 0, 1, Math.PI, 2 * Math.PI, false); handle.lineTo(-1, 0);
    const handleGeo = new THREE.ShapeGeometry(handle, 16);
    for (const x of xs) {
      g.add(B(pw, pedH, pd, body, x, pedH / 2, pz, 0.003));
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.add(C(0.025, 0.025, padH, pad, x + sx * (pw / 2 - 0.04), pedH + padH / 2, pz + sz * (pd / 2 - 0.05), 16));
      for (let i = 0; i < n; i++) {
        const y0 = gap + i * (fh + gap), yTop = y0 + fh;
        if (i) g.add(RB(pw - 0.01, gap, 0.002, line, x, y0 - gap / 2, pz + pd / 2 + 0.001));
        const cut = new THREE.Mesh(handleGeo, recess);
        cut.scale.set(pw * 0.24, Math.min(0.022, fh * 0.2), 1);
        cut.position.set(x, yTop - 0.004, pz + pd / 2 + 0.0015); g.add(cut);
      }
    }
    return g;
  },
  tvUnit(it) {
    const { w, d, h } = it; const g = new THREE.Group(); const m = woodMat(it.color), dark = stdMat('#1d1b19', 0.85);
    const legH = Math.min(0.12, h * 0.25), bodyH = h - legH;
    g.add(B(w, bodyH, d, m, 0, legH + bodyH / 2, 0, 0.006));
    g.add(B(w * 0.42, bodyH * 0.62, 0.01, dark, -w / 2 + w * 0.26, legH + bodyH / 2, d / 2 - 0.002));
    g.add(B(0.004, bodyH * 0.84, 0.006, dark, w * 0.08, legH + bodyH / 2, d / 2 + 0.001));
    g.add(B(0.004, bodyH * 0.84, 0.006, dark, w * 0.3, legH + bodyH / 2, d / 2 + 0.001));
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.add(C(0.016, 0.01, legH, m, sx * (w / 2 - 0.07), legH / 2, sz * (d / 2 - 0.06), 10));
    return g;
  },
  sideboard(it) {
    const { w, d, h } = it; const g = new THREE.Group(); const m = woodMat(it.color), dark = stdMat(shade(it.color, 0.6), 0.8), knob = metalMat();
    const legH = Math.min(0.14, h * 0.2), bodyH = h - legH, doors = clamp(Math.round(w / 0.5), 1, 5);
    g.add(B(w, bodyH, d, m, 0, legH + bodyH / 2, 0, 0.006));
    for (let i = 1; i < doors; i++) g.add(B(0.004, bodyH * 0.9, 0.006, dark, -w / 2 + (w * i) / doors, legH + bodyH / 2, d / 2 + 0.001));
    for (let i = 0; i < doors; i++) { const kn = C(0.012, 0.012, 0.02, knob, -w / 2 + (w * (i + 0.5)) / doors + (i % 2 ? -1 : 1) * (w / doors) * 0.35, legH + bodyH * 0.7, d / 2 + 0.01, 10); kn.rotation.x = Math.PI / 2; g.add(kn); }
    addLegs(g, w, d, legH, 0.06, m);
    return g;
  },
  bookcase(it) {
    const { w, d, h } = it; const g = new THREE.Group(); const m = woodMat(it.color), th = 0.018;
    for (const s of [-1, 1]) g.add(B(th, h, d, m, s * (w / 2 - th / 2), h / 2, 0));
    g.add(B(w, th, d, m, 0, h - th / 2, 0));
    g.add(B(w, 0.06, d, m, 0, 0.03, 0));
    g.add(B(w - 0.01, h - 0.01, 0.006, stdMat(shade(it.color, 0.8), 0.7), 0, h / 2, -d / 2 + 0.003));
    const n = Math.max(1, Math.round((h - 0.08) / 0.34)), gap = (h - 0.06 - th) / n;
    for (let k = 1; k < n; k++) g.add(B(w - 2 * th, th, d - 0.01, m, 0, 0.06 + k * gap, 0.005));
    const r = rng(it.id), cols = ['#7a3b2e', '#2f4858', '#c9a227', '#4f6d47', '#d8cfc0', '#5b4a6b', '#a8553a', '#1f2b33', '#b9b3a6', '#3e6a74'];
    for (let k = 0; k < n; k++) {
      const y = 0.06 + k * gap + (k > 0 ? th / 2 : 0); let x = -w / 2 + th + 0.01; const end = w / 2 - th - 0.01;
      if (r() < 0.15) continue;
      while (x < end) {
        const bw = 0.018 + r() * 0.03; if (x + bw > end) break;
        if (r() < 0.07) { x += 0.06 + r() * 0.16; continue; }
        const bhh = Math.min(gap - th - 0.025, 0.16 + r() * 0.12), bd = Math.min(d - 0.04, 0.13 + r() * 0.08);
        if (bhh < 0.05 || bd < 0.03) break;
        const bk = B(bw - 0.002, bhh, bd, stdMat(cols[Math.floor(r() * cols.length)], 0.8), x + bw / 2, y + bhh / 2, d / 2 - 0.02 - bd / 2);
        bk.castShadow = false; g.add(bk); x += bw;
      }
    }
    return g;
  },
  cubeUnit(it) {
    const { w, d, h } = it; const g = new THREE.Group(); const m = woodMat(it.color), th = 0.03;
    const cols = Math.max(1, Math.round(w / 0.38)), rows = Math.max(1, Math.round(h / 0.38));
    for (let i = 0; i <= cols; i++) g.add(B(th, h, d, m, -w / 2 + th / 2 + ((w - th) * i) / cols, h / 2, 0));
    for (let j = 0; j <= rows; j++) g.add(B(w, th, d, m, 0, th / 2 + ((h - th) * j) / rows, 0));
    g.add(B(w - 0.01, h - 0.01, 0.005, stdMat(shade(it.color, 0.88), 0.8), 0, h / 2, -d / 2 + 0.003));
    return g;
  },
  wallShelf(it) {
    const { w, d, h } = it; const g = new THREE.Group(); const m = woodMat(it.color), mm = metalMat();
    g.add(B(w, h, d, m, 0, h / 2, 0, 0.003));
    for (const s of [-1, 1]) g.add(B(0.02, 0.12, d * 0.8, mm, s * w * 0.32, -0.06, -d * 0.1));
    return g;
  },
  tv(it) {
    const { w, d, h } = it; const g = new THREE.Group(); const panelH = Math.max(0.1, h - 0.07);
    g.add(B(w, panelH, 0.045, stdMat(it.color, 0.5), 0, 0.07 + panelH / 2, 0, 0.004));
    const screen = new THREE.Mesh(new THREE.PlaneGeometry(w - 0.02, panelH - 0.02), stdMat('#06080a', 0.15, 0.3));
    screen.position.set(0, 0.07 + panelH / 2, 0.0231); g.add(screen);
    for (const s of [-1, 1]) { g.add(B(0.05, 0.075, 0.03, metalMat(), s * (w / 2 - 0.14), 0.0375, 0)); g.add(B(0.06, 0.012, d, metalMat(), s * (w / 2 - 0.14), 0.006, 0)); }
    return g;
  },
  monitor(it) {
    // A screen on a single stand: a flat base, a neck at the back, the panel above.
    const { w, d, h } = it; const g = new THREE.Group();
    const body = stdMat(it.color, 0.45), screenMat = stdMat('#06080a', 0.15, 0.3);
    const ph = Math.min(h * 0.8, w * 0.62), pt = 0.022, pz = -d / 2 + Math.min(0.06, d * 0.35);
    g.add(B(Math.min(w * 0.42, 0.26), 0.014, d, body, 0, 0.007, 0, 0.006));
    g.add(B(0.045, h - ph * 0.5, 0.025, body, 0, (h - ph * 0.5) / 2, pz - pt / 2 - 0.012, 0.006));
    g.add(B(w, ph, pt, body, 0, h - ph / 2, pz, 0.006));
    const screen = new THREE.Mesh(new THREE.PlaneGeometry(w - 0.016, ph - 0.03), screenMat);
    screen.position.set(0, h - ph / 2 + 0.006, pz + pt / 2 + 0.0005); g.add(screen);
    return g;
  },
  pcTower(it) {
    // A windowed tower case standing on its feet, front facing +z: glass on the left
    // side (the right when mirrored) showing the parts inside, a mesh front with two
    // light strips, and ports on top.
    const { w, d, h } = it; const g = new THREE.Group();
    const shell = stdMat(it.color, 0.55), mesh = stdMat(shade(it.color, 0.9), 0.95), dark = stdMat('#1b1c1e', 0.6), board = stdMat('#2a2d31', 0.7);
    const glow = stdMat('#7fe9ff', 0.4, 0, { emissive: '#3fd6ff', emissiveIntensity: 1.4 });
    const feet = Math.min(0.014, h * 0.04), bh = h - feet, mid = feet + bh / 2, t = 0.006;
    const fd = 0.03, bd = d - fd, bz = -fd / 2, bar = Math.min(0.03, d * 0.07);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.add(B(Math.min(0.05, w * 0.2), feet, 0.06, dark, sx * (w / 2 - 0.035), feet / 2, sz * (d / 2 - 0.06)));
    // the shell: right side, top, bottom and back, with a white frame round the window
    g.add(B(t, bh, bd, shell, w / 2 - t / 2, mid, bz));
    g.add(B(w, t, bd, shell, 0, h - t / 2, bz)); g.add(B(w, t, bd, shell, 0, feet + t / 2, bz));
    g.add(B(w, bh, t, shell, 0, mid, -d / 2 + t / 2));
    for (const y of [feet + bar / 2, h - bar / 2]) g.add(B(t, bar, bd, shell, -w / 2 + t / 2, y, bz));
    for (const z of [-d / 2 + bar / 2, d / 2 - fd - bar / 2]) g.add(B(t, bh, bar, shell, -w / 2 + t / 2, mid, z));
    // inside: motherboard, power-supply cover, graphics card, cooler, memory, rear fan
    const ih = bh - 2 * t, y0 = feet + t;
    g.add(B(0.004, ih * 0.7, bd - 0.04, board, w / 2 - t - 0.002, y0 + ih * 0.62, bz));
    g.add(B(w - 2 * t, ih * 0.24, bd - 0.01, shell, 0, y0 + ih * 0.12, bz));
    g.add(B(w * 0.5, 0.045, bd * 0.62, stdMat('#3a3d42', 0.5, 0.3), w / 2 - t - w * 0.25, y0 + ih * 0.42, bz + bd * 0.06));
    g.add(B(0.012, 0.05, 0.05, glow, w / 2 - t - 0.012, y0 + ih * 0.74, bz - bd * 0.02));
    for (const dz of [0.06, 0.075]) g.add(B(0.008, 0.11, 0.006, glow, w / 2 - t - 0.01, y0 + ih * 0.74, bz + dz));
    const fan = new THREE.Mesh(new THREE.RingGeometry(Math.min(0.045, ih * 0.11), Math.min(0.06, ih * 0.14), 28), glow);
    fan.position.set(0, y0 + ih * 0.78, -d / 2 + t + 0.002); g.add(fan);
    g.add(B(0.004, 0.006, bd * 0.85, glow, -w / 2 + t + 0.01, h - t - 0.01, bz));
    const glass = new THREE.Mesh(new THREE.PlaneGeometry(bd - 2 * bar, bh - 2 * bar), stdMat('#20323a', 0.05, 0.2, { transparent: true, opacity: 0.28, depthWrite: false }));
    glass.rotation.y = -Math.PI / 2; glass.position.set(-w / 2 + t / 2, mid, bz); g.add(glass);
    // front: mesh panel standing slightly proud, two light strips, ports on top
    g.add(B(w, bh * 0.985, fd, mesh, 0, mid, d / 2 - fd / 2, 0.012));
    for (const sx of [-0.12, 0.12]) g.add(B(0.006, bh * 0.8, 0.004, glow, sx * w, mid - bh * 0.03, d / 2 + 0.001));
    g.add(B(w * 0.55, 0.004, 0.06, dark, 0, h + 0.001, d / 2 - 0.05));
    if (it.mirror) g.scale.x = -1;
    return g;
  },
  microwave(it) {
    // A countertop microwave: door with a window on the left, dials on the right.
    const { w, d, h } = it; const g = new THREE.Group();
    const body = stdMat(it.color, 0.35, 0.55), face = stdMat(shade(it.color, 0.82), 0.3, 0.5), knob = stdMat('#202326', 0.5);
    const feet = 0.012, bodyH = Math.max(0.08, h - feet), mid = feet + bodyH / 2;
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.add(C(0.012, 0.012, feet, knob, sx * (w / 2 - 0.05), feet / 2, sz * (d / 2 - 0.05), 10));
    g.add(B(w, bodyH, d, body, 0, mid, 0, 0.012));
    const panelW = clamp(w * 0.24, 0.07, 0.14), doorW = Math.max(0.1, w - panelW - 0.02), doorH = bodyH - 0.03;
    const doorX = -w / 2 + 0.008 + doorW / 2;
    g.add(B(doorW, doorH, 0.012, face, doorX, mid, d / 2 + 0.006, 0.006));
    const glass = new THREE.Mesh(new THREE.PlaneGeometry(doorW * 0.7, doorH * 0.64), stdMat('#15181b', 0.12, 0.25));
    glass.position.set(doorX - doorW * 0.07, mid, d / 2 + 0.0125); g.add(glass);
    g.add(B(0.014, doorH * 0.62, 0.016, metalMat(), doorX + doorW / 2 - 0.03, mid, d / 2 + 0.02, 0.005));
    const r = Math.min(panelW * 0.26, 0.022), px = w / 2 - panelW / 2 - 0.004;
    for (const dy of [0.2, -0.2]) {
      const dial = C(r, r, 0.016, knob, px, mid + bodyH * dy, d / 2 + 0.008, 24);
      dial.rotation.x = Math.PI / 2; g.add(dial);
    }
    return g;
  },
  floorLamp(it) {
    const { w, h } = it; const g = new THREE.Group(); const m = metalMat();
    g.add(C(w * 0.35, w * 0.38, 0.025, m, 0, 0.0125, 0, 32));
    g.add(C(0.012, 0.012, h - 0.3, m, 0, (h - 0.3) / 2, 0, 12));
    g.add(C(w * 0.34, w * 0.5, 0.3, stdMat(it.color, 0.9, 0, { side: THREE.DoubleSide, emissive: '#ffe3b5', emissiveIntensity: 0.25 }), 0, h - 0.15, 0, 36, true));
    return g;
  },
  rug(it) {
    const { w, d, h } = it; const g = new THREE.Group();
    const a = B(w, h, d, fabricMat(shade(it.color, 0.78)), 0, h / 2, 0); a.castShadow = false; g.add(a);
    const bw = Math.min(0.08, w * 0.08);
    const b = B(Math.max(0.02, w - 2 * bw), h, Math.max(0.02, d - 2 * bw), fabricMat(it.color), 0, h / 2 + 0.0008, 0); b.castShadow = false; g.add(b);
    return g;
  },
  plant(it) {
    const { w, h } = it; const g = new THREE.Group(); const potH = Math.min(0.35, h * 0.3);
    g.add(C(w * 0.42, w * 0.32, potH, stdMat(it.color, 0.7), 0, potH / 2, 0, 24));
    g.add(C(w * 0.39, w * 0.39, 0.01, stdMat('#3b2a1e', 1), 0, potH - 0.02, 0, 20));
    const r = rng(it.id), A = stdMat('#3f6b35', 0.7), Bm = stdMat('#5c8a3f', 0.7), n = 9;
    for (let i = 0; i < n; i++) {
      const lh = Math.max(0.05, (h - potH) * (0.55 + r() * 0.45));
      const leaf = new THREE.Mesh(new THREE.ConeGeometry(0.03 + r() * 0.025, lh, 5), r() < 0.5 ? A : Bm);
      leaf.scale.z = 0.35; leaf.position.set((r() - 0.5) * w * 0.4, potH + lh / 2 - 0.02, (r() - 0.5) * w * 0.4);
      leaf.rotation.set((r() - 0.5) * 0.35, r() * Math.PI, (r() - 0.5) * 0.35); leaf.castShadow = true; g.add(leaf);
    }
    return g;
  },
  art(it, ctx) {
    const { w, d, h } = it; const g = new THREE.Group();
    g.add(B(w, h, d, stdMat('#1f1f1f', 0.6), 0, h / 2, 0));
    const photo = ctx && ctx.photo;
    const map = photo ? imageTexture(photo) : artTexture(it.id, it.color, h / w);
    const pic = new THREE.Mesh(new THREE.PlaneGeometry(Math.max(0.01, w - 0.06), Math.max(0.01, h - 0.06)), new THREE.MeshStandardMaterial({ map, roughness: 0.8 }));
    pic.position.set(0, h / 2, d / 2 + 0.001); g.add(pic);
    return g;
  },
  recordFrame(it, ctx) {
    // A record frame: a slim box frame round the sleeve, behind glass. With a photo the
    // sleeve is your photo; without one, a black record with a coloured label.
    const { w, d, h } = it; const g = new THREE.Group();
    const frame = stdMat(it.color, 0.5), fw = Math.min(0.02, Math.min(w, h) * 0.07);
    const iw = Math.max(0.02, w - 2 * fw), ih = Math.max(0.02, h - 2 * fw);
    g.add(B(w, fw, d, frame, 0, h - fw / 2, 0)); g.add(B(w, fw, d, frame, 0, fw / 2, 0));
    g.add(B(fw, ih, d, frame, -w / 2 + fw / 2, h / 2, 0)); g.add(B(fw, ih, d, frame, w / 2 - fw / 2, h / 2, 0));
    g.add(B(iw, ih, 0.004, stdMat('#1d1d1f', 0.9), 0, h / 2, -d / 2 + 0.002));
    const z = d / 2 - 0.008, photo = ctx && ctx.photo;
    if (photo) {
      const pic = new THREE.Mesh(new THREE.PlaneGeometry(iw, ih), new THREE.MeshStandardMaterial({ map: imageTexture(photo), roughness: 0.7 }));
      pic.position.set(0, h / 2, z); g.add(pic);
    } else {
      const r = Math.min(iw, ih) / 2 - 0.006;
      const disc = new THREE.Mesh(new THREE.CircleGeometry(r, 48), stdMat('#0b0b0c', 0.35, 0.1)); disc.position.set(0, h / 2, z); g.add(disc);
      const groove = new THREE.Mesh(new THREE.RingGeometry(r * 0.55, r * 0.56, 48), stdMat('#2a2a2d', 0.4)); groove.position.set(0, h / 2, z + 0.0005); g.add(groove);
      const label = new THREE.Mesh(new THREE.CircleGeometry(r * 0.33, 32), stdMat('#c4513f', 0.8)); label.position.set(0, h / 2, z + 0.001); g.add(label);
      const hole = new THREE.Mesh(new THREE.CircleGeometry(r * 0.025, 12), stdMat('#0b0b0c', 0.8)); hole.position.set(0, h / 2, z + 0.0015); g.add(hole);
    }
    const glass = new THREE.Mesh(new THREE.PlaneGeometry(iw, ih), stdMat('#ffffff', 0.05, 0, { transparent: true, opacity: 0.08, depthWrite: false }));
    glass.position.set(0, h / 2, d / 2 - 0.003); g.add(glass);
    return g;
  },
  box(it) { const g = new THREE.Group(); g.add(B(it.w, it.h, it.d, stdMat(it.color, 0.8), 0, it.h / 2, 0, 0.01)); return g; },

  /* ------------------------------------------------------- fixed fittings */
  kitchenUnits(it) {
    const { w, d, h } = it; const g = new THREE.Group(), o = it.opts || {};
    const body = stdMat(it.color, 0.6), top = stdMat('#202428', 0.32, 0.05), plinth = stdMat('#2f3032', 0.8), line = stdMat(shade(it.color, 0.62), 0.7);
    const plH = 0.1, topT = 0.04, bodyH = Math.max(0.2, h - plH - topT);
    g.add(RB(w, plH, d - 0.05, plinth, 0, plH / 2, -0.025));
    g.add(RB(w, bodyH, d - 0.02, body, 0, plH + bodyH / 2, -0.01));
    const wt = RB(w, topT, d + 0.01, top, 0, h - topT / 2, 0.005); wt.castShadow = true; g.add(wt);
    for (let x = -w / 2 + 0.5; x < w / 2 - 0.1; x += 0.5) g.add(RB(0.006, bodyH * 0.9, 0.004, line, x, plH + bodyH / 2, d / 2 - 0.008));
    if (o.sink !== null && o.sink !== undefined) {
      const sx = clamp(-w / 2 + w * o.sink, -w / 2 + 0.42, w / 2 - 0.42);
      g.add(RB(Math.min(0.8, w - 0.04), 0.008, Math.min(0.46, d - 0.12), roomMats.chrome, sx, h + 0.004, 0));
      g.add(RB(0.42, 0.01, 0.36, stdMat('#8f949a', 0.3, 0.7), sx - 0.12, h + 0.006, 0));
      const tap = C(0.012, 0.012, 0.24, roomMats.chrome, sx - 0.12, h + 0.12, -d / 2 + 0.1, 12); g.add(tap);
    }
    if (o.hob !== null && o.hob !== undefined) {
      const hx = clamp(-w / 2 + w * o.hob, -w / 2 + 0.3, w / 2 - 0.3);
      g.add(RB(Math.min(0.58, w - 0.04), 0.008, Math.min(0.5, d - 0.08), stdMat('#0f1113', 0.15, 0.2), hx, h + 0.004, 0));
    }
    const splash = o.splash ?? 0.12;
    if (splash > 0.01) g.add(RB(w, splash, 0.012, stdMat('#2c3238', 0.35), 0, h + splash / 2, -d / 2 + 0.006));
    return g;
  },
  wallUnits(it) {
    const { w, d, h } = it; const g = new THREE.Group(); const m = stdMat(it.color, 0.6), line = stdMat(shade(it.color, 0.62), 0.7);
    g.add(B(w, h, d, m, 0, h / 2, 0, 0.004));
    const doors = clamp(Math.round(w / 0.5), 1, 8);
    for (let i = 1; i < doors; i++) g.add(RB(0.005, h * 0.96, 0.004, line, -w / 2 + (w * i) / doors, h / 2, d / 2 + 0.002));
    g.add(RB(w * 0.96, 0.01, d * 0.6, roomMats.light, 0, -0.005, 0.02));
    return g;
  },
  fridge(it) {
    const { w, d, h } = it; const g = new THREE.Group(); const m = stdMat(it.color, 0.3, 0.1), line = stdMat(shade(it.color, 0.7), 0.5);
    g.add(B(w, h, d, m, 0, h / 2, 0, 0.012));
    const split = h * 0.42;
    g.add(RB(w * 0.98, 0.006, 0.004, line, 0, split, d / 2 + 0.002));
    for (const [y0, y1] of [[split + 0.08, split + 0.48], [split - 0.36, split - 0.06]]) g.add(B(0.02, Math.max(0.05, y1 - y0), 0.03, metalMat(), w / 2 - 0.06, (y0 + y1) / 2, d / 2 + 0.02));
    return g;
  },
  toilet(it) {
    const { w, d, h } = it; const g = new THREE.Group(); const P = stdMat(it.color, 0.18);
    const cistern = d >= 0.62 && h >= 0.6;
    const zb = -d / 2 + (cistern ? 0.16 : 0);
    if (cistern) g.add(B(Math.min(w, 0.38), h - 0.42, 0.16, P, 0, 0.42 + (h - 0.42) / 2, -d / 2 + 0.08, 0.02));
    g.add(C(0.13, 0.11, 0.38, P, 0, 0.19, zb + 0.2, 24));
    const bowl = new THREE.Mesh(new THREE.CylinderGeometry(Math.min(0.19, w / 2), 0.15, 0.08, 28), P); bowl.scale.z = 1.35; bowl.position.set(0, 0.4, zb + 0.27); bowl.castShadow = true; g.add(bowl);
    g.add(B(Math.min(0.36, w), 0.02, Math.min(0.46, d - (zb + d / 2)), P, 0, 0.45, zb + 0.27, 0.008));
    return g;
  },
  vanity(it) {
    const { w, d, h } = it; const g = new THREE.Group(); const o = it.opts || {};
    const unit = B(w, h, d, stdMat(it.color, 0.3), 0, h / 2, 0); g.add(unit);
    g.add(RB(w + 0.01, 0.03, d + 0.02, stdMat('#cfcac2', 0.4), 0, h + 0.015, 0.01));
    const bx = clamp(-w / 2 + w * (o.basin ?? 0.5), -w / 2 + 0.24, w / 2 - 0.24);
    const basin = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.17, 0.12, 32), roomMats.porcelain); basin.scale.z = Math.min(0.7, d / 0.5); basin.position.set(bx, h + 0.09, 0.03); basin.castShadow = true; g.add(basin);
    g.add(C(0.012, 0.012, 0.18, roomMats.chrome, bx, h + 0.12, -d / 2 + 0.05, 12));
    const mirror = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 0.75), stdMat('#c8d1d6', 0.05, 0.9)); mirror.position.set(bx, h + 0.67, -d / 2 + 0.005); g.add(mirror);
    return g;
  },
  bath(it) {
    const { w, d, h } = it; const g = new THREE.Group(); const P = stdMat(it.color, 0.2), rim = 0.07;
    g.add(B(w, h, rim, P, 0, h / 2, -d / 2 + rim / 2));
    g.add(B(w, h, rim, P, 0, h / 2, d / 2 - rim / 2));
    g.add(B(rim, h, d - 2 * rim, P, -w / 2 + rim / 2, h / 2, 0));
    g.add(B(rim, h, d - 2 * rim, P, w / 2 - rim / 2, h / 2, 0));
    g.add(RB(w - 2 * rim, h * 0.3, d - 2 * rim, P, 0, h * 0.15, 0));
    g.add(C(0.012, 0.012, 0.14, roomMats.chrome, -w / 2 + rim / 2, h + 0.07, 0, 12));
    return g;
  },
  shower(it) {
    const { w, d, h } = it; const g = new THREE.Group(); const P = stdMat(it.color, 0.18);
    g.add(RB(w, 0.05, d, P, 0, 0.025, 0));
    const screen = new THREE.Mesh(new THREE.BoxGeometry(w - 0.02, Math.max(0.3, h - 0.05), 0.01), roomMats.glass);
    screen.position.set(0, 0.05 + (h - 0.05) / 2, d / 2 - 0.02); screen.renderOrder = 2; g.add(screen);
    g.add(RB(w, 0.025, 0.025, roomMats.chrome, 0, h, d / 2 - 0.02));
    g.add(C(0.012, 0.012, 1.1, roomMats.chrome, 0, 1.4, -d / 2 + 0.04, 12));
    const head = C(0.07, 0.07, 0.02, roomMats.chrome, 0, Math.min(1.98, h - 0.02), -d / 2 + 0.16, 24); head.rotation.x = Math.PI / 2 - 0.3; g.add(head);
    return g;
  },
  radiator(it) {
    const { w, d, h } = it; const g = new THREE.Group(); const m = stdMat(it.color, 0.45);
    const cols = Math.max(2, Math.floor(w / 0.05));
    for (let i = 0; i < cols; i++) g.add(B((w / cols) * 0.68, Math.max(0.05, h - 0.04), Math.min(0.09, d * 0.7), m, -w / 2 + (i + 0.5) * (w / cols), h / 2, -d / 2 + Math.min(0.09, d * 0.7) / 2 + 0.035));
    for (const y of [0.02, h - 0.02]) g.add(B(w, 0.035, Math.min(0.05, d * 0.4), m, 0, y, -d / 2 + 0.06));
    for (const x of [-w / 2 - 0.03, w / 2 + 0.03]) g.add(C(0.014, 0.014, 0.12, roomMats.chrome, x, 0.02, -d / 2 + 0.06, 12));
    return g;
  },
  builtInWardrobe(it) {
    const { w, d, h } = it; const g = new THREE.Group();
    const body = RB(w, h, d, stdMat(it.color, 0.5), 0, h / 2, 0); body.castShadow = true; g.add(body);
    const line = stdMat('#c9c5bd', 0.6), n = clamp(Math.round(w / 0.6), 2, 6);
    for (let i = 1; i < n; i++) g.add(RB(0.006, h - 0.12, 0.006, line, -w / 2 + (w * i) / n, h / 2, d / 2 + 0.003));
    g.add(RB(w, 0.06, 0.012, line, 0, h - 0.06, d / 2 + 0.006));
    g.add(RB(w, 0.06, 0.012, line, 0, 0.03, d / 2 + 0.006));
    return g;
  },
  boxing(it) {
    const { w, d, h } = it; const g = new THREE.Group(), o = it.opts || {};
    const capH = o.cap ? 0.03 : 0;
    g.add(RB(w, h - capH, d, stdMat(it.color, 0.94), 0, (h - capH) / 2, 0));
    if (o.cap) { const cap = RB(w, capH, d + 0.02, stdMat(o.cap, 0.35), 0, h - capH / 2, 0.01); cap.castShadow = true; g.add(cap); }
    return g;
  },
};

/** Build an item or fitting. ctx can carry { photo } for pictures made from your own photos. */
export function buildThing(it, ctx) {
  const fn = BUILD[it.shape] || BUILD.box;
  const g = fn(it, ctx);
  g.name = it.name || it.shape;
  return g;
}
export function placeThing(it, g) { g.position.set(it.x, it.elev, it.z); g.rotation.y = -rad(it.rot); }
