import { bus, getJson, loadModels } from './api.js';
import { toast } from './components.js';
import { usd } from './format.js';
import { Monitor } from './monitor.js';

const ROUTES = {
  '/': () => import('./views/home.js'),
  '/chat': () => import('./views/chat.js'),
  '/image': () => import('./views/image.js'),
  '/audio': () => import('./views/audio.js'),
  '/vitals': () => import('./views/vitals.js'),
};
const ORDER = Object.keys(ROUTES);
const TITLES = { '/': 'AI Playground', '/chat': 'Chat · AI Playground', '/image': 'Image · AI Playground', '/audio': 'Audio · AI Playground', '/vitals': 'Reports · AI Playground' };

const view = document.querySelector('#view');
const nav = document.querySelector('[data-cy=nav]');
let cleanup;
let currentPath;

// ---- theme --------------------------------------------------------------------------------------------
const themeButton = document.querySelector('[data-cy=theme-toggle]');
function applyTheme(theme) {
  if (theme) document.documentElement.dataset.theme = theme;
  else delete document.documentElement.dataset.theme;
}
try {
  applyTheme(localStorage.getItem('theme'));
} catch {
  /* storage can be blocked */
}
themeButton.addEventListener('click', () => {
  const dark = document.documentElement.dataset.theme
    ? document.documentElement.dataset.theme === 'dark'
    : matchMedia('(prefers-color-scheme: dark)').matches;
  const next = dark ? 'light' : 'dark';
  applyTheme(next);
  try {
    localStorage.setItem('theme', next);
  } catch {
    /* ignore */
  }
});

// ---- nav indicator --------------------------------------------------------------------------------------
const indicator = document.createElement('span');
indicator.className = 'nav-indicator';
nav.prepend(indicator);
function moveIndicator() {
  const active = nav.querySelector('[aria-current=page]');
  if (!active) {
    indicator.style.opacity = '0';
    return;
  }
  indicator.style.opacity = '1';
  indicator.style.width = `${active.offsetWidth}px`;
  indicator.style.height = `${active.offsetHeight}px`;
  indicator.style.transform = `translate(${active.offsetLeft}px, ${active.offsetTop}px)`;
}
addEventListener('resize', moveIndicator);
document.fonts?.ready.then(moveIndicator);
new ResizeObserver(moveIndicator).observe(nav);

// ---- header heartbeat and session chip -------------------------------------------------------------------
const chip = document.querySelector('[data-cy=session-chip]');
const heart = document.createElement('canvas');
heart.className = 'heartbeat';
heart.setAttribute('aria-hidden', 'true');
chip.prepend(heart);
chip.querySelector('.pulse')?.remove();
const headerMonitor = new Monitor(heart, { labels: false, speed: 34, beatEvery: 1100 });
export const monitors = new Set([headerMonitor]);

// Session totals: loaded once from the server, then kept up to date from the calls this page makes.
const session = { calls: 0, cost: 0 };
function paintSession() {
  document.querySelector('[data-cy=session-calls]').textContent = session.calls;
  document.querySelector('[data-cy=session-cost]').textContent = usd(session.cost);
}
async function refreshSession() {
  const vitals = await getJson('/api/vitals').catch(() => null);
  if (!vitals) return;
  session.calls = vitals.calls;
  session.cost = vitals.models.filter((m) => typeof m.costUsd === 'number').reduce((s, m) => s + m.costUsd, 0);
  paintSession();
}
bus.addEventListener('call', (e) => {
  const v = e.detail?.vitals;
  for (const m of monitors) m.spike(e.detail?.model ?? v?.model ?? 'model', v?.latencyMs, !e.detail?.error);
  chip.classList.remove('bump');
  void chip.offsetWidth;
  chip.classList.add('bump');
  session.calls += 1;
  if (typeof v?.costUsd === 'number') session.cost += v.costUsd;
  paintSession();
});
addEventListener('session-reset', refreshSession);

// ---- router --------------------------------------------------------------------------------------------
async function show(path, { push = false } = {}) {
  const url = new URL(path, location.origin);
  const route = ROUTES[url.pathname] ? url.pathname : '/';
  if (push) history.pushState({}, '', url.pathname + url.search);
  const direction = currentPath && ORDER.indexOf(route) < ORDER.indexOf(currentPath) ? 'back' : 'forward';
  document.documentElement.dataset.direction = direction;
  for (const a of nav.querySelectorAll('a')) {
    if (a.getAttribute('href') === route) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  }
  moveIndicator();
  document.title = TITLES[route];

  const swap = async () => {
    cleanup?.();
    cleanup = undefined;
    const [{ render }, { mode, models }] = await Promise.all([ROUTES[route](), loadModels()]);
    view.innerHTML = '';
    view.dataset.route = route.slice(1) || 'home';
    cleanup = (await render(view, { models, mode, monitors })) ?? undefined;
  };
  try {
    if (document.startViewTransition && currentPath && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
      await document.startViewTransition(swap).updateCallbackDone;
    } else {
      await swap();
    }
  } catch (err) {
    view.innerHTML = `<p class="error-text">This page failed to load: ${err.message}</p>`;
  }
  currentPath = route;
  if (push) view.focus({ preventScroll: true });
}

document.addEventListener('click', (e) => {
  const link = e.target.closest('a[data-link]');
  if (!link || e.metaKey || e.ctrlKey || e.shiftKey || link.target === '_blank') return;
  e.preventDefault();
  if (link.getAttribute('href') !== location.pathname) show(link.getAttribute('href'), { push: true });
  scrollTo({ top: 0, behavior: 'smooth' });
});
addEventListener('popstate', () => show(location.pathname + location.search));

loadModels()
  .then(({ mode }) => {
    const badge = document.querySelector('[data-cy=mode-badge]');
    badge.hidden = false;
    badge.textContent = mode === 'replay' ? 'Replaying recordings' : mode === 'record' ? 'Recording' : 'Live models';
    badge.classList.toggle('replay', mode !== 'live');
  })
  .catch(() => toast('Could not reach the server. Is npm run app running?', 'error'));
refreshSession();
show(location.pathname + location.search);
