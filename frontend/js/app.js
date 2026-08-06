import { defineRoute, navigate, startRouter, currentPath } from './router.js';
import { store, theme } from './store.js';
import { icon } from './icons.js';
import { escapeHtml, initials, showNotificationDrawer, toast } from './ui.js';
import { api, connectNotificationWS } from './api.js';

import landingView from './views/landing.js';
import { loginView, signupView } from './views/auth.js';
import homeView from './views/home.js';
import riderView from './views/rider.js';
import passengerView from './views/passenger.js';
import { bookingsView, myTripsView } from './views/trips.js';
import tripView from './views/trip.js';
import profileView from './views/profile.js';
import parcelView from './views/parcel.js';

theme.apply();

const NAV = [
  { path: '/home', label: 'Home', icon: 'home', auth: true },
  { path: '/rider', label: 'Rider', icon: 'car', auth: true },
  { path: '/passenger', label: 'Passenger', icon: 'users', auth: true },
  { path: '/parcel', label: 'Parcel', icon: 'package', auth: true },
  { path: '/bookings', label: 'Bookings', icon: 'ticket', auth: true },
  { path: '/trips', label: 'Trips', icon: 'briefcase', auth: true },
];

/* ── Shell ───────────────────────────────────────────────────────────────── */

const app = document.querySelector('#app');

app.innerHTML = `
  <div class="app-shell">
    <header class="site-header">
      <div class="container">
        <a class="brand" href="#/">
          ${icon('route', 24)}
          <span class="brand-word">AI Ride</span>
          <span class="island-label" data-island-label></span>
        </a>
        <nav class="main-nav" data-nav aria-label="Main"></nav>
        <span class="spacer"></span>
        <div class="row-tight" data-account></div>
      </div>
    </header>

    <main id="outlet" tabindex="-1"></main>

    <footer class="site-footer">
      <div class="container row" style="justify-content:space-between">
        <span>AI Ride — intelligent route overlap and trust-based matching.</span>
        <span class="xsmall">Cost-share only. No commission, no surge.</span>
      </div>
    </footer>

    <nav class="bottom-nav" data-bottom-nav aria-label="Main"></nav>
  </div>
`;

const navNode = app.querySelector('[data-nav]');
const bottomNavNode = app.querySelector('[data-bottom-nav]');
const accountNode = app.querySelector('[data-account]');

let activeWS = null;
let pollTimer = null;

function updateBellBadge(count) {
  const badge = app.querySelector('[data-notification-count]');
  if (badge) {
    badge.textContent = count > 99 ? '99+' : count;
    badge.classList.toggle('is-visible', count > 0);
  }
}

async function syncNotifications() {
  if (!store.isAuthed) return;
  try {
    const res = await api.notifications(store.user.id);
    const count = res?.unread_count || 0;
    store.setUnreadNotificationCount(count);
    updateBellBadge(count);
  } catch {}
}

function initNotifications() {
  if (activeWS) { try { activeWS.close(); } catch {} activeWS = null; }
  if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }

  if (!store.isAuthed) return;

  syncNotifications();

  activeWS = connectNotificationWS(store.user.id, (event) => {
    if (event?.type === 'NOTIFICATION_NEW' || event?.notification) {
      syncNotifications();
      const note = event.notification || {};
      toast(`${note.title || 'Notification'}: ${note.message || ''}`, 'info');
    }
  });

  pollTimer = setInterval(syncNotifications, 15000);
}

function renderNav() {
  const authed = store.isAuthed;
  const items = NAV.filter((item) => !item.auth || authed);
  const unread = store.unreadNotificationCount;

  navNode.innerHTML = items
    .map((item) => `<a class="nav-link" href="#${item.path}">${icon(item.icon, 16)} ${item.label}</a>`)
    .join('');

  bottomNavNode.innerHTML = authed
    ? items
        .map((item) => `<a href="#${item.path}">${icon(item.icon, 20)}<span>${item.label}</span></a>`)
        .join('')
    : `
      <a href="#/">${icon('home', 20)}<span>Home</span></a>
      <a href="#/login">${icon('user', 20)}<span>Sign in</span></a>
    `;

  accountNode.innerHTML = `
    <button class="icon-btn" data-theme-toggle
            aria-label="Switch to ${theme.current === 'dark' ? 'light' : 'dark'} theme">
      ${icon(theme.current === 'dark' ? 'sun' : 'moon', 18)}
    </button>
    ${authed
      ? `
        <button class="icon-btn notification-bell-btn" data-notification-bell aria-label="Notifications" title="Notification Center">
          ${icon('bell', 18)}
          <span class="notification-badge ${unread > 0 ? 'is-visible' : ''}" data-notification-count>
            ${unread > 99 ? '99+' : unread}
          </span>
        </button>
        <a class="nav-link" href="#/profile" title="${escapeHtml(store.publicId)}">
           <span class="avatar" style="width:30px;height:30px;flex-basis:30px;font-size:var(--text-xs)">
             ${escapeHtml(initials(store.user?.name))}
           </span>
           <span class="badge-id xsmall">${escapeHtml(store.publicId)}</span>
         </a>`
      : `<a class="btn btn-sm btn-ghost" href="#/login">Sign in</a>
         <a class="btn btn-sm btn-primary" href="#/signup">Get started</a>`}
  `;

  accountNode.querySelector('[data-theme-toggle]').addEventListener('click', () => {
    theme.toggle();
    renderNav();
    markActive(currentPath().split('?')[0]);
  });

  const bellBtn = accountNode.querySelector('[data-notification-bell]');
  if (bellBtn) {
    bellBtn.addEventListener('click', () => {
      if (store.isAuthed) {
        showNotificationDrawer(store.user.id, {
          onUpdate: (newCount) => updateBellBadge(newCount)
        });
      }
    });
  }
}

