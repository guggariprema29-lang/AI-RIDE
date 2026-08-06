import { store } from './store.js';

export const DEFAULT_API_BASE = 'http://127.0.0.1:8000';

/**
 * Where the backend lives, in priority order:
 *   1. localStorage 'airide_api_base'      — per-device override for debugging
 *   2. <meta name="airide-api" content>    — set once per deployment
 *   3. http://127.0.0.1:8000               — local development
 */
function resolveApiBase() {
  const stored = localStorage.getItem('airide_api_base');
  if (stored) return stored.replace(/\/$/, '');

  const host = (typeof window !== 'undefined' && window.location.hostname) || '127.0.0.1';
  const isLocal = host === '127.0.0.1' || host === 'localhost' || host.startsWith('192.168.') || host.startsWith('10.');

  const meta = document.querySelector('meta[name="airide-api"]')?.content?.trim();
  if (meta && !isLocal) return meta.replace(/\/$/, '');

  if (isLocal) return `http://${host}:8000`;

  return meta || 'https://airide-api-mzah.onrender.com';
}

export const API_BASE_URL = resolveApiBase();

export class ApiError extends Error {
  constructor(message, status) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

async function request(path, { method = 'GET', body, signal } = {}) {
  let response;
  const headers = {};
  if (body) headers['Content-Type'] = 'application/json';
  if (store.token) headers['Authorization'] = `Bearer ${store.token}`;

  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      method,
      headers: Object.keys(headers).length ? headers : undefined,
      body: body ? JSON.stringify(body) : undefined,
      signal,
    });
  } catch (error) {
    if (error.name === 'AbortError') throw error;
    const hosted = !API_BASE_URL.includes('127.0.0.1') && !API_BASE_URL.includes('localhost');
    throw new ApiError(
      hosted
        ? `Cannot reach the API at ${API_BASE_URL}. A free Render service sleeps when idle — wait about a minute and try again.`
        : `Cannot reach the API at ${API_BASE_URL}. Start the backend: cd backend && python -m uvicorn app:app --port 8000`,
      0
    );
  }

  const text = await response.text();
  const data = text ? safeParse(text) : null;

  const looksLikeApi = (response.headers.get('content-type') || '').includes('json');
  if (!looksLikeApi && (response.status === 404 || response.status === 501)) {
    throw new ApiError(
      `Port 8000 is not the AI Ride API — something else is answering there. Stop it and run: cd backend && python -m uvicorn app:app --port 8000`,
      response.status
    );
  }

  if (!response.ok) {
    if (response.status === 401 && store.token) {
      store.logout();
    }
    const detail = data?.detail || data?.message || `Request failed (${response.status})`;
    throw new ApiError(typeof detail === 'string' ? detail : 'Request failed', response.status);
  }
  return data;
}

function safeParse(text) {
  try { return JSON.parse(text); } catch { return { message: text }; }
}

