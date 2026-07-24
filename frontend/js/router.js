// Hash router with auth guards and per-view cleanup.

import { store } from './store.js';

const routes = new Map();
let outlet = null;
let currentView = null;
let onNavigate = () => {};

export function defineRoute(path, config) {
  routes.set(path, config);
}

export function startRouter(outletElement, { onChange } = {}) {
  outlet = outletElement;
  onNavigate = onChange || (() => {});
  window.addEventListener('hashchange', resolve);
  resolve();
}

export function navigate(path, { replace = false } = {}) {
  const target = `#${path}`;
  if (window.location.hash === target) {
    resolve();
    return;
  }
  if (replace) window.location.replace(target);
  else window.location.hash = target;
}

export function currentPath() {
  const raw = window.location.hash.replace(/^#/, '');
  return raw || '/';
}

function parse(path) {
  const [pathname, queryString = ''] = path.split('?');
  return {
    pathname: pathname.replace(/\/+$/, '') || '/',
    query: Object.fromEntries(new URLSearchParams(queryString)),
  };
}

async function resolve() {
  const { pathname, query } = parse(currentPath());
  const route = routes.get(pathname) || routes.get('*');

  if (!route) return;

  if (route.requiresAuth && !store.isAuthed) {
    navigate(`/login?next=${encodeURIComponent(pathname)}`, { replace: true });
    return;
  }
  if (route.guestOnly && store.isAuthed) {
    navigate('/home', { replace: true });
    return;
  }

  if (currentView?.destroy) {
    try { currentView.destroy(); } catch { /* view already gone */ }
  }

  outlet.innerHTML = '';
  const container = document.createElement('div');
  container.className = 'view-enter';
  outlet.append(container);

  document.title = route.title ? `${route.title} · AI Ride` : 'AI Ride';
  window.scrollTo({ top: 0, behavior: 'instant' in window ? 'instant' : 'auto' });

  currentView = (await route.view(container, query)) || null;
  onNavigate(pathname);
}
