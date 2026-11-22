/* The planner: one flat in 3D, with four panels.
   Furnish – add things from your catalogue and arrange them.
   Layout  – rooms, doors, windows and fixed fittings, traced from the listing.
   Decor   – paint, floors, doors and skirting.
   Details – the listing's details, and files to save.
   The 3D view, the views (3D, top, eye level), dragging, overlaps, measuring and undo
   come from the original single-flat planner. */
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { dimsText, entryLook, newEntry, STATUS } from '../core/catalogue.js';
import {
  CORNERS, OPENING_KINDS, edgeEndNames, edgeLabel, findRoom, flatBounds, floorFor, newFixture, newOpening, newRoom, normalizeFlat,
  normalizeItem, paintFor, posFromScreenOffset, roomArea, roomBeside, roomCentre, roomEdges, roomPolygon, roomRects, roomType, screenOffset,
} from '../core/flat-model.js';
import { DEFAULT_CEILING_PAINT, FABRICS, FLAT_STATUS, FLOORS, PAINTS, ROOM_TYPES, TRIMS } from '../core/palette.js';
import { createWorld } from '../core/placement.js';
import { FITTING_SHAPES, SHAPES } from '../core/shapes.js';
import { $, $$, clamp, cm, downloadBlob, el, fileToImageDataUrl, ftin, money, rad, safeUrl, selectEl, slug, snapTo, toast, uid } from '../core/util.js';
import { computeWalls } from '../core/walls.js';
import { flatFile } from '../core/files.js';
import { flatLink } from '../core/share.js';
import { db, deletePicture, findEntry, getPicture, planKey, saveFlats, savePrefs, setPicture, thumbKey } from '../store.js';
import { PLAN_CUT, buildFlatMeshes, swingFill, swingLine } from '../three/flat-mesh.js';
import { buildThing, disposeGeo, placeThing } from '../three/furniture.js';
import { floorMat, forgetImage, imageTexture, roomMats, setAnisotropy, skyTexture, wallMat } from '../three/materials.js';
import { editEntryFlow } from './catalogue.js';
import { exportFlat } from './home.js';
import { cmField, confirmDialog, field, pickFile, swatchRow } from './widgets.js';

const TABS = ['furnish', 'layout', 'decor', 'details'];
const CEILING_PAINTS = [['#f5f3ef', 'Warm white'], ['#ffffff', 'Brilliant white'], ['#ebe7df', 'Soft cream'], ['#dfe3e2', 'Pale grey']];
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

/* ------------------------------------------------------------------ state */
let flat = null;                 // the flat being planned (an object in db.flats)
let walls = null, world = null;  // worked out from the flat
let meshes = null;               // the flat in 3D
let selection = null;            // { kind: 'item' | 'fixture' | 'room' | 'opening', id }
let tab = 'furnish';
let mode = 'orbit';
let focus = 'flat';
let decorRoom = null;
let underlayImg = null;
let underlayMove = false;
let structureDirty = false;
let clashes = { list: [], flagged: new Set(), byId: new Map() };
const furnishView = { q: '', cat: '' };
const prefs = () => db.prefs;

/* ----------------------------------------------------------------- engine */
let renderer, scene, sun, persp, ortho, eyeCam, orbit, planCtl, skyTex, canvas, stage;
let roomRoot, itemsRoot, fixturesRoot, selGroup, roomSelGroup, measureGroup, underlayMesh = null;
let themeAccent = '#1d5866', themeWarn = '#b2431b', stageColor = new THREE.Color('#dfe5e3');
const size = { w: 1, h: 1 };
let cameraTouched = false;
let rafId = 0, last = 0;

const selLine = new THREE.LineBasicMaterial({ color: '#1d5866', depthTest: false, transparent: true, opacity: 0.95 });
const selFill = new THREE.MeshBasicMaterial({ color: '#1d5866', transparent: true, opacity: 0.16, depthWrite: false });
const measureMat = new THREE.LineBasicMaterial({ color: '#1d5866', depthTest: false, transparent: true });

function initEngine() {
  if (renderer) return true;
  canvas = $('#c'); stage = $('#stage');
  try { renderer = new THREE.WebGLRenderer({ canvas, antialias: true }); }
  catch (err) { console.error(err); $('#loadfail').hidden = false; return false; }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  setAnisotropy(renderer.capabilities.getMaxAnisotropy());

  scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.6;
  scene.add(new THREE.HemisphereLight(0xffffff, 0xf3ebe0, 1.25));
  sun = new THREE.DirectionalLight(0xfff3e3, 1.45);
  sun.castShadow = true;
  sun.shadow.mapSize.set(4096, 4096);
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.02;
  sun.shadow.radius = 3;
  scene.add(sun, sun.target);
  skyTex = skyTexture();

  persp = new THREE.PerspectiveCamera(40, 1, 0.05, 200);
  ortho = new THREE.OrthographicCamera(-5, 5, 5, -5, 0.1, 100);
  ortho.up.set(0, 0, -1);
  eyeCam = new THREE.PerspectiveCamera(68, 1, 0.03, 300);
  orbit = new OrbitControls(persp, canvas);
  orbit.enableDamping = !reduceMotion;
  orbit.maxPolarAngle = Math.PI * 0.47;
  orbit.minDistance = 1.5;
  orbit.maxDistance = 60;
  planCtl = new OrbitControls(ortho, canvas);
  planCtl.enableRotate = false;
  planCtl.screenSpacePanning = true;
  planCtl.mouseButtons = { LEFT: THREE.MOUSE.PAN, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.PAN };
  planCtl.touches = { ONE: THREE.TOUCH.PAN, TWO: THREE.TOUCH.DOLLY_PAN };
  planCtl.minZoom = 0.3; planCtl.maxZoom = 12;
  planCtl.enabled = false;
  orbit.addEventListener('start', () => { cameraTouched = true; });
  planCtl.addEventListener('start', () => { cameraTouched = true; });

  roomRoot = new THREE.Group(); itemsRoot = new THREE.Group(); fixturesRoot = new THREE.Group();
  selGroup = new THREE.Group(); roomSelGroup = new THREE.Group(); measureGroup = new THREE.Group();
  scene.add(roomRoot, itemsRoot, fixturesRoot, selGroup, roomSelGroup, measureGroup);

  new ResizeObserver(() => {
    const r = stage.getBoundingClientRect(); size.w = Math.max(1, r.width); size.h = Math.max(1, r.height);
    renderer.setSize(size.w, size.h, false);
    persp.aspect = eyeCam.aspect = size.w / size.h; persp.updateProjectionMatrix(); eyeCam.updateProjectionMatrix();
    if (flat) { frustumPlan(); if (!cameraTouched) { resetOrbitView(false); resetPlanView(); } }
  }).observe(stage);

  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', readTheme);
  bindPointer(); bindKeys(); bindToolbar(); bindTabs();
  readTheme();
  return true;
}

function readTheme() {
  const css = (n, f) => getComputedStyle(document.documentElement).getPropertyValue(n).trim() || f;
  themeAccent = css('--accent', '#1d5866'); themeWarn = css('--warn', '#b2431b'); stageColor = new THREE.Color(css('--stage', '#dfe5e3'));
  measureMat.color.set(themeAccent); swingFill.color.set(themeAccent); swingLine.color.set(themeAccent);
  setBackground(); if (flat) { updateSelHelper(); updateRoomSel(); }
}
const setBackground = () => { if (scene) scene.background = mode === 'eye' ? skyTex : stageColor; };
const activeCamera = () => (mode === 'orbit' ? persp : mode === 'plan' ? ortho : eyeCam);

function frame(now) {
  rafId = requestAnimationFrame(frame);
  if (!flat) return;
  const dt = Math.min(0.05, (now - last) / 1000); last = now;
  if (structureDirty) rebuildFlat();
  if (mode === 'orbit') { orbit.update(); updateWalls(); }
  else if (mode === 'plan') planCtl.update();
  else stepEye(dt);
  renderer.render(scene, activeCamera());
  projectLabels();
}
function startLoop() { if (!rafId) { last = performance.now(); rafId = requestAnimationFrame(frame); } }
function stopLoop() { cancelAnimationFrame(rafId); rafId = 0; }

/* ------------------------------------------------------------ open/close */
export function openPlanner(f, tabName) {
  if (!initEngine()) return;
  const fresh = !flat || flat.id !== f.id;
  if (flat && fresh) closePlanner();
  flat = f;
  if (fresh) {
    selection = null; focus = 'flat'; decorRoom = null; underlayMove = false; cameraTouched = false; eye.init = false; underlayImg = null;
    refreshLooks();
    walls = computeWalls(flat); world = createWorld(flat, walls);
    for (const fx of flat.fixtures) world.resolve(fx, false, world.ROOMS[fx.room], true);
    world = createWorld(flat, walls);
    for (const it of flat.design.items) world.resolve(it, false, world.roomAt(it.x, it.z) || world.ROOMS[it.room]);
    hist.stack = [snapshot()]; hist.i = 0;
    getPicture(planKey(flat.id)).then((img) => {
      if (!flat || flat.id !== f.id) return;
      underlayImg = img || null; updateUnderlay();
      if (!img && flat.floorplanUrl && !floorplanTried.has(flat.id)) fetchListingFloorplan({ quiet: true });
      else if (img && tab === 'layout') renderLayout();
    });
  }
  rebuildFlat();
  syncItems();
  setTab(TABS.includes(tabName) ? tabName : fresh ? (flat.rooms.length ? 'furnish' : 'layout') : tab);
  renderHeader();
  setMode(fresh ? (tab === 'layout' && !flat.design.items.length && flat.rooms.length <= 1 ? 'plan' : 'orbit') : mode);
  setFocus(focus);
  if (fresh) { resetOrbitView(false); resetPlanView(); }
  updateUndo();
  startLoop();
}

export function closePlanner({ save = true } = {}) {
  if (!flat) return;
  if (save) captureThumbnail();
  stopLoop();
  if (save) saveFlats.flush();
  flat = null; selection = null;
  $('#inspector').hidden = true;
}
export const currentFlatId = () => (flat ? flat.id : null);
/** For tests: where a point in the flat appears on screen, and what is selected. */
export const debugView = {
  project(x, y, z) { const r = canvas.getBoundingClientRect(); _v.set(x, y, z).project(activeCamera()); return { x: r.left + (_v.x * 0.5 + 0.5) * r.width, y: r.top + (-_v.y * 0.5 + 0.5) * r.height }; },
  selection: () => selection,
  mode: () => mode,
  drag: () => (drag ? { kind: drag.kind, id: drag.id, moved: drag.moved } : null),
  pickAt(cx, cy) { setRay({ clientX: cx, clientY: cy }); const h = pick(); return h ? { kind: h.kind, id: h.id } : null; },
};

/** Copy each placed item's size, colour and name from your catalogue. */
function refreshLooks() {
  for (const it of flat.design.items) { const e = findEntry(it.cat); if (e) Object.assign(it, entryLook(e)); }
}

/* ------------------------------------------------------------ the flat */
function rebuildFlat() {
  structureDirty = false;
  walls = computeWalls(flat);
  world = createWorld(flat, walls);
  if (meshes) { roomRoot.remove(meshes.group); disposeGeo(meshes.group); }
  meshes = buildFlatMeshes(flat, walls, world);
  roomRoot.add(meshes.group);
  applyDecor();
  syncFixtures();
  placeSun(); frustumPlan(); applyVisibility(); refreshSelectors(); updateRoomSel();
  if (flat.design.items.length) { clashes = world.computeClashes(flat.design.items); renderClashChip(); }
}
/** Recompute placement after fittings move (their footprints are cut out of rooms). */
function rebuildWorld() { world = createWorld(flat, walls); }

function placeSun() {
  const [x0, z0, x1, z1] = flatBounds(flat, 0.3), cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
  sun.position.set(cx - 1.2, 9, cz + 2.4);
  sun.target.position.set(cx, 0, cz);
  const c = sun.shadow.camera, r = Math.max(x1 - x0, z1 - z0) * 0.58 + 0.6;
  c.left = -r; c.right = r; c.top = r; c.bottom = -r; c.near = 0.5; c.far = 30; c.updateProjectionMatrix();
}

function applyDecor() {
  for (const r of flat.rooms) {
    const gloss = roomType(r).gloss;
    roomEdges(r).forEach((e) => wallMat(`${r.id}:${e.i}`, paintFor(flat, r, e.i), gloss));
  }
  if (meshes) {
    const rooms = Object.fromEntries(flat.rooms.map((r) => [r.id, r]));
    for (const m of meshes.floors) { const r = rooms[m.userData.roomId]; if (r) m.material = floorMat(floorFor(flat, r)); }
  }
  roomMats.ceiling.color.set(flat.design.ceiling);
  roomMats.cove.color.set(flat.design.ceiling);
  roomMats.trim.color.set(flat.design.trim);
}

function applyVisibility() {
  if (!meshes) return;
  meshes.ceilings.visible = mode === 'eye';
  if (meshes.swings) meshes.swings.visible = prefs().swing;
  updateWalls();
  updateUnderlay();
}

/* Which walls to draw. At eye level, all of them. In the top view, all of them sliced at
   1.2 m. In 3D, the room you're looking at keeps its far walls full height and drops the
   ones between you and it; every other wall is sliced at 1.2 m. */