export const api = {
  health: () => request('/'),

  register: (payload) => request('/users/register', { method: 'POST', body: payload }),
  login: (payload) => request('/auth/login', { method: 'POST', body: payload }),
  sendOtp: (phone) => request('/auth/send-otp', { method: 'POST', body: { phone } }),
  verifyOtp: (phone, code) => request('/auth/verify-otp', { method: 'POST', body: { phone, code } }),
  user: (id) => request(`/users/${id}`),
  trustProfile: (id) => request(`/users/trust-score/${id}`),

  publishRide: (payload) => request('/rides/publish', { method: 'POST', body: payload }),
  liveRides: (signal) => request('/rides/live', { signal }),
  nearbyRiders: (lat, lng, radius_m = 5000, signal) =>
    request(`/rides/nearby?lat=${lat}&lng=${lng}&radius_m=${radius_m}`, { signal }),
  ridesByRider: (riderId) => request(`/rides/rider/${riderId}`),
  ride: (id) => request(`/rides/${id}`),
  updateRideLocation: (id, latitude, longitude) =>
    request(`/rides/${id}/location`, { method: 'POST', body: { latitude, longitude } }),
  updateRideStatus: (id, status) =>
    request(`/rides/${id}/status`, { method: 'POST', body: { status } }),

  searchRides: (payload, signal) => request('/rides/search', { method: 'POST', body: payload, signal }),

  book: (payload) => request('/bookings', { method: 'POST', body: payload }),
  bookRelay: (payload) => request('/bookings/relay', { method: 'POST', body: payload }),
  booking: (id) => request(`/bookings/${id}`),
  passengerBookings: (id) => request(`/bookings/passenger/${id}`),
  riderBookings: (id) => request(`/bookings/rider/${id}`),
  getChatMessages: (id) => request(`/bookings/${id}/chat`),
  sendChatMessage: (id, payload) => request(`/bookings/${id}/chat`, { method: 'POST', body: payload }),
  updateBookingStatus: (id, status) =>
    request(`/bookings/${id}/status`, { method: 'POST', body: { status } }),
  startBooking: (id, otp) => request(`/bookings/${id}/start`, { method: 'POST', body: { otp } }),
  completeBooking: (id) => request(`/bookings/${id}/complete`, { method: 'POST', body: {} }),
  payBooking: (id) => request(`/bookings/${id}/pay`, { method: 'POST', body: {} }),
  rateBooking: (id, payload) => request(`/bookings/${id}/rate`, { method: 'POST', body: payload }),
  reviews: (userId) => request(`/users/${userId}/reviews`),

  notifications: (userId, category = null) =>
    request(`/notifications/${userId}${category && category !== 'all' ? `?category=${encodeURIComponent(category)}` : ''}`),
  createNotification: (payload) => request('/notifications/create', { method: 'POST', body: payload }),
  markNotificationRead: (id) => request(`/notifications/${id}/read`, { method: 'POST', body: {} }),
  markAllNotificationsRead: (userId) => request(`/notifications/read-all/${userId}`, { method: 'POST', body: {} }),
  deleteNotification: (id) => request(`/notifications/${id}`, { method: 'DELETE' }),
  clearNotifications: (userId) => request(`/notifications/clear/${userId}`, { method: 'POST', body: {} }),

  triggerSos: (payload) => request('/sos/trigger', { method: 'POST', body: payload }),
  updateEmergencyContact: (payload) => request('/sos/contact', { method: 'POST', body: payload }),
  getSosAlerts: (userId) => request(`/sos/alerts/${userId}`),
  resolveSos: (alertId) => request(`/sos/${alertId}/resolve`, { method: 'POST', body: {} }),

  wallet: (userId) => request(`/wallet/balance/${userId}`),
  deposit: (userId, amount) =>
    request('/wallet/deposit', { method: 'POST', body: { user_id: userId, amount } }),

  createParcel: (payload) => request('/parcels/create', { method: 'POST', body: payload }),
  senderParcels: (senderId) => request(`/parcels/sender/${senderId}`),
  riderParcels: (riderId) => request(`/parcels/rider/${riderId}`),
  nearbyParcels: (rideId, maxDetourM = 3000) => request(`/parcels/nearby/${rideId}?max_detour_m=${maxDetourM}`),
  acceptParcel: (id, riderId, rideId) => request(`/parcels/${id}/accept`, { method: 'POST', body: { rider_id: riderId, ride_id: rideId } }),
  verifyParcelPickup: (id, otp) => request(`/parcels/${id}/verify-pickup`, { method: 'POST', body: { otp } }),
  verifyParcelDelivery: (id, otp) => request(`/parcels/${id}/verify-delivery`, { method: 'POST', body: { otp } }),
  cancelParcel: (id, userId) => request(`/parcels/${id}/cancel`, { method: 'POST', body: { user_id: userId } }),
};

export function connectNotificationWS(userId, onMessage) {
  if (!userId) return null;
  const wsUrl = API_BASE_URL.replace(/^http/, 'ws') + `/ws/notifications/${userId}`;
  let ws = null;
  try {
    ws = new WebSocket(wsUrl);
    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (onMessage) onMessage(data);
      } catch (err) {
        console.warn('[WS] Failed to parse message', err);
      }
    };
    ws.onerror = (err) => {
      console.warn('[WS] Connection error', err);
    };
  } catch (e) {
    console.warn('[WS] Initialization failed', e);
  }
  return ws;
}

/* ── Geocoding (OpenStreetMap Nominatim) ─────────────────────────────────── */

const geocodeCache = new Map();

export async function searchPlaces(query, signal) {
  const key = query.trim().toLowerCase();
  if (key.length < 3) return [];
  if (geocodeCache.has(key)) return geocodeCache.get(key);

  const url = `https://nominatim.openstreetmap.org/search?format=json&limit=6&countrycodes=in&q=${encodeURIComponent(query)}`;
  const response = await fetch(url, { headers: { 'Accept-Language': 'en' }, signal });
  if (!response.ok) return [];
  const results = (await response.json()).map((item) => ({
    label: item.display_name,
    short: item.display_name.split(',').slice(0, 2).join(',').trim(),
    lat: Number(item.lat),
    lng: Number(item.lon),
  }));
  geocodeCache.set(key, results);
  return results;
}

/**
 * Road route between two points via the public OSRM server. Falls back to a
 * straight line so publishing never fails just because routing is unreachable.
 */
export async function roadRoute(from, to) {
  const url = `https://router.project-osrm.org/route/v1/driving/${from.lng},${from.lat};${to.lng},${to.lat}?overview=full&geometries=geojson`;
  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error('routing unavailable');
    const data = await response.json();
    const route = data.routes?.[0];
    if (!route?.geometry?.coordinates?.length) throw new Error('no route');
    return {
      polyline: route.geometry.coordinates.map(([lng, lat]) => ({ latitude: lat, longitude: lng })),
      distance_m: route.distance,
      duration_s: route.duration,
      source: 'osrm',
    };
  } catch {
    return {
      polyline: [
        { latitude: from.lat, longitude: from.lng },
        { latitude: to.lat, longitude: to.lng },
      ],
      distance_m: null,
      duration_s: null,
      source: 'straight-line',
    };
  }
}

export async function reverseGeocode(lat, lng) {
  try {
    const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}`;
    const response = await fetch(url, { headers: { 'Accept-Language': 'en' } });
    if (!response.ok) return null;
    const data = await response.json();
    return data.display_name || null;
  } catch {
    return null;
  }
}
