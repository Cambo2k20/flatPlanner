/* Materials and generated textures, shared by everything drawn in 3D. */
import * as THREE from 'three';
import { FLOORS } from '../core/palette.js';
import { clamp, rng } from '../core/util.js';

let maxAniso = 4;
export const setAnisotropy = (n) => { maxAniso = n; };

export function shade(hex, f) {
  const c = new THREE.Color(hex), h = {};
  c.getHSL(h);
  c.setHSL(h.h, h.s, clamp(h.l * f, 0, 1));
  return '#' + c.getHexString();
}

const matCache = new Map();
export function stdMat(color, rough = 0.85, metal = 0, extra) {
  const key = `${color}|${rough}|${metal}|${extra ? JSON.stringify(extra) : ''}`;
  let m = matCache.get(key);
  if (!m) { m = new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal, ...(extra || {}) }); matCache.set(key, m); }
  return m;
}
export const fabricMat = (c) => stdMat(c, 0.95);
export const woodMat = (c) => stdMat(c, 0.6);
export const metalMat = () => stdMat('#2a2c2f', 0.42, 0.6);
export const legMat = () => stdMat('#2b2622', 0.6);

export const roomMats = {
  ext: new THREE.MeshStandardMaterial({ color: '#e6e2db', roughness: 0.94 }),
  cut: new THREE.MeshStandardMaterial({ color: '#3a4144', roughness: 0.9 }),
  ceiling: new THREE.MeshStandardMaterial({ roughness: 0.95, emissive: '#ffffff', emissiveIntensity: 0.18 }),
  cove: new THREE.MeshStandardMaterial({ roughness: 0.8, emissive: '#ffffff', emissiveIntensity: 0.1 }),
  trim: new THREE.MeshStandardMaterial({ roughness: 0.55 }),
  frame: new THREE.MeshStandardMaterial({ color: '#f4f4f1', roughness: 0.45 }),
  glass: new THREE.MeshStandardMaterial({ color: '#c3dbe6', roughness: 0.05, metalness: 0.1, transparent: true, opacity: 0.18, depthWrite: false, side: THREE.DoubleSide }),
  doorGlass: new THREE.MeshStandardMaterial({ color: '#e9eef0', roughness: 0.2, transparent: true, opacity: 0.55, depthWrite: false, side: THREE.DoubleSide }),
  chrome: new THREE.MeshStandardMaterial({ color: '#c9ccd0', roughness: 0.25, metalness: 0.85 }),
  light: new THREE.MeshStandardMaterial({ color: '#ffffff', emissive: '#fff6e6', emissiveIntensity: 0.9, roughness: 0.3 }),
  porcelain: new THREE.MeshStandardMaterial({ color: '#f7f7f5', roughness: 0.18 }),
};

/* One material per wall of each room, so each wall can have its own paint. */
const wallMats = new Map();
export function wallMat(key, color, gloss) {
  let m = wallMats.get(key);
  if (!m) { m = new THREE.MeshStandardMaterial({ roughness: 0.94 }); wallMats.set(key, m); }
  m.color.set(color);
  m.roughness = gloss ? 0.6 : 0.94;
  return m;
}

/* ------------------------------------------------------------- textures */
function finishTex(c, rx, ry) {
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = maxAniso;
  t.repeat.set(rx, ry);
  return t;
}

const floorTexCache = new Map();
export function floorTexture(kind) {
  if (floorTexCache.has(kind)) return floorTexCache.get(kind);
  const F = FLOORS[kind] || FLOORS.oak, r = rng('floor-' + kind);
  const c = document.createElement('canvas');
  let tex;
  if (F.carpet) {
    c.width = c.height = 512; const g = c.getContext('2d');
    g.fillStyle = F.carpet; g.fillRect(0, 0, 512, 512);
    for (let i = 0; i < 26000; i++) { g.fillStyle = r() < 0.5 ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.07)'; g.fillRect(r() * 512, r() * 512, 1.6, 1.6); }
    tex = finishTex(c, 1 / 0.8, 1 / 0.8);
  } else if (F.tile) {
    const T = F.tile;
    c.width = c.height = 512; const g = c.getContext('2d');
    g.fillStyle = T.grout; g.fillRect(0, 0, 512, 512);
    for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) {
      const v = Math.floor(r() * T.spread), [R, G, Bc] = T.base;
      g.fillStyle = `rgb(${R + v},${G + v + 2},${Bc + v + 4})`;
      g.fillRect(i * 256 + 3, j * 256 + 3, 250, 250);
      for (let k = 0; k < 900; k++) { g.fillStyle = r() < 0.5 ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.06)'; g.fillRect(i * 256 + 3 + r() * 250, j * 256 + 3 + r() * 250, 2, 2); }
    }
    tex = finishTex(c, 1 / T.size, 1 / T.size);
  } else {
    c.width = 1024; c.height = 2048; const g = c.getContext('2d');
    const planks = 10, pw = c.width / planks; // 10 planks across 1.4 m = 14 cm boards
    for (let i = 0; i < planks; i++) {
      let y = -r() * 900;
      while (y < c.height) {
        const len = 520 + r() * 900;
        g.fillStyle = F.tones[Math.floor(r() * F.tones.length)];
        g.fillRect(i * pw, y, pw, len);
        for (let k = 0; k < 16; k++) {
          g.strokeStyle = `rgba(70,40,15,${0.035 + r() * 0.06})`; g.lineWidth = 0.8 + r() * 1.6;
          g.beginPath(); const x0 = i * pw + 3 + r() * (pw - 6), ph = r() * 9, amp = 1 + r() * 3;
          g.moveTo(x0, y);
          for (let yy = y; yy <= y + len; yy += 32) g.lineTo(x0 + Math.sin(yy * 0.006 + ph) * amp, yy);
          g.stroke();
        }
        if (r() < 0.25) { g.fillStyle = 'rgba(80,45,20,0.25)'; g.beginPath(); g.ellipse(i * pw + r() * pw, y + r() * len, 3 + r() * 4, 7 + r() * 9, 0, 0, Math.PI * 2); g.fill(); }
        g.fillStyle = 'rgba(35,20,8,0.55)'; g.fillRect(i * pw, y, pw, 2);
        y += len;
      }
      g.fillStyle = 'rgba(35,20,8,0.5)'; g.fillRect(i * pw, 0, 2, c.height);
    }
    tex = finishTex(c, 1 / 1.4, 1 / 2.8);
  }
  floorTexCache.set(kind, tex);
  return tex;
}

