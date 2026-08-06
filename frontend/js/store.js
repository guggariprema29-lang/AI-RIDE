// Session state, persisted to localStorage.

const SESSION_KEY = 'airide_session';
const THEME_KEY = 'airide_theme';

const listeners = new Set();

function read() {
  try {
    return JSON.parse(localStorage.getItem(SESSION_KEY) || 'null');
  } catch {
    return null;
  }
}

export const store = {
  get user() {
    return read();
  },

  get isAuthed() {
    return Boolean(read()?.id);
  },

  /** Public ride ID shown across the app, e.g. AR-000042. */
  get publicId() {
    const user = read();
    if (!user) return null;
    return user.public_id || `AR-${String(user.id).padStart(6, '0')}`;
  },

  get token() {
    return read()?.token || read()?.access_token || null;
  },

  get unreadNotificationCount() {
    return Number(localStorage.getItem('airide_unread_notifications') || 0);
  },

  setUnreadNotificationCount(count) {
    localStorage.setItem('airide_unread_notifications', String(Math.max(0, count)));
    listeners.forEach((fn) => fn(read()));
  },

  setUser(user) {
    if (!user) {
      localStorage.removeItem(SESSION_KEY);
      localStorage.removeItem('airide_unread_notifications');
    } else {
      const stored = { ...user };
      delete stored.password_hash;
      stored.public_id = stored.public_id || `AR-${String(stored.id).padStart(6, '0')}`;
      localStorage.setItem(SESSION_KEY, JSON.stringify(stored));
    }
    listeners.forEach((fn) => fn(read()));
  },

  patchUser(patch) {
    const current = read();
    if (!current) return;
    store.setUser({ ...current, ...patch });
  },

  logout() {
    store.setUser(null);
  },

  subscribe(fn) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },
};

/* ── Theme ───────────────────────────────────────────────────────────────── */

export const theme = {
  get current() {
    return localStorage.getItem(THEME_KEY) || 'dark';
  },
  apply(value = theme.current) {
    document.documentElement.dataset.theme = value;
    localStorage.setItem(THEME_KEY, value);
  },
  toggle() {
    const next = theme.current === 'dark' ? 'light' : 'dark';
    theme.apply(next);
    return next;
  },
};

/* ── Recent passenger searches ───────────────────────────────────────────── */

const RECENT_KEY = 'airide_recent_trips';

export function recentTrips() {
  try {
    return JSON.parse(localStorage.getItem(RECENT_KEY) || '[]');
  } catch {
    return [];
  }
}

export function rememberTrip(trip) {
  // Compare the place labels — the trip objects are always fresh instances.
  const trips = recentTrips().filter(
    (item) => !(item.pickup?.label === trip.pickup?.label && item.dropoff?.label === trip.dropoff?.label)
  );
  trips.unshift(trip);
  localStorage.setItem(RECENT_KEY, JSON.stringify(trips.slice(0, 5)));
}