function updateWalls(cam = activeCamera()) {
  if (!meshes) return;
  const far = (w, sides) => sides.some((s) => (cam.position.x - w.mid.x) * s.nx + (cam.position.z - w.mid.z) * s.nz > -0.05);
  const openFull = new Set();
  for (const w of meshes.wallRecs) {
    let st = 'full';
    if (mode === 'plan') st = 'plan';
    else if (mode === 'orbit') {
      if (focus === 'flat') st = w.rooms.length >= 2 ? 'plan' : w.sides.length ? (far(w, w.sides) ? 'full' : 'stub') : 'full';
      else { const rel = w.sides.filter((s) => s.room === focus); st = rel.length ? (far(w, rel) ? 'full' : 'stub') : 'plan'; }
    }
    w.full.visible = st === 'full'; w.stub.visible = st === 'stub'; w.plan.visible = st === 'plan';
    if (w.opening && st === 'full') openFull.add(w.opening);
  }
  for (const v of meshes.openingVisuals) v.group.visible = openFull.has(v.id);
  for (const t of meshes.edgeTrims) {
    const full = !t.recs.length || t.recs.some((r) => r.full.visible), stub = t.recs.length && t.recs.every((r) => r.stub.visible);
    if (t.cove) t.cove.visible = mode !== 'plan' && full;
    t.skirt.visible = !stub;
  }
  for (const fx of flat.fixtures) {
    const rec = fixtureObjs.get(fx.id); if (!rec) continue;
    const top = fx.elev + fx.h; let s = 1, vis = true;
    const cut = (limit) => { if (fx.elev >= limit - 0.01) vis = false; else if (top > limit) s = (limit - fx.elev) / fx.h; };
    if (mode === 'plan') cut(PLAN_CUT);
    else if (mode === 'orbit') {
      if (focus !== fx.room) cut(PLAN_CUT);
      else if (top > PLAN_CUT) {
        const r = rad(fx.rot), bx = Math.sin(r), bz = -Math.cos(r); // the way its back faces
        if ((cam.position.x - fx.x) * bx + (cam.position.z - fx.z) * bz > 0.3) cut(0.1);
      }
    }
    rec.group.visible = vis; rec.group.scale.y = s;
  }
}

/* ------------------------------------------------------- items and fittings */
const itemObjs = new Map(), fixtureObjs = new Map();
const photoOf = (it) => { if (it.shape !== 'art' || !it.cat) return ''; const e = findEntry(it.cat); return (e && e.photo) || ''; };
const lookKey = (it) => [it.shape, it.w, it.d, it.h, it.color, it.mirror ? 1 : 0, it.name, JSON.stringify(it.opts || null), photoOf(it).length].join('|');
function syncObjs(list, root, map, idKey) {
  const ids = new Set(list.map((i) => i.id));
  for (const [id, rec] of map) if (!ids.has(id)) { root.remove(rec.group); disposeGeo(rec.group); map.delete(id); }
  for (const it of list) {
    const key = lookKey(it); let rec = map.get(it.id);
    if (!rec || rec.key !== key) {
      if (rec) { root.remove(rec.group); disposeGeo(rec.group); }
      const g = buildThing(it, { photo: photoOf(it) }); g.userData[idKey] = it.id;
      rec = { group: g, key }; root.add(g); map.set(it.id, rec);
    }
    placeThing(it, rec.group);
  }
}
function syncItems() { syncObjs(flat.design.items, itemsRoot, itemObjs, 'itemId'); afterItemsChanged(); }
function syncFixtures() { syncObjs(flat.fixtures, fixturesRoot, fixtureObjs, 'fixtureId'); updateWalls(); }
function afterItemsChanged() {
  clashes = world.computeClashes(flat.design.items);
  updateSelHelper(); updateMeasure(); renderPlaced(); renderClashChip(); liveInspector();
}
function onThingMoved(kind, it) {
  const rec = (kind === 'item' ? itemObjs : fixtureObjs).get(it.id);
  if (rec) placeThing(it, rec.group);
  if (kind === 'fixture') rebuildWorld();
  clashes = world.computeClashes(flat.design.items);
  updateSelHelper(); updateMeasure(); renderClashChip(); liveInspector();
}

/* -------------------------------------------------------------- history */
const hist = { stack: [], i: -1 };
const snapshot = () => JSON.stringify({ ...flat, updated: 0 });
function commit() {
  const s = snapshot();
  if (hist.stack[hist.i] === s) return;
  hist.stack = hist.stack.slice(0, hist.i + 1); hist.stack.push(s);
  if (hist.stack.length > 150) hist.stack.shift();
  hist.i = hist.stack.length - 1;
  flat.updated = Date.now();
  saveFlats(); updateUndo(); renderPlaced();
}
let nudgeTimer = 0;
const commitSoon = () => { clearTimeout(nudgeTimer); nudgeTimer = setTimeout(commit, 450); };
function restore(s) {
  const data = JSON.parse(s);
  for (const k of Object.keys(flat)) delete flat[k];
  Object.assign(flat, data, { updated: Date.now() });
  if (selection && !selectedTarget()) selection = null;
  rebuildFlat(); syncItems(); renderPanels(); renderHeader(); renderInspector(); updateUnderlay();
  saveFlats(); updateUndo();
}
function undo() { if (hist.i > 0) { hist.i--; restore(hist.stack[hist.i]); } }
function redo() { if (hist.i < hist.stack.length - 1) { hist.i++; restore(hist.stack[hist.i]); } }
function updateUndo() { $('#btn-undo').disabled = hist.i <= 0; $('#btn-redo').disabled = hist.i >= hist.stack.length - 1; }

/** After editing rooms, doors or fittings: tidy the data, rebuild, keep things in rooms. */
function structureChanged({ resolveAll = false } = {}) {
  const n = normalizeFlat(flat);
  flat.rooms = n.rooms; flat.openings = n.openings; flat.fixtures = n.fixtures;
  rebuildFlat();
  if (resolveAll) {
    for (const fx of flat.fixtures) world.resolve(fx, false, world.ROOMS[fx.room] || undefined, true);
    rebuildWorld();
    for (const it of flat.design.items) world.resolve(it, false);
    syncFixtures();
  }
  syncItems();
  if (selection && !selectedTarget()) selection = null;
  commit();
  renderPanels(); renderInspector(); updateRoomSel(); updateMeasure();
}

/* ------------------------------------------------------------- selection */
function selectedTarget() {
  if (!selection || !flat) return null;
  const { kind, id } = selection;
  if (kind === 'item') return flat.design.items.find((i) => i.id === id) || null;
  if (kind === 'fixture') return flat.fixtures.find((i) => i.id === id) || null;
  if (kind === 'room') return findRoom(flat, id);
  if (kind === 'opening') return flat.openings.find((o) => o.id === id) || null;
  return null;
}
const isSel = (kind, id) => !!selection && selection.kind === kind && selection.id === id;
function select(kind, id) {
  selection = kind && id ? { kind, id } : null;
  if (selection && !selectedTarget()) selection = null;
  renderInspector(); updateSelHelper(); updateRoomSel(); updateMeasure(); renderPlaced(); renderLayoutLists();
}

let selKey = '', selFoot = null;
function updateSelHelper() {
  const it = selection && (selection.kind === 'item' || selection.kind === 'fixture') ? selectedTarget() : null;
  selGroup.visible = !!it; if (!it) return;
  const key = `${it.w}|${it.d}|${it.h}`;
  if (key !== selKey) {
    disposeGeo(selGroup); selGroup.clear();
    const box = new THREE.BoxGeometry(it.w + 0.02, Math.max(it.h, 0.01) + 0.02, it.d + 0.02);
    const edges = new THREE.LineSegments(new THREE.EdgesGeometry(box), selLine); box.dispose(); edges.position.y = it.h / 2; edges.renderOrder = 10;
    selFoot = new THREE.Mesh(new THREE.PlaneGeometry(it.w + 0.04, it.d + 0.04).rotateX(-Math.PI / 2), selFill); selFoot.renderOrder = 1;
    selGroup.add(edges, selFoot); selKey = key;
  }
  selGroup.position.set(it.x, it.elev, it.z); selGroup.rotation.y = -rad(it.rot);
  selFoot.position.y = -it.elev + 0.007;
  const bad = selection.kind === 'item' && clashes.flagged.has(it.id);
  selLine.color.set(bad ? themeWarn : themeAccent); selFill.color.set(bad ? themeWarn : themeAccent);
}

const roomLine = new THREE.LineBasicMaterial({ color: '#1d5866', depthTest: false, transparent: true });
const roomFill = new THREE.MeshBasicMaterial({ color: '#1d5866', transparent: true, opacity: 0.12, depthWrite: false });
function updateRoomSel() {
  disposeGeo(roomSelGroup); roomSelGroup.clear();
  if (!flat || !selection) return;
  roomLine.color.set(themeAccent); roomFill.color.set(themeAccent);
  if (selection.kind === 'room') {
    const r = findRoom(flat, selection.id); if (!r) return;
    const P = roomPolygon(r);
    const line = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(P.map((p) => new THREE.Vector3(p.x, 0.02, p.z))), roomLine); line.renderOrder = 10;
    const fill = new THREE.Mesh(new THREE.ShapeGeometry(new THREE.Shape(P.map((p) => new THREE.Vector2(p.x, -p.z)))).rotateX(-Math.PI / 2), roomFill);
    fill.position.y = 0.008; fill.renderOrder = 2;
    roomSelGroup.add(line, fill);
  } else if (selection.kind === 'opening') {
    const o = walls.openings.find((x) => x.id === selection.id); if (!o) return;
    const t = Math.max(o.t, 0.1), box = new THREE.BoxGeometry(o.u1 - o.u0 + 0.04, o.y1 - o.y0 + 0.04, t + 0.08);
    const edges = new THREE.LineSegments(new THREE.EdgesGeometry(box), roomLine); box.dispose();
    const g = new THREE.Group(); g.position.set(o.A.x, 0, o.A.z); g.rotation.y = Math.atan2(-o.d.z, o.d.x);
    edges.position.set((o.u0 + o.u1) / 2, (o.y0 + o.y1) / 2, -o.t / 2); edges.renderOrder = 10; g.add(edges);
    roomSelGroup.add(g);
  }
}

/* ---------------------------------------------------------------- labels */
const labelsEl = () => $('#labels');
let labelSpecs = [];
function setLabels(specs) {
  const root = labelsEl(); root.replaceChildren();
  labelSpecs = specs.map((s) => { const e = el('div', { class: 'dim ' + (s.cls || '') }, s.text); root.appendChild(e); return { el: e, p: new THREE.Vector3(...s.p), left: !!s.left }; });
}
const _v = new THREE.Vector3();
function projectLabels() {
  const cam = activeCamera();
  for (const s of labelSpecs) {
    _v.copy(s.p).project(cam);
    const vis = _v.z < 1 && _v.z > -1 && Math.abs(_v.x) < 1.1 && Math.abs(_v.y) < 1.1;
    s.el.style.display = vis ? '' : 'none';
    if (vis) s.el.style.transform = `translate(${((_v.x * 0.5 + 0.5) * size.w).toFixed(1)}px, ${((-_v.y * 0.5 + 0.5) * size.h).toFixed(1)}px) translate(${s.left ? '0' : '-50%'}, -50%)`;
  }
}

function updateMeasure() {
  if (!flat) return;
  disposeGeo(measureGroup); measureGroup.clear();
  const specs = [], pts = [], H = flat.ceiling;
  const seg = (x0, z0, x1, z1, y) => { pts.push(x0, y, z0, x1, y, z1); };
  const tick = (x, z, y, alongX) => { const t = 0.06; if (alongX) seg(x, z - t, x, z + t, y); else seg(x - t, z, x + t, z, y); };
  if (mode === 'plan' || tab === 'layout') {
    const y = mode === 'plan' ? H + 0.02 : 0.05;
    for (const r of flat.rooms) {
      const [x0, z0] = roomRects(r)[0];
      specs.push({ text: `${r.name} · ${cm(r.w)} × ${cm(r.d)}`, p: [x0 + 0.1, y, z0 + 0.28], cls: 'roomtag', left: true });
    }
    if (mode === 'plan') {
      for (const it of flat.design.items) if (!isSel('item', it.id)) specs.push({ text: it.name, p: [it.x, y, it.z], cls: 'name' });
      for (const dr of world.DOORS) if (dr.label === 'the front door') { const o = walls.openings.find((x) => x.id === dr.id); if (o) specs.push({ text: 'Front door', p: [(o.p0.x + o.p1.x) / 2 - o.n.x * (o.t + 0.25), y, (o.p0.z + o.p1.z) / 2 - o.n.z * (o.t + 0.25)], cls: 'tag' }); }
    }
  }
  const it = selection && (selection.kind === 'item' || selection.kind === 'fixture') ? selectedTarget() : null;
  if (it && prefs().measure) {
    const L = world.wallLimits(it, selection.kind === 'fixture'), b = L.b, y = mode === 'plan' ? H + 0.02 : Math.min(it.elev, 1.5) + 0.012;
    const gaps = [
      { v: b.minX - L.west, x0: L.west, z0: it.z, x1: b.minX, z1: it.z },
      { v: L.east - b.maxX, x0: b.maxX, z0: it.z, x1: L.east, z1: it.z },
      { v: b.minZ - L.north, x0: it.x, z0: L.north, x1: it.x, z1: b.minZ },
      { v: L.south - b.maxZ, x0: it.x, z0: b.maxZ, x1: it.x, z1: L.south },
    ];
    for (const gp of gaps) {
      if (gp.v < 0.01) continue;
      seg(gp.x0, gp.z0, gp.x1, gp.z1, y);
      const alongX = gp.z0 === gp.z1; tick(gp.x0, gp.z0, y, alongX); tick(gp.x1, gp.z1, y, alongX);
      specs.push({ text: `${cm(gp.v)} cm`, p: [(gp.x0 + gp.x1) / 2, y, (gp.z0 + gp.z1) / 2] });
    }
  }
  if (selection && selection.kind === 'room') {
    const r = findRoom(flat, selection.id);
    if (r) {
      const y = mode === 'plan' ? H + 0.02 : 0.03, off = flat.outerWall + 0.25;
      const zt = r.z - off, xl = r.x - off;
      seg(r.x, zt, r.x + r.w, zt, y); tick(r.x, zt, y, true); tick(r.x + r.w, zt, y, true);
      seg(xl, r.z, xl, r.z + r.d, y); tick(xl, r.z, y, false); tick(xl, r.z + r.d, y, false);
      specs.push({ text: `${cm(r.w)} cm`, p: [r.x + r.w / 2, y, zt], cls: 'room' });
      specs.push({ text: `${cm(r.d)} cm`, p: [xl, y, r.z + r.d / 2], cls: 'room' });
    }
  }
  if (pts.length) {
    const geom = new THREE.BufferGeometry(); geom.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    const ls = new THREE.LineSegments(geom, measureMat); ls.renderOrder = 11; measureGroup.add(ls);
  }
  setLabels(specs);
}