const floorMats = new Map();
export function floorMat(kind) {
  if (!FLOORS[kind]) kind = 'oak';
  let m = floorMats.get(kind);
  if (!m) {
    const F = FLOORS[kind];
    m = new THREE.MeshStandardMaterial({ map: floorTexture(kind), roughness: F.carpet ? 1 : F.tile ? 0.45 : 0.5 });
    floorMats.set(kind, m);
  }
  return m;
}

export function skyTexture() {
  const W = 2048, H = 1024, c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d'), r = rng('sky');
  const grad = g.createLinearGradient(0, 0, 0, H / 2);
  grad.addColorStop(0, '#7fa9cc'); grad.addColorStop(0.75, '#cfe0ea'); grad.addColorStop(1, '#e8eff2');
  g.fillStyle = grad; g.fillRect(0, 0, W, H / 2);
  for (let i = 0; i < 18; i++) { g.fillStyle = 'rgba(255,255,255,0.35)'; g.beginPath(); g.ellipse(r() * W, H * (0.12 + r() * 0.25), 60 + r() * 160, 12 + r() * 20, 0, 0, Math.PI * 2); g.fill(); }
  const ridge = (base, amp, col, seed) => {
    const rr = rng(seed); g.fillStyle = col; g.beginPath(); g.moveTo(0, H); let y = base;
    for (let x = 0; x <= W; x += 16) { y = base - amp * (0.5 + 0.5 * Math.sin(x * 0.004 + rr() * 0.3) * Math.sin(x * 0.0013 + 1.3)) - rr() * 3; g.lineTo(x, y); }
    g.lineTo(W, H); g.closePath(); g.fill();
  };
  ridge(H * 0.5, 40, '#9fb0aa', 'r1');
  ridge(H * 0.515, 26, '#7f9a84', 'r2');
  ridge(H * 0.535, 14, '#6c8770', 'r3');
  g.fillStyle = '#62775f'; g.fillRect(0, H * 0.545, W, H);
  const t = new THREE.CanvasTexture(c);
  t.mapping = THREE.EquirectangularReflectionMapping;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

const artCache = new Map();
export function artTexture(seed, color, aspect) {
  const key = `${seed}|${color}|${aspect.toFixed(2)}`;
  if (artCache.has(key)) return artCache.get(key);
  const W = 256, H = Math.max(64, Math.round(256 * aspect)), c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d'), r = rng(seed);
  g.fillStyle = '#f1ece3'; g.fillRect(0, 0, W, H);
  const base = new THREE.Color(color);
  const pal = [color, '#' + base.clone().offsetHSL(0.5, -0.1, 0).getHexString(), '#' + base.clone().offsetHSL(0.06, -0.1, -0.22).getHexString(), '#1f2a30', '#e9c46a'];
  for (let i = 0; i < 7; i++) {
    g.fillStyle = pal[Math.floor(r() * pal.length)]; g.globalAlpha = 0.7 + r() * 0.3;
    if (r() < 0.5) { g.beginPath(); g.arc(r() * W, r() * H, 14 + r() * 60, 0, Math.PI * 2); g.fill(); }
    else g.fillRect(r() * W * 0.8, r() * H * 0.8, 24 + r() * 110, 16 + r() * 90);
  }
  g.globalAlpha = 1;
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  artCache.set(key, t);
  return t;
}

/* Your own photos (a picture you own, a floorplan from a listing) as textures. */
const photoCache = new Map();
export function imageTexture(dataUrl, onLoad) {
  if (photoCache.has(dataUrl)) return photoCache.get(dataUrl);
  const t = new THREE.TextureLoader().load(dataUrl, onLoad);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = maxAniso;
  photoCache.set(dataUrl, t);
  return t;
}
export function forgetImage(dataUrl) {
  const t = photoCache.get(dataUrl);
  if (t) { t.dispose(); photoCache.delete(dataUrl); }
}
