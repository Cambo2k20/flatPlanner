/* Small 3D pictures of catalogue items, drawn with their real shape, size and colour.
   One offscreen renderer draws them a few at a time and keeps the results. */
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { buildThing, disposeGeo } from './furniture.js';
import { SHAPES } from '../core/shapes.js';

const W = 320, H = 240;
let renderer = null, scene, cam;
const cache = new Map();

function init() {
  if (renderer !== null) return !!renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas: document.createElement('canvas'), antialias: true, alpha: true, preserveDrawingBuffer: true });
  } catch { renderer = false; return false; }
  renderer.setPixelRatio(1);
  renderer.setSize(W, H, false);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.setClearColor(0x000000, 0);
  scene = new THREE.Scene();
  scene.environment = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.75;
  scene.add(new THREE.HemisphereLight(0xffffff, 0xe8e0d4, 1.1));
  const sun = new THREE.DirectionalLight(0xffffff, 1.4); sun.position.set(-2, 4, 3); scene.add(sun);
  cam = new THREE.PerspectiveCamera(28, W / H, 0.01, 100);
  return true;
}

export const previewKey = (e) => [e.shape, e.w, e.d, e.h, e.color, e.photo ? e.photo.length : 0].join('|');

/** A PNG data URL of the item, or '' if 3D isn't available. */
export function itemPreview(e) {
  const key = previewKey(e);
  if (cache.has(key)) return cache.get(key);
  if (!init()) return '';
  const it = { id: e.id || 'preview', shape: e.shape, w: e.w, d: e.d, h: e.h, color: e.color, name: e.name, mirror: false, rot: 0, x: 0, z: 0, elev: 0 };
  const g = buildThing(it, { photo: SHAPES[e.shape] && SHAPES[e.shape].photo ? e.photo : '' });
  g.rotation.y = -0.55;
  scene.add(g);
  g.updateMatrixWorld(true);
  const sphere = new THREE.Box3().setFromObject(g).getBoundingSphere(new THREE.Sphere());
  const dir = new THREE.Vector3(0, e.h < 0.05 ? 1.1 : 0.5, 1).normalize();
  const dist = sphere.radius / Math.sin(THREE.MathUtils.degToRad(cam.fov / 2)) * 1.02;
  cam.position.copy(sphere.center).addScaledVector(dir, dist);
  cam.near = dist / 50; cam.far = dist * 4; cam.updateProjectionMatrix();
  cam.lookAt(sphere.center);
  renderer.render(scene, cam);
  const url = renderer.domElement.toDataURL('image/png');
  scene.remove(g); disposeGeo(g);
  cache.set(key, url);
  return url;
}

/* Draw previews a few per frame so a long catalogue doesn't hold up the page. */
const queue = [];
let busy = false;
export function queuePreview(entry, img) {
  const key = previewKey(entry);
  if (cache.has(key)) { img.src = cache.get(key); img.hidden = false; return; }
  queue.push({ entry, img });
  if (!busy) { busy = true; requestAnimationFrame(drain); }
}
function drain() {
  const t0 = performance.now();
  while (queue.length && performance.now() - t0 < 24) {
    const { entry, img } = queue.shift();
    if (!img.isConnected) continue;
    const url = itemPreview(entry);
    if (url) { img.src = url; img.hidden = false; }
  }
  if (queue.length) requestAnimationFrame(drain); else busy = false;
}