/* ----------------------------------------------------------------- views */
const eye = { x: 0, z: 0, yaw: 0, pitch: -0.1, init: false, anim: null };
const HINTS = {
  orbit: 'Drag to orbit · right-drag or two fingers to pan · scroll or pinch to zoom · drag furniture to move it · R turns it',
  plan: 'Drag to pan · scroll or pinch to zoom · drag furniture to move it, even into another room · R turns the selected item',
  eye: 'Drag to look around · click the floor to walk there · W A S D or arrow keys to walk, through doorways too',
  layout: 'Click a room, door, window or fitting to change it · drag rooms to move them: they snap together with a wall between',
};
function setHint() { const h = $('#hint'); h.textContent = tab === 'layout' && mode !== 'eye' ? HINTS.layout : HINTS[mode]; h.hidden = false; }

function setMode(m) {
  mode = m;
  orbit.enabled = m === 'orbit'; planCtl.enabled = m === 'plan';
  $$('[data-view]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.view === m)));
  $('#eye-wrap').hidden = m !== 'eye'; $('#focus-wrap').hidden = m === 'eye';
  setHint();
  if (m === 'eye' && !eye.init) presetEye(focus !== 'flat' ? focus : (eyePresets()[0] || {}).id);
  if (m === 'eye') applyEye();
  setBackground(); applyVisibility(); updateMeasure();
}

function focusBounds() {
  if (focus === 'flat' || !world.ROOMS[focus]) return flatBounds(flat, flat.outerWall + 0.25);
  const [x0, z0, x1, z1] = world.ROOMS[focus].bounds; return [x0 - 0.35, z0 - 0.35, x1 + 0.35, z1 + 0.35];
}
const DEFAULT_DIR = new THREE.Vector3(-0.49, 0.59, 0.64).normalize();
function fitPerspective(cam, bounds, dir, target, tight = false) {
  const [x0, z0, x1, z1] = bounds, lim = tight ? { x: 0.98, top: 0.94, bottom: -0.98 } : { x: 0.9, top: 0.8, bottom: -0.9 };
  target.set((x0 + x1) / 2, 0.3, (z0 + z1) / 2);
  const corners = []; for (const x of [x0, x1]) for (const z of [z0, z1]) for (const y of [0, flat.ceiling]) corners.push(new THREE.Vector3(x, y, z));
  const c = cam.clone(), v = new THREE.Vector3(); let lo = 2, hi = 120;
  for (let i = 0; i < 26; i++) {
    const mid = (lo + hi) / 2; c.position.copy(target).addScaledVector(dir, mid); c.lookAt(target); c.updateMatrixWorld();
    const fits = corners.every((p) => { v.copy(p).project(c); return v.z < 1 && Math.abs(v.x) <= lim.x && v.y <= lim.top && v.y >= lim.bottom; });
    if (fits) hi = mid; else lo = mid;
  }
  cam.position.copy(target).addScaledVector(dir, hi); cam.lookAt(target);
}
function resetOrbitView(keepDir) {
  let dir = DEFAULT_DIR.clone();
  if (keepDir) { const cur = persp.position.clone().sub(orbit.target).normalize(); if (cur.y > 0.25) dir = cur; }
  fitPerspective(persp, focusBounds(), dir, orbit.target);
  orbit.update();
}
function frustumPlan() {
  const [x0, z0, x1, z1] = focusBounds(), aspect = size.w / size.h, bw = x1 - x0 + 1.2, bh = z1 - z0 + 1.2; let hw = bw / 2, hh = bh / 2;
  if (hw / hh > aspect) hh = hw / aspect; else hw = hh * aspect;
  ortho.left = -hw; ortho.right = hw; ortho.top = hh; ortho.bottom = -hh; ortho.updateProjectionMatrix();
}
function resetPlanView() {
  const [x0, z0, x1, z1] = focusBounds(), cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
  frustumPlan(); ortho.position.set(cx, 40, cz); planCtl.target.set(cx, 0, cz); ortho.zoom = 1; ortho.updateProjectionMatrix(); planCtl.update();
}
function resetView() { if (mode === 'orbit') resetOrbitView(false); else if (mode === 'plan') resetPlanView(); else presetEye($('#eye-where').value); }
function setFocus(f) {
  focus = f === 'flat' || (world && world.ROOMS[f]) ? f : 'flat';
  $('#focus').value = focus;
  resetOrbitView(true); resetPlanView(); updateWalls(); updateMeasure();
  if (tab === 'furnish') renderFurnishTarget();
}
function refreshSelectors() {
  const fs = $('#focus'), es = $('#eye-where');
  fs.replaceChildren(el('option', { value: 'flat' }, 'Whole flat'), ...flat.rooms.map((r) => el('option', { value: r.id }, r.name)));
  if (focus !== 'flat' && !world.ROOMS[focus]) focus = 'flat';
  fs.value = focus;
  const cur = es.value;
  es.replaceChildren(...eyePresets().map((p) => el('option', { value: p.id }, p.label)));
  if ([...es.options].some((o) => o.value === cur)) es.value = cur;
  $('[data-view="eye"]').disabled = !flat.rooms.length;
}

function applyEye() {
  eyeCam.position.set(eye.x, 1.55, eye.z);
  const cp = Math.cos(eye.pitch);
  eyeCam.lookAt(eye.x + Math.sin(eye.yaw) * cp, 1.55 + Math.sin(eye.pitch), eye.z - Math.cos(eye.yaw) * cp);
}
/** Somewhere to stand in each room: just inside its door, looking across the room. */
function eyePresets() {
  return flat.rooms.map((r) => {
    const [cx, cz] = roomCentre(r);
    const dr = walls.openings.filter((o) => o.ok && o.kind !== 'window' && (o.room === r.id || o.farRoom === r.id))
      .sort((a, b) => (a.kind === 'door' ? 0 : 1) - (b.kind === 'door' ? 0 : 1))[0];
    let x, z;
    if (dr) {
      const um = (dr.u0 + dr.u1) / 2, off = dr.room === r.id ? 0.45 : -dr.t - 0.45;
      x = dr.A.x + dr.d.x * um + dr.n.x * off; z = dr.A.z + dr.d.z * um + dr.n.z * off;
    } else { x = r.x + 0.45; z = r.z + r.d - 0.45; }
    if (!world.walkable(x, z)) { x = cx; z = cz; }
    let tx = cx + (cx - x), tz = cz + (cz - z);
    if (Math.hypot(tx - x, tz - z) < 0.5) { tx = r.x + r.w; tz = r.z; }
    return { id: r.id, label: r.name, x, z, tx, tz, pitch: r.type === 'bathroom' ? -0.3 : -0.1 };
  });
}
function presetEye(id) {
  const all = eyePresets(); if (!all.length) return;
  const p = all.find((q) => q.id === id) || all[0];
  eye.anim = null; eye.x = p.x; eye.z = p.z;
  eye.yaw = Math.atan2(p.tx - p.x, -(p.tz - p.z)); eye.pitch = p.pitch; eye.init = true; applyEye();
  $('#eye-where').value = p.id;
}
function stepTo(nx, nz) {
  if (world.walkable(nx, nz)) { eye.x = nx; eye.z = nz; }
  else if (world.walkable(nx, eye.z)) eye.x = nx;
  else if (world.walkable(eye.x, nz)) eye.z = nz;
}
function walkTo(x, z) {
  let tx = x, tz = z;
  if (!world.walkable(tx, tz)) {
    const R = world.roomAt(x, z); if (!R) return;
    const [x0, z0, x1, z1] = R.bounds; tx = clamp(x, x0 + 0.25, x1 - 0.25); tz = clamp(z, z0 + 0.25, z1 - 0.25);
    if (!world.walkable(tx, tz)) return;
  }
  if (reduceMotion) { eye.x = tx; eye.z = tz; return; }
  eye.anim = { x0: eye.x, z0: eye.z, x1: tx, z1: tz, t: 0, dur: clamp(Math.hypot(tx - eye.x, tz - eye.z) / 1.6, 0.25, 2.2) };
}
const keys = new Set();
function stepEye(dt) {
  if (eye.anim) {
    const a = eye.anim; a.t = Math.min(1, a.t + dt / a.dur); const q = a.t < 0.5 ? 2 * a.t * a.t : 1 - Math.pow(-2 * a.t + 2, 2) / 2;
    eye.x = a.x0 + (a.x1 - a.x0) * q; eye.z = a.z0 + (a.z1 - a.z0) * q; if (a.t >= 1) eye.anim = null;
  }
  let f = 0, s = 0, turn = 0;
  if (keys.has('w')) f += 1; if (keys.has('s')) f -= 1; if (keys.has('a')) s -= 1; if (keys.has('d')) s += 1;
  if (keys.has('arrowup')) f += 1; if (keys.has('arrowdown')) f -= 1; if (keys.has('arrowleft')) turn -= 1; if (keys.has('arrowright')) turn += 1;
  if (f || s || turn) {
    eye.anim = null; eye.yaw += turn * 1.6 * dt; const sp = 1.4 * dt;
    stepTo(eye.x + (Math.sin(eye.yaw) * f + Math.cos(eye.yaw) * s) * sp, eye.z + (-Math.cos(eye.yaw) * f + Math.sin(eye.yaw) * s) * sp);
  }
  applyEye();
}

/* ------------------------------------------------------------ floorplan */
function updateUnderlay() {
  const u = flat && flat.underlay;
  if (!u || !underlayImg) { if (underlayMesh) underlayMesh.visible = false; return; }
  if (!underlayMesh) {
    underlayMesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, toneMapped: false }));
    underlayMesh.rotation.order = 'YXZ'; underlayMesh.renderOrder = 3; scene.add(underlayMesh);
  }
  const m = underlayMesh.material, tex = imageTexture(underlayImg);
  if (m.map !== tex) { m.map = tex; m.needsUpdate = true; }
  m.opacity = u.opacity;
  underlayMesh.scale.set(u.width, u.width * u.aspect, 1);
  underlayMesh.rotation.set(-Math.PI / 2, -rad(u.rot), 0);
  underlayMesh.position.set(u.x, 0.012, u.z);
  underlayMesh.visible = u.show && tab === 'layout' && mode !== 'eye';
}
async function addUnderlay() {
  const f = await pickFile('image/*');
  if (f && flat) await useFloorplan(f);
}
/** Put a picture (a File or Blob) under the plan. */
async function useFloorplan(blob, { quiet = false } = {}) {
  const forFlat = flat;
  try {
    const { dataUrl, width, height } = await fileToImageDataUrl(blob, 2000, 'image/jpeg', 0.86);
    if (flat !== forFlat) return false;
    if (underlayImg) forgetImage(underlayImg);
    await setPicture(planKey(flat.id), dataUrl); underlayImg = dataUrl;
    // A flat that already knows where its picture goes (a replaced picture, or a flat
    // traced from the same floorplan) keeps that place and scale.
    const known = flat.underlay;
    const [x0, z0, x1, z1] = flatBounds(flat, 0);
    flat.underlay = known
      ? { ...known, show: true, aspect: height / width }
      : { show: true, x: (x0 + x1) / 2, z: (z0 + z1) / 2, width: flat.rooms.length > 1 ? Math.max(4, (x1 - x0) * 1.2) : 10, aspect: height / width, rot: 0, opacity: 0.6 };
    commit(); updateUnderlay(); renderPanels();
    if (!quiet) {
      if (mode !== 'plan') setMode('plan');
      toast(known ? 'Floorplan added in its saved place. Use “Move it” or the width if it needs nudging.' : 'Floorplan added. Set its width until the rooms on it match their sizes, then trace each room.');
    }
    return true;
  } catch { if (!quiet) toast('That file isn’t a picture this browser can read.'); return false; }
}
/** Fetch the listing's floorplan picture. Most listing sites allow it; some don't. */
const floorplanTried = new Set();
async function fetchListingFloorplan({ quiet = false } = {}) {
  const url = flat && flat.floorplanUrl;
  if (!url) return false;
  floorplanTried.add(flat.id);
  try {
    const r = await fetch(url, { mode: 'cors', referrerPolicy: 'no-referrer' });
    if (!r.ok) throw new Error(String(r.status));
    const blob = await r.blob();
    if (!/^image\//.test(blob.type)) throw new Error('not a picture');
    return await useFloorplan(blob, { quiet });
  } catch (err) {
    console.warn('Floorplan not fetched', err);
    if (!quiet) toast('The listing site doesn’t let the app fetch its floorplan. Open it, save the picture, then add it with “Add the floorplan picture”.');
    return false;
  }
}
function removeUnderlay() {
  if (underlayImg) forgetImage(underlayImg);
  underlayImg = null; flat.underlay = null; underlayMove = false;
  deletePicture(planKey(flat.id));
  commit(); updateUnderlay(); renderLayout();
}

/* --------------------------------------------------------------- pointer */
const ray = new THREE.Raycaster(), ndc = new THREE.Vector2(), _p = new THREE.Vector3();
function setRay(e) { const r = canvas.getBoundingClientRect(); ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1); ray.setFromCamera(ndc, activeCamera()); }
const shown = (o) => { for (let p = o; p; p = p.parent) if (!p.visible) return false; return true; };
const firstHit = (objs, recursive = true) => ray.intersectObjects(objs, recursive).find((h) => shown(h.object)) || null;
const idUp = (o, key) => { for (let p = o; p; p = p.parent) if (p.userData[key] !== undefined) return p.userData[key]; return null; };

