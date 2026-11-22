/* Start-up and the screens: #/ (your flats), #/catalogue, #/flat/<id>[/<tab>], and
   #/add/<payload>, a link that adds a whole flat (see core/share.js). */
import './styles.css';
import { $ } from './core/util.js';
import { db, findFlat, flushAll, loadAll, onSaveError, storageWorks } from './store.js';
import { bindCatalogueScreen, renderCatalogue } from './ui/catalogue.js';
import { addFromLink, bindHome, renderHome } from './ui/home.js';
import { LINK_ROUTE } from './core/share.js';
import { closePlanner, debugView, openPlanner } from './ui/planner.js';

const screens = { home: $('#screen-home'), catalogue: $('#screen-catalogue'), planner: $('#screen-planner') };
function show(name) { for (const [k, s] of Object.entries(screens)) s.hidden = k !== name; }

function route() {
  const h = location.hash || '#/';
  if (h.startsWith(LINK_ROUTE)) { closePlanner(); show('home'); renderHome(); addFromLink(h.slice(LINK_ROUTE.length)); return; }
  const m = h.match(/^#\/flat\/([^/]+)(?:\/(\w+))?/);
  if (m) {
    const flat = findFlat(decodeURIComponent(m[1]));
    if (flat) {
      show('planner');
      openPlanner(flat, m[2]);
      return;
    }
    location.replace('#/');
    return;
  }
  closePlanner();
  document.title = 'Flat Planner';
  if (h.startsWith('#/catalogue')) { show('catalogue'); renderCatalogue(); window.scrollTo(0, 0); return; }
  show('home'); renderHome();
}

async function boot() {
  await loadAll();
  onSaveError(() => {
    const t = document.getElementById('toast');
    if (t) { t.textContent = 'Your changes couldn’t be saved in this browser. Save a backup file to keep them.'; t.classList.add('show'); }
  });
  if (!storageWorks()) console.warn('Storage is switched off: nothing will be kept after this page closes.');
  bindHome(); bindCatalogueScreen();
  window.addEventListener('hashchange', route);
  window.addEventListener('pagehide', flushAll);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flushAll(); });
  route();
  window.__planner = { db, view: debugView };
}
boot();