initNotifications();

const header = app.querySelector('.site-header');

// A 1px sentinel at the very top of the document tells us when the page has
// left the top, without running a handler on every scroll frame.
const scrollSentinel = document.createElement('div');
scrollSentinel.setAttribute('aria-hidden', 'true');
scrollSentinel.style.cssText = 'position:absolute;top:0;left:0;width:1px;height:24px;pointer-events:none;';
document.body.prepend(scrollSentinel);

const sentinelWatcher = new IntersectionObserver(
  ([entry]) => header.classList.toggle('is-scrolled', !entry.isIntersecting),
  { threshold: 0 }
);
sentinelWatcher.observe(scrollSentinel);

function syncHeaderScroll() {
  header.classList.toggle('is-scrolled', window.scrollY > 24);
}

// Belt and braces: the observer handles the common case, this covers restored
// scroll positions and any browser where the sentinel does not fire.
window.addEventListener('scroll', syncHeaderScroll, { passive: true });

const ROUTE_LABELS = {
  '/': 'AI Ride',
  '/home': 'Home',
  '/rider': 'Rider',
  '/passenger': 'Passenger',
  '/parcel': 'Parcel sharing',
  '/bookings': 'My trips',
  '/trips': 'Published',
  '/trip': 'Live trip',
  '/profile': 'Profile',
  '/login': 'Sign in',
  '/signup': 'Sign up',
};

function markActive(pathname) {
  document.body.dataset.route = pathname;
  syncHeaderScroll();

  // The island swaps the wordmark for the current screen once you scroll.
  const label = app.querySelector('[data-island-label]');
  if (label) label.textContent = ROUTE_LABELS[pathname] || 'AI Ride';

  [...navNode.querySelectorAll('a'), ...bottomNavNode.querySelectorAll('a')].forEach((link) => {
    const target = link.getAttribute('href').replace(/^#/, '');
    if (target === pathname) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  });
}

store.subscribe(() => {
  renderNav();
  markActive(currentPath().split('?')[0]);
});

renderNav();

/* ── Routes ──────────────────────────────────────────────────────────────── */

defineRoute('/', { title: 'Shared rides on the route you already take', view: landingView });
defineRoute('/login', { title: 'Sign in', view: loginView, guestOnly: true });
defineRoute('/signup', { title: 'Create account', view: signupView, guestOnly: true });
defineRoute('/home', { title: 'Home', view: homeView, requiresAuth: true });
defineRoute('/rider', { title: 'Rider portal', view: riderView, requiresAuth: true });
defineRoute('/passenger', { title: 'Passenger portal', view: passengerView, requiresAuth: true });
defineRoute('/parcel', { title: 'Parcel sharing', view: parcelView, requiresAuth: true });
defineRoute('/bookings', { title: 'My bookings', view: bookingsView, requiresAuth: true });
defineRoute('/trip', { title: 'Live trip', view: tripView, requiresAuth: true });
defineRoute('/trips', { title: 'My trips', view: myTripsView, requiresAuth: true });
defineRoute('/profile', { title: 'Profile', view: profileView, requiresAuth: true });
defineRoute('*', {
  title: 'Page not found',
  view(container) {
    container.innerHTML = `
      <div class="container page">
        <div class="empty-state">
          ${icon('alert', 32)}
          <h2>That page does not exist</h2>
          <p class="small">The link may be old, or the address was mistyped.</p>
          <button class="btn btn-primary" data-home>Back to home</button>
        </div>
      </div>
    `;
    container.querySelector('[data-home]').addEventListener('click', () =>
      navigate(store.isAuthed ? '/home' : '/')
    );
  },
});

startRouter(document.querySelector('#outlet'), { onChange: markActive });