function pick() {
  if (tab === 'layout') {
    if (underlayMove && underlayMesh && underlayMesh.visible) { const h = ray.intersectObject(underlayMesh, false)[0]; if (h) return { kind: 'underlay', point: h.point }; }
    const ho = firstHit(meshes.openingGroups), hf = firstHit(fixturesRoot.children);
    let best = null;
    if (ho) best = { kind: 'opening', id: idUp(ho.object, 'openingId'), point: ho.point, dist: ho.distance };
    if (hf && (!best || hf.distance < best.dist)) best = { kind: 'fixture', id: idUp(hf.object, 'fixtureId'), point: hf.point, dist: hf.distance };
    if (best) return best;
    const hr = firstHit(meshes.floors, false);
    return hr ? { kind: 'room', id: hr.object.userData.roomId, point: hr.point } : null;
  }
  const hi = firstHit(itemsRoot.children);
  if (hi) return { kind: 'item', id: idUp(hi.object, 'itemId'), point: hi.point };
  if (tab === 'decor') { const hr = firstHit(meshes.floors, false); if (hr) return { kind: 'decor', id: hr.object.userData.roomId, point: hr.point }; }
  return null;
}

let drag = null, press = null; const pointers = new Set();
function bindPointer() {
  canvas.addEventListener('pointerdown', (e) => {
    if (!flat) return;
    pointers.add(e.pointerId); $('#hint').hidden = true;
    if (pointers.size > 1) { if (drag) { drag = null; orbit.enabled = mode === 'orbit'; planCtl.enabled = mode === 'plan'; } press = null; return; }
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    if (mode === 'eye') { press = { pid: e.pointerId, sx: e.clientX, sy: e.clientY, yaw0: eye.yaw, pitch0: eye.pitch, moved: false }; return; }
    setRay(e);
    const hit = pick();
    // a room has to be selected before dragging moves it, so dragging a floor still turns the view
    if (hit && hit.kind !== 'decor' && !(hit.kind === 'room' && !isSel('room', hit.id))) {
      if (hit.kind !== 'underlay' && !isSel(hit.kind, hit.id)) select(hit.kind, hit.id);
      drag = { kind: hit.kind, id: hit.id, pid: e.pointerId, plane: new THREE.Plane(new THREE.Vector3(0, 1, 0), -hit.point.y), moved: false, sx: e.clientX, sy: e.clientY, ...dragStart(hit) };
      orbit.enabled = false; planCtl.enabled = false;
      try { canvas.setPointerCapture(e.pointerId); } catch { /* ignore */ }
    } else {
      press = { pid: e.pointerId, sx: e.clientX, sy: e.clientY, moved: false, hit };
    }
  }, { capture: true });
  window.addEventListener('pointermove', (e) => {
    if (!flat) return;
    if (drag && e.pointerId === drag.pid) {
      if (!drag.moved && Math.hypot(e.clientX - drag.sx, e.clientY - drag.sy) < 3) return;
      drag.moved = true; setRay(e);
      if (ray.ray.intersectPlane(drag.plane, _p)) dragTo(_p);
    } else if (press && e.pointerId === press.pid) {
      const dx = e.clientX - press.sx, dy = e.clientY - press.sy;
      if (Math.hypot(dx, dy) > 4) press.moved = true;
      if (mode === 'eye' && press.moved) { eye.anim = null; eye.yaw = press.yaw0 - dx * 0.005; eye.pitch = clamp(press.pitch0 + dy * 0.004, -1.1, 1.1); }
    }
  });
  const end = (e, cancelled) => {
    pointers.delete(e.pointerId);
    if (drag && e.pointerId === drag.pid) {
      const d = drag; drag = null; orbit.enabled = mode === 'orbit'; planCtl.enabled = mode === 'plan';
      if (d.moved) { if (d.kind === 'room' || d.kind === 'opening') { rebuildFlat(); renderInspector(); } commit(); if (d.kind === 'underlay') renderLayout(); }
    } else if (press && e.pointerId === press.pid) {
      if (!press.moved && !cancelled) {
        if (mode === 'eye') { setRay(e); if (ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), _p)) walkTo(_p.x, _p.z); }
        else if (press.hit && press.hit.kind === 'room') select('room', press.hit.id);
        else if (press.hit && press.hit.kind === 'decor') { decorRoom = press.hit.id; renderDecor(); const c = document.querySelector(`[data-room-card="${CSS.escape(decorRoom)}"]`); if (c) c.scrollIntoView({ block: 'nearest', behavior: reduceMotion ? 'auto' : 'smooth' }); }
        else select(null);
      }
      press = null;
    }
  };
  window.addEventListener('pointerup', (e) => end(e, false));
  window.addEventListener('pointercancel', (e) => end(e, true));
  canvas.addEventListener('wheel', (e) => {
    if (mode !== 'eye' || !flat) return; e.preventDefault();
    const s = -e.deltaY * 0.002; eye.anim = null; stepTo(eye.x + Math.sin(eye.yaw) * s, eye.z - Math.cos(eye.yaw) * s);
  }, { passive: false });
}

function dragStart(hit) {
  const p = hit.point;
  if (hit.kind === 'item' || hit.kind === 'fixture') { const it = selectedTarget(); return { off: { x: it.x - p.x, z: it.z - p.z } }; }
  if (hit.kind === 'room') { const r = findRoom(flat, hit.id); return { off: { x: r.x - p.x, z: r.z - p.z } }; }
  if (hit.kind === 'opening') {
    const op = flat.openings.find((o) => o.id === hit.id), r = findRoom(flat, op.room), e = roomEdges(r)[op.edge];
    return { off: op.pos - ((p.x - e.a.x) * e.d.x + (p.z - e.a.z) * e.d.z) };
  }
  if (hit.kind === 'underlay') return { off: { x: flat.underlay.x - p.x, z: flat.underlay.z - p.z } };
  return {};
}

function dragTo(p) {
  if (drag.kind === 'item' || drag.kind === 'fixture') {
    const it = selectedTarget(); if (!it) return;
    const before = it.room;
    it.x = p.x + drag.off.x; it.z = p.z + drag.off.z;
    world.resolve(it, prefs().snap, undefined, drag.kind === 'fixture');
    onThingMoved(drag.kind, it);
    if (it.room !== before) renderPlaced();
  } else if (drag.kind === 'room') {
    const r = findRoom(flat, drag.id); if (!r) return;
    const s = snapRoom(r, p.x + drag.off.x, p.z + drag.off.z);
    moveRoom(r, s.x - r.x, s.z - r.z);
  } else if (drag.kind === 'opening') {
    const op = flat.openings.find((o) => o.id === drag.id); if (!op) return;
    const r = findRoom(flat, op.room), e = roomEdges(r)[op.edge];
    const u = (p.x - e.a.x) * e.d.x + (p.z - e.a.z) * e.d.z;
    const pos = clamp(snapTo(u + drag.off, 0.01), 0, Math.max(0, e.len - op.width));
    if (Math.abs(pos - op.pos) > 1e-6) { op.pos = pos; structureDirty = true; liveInspector(); }
  } else if (drag.kind === 'underlay') {
    flat.underlay.x = p.x + drag.off.x; flat.underlay.z = p.z + drag.off.z; updateUnderlay();
  }
}

function moveRoom(r, dx, dz) {
  if (Math.abs(dx) < 1e-6 && Math.abs(dz) < 1e-6) return;
  r.x += dx; r.z += dz;
  for (const it of flat.design.items) if (it.room === r.id) { it.x += dx; it.z += dz; }
  for (const fx of flat.fixtures) if (fx.room === r.id) { fx.x += dx; fx.z += dz; }
  for (const it of flat.design.items) { const rec = itemObjs.get(it.id); if (rec && it.room === r.id) placeThing(it, rec.group); }
  for (const fx of flat.fixtures) { const rec = fixtureObjs.get(fx.id); if (rec && fx.room === r.id) placeThing(fx, rec.group); }
  structureDirty = true;
}

/** Snap a room being dragged so it sits a wall's width from its neighbours, or lines up with them. */
function snapRoom(r, nx, nz) {
  const T = 0.12, gap = flat.innerWall, mine = roomEdges({ ...r, x: 0, z: 0 });
  let bx = null, bdx = T, bz = null, bdz = T;
  const near = (a0, a1, b0, b1) => Math.min(a1, b1) - Math.max(a0, b0) > -0.6;
  for (const o of flat.rooms) {
    if (o.id === r.id) continue;
    for (const oe of roomEdges(o)) for (const me of mine) {
      if (oe.axis !== me.axis) continue;
      let cand = null;
      if (me.axis === 'z') {
        if (me.side === 'e' && oe.side === 'w') cand = oe.coord - gap - me.coord;
        else if (me.side === 'w' && oe.side === 'e') cand = oe.coord + gap - me.coord;
        else if (me.side === oe.side) cand = oe.coord - me.coord;
        if (cand !== null && Math.abs(nx - cand) < bdx && near(me.lo + nz, me.hi + nz, oe.lo, oe.hi)) { bdx = Math.abs(nx - cand); bx = cand; }
      } else {
        if (me.side === 's' && oe.side === 'n') cand = oe.coord - gap - me.coord;
        else if (me.side === 'n' && oe.side === 's') cand = oe.coord + gap - me.coord;
        else if (me.side === oe.side) cand = oe.coord - me.coord;
        if (cand !== null && Math.abs(nz - cand) < bdz && near(me.lo + nx, me.hi + nx, oe.lo, oe.hi)) { bdz = Math.abs(nz - cand); bz = cand; }
      }
    }
  }
  return { x: bx ?? snapTo(nx, 0.05), z: bz ?? snapTo(nz, 0.05) };
}

/* ------------------------------------------------------------- keyboard */
const typing = (e) => { const t = e.target; return t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable); };
function bindKeys() {
  window.addEventListener('keydown', (e) => {
    if (!flat || typing(e) || $('#dlg').open) return;
    const k = e.key.toLowerCase(), mod = e.ctrlKey || e.metaKey;
    if (mod && k === 'z') { e.preventDefault(); if (e.shiftKey) redo(); else undo(); return; }
    if (mod && k === 'y') { e.preventDefault(); redo(); return; }
    const t = selectedTarget();
    if (t && mode !== 'eye') {
      const kind = selection.kind;
      if (k === 'delete' || k === 'backspace') { e.preventDefault(); deleteSelected(); return; }
      if (k === 'escape') { select(null); return; }
      if (kind === 'item' || kind === 'fixture') {
        if (mod && k === 'd') { e.preventDefault(); duplicateSelected(); return; }
        if (k === 'r') { rotateThing(t, e.shiftKey ? -90 : 90); return; }
        if (k === 'q') { rotateThing(t, -15); return; }
        if (k === 'e') { rotateThing(t, 15); return; }
      }
      const step = e.shiftKey ? 0.1 : 0.01; let dx = 0, dz = 0;
      if (k === 'arrowleft') dx = -step; else if (k === 'arrowright') dx = step; else if (k === 'arrowup') dz = -step; else if (k === 'arrowdown') dz = step;
      if (dx || dz) {
        e.preventDefault();
        if (kind === 'item' || kind === 'fixture') { t.x += dx; t.z += dz; world.resolve(t, false, world.ROOMS[t.room], kind === 'fixture'); onThingMoved(kind, t); commitSoon(); }
        else if (kind === 'room') { moveRoom(t, dx, dz); commitSoon(); }
        else if (kind === 'opening') {
          const e2 = roomEdges(findRoom(flat, t.room))[t.edge];
          const along = e2.axis === 'x' ? dx : dz, dir = e2.axis === 'x' ? e2.d.x : e2.d.z;
          if (along) { t.pos = clamp(t.pos + along * dir, 0, Math.max(0, e2.len - t.width)); structureDirty = true; commitSoon(); setTimeout(renderInspector, 460); }
        }
        return;
      }
    }
    if (mode === 'eye' && ['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(k)) { e.preventDefault(); keys.add(k); }
  });
  window.addEventListener('keyup', (e) => keys.delete(e.key.toLowerCase()));
  window.addEventListener('blur', () => keys.clear());
}

/* --------------------------------------------------------- actions */
function rotateThing(it, delta) {
  it.rot = (((it.rot + delta) % 360) + 360) % 360;
  const fx = selection && selection.kind === 'fixture';
  world.resolve(it, prefs().snap, world.ROOMS[it.room], fx);
  if (fx) { syncFixtures(); rebuildWorld(); }
  syncItems(); commitSoon(); renderInspectorSoon();
}
async function deleteSelected() {
  const t = selectedTarget(); if (!t) return;
  const kind = selection.kind;
  if (kind === 'item') { flat.design.items = flat.design.items.filter((i) => i.id !== t.id); select(null); syncItems(); commit(); return; }
  if (kind === 'fixture') { flat.fixtures = flat.fixtures.filter((i) => i.id !== t.id); select(null); structureChanged(); return; }
  if (kind === 'opening') { flat.openings = flat.openings.filter((o) => o.id !== t.id); select(null); structureChanged(); return; }
  if (kind === 'room') {
    const things = flat.design.items.filter((i) => i.room === t.id).length + flat.fixtures.filter((f) => f.room === t.id).length;
    if (things && !(await confirmDialog({ title: `Delete the ${t.name.toLowerCase()}?`, text: `The ${things} ${things === 1 ? 'thing' : 'things'} in it go too.`, ok: 'Delete room', danger: true }))) return;
    flat.rooms = flat.rooms.filter((r) => r.id !== t.id);
    flat.openings = flat.openings.filter((o) => o.room !== t.id);
    flat.fixtures = flat.fixtures.filter((f) => f.room !== t.id);
    flat.design.items = flat.design.items.filter((i) => i.room !== t.id);
    for (const k of ['paint', 'wallPaint', 'floor']) delete flat.design[k][t.id];
    if (focus === t.id) focus = 'flat';
    select(null); structureChanged();
  }
}
function duplicateSelected() {
  const t = selectedTarget(); if (!t) return;
  const copy = { ...structuredClone(t), id: uid(), x: t.x + 0.2, z: t.z + 0.2 };
  if (selection.kind === 'item') { world.resolve(copy, prefs().snap, world.ROOMS[t.room]); flat.design.items.push(copy); syncItems(); select('item', copy.id); commit(); }
  else if (selection.kind === 'fixture') { world.resolve(copy, prefs().snap, world.ROOMS[t.room], true); flat.fixtures.push(copy); select('fixture', copy.id); structureChanged(); }
}

/** Which room new furniture goes in: the room you're looking at, else a sensible one. */
function targetRoomFor(entry) {
  if (focus !== 'flat' && world.ROOMS[focus]) return focus;
  const biggest = (list) => list.slice().sort((a, b) => roomArea(b) - roomArea(a))[0];
  const bedroomish = entry && (entry.category === 'Bedroom' || ['bed', 'wardrobe'].includes(entry.shape));
  const r = (bedroomish && biggest(flat.rooms.filter((x) => x.type === 'bedroom'))) || biggest(flat.rooms.filter((x) => x.type === 'living')) || biggest(flat.rooms);
  return r ? r.id : null;
}
function targetRoomForFitting(shape) {
  const t = selectedTarget();
  if (t && selection.kind === 'room') return t.id;
  if (t && (selection.kind === 'fixture' || selection.kind === 'opening')) return t.room;
  if (focus !== 'flat' && world.ROOMS[focus]) return focus;
  const g = SHAPES[shape].group, type = g === 'Kitchen' ? 'kitchen' : g === 'Bathroom' ? 'bathroom' : null;
  const biggest = (list) => list.slice().sort((a, b) => roomArea(b) - roomArea(a))[0];
  const r = (type && biggest(flat.rooms.filter((x) => x.type === type))) || biggest(flat.rooms);
  return r ? r.id : null;
}

function addItem(entry) {
  const rid = targetRoomFor(entry), R = rid && world.ROOMS[rid];
  if (!R) { toast('Add a room first, on the Layout tab.'); return; }
  const room = findRoom(flat, rid), [cx, cz] = roomCentre(room);
  const it = normalizeItem({ id: uid(), cat: entry.id, ...entryLook(entry), x: cx, z: cz, rot: 0, elev: entry.elev, room: rid });
  if (it.shape === 'tv') {
    const unit = flat.design.items.find((i) => (i.shape === 'tvUnit' || i.shape === 'sideboard') && i.room === rid);
    if (unit) { it.x = unit.x; it.z = unit.z; it.rot = unit.rot; it.elev = unit.elev + unit.h; world.resolve(it, false, R); }
    else world.backToWall(it, R);
  } else if (entry.wall) world.backToWall(it, R);
  else world.placeFree(it, R, flat.design.items);
  flat.design.items.push(it); syncItems(); select('item', it.id); commit();
  toast(`Added ${entry.name} to the ${room.name.toLowerCase()}. Drag it to move it.`);
}

function addFitting(shape) {
  const rid = targetRoomForFitting(shape);
  if (!rid) { toast('Add a room first.'); return; }
  const room = findRoom(flat, rid), fx = newFixture(flat, shape, room);
  world.backToWall(fx, world.ROOMS[rid], true);
  flat.fixtures.push(fx);
  selection = { kind: 'fixture', id: fx.id };
  structureChanged();
  toast(`Added ${SHAPES[shape].label.toLowerCase()} to the ${room.name.toLowerCase()}.`);
}

function addRoom(beside, side) {
  let r;
  if (beside) r = roomBeside(flat, beside, side);
  else {
    const [, z0, x1] = flatBounds(flat, 0);
    r = newRoom(flat, flat.rooms.length ? { x: x1 + flat.innerWall, z: z0 } : { name: 'Living room', type: 'living', w: 4, d: 3.5 });
  }
  flat.rooms.push(r);
  selection = { kind: 'room', id: r.id };
  structureChanged();
  if (!cameraTouched || flat.rooms.length <= 2) { resetOrbitView(true); resetPlanView(); }
}

function addOpening(room, edge, kind) {
  const op = newOpening(flat, room, edge, kind);
  if (!op) return;
  flat.openings.push(op);
  selection = { kind: 'opening', id: op.id };
  structureChanged();
}

/** Keep doors and windows in the same place on screen after a room changes shape. */
function reattachOpenings(room, oldEdges) {
  const now = roomEdges(room);
  for (const op of flat.openings) {
    if (op.room !== room.id) continue;
    const oe = oldEdges[op.edge]; if (!oe) continue;
    const p0 = { x: oe.a.x + oe.d.x * op.pos, z: oe.a.z + oe.d.z * op.pos };
    const cands = now.filter((e) => e.side === oe.side).sort((a, b) => Math.abs(a.coord - oe.coord) - Math.abs(b.coord - oe.coord));
    const e = cands[0]; if (!e) continue;
    op.edge = e.i;
    op.pos = clamp((p0.x - e.a.x) * e.d.x + (p0.z - e.a.z) * e.d.z, 0, Math.max(0, e.len - op.width));
  }
}
function changeRoom(room, fn) {
  const before = roomEdges(room);
  fn(room);
  reattachOpenings(room, before);
  structureChanged({ resolveAll: true });
}

/* ----------------------------------------------------------------- UI */
function renderHeader() {
  $('#p-title').textContent = flat.name;
  const bits = [];
  if (flat.address) bits.push(flat.address);
  if (flat.rent !== null) bits.push(flat.rentPeriod === 'sale' ? money(flat.rent, prefs().currency) : `${money(flat.rent, prefs().currency)} a ${flat.rentPeriod}`);
  bits.push(FLAT_STATUS[flat.status]);
  $('#p-sub').textContent = bits.join(' · ');
  document.title = `${flat.name} · Flat Planner`;
}

function bindTabs() {
  const tabs = $$('#panel [role="tab"]');
  tabs.forEach((t, i) => {
    t.addEventListener('click', () => setTab(t.dataset.tab));
    t.addEventListener('keydown', (e) => {
      if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
      const n = tabs[(i + (e.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length]; setTab(n.dataset.tab); n.focus();
    });
  });
}
function setTab(name) {
  tab = name;
  for (const t of $$('#panel [role="tab"]')) {
    const on = t.dataset.tab === name;
    t.setAttribute('aria-selected', String(on)); t.tabIndex = on ? 0 : -1;
    $('#' + t.getAttribute('aria-controls')).hidden = !on;
  }
  const keep = { furnish: ['item'], decor: ['item'], details: ['item'], layout: ['room', 'opening', 'fixture'] }[name];
  if (selection && !keep.includes(selection.kind)) select(null);
  if (name !== 'layout') underlayMove = false;
  const h = location.hash.replace(/\/(furnish|layout|decor|details)$/, '');
  history.replaceState(null, '', `${h}/${name}`);
  renderPanels(); setHint(); updateUnderlay(); updateMeasure();
}
function renderPanels() {
  if (tab === 'furnish') renderFurnish();
  else if (tab === 'layout') renderLayout();
  else if (tab === 'decor') renderDecor();
  else renderDetails();
}

/* ---- Furnish */
let catalogListEl = null, placedEl = null, targetEl = null;
function renderFurnish() {
  const root = $('#tab-furnish');
  const search = el('input', { type: 'search', placeholder: 'Search your catalogue', value: furnishView.q, 'aria-label': 'Search your catalogue' });
  search.addEventListener('input', () => { furnishView.q = search.value; renderCatalogList(); });
  const cats = [...new Set(db.catalogue.map((e) => e.category))];
  const catSel = selectEl([['', 'Everything'], ...cats.map((c) => [c, c])], cats.includes(furnishView.cat) ? furnishView.cat : '', { 'aria-label': 'Group' });
  catSel.addEventListener('change', () => { furnishView.cat = catSel.value; renderCatalogList(); });
  targetEl = el('b');
  catalogListEl = el('div', { class: 'block' });
  placedEl = el('div', { class: 'block' });
  root.replaceChildren(
    el('p', { class: 'lead' }, 'Tap one of your things to add it to ', targetEl, ', then drag it into place, even into another room.'),
    el('div', { class: 'cat-tools' }, search, catSel),
    catalogListEl,
    el('div', { class: 'row' },
      el('button', { type: 'button', class: 'btn small', onclick: newItemHere }, '+ New item'),
      el('a', { class: 'btn small ghost', href: '#/catalogue' }, 'Manage my catalogue')),
    placedEl);
  renderFurnishTarget(); renderCatalogList(); renderPlaced();
}
function renderFurnishTarget() {
  if (!targetEl) return;
  const main = findRoom(flat, targetRoomFor(null)), bed = findRoom(flat, targetRoomFor({ category: 'Bedroom' }));
  if (!main) { targetEl.textContent = 'a room (add one on the Layout tab)'; return; }
  targetEl.textContent = `the ${main.name.toLowerCase()}` + (focus === 'flat' && bed && bed !== main ? ` (beds go in the ${bed.name.toLowerCase()})` : '');
}
function renderCatalogList() {
  if (!catalogListEl) return;
  const q = furnishView.q.trim().toLowerCase();
  const list = db.catalogue.filter((e) => (!furnishView.cat || e.category === furnishView.cat) && (!q || `${e.name} ${e.category} ${e.notes}`.toLowerCase().includes(q)));
  const groups = [...new Set(list.map((e) => e.category))];
  const used = new Map(); for (const it of flat.design.items) used.set(it.cat, (used.get(it.cat) || 0) + 1);
  catalogListEl.replaceChildren(...groups.map((g) => el('div', { class: 'cat-group' },
    el('h3', {}, g),
    el('div', { class: 'cat-grid' }, list.filter((e) => e.category === g).map((e) => el('button', {
      type: 'button', class: 'cat', 'aria-label': `Add ${e.name}`, title: e.notes || e.name, onclick: () => addItem(e),
    },
    el('span', { class: 'dot', style: { background: e.color } }),
    el('span', { class: 'cat-name' }, e.name),
    el('span', { class: 'cat-dim' }, dimsText(e)),
    e.status === 'buy' ? el('span', { class: 'buy' }, `To buy${e.price !== null ? ` · ${money(e.price, prefs().currency)}` : ''}`) : null,
    used.get(e.id) ? el('span', { class: 'buy', style: { color: 'var(--muted)' } }, `${used.get(e.id)} in this flat`) : null))))));
  if (!list.length) catalogListEl.append(el('p', { class: 'note' }, db.catalogue.length ? 'Nothing matches.' : 'Your catalogue is empty.'));
}
async function newItemHere() {
  const res = await editEntryFlow(newEntry('sofa'), { isNew: true, inFlat: true });
  if (!res || !flat) return;
  renderCatalogList();
  if (res.action === 'add') addItem(res.entry);
}
function renderPlaced() {
  if (!placedEl || !flat || tab !== 'furnish') return;
  const items = flat.design.items, order = (it) => flat.rooms.findIndex((r) => r.id === it.room);
  const ul = el('ul', { class: 'placed' });
  for (const it of items.slice().sort((a, b) => order(a) - order(b))) {
    const r = findRoom(flat, it.room);
    const li = el('li', {}, el('button', { type: 'button', class: 'pick', 'aria-current': String(isSel('item', it.id)), onclick: () => select('item', it.id) },
      el('span', { class: 'nm' }, it.name, el('small', {}, r ? r.name : '')),
      el('span', { class: 'd' }, `${cm(it.w)} × ${cm(it.d)}`)));
    if (clashes.flagged.has(it.id)) li.append(el('span', { class: 'flag', title: 'Overlaps ' + clashes.byId.get(it.id).join(', ') }));
    ul.append(li);
  }
  // what it would cost, and whether you've placed more than you own
  const counts = new Map(); for (const it of items) counts.set(it.cat, (counts.get(it.cat) || 0) + 1);
  let buyN = 0, cost = 0, ownN = 0, unpriced = 0; const short = [];
  for (const [cat, n] of counts) {
    const e = findEntry(cat); if (!e) continue;
    if (e.status === 'buy') { buyN += n; if (e.price !== null) cost += e.price * n; else unpriced += n; }
    else { ownN += n; if (n > e.qty) short.push(`${n} × ${e.name}, you have ${e.qty}`); }
  }
  placedEl.replaceChildren(
    el('h2', {}, 'In this flat ', el('span', { class: 'count' }, String(items.length))),
    items.length ? ul : el('p', { class: 'note' }, 'Nothing yet. The flat is empty.'),
    items.length ? el('div', { class: 'totals' },
      el('span', {}, 'Things you own'), el('b', {}, String(ownN)),
      el('span', {}, 'Things to buy'), el('b', {}, String(buyN)),
      buyN ? el('span', {}, 'Cost of what to buy') : null, buyN ? el('b', {}, money(cost, prefs().currency) + (unpriced ? ` + ${unpriced} unpriced` : '')) : null) : null,
    short.length ? el('p', { class: 'warnline' }, `Placed more than you own: ${short.join('; ')}.`) : null,
    items.length ? el('div', { class: 'row' }, el('button', { type: 'button', class: 'btn small ghost danger', onclick: () => { flat.design.items = []; select(null); syncItems(); commit(); toast('Furniture removed. Undo brings it back.'); } }, 'Remove all furniture')) : null);
}

/* ---- Layout */
let roomsListEl = null;
function renderLayout() {
  const root = $('#tab-layout');
  roomsListEl = el('div', { class: 'list-btns' });
  const u = flat.underlay;
  const groups = [...new Set(FITTING_SHAPES.map((k) => SHAPES[k].group))];
  const ceiling = cmField('Ceiling height', flat.ceiling, (v) => {
    flat.ceiling = clamp(v, 2.0, 4.0);
    for (const fx of flat.fixtures) if (fx.fullHeight) fx.h = flat.ceiling;
    structureChanged();
  }, { min: 200, max: 400, hint: 'Every room' });
  const outer = cmField('Outside walls', flat.outerWall, (v) => { flat.outerWall = clamp(v, 0.1, 0.6); structureChanged(); }, { min: 10, max: 60, hint: 'How thick they look' });
  const inner = cmField('Gap between rooms', flat.innerWall, (v) => { flat.innerWall = clamp(v, 0.05, 0.4); structureChanged(); }, { min: 5, max: 40, hint: 'Rooms snap this far apart' });
  root.replaceChildren(
    el('p', { class: 'lead' }, 'Trace the flat from its listing: add a room for each one on the floorplan and type in its size. Click a room to add its doors and windows.'),
    el('div', { class: 'block' },
      el('h2', {}, 'Rooms ', el('span', { class: 'count' }, String(flat.rooms.length))),
      roomsListEl,
      el('div', { class: 'row' }, el('button', { type: 'button', class: 'btn small primary', onclick: () => addRoom(null) }, '+ Add a room'))),
    el('div', { class: 'block' },
      el('h2', {}, 'Floorplan picture'),
      u && underlayImg ? el('div', { class: 'block' },
        el('div', { class: 'checks' }, el('label', {}, el('input', { type: 'checkbox', checked: u.show, onchange: (e) => { u.show = e.target.checked; updateUnderlay(); commit(); } }), 'Show it under the plan')),
        el('div', { class: 'fields2' },
          el('label', { class: 'f' }, 'Width of the picture', el('span', { class: 'inp' }, el('input', { type: 'number', min: 0.5, max: 200, step: 0.05, value: u.width.toFixed(2), onchange: (e) => { const v = parseFloat(e.target.value); if (Number.isFinite(v)) { u.width = clamp(v, 0.5, 200); updateUnderlay(); commit(); } } }), ' m'), el('span', { class: 'hint' }, 'Scale it until the rooms match')),
          el('label', { class: 'f' }, 'See-through', el('input', { type: 'range', min: 0.15, max: 1, step: 0.05, value: u.opacity, oninput: (e) => { u.opacity = +e.target.value; updateUnderlay(); }, onchange: () => commit() }))),
        el('div', { class: 'row' },
          el('button', { type: 'button', class: 'btn small', 'aria-pressed': String(underlayMove), onclick: () => { underlayMove = !underlayMove; renderLayout(); toast(underlayMove ? 'Drag the floorplan to line it up. Click “Done moving” when it fits.' : 'Floorplan fixed in place.'); } }, underlayMove ? 'Done moving' : 'Move it'),
          el('button', { type: 'button', class: 'btn small', onclick: () => { u.rot = (u.rot + 90) % 360; updateUnderlay(); commit(); } }, 'Turn it 90°'),
          el('button', { type: 'button', class: 'btn small ghost danger', onclick: removeUnderlay }, 'Remove'))) :
        el('div', { class: 'block' },
          el('p', { class: 'note' }, flat.floorplanUrl ? 'This flat has the listing’s floorplan. Put it under the plan to check the rooms against it.' : 'Put the listing’s floorplan under the plan and trace over it. Use a screenshot or the image from the listing.'),
          el('div', { class: 'row' },
            flat.floorplanUrl ? el('button', { type: 'button', class: 'btn small primary', onclick: () => fetchListingFloorplan() }, 'Use the listing’s floorplan') : null,
            el('button', { type: 'button', class: 'btn small', onclick: addUnderlay }, 'Add the floorplan picture'),
            flat.floorplanUrl ? el('a', { class: 'btn small ghost', href: flat.floorplanUrl, target: '_blank', rel: 'noopener noreferrer' }, 'Open it ↗') : null))),
    el('div', { class: 'block' },
      el('h2', {}, 'Fixed fittings'),
      el('p', { class: 'note' }, 'Kitchen units, bathroom fittings, radiators and built-in cupboards. They go in the selected room; drag them into place.'),
      ...groups.map((g) => el('div', { class: 'cat-group' }, el('h3', {}, g), el('div', { class: 'cat-grid' },
        FITTING_SHAPES.filter((k) => SHAPES[k].group === g).map((k) => el('button', { type: 'button', class: 'cat', onclick: () => addFitting(k) },
          el('span', { class: 'cat-name' }, SHAPES[k].label), el('span', { class: 'cat-dim' }, `${cm(SHAPES[k].w)} × ${cm(SHAPES[k].d)}`))))))),
    el('div', { class: 'block' },
      el('h2', {}, 'Walls and ceiling'),
      el('div', { class: 'fields3' }, ceiling, outer, inner),
      el('p', { class: 'note' }, `The ceiling is ${ftin(flat.ceiling)}. Room sizes are inside measurements, wall to wall, as listings give them.`)));
  renderLayoutLists();
}
function renderLayoutLists() {
  if (!roomsListEl || tab !== 'layout') return;
  roomsListEl.replaceChildren(...flat.rooms.map((r) => el('button', { type: 'button', 'aria-current': String(isSel('room', r.id)), onclick: () => select('room', r.id) },
    el('span', {}, r.name), el('span', {}, `${cm(r.w)} × ${cm(r.d)}`))));
  if (!flat.rooms.length) roomsListEl.append(el('p', { class: 'note' }, 'No rooms yet.'));
}

/* ---- Decor */
function renderDecor() {
  const root = $('#tab-decor');
  const paintPick = (room, edge) => (c, live) => {
    if (edge === undefined) { flat.design.paint[room.id] = c; }
    else { (flat.design.wallPaint[room.id] ||= {})[edge] = c; }
    applyDecor();
    if (!live) { commit(); renderDecor(); }
  };
  const cards = flat.rooms.map((r) => {
    const fl = floorFor(flat, r), wp = flat.design.wallPaint[r.id] || {};
    const edges = roomEdges(r);
    return el('div', { class: 'room-card', 'data-room-card': r.id, 'aria-current': String(decorRoom === r.id) },
      el('h2', {}, r.name, el('span', { class: 'muted small' }, roomType(r).label)),
      el('div', { class: 'paint-row' }, el('div', { class: 'lbl' }, el('b', {}, 'Walls'), el('span', {}, paintFor(flat, r).toUpperCase())),
        swatchRow(PAINTS, paintFor(flat, r), paintPick(r), `Pick any colour for the ${r.name.toLowerCase()}`)),
      el('div', { class: 'block', style: { gap: '6px' } }, el('span', { class: 'lbl' }, 'Floor'),
        el('div', { class: 'chips' }, Object.entries(FLOORS).map(([k, F]) => el('button', {
          type: 'button', class: 'chip', 'aria-pressed': String(fl === k),
          onclick: () => { flat.design.floor[r.id] = k; applyDecor(); commit(); renderDecor(); },
        }, el('i', { style: { background: F.swatch } }), F.label)))),
      el('details', { class: 'more', open: Object.keys(wp).length > 0 || undefined },
        el('summary', {}, 'Paint walls separately'),
        el('div', { class: 'block' }, edges.map((e) => el('div', { class: 'paint-row' },
          el('div', { class: 'lbl' }, el('b', {}, `${edgeLabel(r, e.i)} · ${cm(e.len)} cm`),
            wp[e.i] ? el('button', { type: 'button', class: 'linkbtn small', onclick: () => { delete wp[e.i]; if (!Object.keys(wp).length) delete flat.design.wallPaint[r.id]; applyDecor(); commit(); renderDecor(); } }, 'Same as the room') : el('span', {}, '')),
          swatchRow(PAINTS, paintFor(flat, r, e.i), paintPick(r, e.i), `Pick any colour for this wall`))))));
  });
  root.replaceChildren(
    el('p', { class: 'lead' }, 'Paint and floors, room by room. Click a floor in the 3D view to jump to its room.'),
    ...cards,
    el('div', { class: 'block' }, el('h2', {}, 'Ceilings and coving'),
      swatchRow(CEILING_PAINTS, flat.design.ceiling, (c, live) => { flat.design.ceiling = c; applyDecor(); if (!live) { commit(); renderDecor(); } }, 'Pick any colour for the ceilings')),
    el('div', { class: 'block' }, el('h2', {}, 'Doors and skirting'),
      el('div', { class: 'chips' }, TRIMS.map(([c, name]) => el('button', { type: 'button', class: 'chip', 'aria-pressed': String(flat.design.trim === c), onclick: () => { flat.design.trim = c; applyDecor(); commit(); renderDecor(); } }, el('i', { style: { background: c } }), name)))),
    el('div', { class: 'row' }, el('button', { type: 'button', class: 'btn small ghost', onclick: () => { flat.design.paint = {}; flat.design.wallPaint = {}; flat.design.floor = {}; flat.design.ceiling = DEFAULT_CEILING_PAINT; applyDecor(); commit(); renderDecor(); } }, 'Back to plain walls and floors')),
    el('div', { class: 'block' }, el('h2', {}, 'Show'),
      el('div', { class: 'checks' },
        el('label', {}, el('input', { type: 'checkbox', checked: prefs().swing, onchange: (e) => { prefs().swing = e.target.checked; savePrefs(); applyVisibility(); } }), 'Door swings on the floor'),
        el('label', {}, el('input', { type: 'checkbox', checked: prefs().measure, onchange: (e) => { prefs().measure = e.target.checked; savePrefs(); updateMeasure(); } }), 'Distances from the selected item to the walls'),
        el('label', {}, el('input', { type: 'checkbox', checked: prefs().snap, onchange: (e) => { prefs().snap = e.target.checked; savePrefs(); } }), 'Snap furniture to walls'))));
}

/* ---- Details */
function renderDetails() {
  const root = $('#tab-details');
  const text = (key, label, attrs = {}) => {
    const inp = el('input', { type: attrs.type || 'text', value: flat[key] ?? '', maxlength: attrs.max || 200, placeholder: attrs.placeholder || '' });
    inp.addEventListener('change', () => { flat[key] = inp.value.trim(); if (key === 'name' && !flat.name) flat.name = 'Untitled flat'; commit(); renderHeader(); if (key === 'url') renderDetails(); });
    return field(label, inp, attrs.hint);
  };
  const status = selectEl(Object.entries(FLAT_STATUS), flat.status);
  status.addEventListener('change', () => { flat.status = status.value; commit(); renderHeader(); });
  const rent = el('input', { type: 'number', min: 0, step: 'any', value: flat.rent ?? '' });
  rent.addEventListener('change', () => { flat.rent = rent.value === '' ? null : Math.max(0, +rent.value); commit(); renderHeader(); });
  const period = selectEl([['month', 'a month'], ['week', 'a week'], ['sale', 'to buy']], flat.rentPeriod);
  period.addEventListener('change', () => { flat.rentPeriod = period.value; commit(); renderHeader(); });
  const notes = el('textarea', { maxlength: 5000, rows: 6, placeholder: 'Viewing notes, questions for the agent…' }, flat.notes);
  notes.addEventListener('change', () => { flat.notes = notes.value; commit(); });
  const link = safeUrl(flat.url);
  const area = flat.rooms.reduce((s, r) => s + roomArea(r), 0);
  root.replaceChildren(
    el('div', { class: 'block' },
      el('h2', {}, 'The listing'),
      text('name', 'Name', { max: 80 }),
      field('Status', status),
      text('address', 'Address'),
      text('url', 'Listing link', { type: 'url', max: 500, placeholder: 'https://' }),
      link ? el('a', { class: 'btn small', href: link, target: '_blank', rel: 'noopener noreferrer', style: { justifySelf: 'start' } }, 'Open the listing ↗') : null,
      el('div', { class: 'fields2' }, el('label', { class: 'f' }, 'Rent or price', el('span', { class: 'inp' }, prefs().currency || '£', rent)), field('Per', period)),
      field('Notes', notes),
      el('p', { class: 'note' }, `${flat.rooms.length} rooms, ${area.toFixed(1)} m² inside (${Math.round(area * 10.764)} sq ft).`)),
    flat.photos.length ? el('div', { class: 'block' },
      el('h2', {}, 'Listing photos ', el('span', { class: 'count' }, String(flat.photos.length))),
      el('div', { class: 'photos' }, flat.photos.map((u, i) => el('a', { href: u, target: '_blank', rel: 'noopener noreferrer', 'aria-label': `Photo ${i + 1}, opens full size` },
        el('img', { src: u, alt: '', loading: 'lazy', referrerpolicy: 'no-referrer', onerror: (e) => e.currentTarget.parentElement.remove() }))))) : null,
    el('div', { class: 'block' },
      el('h2', {}, 'Save and share'),
      el('button', { type: 'button', class: 'btn wide', onclick: copyFlatLink }, 'Copy a link to this flat', el('small', {}, 'Opening the link adds the flat, with its rooms and furniture, to whoever opens it. Your own pictures stay here.')),
      el('button', { type: 'button', class: 'btn wide', onclick: () => exportFlat(flat) }, 'Save this flat as a file', el('small', {}, '.json with its plan, furniture and floorplan picture. Open it on the flats page.')),
      el('button', { type: 'button', class: 'btn primary wide', onclick: (e) => downloadModel(false, e.currentTarget) }, 'Download the empty flat', el('small', {}, '.glb 3D model, in metres')),
      el('button', { type: 'button', class: 'btn wide', onclick: (e) => downloadModel(true, e.currentTarget) }, 'Download the flat with your furniture', el('small', {}, 'Same model with everything you placed')),
      el('button', { type: 'button', class: 'btn wide', onclick: savePicture }, 'Save a picture of this view', el('small', {}, '.png of the 3D view as it is now')),
      el('p', { class: 'note' }, 'A .glb opens in Blender, Windows 3D Viewer, Apple Quick Look (via Reality Converter), SketchUp with a glTF importer, and most online 3D viewers.')));
}

/* ---- inspector */
let inspectorTimer = 0;
const renderInspectorSoon = () => { clearTimeout(inspectorTimer); inspectorTimer = setTimeout(renderInspector, 0); };
function liveInspector() {
  const t = selectedTarget(); if (!t) return;
  const pos = $('#ins-pos'), msg = $('#ins-clash');
  if (selection.kind === 'item' && msg) {
    const cl = clashes.byId.get(t.id);
    msg.hidden = !cl; if (cl) msg.textContent = 'Overlaps ' + [...new Set(cl)].join(', ') + '.';
  }
  if (pos && (selection.kind === 'item' || selection.kind === 'fixture')) { const r = findRoom(flat, t.room); pos.textContent = r ? `In the ${r.name.toLowerCase()}. Drag it through a doorway to move it to another room.` : ''; }
  if (selection.kind === 'opening') { const inp = $('[data-k="op-off"]'); const r = findRoom(flat, t.room), e = r && roomEdges(r)[t.edge]; if (inp && e && document.activeElement !== inp) inp.value = String(cm(screenOffset(e, t))); }
}

function renderInspector() {
  clearTimeout(inspectorTimer);
  const box = $('#inspector');
  const t = selectedTarget();
  if (!t || !flat) { box.hidden = true; box.replaceChildren(); return; }
  const focusKey = box.contains(document.activeElement) && document.activeElement.dataset ? document.activeElement.dataset.k : null;
  box.hidden = false;
  const content = { item: itemInspector, fixture: fixtureInspector, room: roomInspector, opening: openingInspector }[selection.kind](t);
  box.replaceChildren(...content.filter(Boolean));
  box.classList.toggle('folded', !!prefs().fold);
  if (focusKey) { const n = box.querySelector(`[data-k="${focusKey}"]`); if (n) n.focus(); }
}
const head = (kind, title) => el('div', { class: 'ins-h' },
  el('div', { class: 'stack', style: { gap: '3px', minWidth: 0, flex: 1 } }, el('span', { class: 'ins-kind' }, kind), title),
  el('button', {
    type: 'button', class: 'x fold', 'aria-label': prefs().fold ? 'Show the details' : 'Fold away the details', 'aria-expanded': String(!prefs().fold),
    title: prefs().fold ? 'Show the details' : 'Fold away', onclick: () => { prefs().fold = !prefs().fold; savePrefs(); renderInspector(); },
  }, prefs().fold ? '▴' : '▾'),
  el('button', { type: 'button', class: 'x', 'aria-label': 'Deselect', onclick: () => select(null) }, '×'));
const rotRow = (t) => el('div', { class: 'f' }, el('span', { class: 'lbl' }, 'Turned ', el('b', {}, `${Math.round(t.rot)}°`)),
  el('div', { class: 'rot-row' }, [[-90, '↺90', 'Turn left 90 degrees'], [-15, '−15', 'Turn left 15 degrees'], [15, '+15', 'Turn right 15 degrees'], [90, '↻90', 'Turn right 90 degrees']]
    .map(([d, label, aria]) => el('button', { type: 'button', class: 'btn small', 'aria-label': aria, onclick: () => rotateThing(t, d) }, label))));
const numIn = (key, metres, onChange, min = 0, max = 2000) => {
  const i = el('input', { type: 'number', min, max, step: 1, inputmode: 'numeric', value: String(cm(metres)), 'data-k': key });
  i.addEventListener('change', () => { const v = parseFloat(i.value); if (!Number.isFinite(v)) { i.value = String(cm(metres)); return; } onChange(clamp(v, min, max) / 100); });
  return i;
};
const cmLabel = (label, input, hint) => el('label', { class: 'f' }, label, el('span', { class: 'inp' }, input, ' cm'), hint ? el('span', { class: 'hint' }, hint) : null);

function itemInspector(it) {
  const e = findEntry(it.cat), r = findRoom(flat, it.room), cl = clashes.byId.get(it.id);
  const shop = e && safeUrl(e.url);
  return [
    head(e ? e.category : 'Furniture', el('strong', { style: { fontSize: '16px' } }, it.name)),
    el('p', { class: 'clash-msg', id: 'ins-clash', hidden: !cl }, cl ? 'Overlaps ' + [...new Set(cl)].join(', ') + '.' : ''),
    el('p', { class: 'info' }, el('span', {}, dimsText(it)),
      e ? el('span', {}, STATUS[e.status] + (e.price !== null ? ` · ${money(e.price, prefs().currency)}` : '')) : el('span', {}, 'No longer in your catalogue'),
      shop ? el('a', { href: shop, target: '_blank', rel: 'noopener noreferrer' }, 'Shop ↗') : null),
    el('div', { class: 'fields2' },
      cmLabel('Off the floor', numIn('it-elev', it.elev, (v) => { it.elev = v; world.resolve(it, false, world.ROOMS[it.room]); syncItems(); commit(); renderInspectorSoon(); }, 0, 280)),
      rotRow(it)),
    el('div', { class: 'row' },
      el('button', { type: 'button', class: 'btn small', onclick: () => { world.backToWall(it, world.ROOMS[it.room]); syncItems(); commit(); renderInspectorSoon(); } }, 'Back against nearest wall'),
      it.shape === 'cornerSofa' ? el('button', { type: 'button', class: 'btn small', onclick: () => { it.mirror = !it.mirror; syncItems(); commit(); } }, 'Swap the chaise side') : null,
      e ? el('button', { type: 'button', class: 'btn small', onclick: async () => {
        const res = await editEntryFlow(e);
        if (!flat) return;
        if (res && res.action === 'delete') { renderCatalogList(); renderInspector(); return; }
        if (res) { refreshLooks(); for (const x of flat.design.items) if (x.cat === e.id) world.resolve(x, false, world.ROOMS[x.room]); syncItems(); commit(); renderCatalogList(); renderInspector(); }
      } }, 'Edit item') : null),
    el('p', { class: 'pos', id: 'ins-pos' }, r ? `In the ${r.name.toLowerCase()}. Drag it through a doorway to move it to another room.` : ''),
    el('div', { class: 'row between' },
      el('button', { type: 'button', class: 'btn small', onclick: duplicateSelected }, 'Duplicate'),
      el('button', { type: 'button', class: 'btn small danger', onclick: deleteSelected }, 'Remove from flat')),
  ];
}

function fixtureInspector(fx) {
  const s = SHAPES[fx.shape], r = findRoom(flat, fx.room);
  const name = el('input', { type: 'text', class: 'name', value: fx.name, maxlength: 60, 'aria-label': 'Name', 'data-k': 'fx-name' });
  name.addEventListener('change', () => { fx.name = name.value.trim() || s.label; rebuildWorld(); commit(); });
  const set = (k) => (v) => { fx[k] = v; world.resolve(fx, false, world.ROOMS[fx.room], true); structureChanged(); };
  const opts = [];
  const posSel = (key, label, choices) => {
    const cur = fx.opts[key];
    const list = [['', 'None'], ...choices];
    const match = list.find(([v]) => (v === '' ? cur === null || cur === undefined : Math.abs(+v - cur) < 0.02));
    const sel = selectEl(match ? list : [...list, [String(cur), 'As placed']], match ? match[0] : String(cur), { 'data-k': 'fx-' + key });
    sel.addEventListener('change', () => { fx.opts[key] = sel.value === '' ? null : +sel.value; syncFixtures(); commit(); });
    return field(label, sel);
  };
  if (fx.shape === 'kitchenUnits') opts.push(el('div', { class: 'fields2' }, posSel('sink', 'Sink', [['0.2', 'Left'], ['0.5', 'Middle'], ['0.8', 'Right']]), posSel('hob', 'Hob', [['0.2', 'Left'], ['0.5', 'Middle'], ['0.8', 'Right']])));
  if (fx.shape === 'vanity') opts.push(posSel('basin', 'Basin', [['0.25', 'Left'], ['0.5', 'Middle'], ['0.75', 'Right']]));
  if (fx.shape === 'boxing') opts.push(el('div', { class: 'checks' }, el('label', {}, el('input', { type: 'checkbox', checked: !!fx.opts.cap, onchange: (e) => { fx.opts.cap = e.target.checked ? '#1c2125' : null; syncFixtures(); commit(); } }), 'Dark top, like a window ledge')));
  return [
    head('Fitting · ' + s.label, name),
    el('div', { class: 'fields3' },
      cmLabel('Width', numIn('fx-w', fx.w, set('w'), 2, 800)),
      cmLabel('Depth', numIn('fx-d', fx.d, set('d'), 1, 800)),
      fx.fullHeight ? el('div', { class: 'f' }, 'Height', el('span', { class: 'small', style: { padding: '6px 0' } }, 'To the ceiling')) : cmLabel('Height', numIn('fx-h', fx.h, set('h'), 1, cm(flat.ceiling)))),
    el('div', { class: 'fields2' }, cmLabel('Off the floor', numIn('fx-elev', fx.elev, set('elev'), 0, cm(flat.ceiling) - 1)), rotRow(fx)),
    ...opts,
    el('div', { class: 'row' }, el('button', { type: 'button', class: 'btn small', onclick: () => { world.backToWall(fx, world.ROOMS[fx.room], true); structureChanged(); } }, 'Back against nearest wall')),
    el('div', { class: 'block', style: { gap: '6px' } }, el('span', { class: 'lbl' }, 'Colour'),
      swatchRow([['#f1efea', 'White'], ['#b98b5c', 'Oak'], ...FABRICS.filter(([c]) => !['#f3f0ea', '#c49a6c'].includes(c))], fx.color, (c, live) => { fx.color = c; syncFixtures(); if (!live) { commit(); renderInspectorSoon(); } })),
    el('p', { class: 'pos', id: 'ins-pos' }, r ? `In the ${r.name.toLowerCase()}.` : ''),
    el('div', { class: 'row between' },
      el('button', { type: 'button', class: 'btn small', onclick: duplicateSelected }, 'Duplicate'),
      el('button', { type: 'button', class: 'btn small danger', onclick: deleteSelected }, 'Delete')),
  ];
}

function roomInspector(r) {
  const name = el('input', { type: 'text', class: 'name', value: r.name, maxlength: 50, 'aria-label': 'Room name', 'data-k': 'rm-name' });
  name.addEventListener('change', () => { r.name = name.value.trim() || 'Room'; structureChanged(); });
  const type = selectEl(Object.entries(ROOM_TYPES).map(([k, v]) => [k, v.label]), r.type, { 'data-k': 'rm-type' });
  type.addEventListener('change', () => { r.type = type.value; structureChanged(); });
  const corner = selectEl([['', 'No, it’s a rectangle'], ...Object.entries(CORNERS).map(([k, v]) => [k, `${v} corner cut out`])], r.notch ? r.notch.corner : '', { 'data-k': 'rm-corner' });
  corner.addEventListener('change', () => changeRoom(r, () => { r.notch = corner.value ? { corner: corner.value, w: r.notch ? r.notch.w : Math.round(r.w * 40) / 100, d: r.notch ? r.notch.d : Math.round(r.d * 40) / 100 } : null; }));
  const ops = flat.openings.filter((o) => o.room === r.id);
  const incoming = walls.openings.filter((o) => o.farRoom === r.id && o.ok);
  const edges = roomEdges(r);
  const onWall = selectEl(edges.map((e) => [String(e.i), `${edgeLabel(r, e.i)} · ${cm(e.len)} cm`]), '0', { 'data-k': 'rm-wall' });
  const area = roomArea(r);
  const dir = (side, label, col, row) => el('button', { type: 'button', class: 'btn small', style: { gridColumn: col, gridRow: row }, title: `Add a room ${label}`, 'aria-label': `Add a room ${label}`, onclick: () => addRoom(r, side) }, { n: '↑', s: '↓', e: '→', w: '←' }[side]);
  return [
    head('Room', name),
    field('Type', type),
    el('div', { class: 'fields2' },
      cmLabel('Width', numIn('rm-w', r.w, (v) => changeRoom(r, () => { r.w = Math.max(0.4, v); }), 40, 4000), 'left to right'),
      cmLabel('Length', numIn('rm-d', r.d, (v) => changeRoom(r, () => { r.d = Math.max(0.4, v); }), 40, 4000), 'top to bottom')),
    field('L-shaped?', corner),
    r.notch ? el('div', { class: 'fields2' },
      cmLabel('Cut-out width', numIn('rm-nw', r.notch.w, (v) => changeRoom(r, () => { r.notch.w = v; }), 10, cm(r.w) - 30)),
      cmLabel('Cut-out length', numIn('rm-nd', r.notch.d, (v) => changeRoom(r, () => { r.notch.d = v; }), 10, cm(r.d) - 30))) : null,
    el('p', { class: 'info' }, `${area.toFixed(1)} m² · ${ftin(r.w)} × ${ftin(r.d)}`),
    el('div', { class: 'block', style: { gap: '6px' } },
      el('span', { class: 'lbl' }, 'Doors and windows'),
      ops.length || incoming.length ? el('div', { class: 'list-btns' },
        ...ops.map((o) => el('button', { type: 'button', onclick: () => select('opening', o.id) }, el('span', {}, `${OPENING_KINDS[o.kind]} · ${edgeLabel(r, o.edge).toLowerCase()}`), el('span', {}, `${cm(o.width)} cm`))),
        ...incoming.map((o) => { const from = findRoom(flat, o.room); return el('button', { type: 'button', onclick: () => select('opening', o.id) }, el('span', {}, `${OPENING_KINDS[o.kind]} from the ${from ? from.name.toLowerCase() : 'next room'}`), el('span', {}, `${cm(o.u1 - o.u0)} cm`)); })) : el('p', { class: 'note' }, 'None yet.'),
      el('div', { class: 'row' }, el('span', { class: 'lbl' }, 'Add on the'), onWall),
      el('div', { class: 'row' },
        el('button', { type: 'button', class: 'btn small', onclick: () => addOpening(r, +onWall.value, 'door') }, '+ Door'),
        el('button', { type: 'button', class: 'btn small', onclick: () => addOpening(r, +onWall.value, 'window') }, '+ Window'),
        el('button', { type: 'button', class: 'btn small', onclick: () => addOpening(r, +onWall.value, 'opening') }, '+ Opening'))),
    el('div', { class: 'row', style: { alignItems: 'center', gap: '12px' } },
      el('div', { class: 'dirpad' }, dir('n', 'above', 2, 1), dir('w', 'to the left', 1, 2), el('span', { class: 'c' }, 'room'), dir('e', 'to the right', 3, 2), dir('s', 'below', 2, 3)),
      el('p', { class: 'note', style: { flex: 1 } }, 'Add a room beside this one, a wall’s width away. Drag rooms to move them.')),
    el('div', { class: 'row between' },
      el('button', { type: 'button', class: 'btn small', onclick: () => setFocus(r.id) }, 'Show just this room'),
      el('button', { type: 'button', class: 'btn small danger', onclick: deleteSelected }, 'Delete room')),
  ];
}

function openingInspector(op) {
  const r = findRoom(flat, op.room), edges = roomEdges(r), e = edges[op.edge];
  const info = walls.openings.find((o) => o.id === op.id);
  const kind = selectEl(Object.entries(OPENING_KINDS), op.kind, { 'data-k': 'op-kind' });
  kind.addEventListener('change', () => {
    const was = op.kind; op.kind = kind.value;
    if (op.kind === 'window' && was !== 'window') { op.sill = 0.9; op.top = Math.min(2.1, flat.ceiling - 0.2); op.sillBoard = true; }
    if (op.kind !== 'window' && was === 'window') { op.sill = 0; op.top = Math.min(2.03, flat.ceiling - 0.15); }
    structureChanged();
  });
  const wall = selectEl(edges.map((x) => [String(x.i), `${edgeLabel(r, x.i)} · ${cm(x.len)} cm`]), String(op.edge), { 'data-k': 'op-wall' });
  wall.addEventListener('change', () => { op.edge = +wall.value; const ne = edges[op.edge]; op.pos = clamp(op.pos, 0, Math.max(0, ne.len - op.width)); structureChanged(); });
  const [startName, endName] = edgeEndNames(e);
  const leftName = e.axis === 'x' ? 'left' : 'top';
  const far = info && info.farRoom ? findRoom(flat, info.farRoom) : null;
  const intoSel = selectEl([['in', `Into the ${r.name.toLowerCase()}`], ['out', far ? `Into the ${far.name.toLowerCase()}` : 'Outwards']], op.swing, { 'data-k': 'op-swing' });
  intoSel.addEventListener('change', () => { op.swing = intoSel.value; structureChanged(); });
  const hinge = selectEl([['start', `Hinges on the ${startName}`], ['end', `Hinges on the ${endName}`]], op.hinge, { 'data-k': 'op-hinge' });
  hinge.addEventListener('change', () => { op.hinge = hinge.value; structureChanged(); });
  const style = selectEl([['panel', 'Panelled'], ['glazed', 'Glazed']], op.style, { 'data-k': 'op-style' });
  style.addEventListener('change', () => { op.style = style.value; structureChanged(); });
  return [
    head(`${OPENING_KINDS[op.kind]} · ${r.name}`, kind),
    field('On the', wall),
    el('div', { class: 'fields2' },
      cmLabel(`From the ${leftName} end`, numIn('op-off', screenOffset(e, op), (v) => { op.pos = clamp(posFromScreenOffset(e, v, op.width), 0, Math.max(0, e.len - op.width)); structureChanged(); }, 0, cm(e.len))),
      cmLabel('Width', numIn('op-w', op.width, (v) => { const off = screenOffset(e, op); op.width = clamp(v, 0.2, e.len); op.pos = clamp(posFromScreenOffset(e, off, op.width), 0, Math.max(0, e.len - op.width)); structureChanged(); }, 20, cm(e.len)))),
    el('div', { class: 'fields2' },
      cmLabel(op.kind === 'window' ? 'Top of the window' : 'Height', numIn('op-top', op.top, (v) => { op.top = v; structureChanged(); }, 30, cm(flat.ceiling))),
      op.kind === 'window' ? cmLabel('Sill height', numIn('op-sill', op.sill, (v) => { op.sill = v; structureChanged(); }, 0, cm(flat.ceiling) - 30)) : null),
    op.kind === 'door' ? el('div', { class: 'fields2' }, field('Opens', intoSel), field('Hinge', hinge)) : null,
    op.kind === 'door' ? field('Style', style) : null,
    op.kind === 'window' ? el('div', { class: 'checks' }, el('label', {}, el('input', { type: 'checkbox', checked: op.sillBoard, onchange: (ev) => { op.sillBoard = ev.target.checked; structureChanged(); } }), 'Window board on the sill')) : null,
    el('p', { class: 'info' }, info && info.ok ? `The wall is ${cm(info.t)} cm thick here. It leads ${far ? `to the ${far.name.toLowerCase()}` : 'outside'}.` : 'There’s no wall here yet: move the room next to another one, or this wall is too short.'),
    el('p', { class: 'note' }, 'Drag it along the wall in the 3D view, or use the arrow keys.'),
    el('div', { class: 'row between' },
      el('button', { type: 'button', class: 'btn small', onclick: () => select('room', r.id) }, `Back to the ${r.name.toLowerCase()}`),
      el('button', { type: 'button', class: 'btn small danger', onclick: deleteSelected }, 'Delete')),
  ];
}

/* ---- toolbar */
function renderClashChip() {
  const chip = $('#clash-chip'), n = clashes.flagged.size;
  chip.textContent = n ? `${n} ${n === 1 ? 'item overlaps' : 'items overlap'}` : 'No overlaps';
  chip.classList.toggle('warn', n > 0);
  chip.title = n ? 'Select the next item that overlaps something' : 'Nothing overlaps';
}
function bindToolbar() {
  $$('[data-view]').forEach((b) => b.addEventListener('click', () => setMode(b.dataset.view)));
  $('#focus').addEventListener('change', (e) => setFocus(e.target.value));
  $('#eye-where').addEventListener('change', (e) => presetEye(e.target.value));
  $('#btn-reset-view').addEventListener('click', resetView);
  $('#btn-undo').addEventListener('click', undo);
  $('#btn-redo').addEventListener('click', redo);
  $('#clash-chip').addEventListener('click', () => {
    const ids = [...clashes.flagged]; if (!ids.length) return;
    if (tab === 'layout') setTab('furnish');
    const i = selection && selection.kind === 'item' ? ids.indexOf(selection.id) : -1; select('item', ids[(i + 1) % ids.length]);
  });
}

/* ---------------------------------------------------------------- files */
async function copyFlatLink() {
  try {
    const entries = db.catalogue.map((e) => ({ ...e, photo: '' })); // item photos would make the link far too long
    const link = await flatLink(flatFile(flat, entries), location.href);
    try { await navigator.clipboard.writeText(link); toast('Link copied. Opening it adds this flat to the planner.'); }
    catch { window.prompt('Copy this link:', link); }
  } catch (err) { console.error(err); toast('This browser can’t make the link.'); }
}

async function exportGLB(withFurniture) {
  const { GLTFExporter } = await import('three/addons/exporters/GLTFExporter.js');
  const root = new THREE.Group(); root.name = withFurniture ? `${flat.name}, furnished` : flat.name;
  const r = buildFlatMeshes(flat, walls, world, { forExport: true });
  root.add(r.group);
  if (flat.fixtures.length) {
    const g = new THREE.Group(); g.name = 'Fittings';
    for (const fx of flat.fixtures) { const m = buildThing(fx); placeThing(fx, m); g.add(m); }
    root.add(g);
  }
  if (withFurniture && flat.design.items.length) {
    const g = new THREE.Group(); g.name = 'Furniture';
    for (const it of flat.design.items) { const m = buildThing(it, { photo: photoOf(it) }); placeThing(it, m); g.add(m); }
    root.add(g);
  }
  root.updateMatrixWorld(true);
  const buf = await new GLTFExporter().parseAsync(root, { binary: true, onlyVisible: true });
  disposeGeo(root);
  return buf;
}
async function downloadModel(withFurniture, btn) {
  btn.disabled = true; const label = btn.firstChild.textContent; btn.firstChild.textContent = 'Building the model…';
  try {
    const buf = await exportGLB(withFurniture);
    downloadBlob(`${slug(flat.name)}-${withFurniture ? 'furnished' : 'empty'}.glb`, new Blob([buf], { type: 'model/gltf-binary' }));
    toast('Model saved.');
  } catch (err) { console.error(err); toast('The model couldn’t be built. Try again.'); }
  finally { btn.disabled = false; btn.firstChild.textContent = label; }
}
function savePicture() {
  const prevSel = selGroup.visible, prevM = measureGroup.visible, prevR = roomSelGroup.visible;
  selGroup.visible = false; measureGroup.visible = false; roomSelGroup.visible = false;
  renderer.render(scene, activeCamera());
  renderer.domElement.toBlob((b) => { if (b) downloadBlob(`${slug(flat.name)}-view.png`, b); }, 'image/png');
  selGroup.visible = prevSel; measureGroup.visible = prevM; roomSelGroup.visible = prevR;
}

/** A small picture of the whole flat for the flats page, taken as you leave. */
function captureThumbnail() {
  if (!flat || !flat.rooms.length || !renderer) return;
  try {
    const W = 480, H = 300, cam = new THREE.PerspectiveCamera(40, W / H, 0.05, 300), target = new THREE.Vector3();
    fitPerspective(cam, flatBounds(flat, flat.outerWall), DEFAULT_DIR, target, true);
    const keep = { mode, focus, sel: selGroup.visible, m: measureGroup.visible, r: roomSelGroup.visible, u: underlayMesh ? underlayMesh.visible : false };
    mode = 'orbit'; focus = 'flat'; updateWalls(cam); applyVisibilityFor(cam);
    selGroup.visible = measureGroup.visible = roomSelGroup.visible = false; if (underlayMesh) underlayMesh.visible = false;
    const ratio = renderer.getPixelRatio(), sz = renderer.getSize(new THREE.Vector2());
    renderer.setPixelRatio(1); renderer.setSize(W, H, false);
    scene.background = stageColor;
    renderer.render(scene, cam);
    const url = renderer.domElement.toDataURL('image/jpeg', 0.82);
    renderer.setPixelRatio(ratio); renderer.setSize(sz.x, sz.y, false);
    mode = keep.mode; focus = keep.focus;
    selGroup.visible = keep.sel; measureGroup.visible = keep.m; roomSelGroup.visible = keep.r; if (underlayMesh) underlayMesh.visible = keep.u;
    setBackground(); applyVisibility();
    setPicture(thumbKey(flat.id), url);
  } catch (err) { console.warn('No thumbnail', err); }
}
function applyVisibilityFor(cam) {
  if (!meshes) return;
  meshes.ceilings.visible = false;
  if (meshes.swings) meshes.swings.visible = false;
  updateWalls(cam);
}
