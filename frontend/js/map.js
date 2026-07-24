// Leaflet helpers: map creation, vehicle markers, route lines.

import { icon, vehicleIconName } from './icons.js';
import { escapeHtml, km, timeLabel } from './ui.js';

const TILE_URL = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
const TILE_ATTRIBUTION = '&copy; OpenStreetMap contributors';

// Belagavi / Chikodi region — the project's home ground.
export const DEFAULT_CENTER = [16.4249, 74.6015];
export const DEFAULT_ZOOM = 11;

export function createMap(element, { center = DEFAULT_CENTER, zoom = DEFAULT_ZOOM } = {}) {
  const map = L.map(element, {
    center,
    zoom,
    zoomControl: true,
    scrollWheelZoom: true,
    attributionControl: true,
  });
  L.tileLayer(TILE_URL, { maxZoom: 19, attribution: TILE_ATTRIBUTION }).addTo(map);

  // The container is often created before its final size is known, and it can
  // be resized later when results render beside it — repaint tiles either way.
  setTimeout(() => map.invalidateSize(), 60);
  if ('ResizeObserver' in window) {
    const observer = new ResizeObserver(() => map.invalidateSize());
    observer.observe(element);
    map.once('unload', () => observer.disconnect());
  }
  return map;
}

export function toLatLngs(polyline = []) {
  return polyline
    .map((point) => [
      Number(point.latitude ?? point.lat),
      Number(point.longitude ?? point.lng),
    ])
    .filter(([lat, lng]) => Number.isFinite(lat) && Number.isFinite(lng));
}

export function vehicleDivIcon(vehicleType, moving = false) {
  const color = vehicleType === 'bike' ? 'var(--color-bike)' : 'var(--color-car)';
  return L.divIcon({
    className: '',
    iconSize: [38, 38],
    iconAnchor: [19, 19],
    popupAnchor: [0, -20],
    html: `<div class="vehicle-marker ${moving ? 'is-moving' : ''}" style="--marker-color:${color}">
             ${icon(vehicleIconName(vehicleType), 20)}
           </div>`,
  });
}

export function pinDivIcon(label) {
  return L.divIcon({
    className: '',
    iconSize: [30, 30],
    iconAnchor: [15, 15],
    popupAnchor: [0, -16],
    html: `<div class="pin-marker">${escapeHtml(label)}</div>`,
  });
}

export function ridePopupHtml(ride) {
  const seats = ride.seats_available ?? 0;
  return `
    <h4>${escapeHtml(ride.rider_name || 'Traveller')}</h4>
    <div class="xsmall muted" style="margin-bottom:6px">${escapeHtml(ride.rider_public_id || '')}</div>
    <div class="small"><strong>${escapeHtml(ride.origin)}</strong> → <strong>${escapeHtml(ride.destination)}</strong></div>
    <div class="xsmall muted" style="margin-top:6px">
      ${escapeHtml(ride.vehicle_type || 'car')} · ${seats} seat${seats === 1 ? '' : 's'} free · ${km(ride.total_distance_m)}
    </div>
    <div class="xsmall muted">Departs ${escapeHtml(timeLabel(ride.departure_time))}</div>
  `;
}

/**
 * Renders live rides on a map and keeps markers in sync between polls
 * instead of tearing the whole layer down each refresh.
 */
export class LiveRidesLayer {
  constructor(map, { onSelect } = {}) {
    this.map = map;
    this.onSelect = onSelect;
    this.markers = new Map();
    this.lines = new Map();
    this.group = L.layerGroup().addTo(map);
  }

  render(rides, { showRoutes = true } = {}) {
    const seen = new Set();

    rides.forEach((ride) => {
      seen.add(ride.id);
      const lat = Number(ride.current_lat ?? ride.origin_lat);
      const lng = Number(ride.current_lng ?? ride.origin_lng);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;

      let marker = this.markers.get(ride.id);
      if (marker) {
        marker.setLatLng([lat, lng]);
        marker.setPopupContent(ridePopupHtml(ride));
      } else {
        marker = L.marker([lat, lng], {
          icon: vehicleDivIcon(ride.vehicle_type, ride.status === 'started'),
          keyboard: true,
          alt: `${ride.rider_name} travelling to ${ride.destination}`,
        })
          .bindPopup(ridePopupHtml(ride))
          .addTo(this.group);
        marker.on('click', () => this.onSelect?.(ride));
        this.markers.set(ride.id, marker);
      }

      if (showRoutes) {
        const latlngs = toLatLngs(ride.polyline);
        if (latlngs.length >= 2) {
          const existing = this.lines.get(ride.id);
          if (existing) {
            existing.setLatLngs(latlngs);
          } else {
            const line = L.polyline(latlngs, {
              color: ride.vehicle_type === 'bike' ? '#22c55e' : '#38bdf8',
              weight: 3,
              opacity: 0.45,
            }).addTo(this.group);
            this.lines.set(ride.id, line);
          }
        }
      }
    });

    // Drop rides that are no longer live.
    [...this.markers.keys()].forEach((id) => {
      if (seen.has(id)) return;
      this.group.removeLayer(this.markers.get(id));
      this.markers.delete(id);
      const line = this.lines.get(id);
      if (line) {
        this.group.removeLayer(line);
        this.lines.delete(id);
      }
    });
  }

  highlight(rideId) {
    const marker = this.markers.get(rideId);
    if (!marker) return;
    this.map.panTo(marker.getLatLng(), { animate: true });
    marker.openPopup();
  }

  fit() {
    const markers = [...this.markers.values()];
    if (!markers.length) return;
    const bounds = L.latLngBounds(markers.map((marker) => marker.getLatLng()));
    this.map.fitBounds(bounds.pad(0.25), { maxZoom: 14 });
  }

  destroy() {
    this.group.clearLayers();
    this.map.removeLayer(this.group);
    this.markers.clear();
    this.lines.clear();
  }
}

/** Draws a single origin→destination route with A/B pins. */
export class RoutePreview {
  constructor(map) {
    this.map = map;
    this.group = L.layerGroup().addTo(map);
  }

  draw({ from, to, polyline, color = '#2563eb', labels = ['A', 'B'] }) {
    this.group.clearLayers();
    const points = polyline?.length ? toLatLngs(polyline) : [];
    const line = points.length >= 2 ? points : [from, to].filter(Boolean);

    if (from) L.marker(from, { icon: pinDivIcon(labels[0]) }).addTo(this.group);
    if (to) L.marker(to, { icon: pinDivIcon(labels[1]) }).addTo(this.group);
    if (line.length >= 2) {
      L.polyline(line, { color, weight: 4, opacity: 0.9 }).addTo(this.group);
      this.map.fitBounds(L.latLngBounds(line).pad(0.3), { maxZoom: 14 });
    } else if (from) {
      this.map.setView(from, 13);
    }
  }

  clear() {
    this.group.clearLayers();
  }

  destroy() {
    this.group.clearLayers();
    this.map.removeLayer(this.group);
  }
}

/**
 * Live trip map: the rider's full path dimmed, the passenger's leg highlighted,
 * pickup and drop pins, and the vehicle moving along it.
 */
export class TripMap {
  constructor(map) {
    this.map = map;
    this.group = L.layerGroup().addTo(map);
    this.vehicle = null;
  }

  draw(booking) {
    this.group.clearLayers();
    this.vehicle = null;

    const route = toLatLngs(booking.ride_polyline);
    const pickup = [Number(booking.pickup_lat), Number(booking.pickup_lng)];
    const drop = [Number(booking.drop_lat), Number(booking.drop_lng)];

    if (route.length >= 2) {
      L.polyline(route, {
        color: '#8a8f98', weight: 4, opacity: 0.35, lineCap: 'round',
      }).addTo(this.group);

      // Highlight only the stretch the passenger is actually carried.
      const from = nearestIndex(pickup, route);
      const to = nearestIndex(drop, route);
      const leg = route.slice(Math.min(from, to), Math.max(from, to) + 1);
      const legPath = [pickup, ...leg, drop];
      L.polyline(legPath, {
        color: '#6e79e0', weight: 6, opacity: 0.95, lineCap: 'round',
      }).addTo(this.group);
    } else {
      L.polyline([pickup, drop], {
        color: '#6e79e0', weight: 6, opacity: 0.95, lineCap: 'round',
      }).addTo(this.group);
    }

    L.marker(pickup, { icon: pinDivIcon('P'), title: 'Pickup' })
      .bindPopup(`<h4>Pickup</h4><div class="small">${escapeHtml(booking.pickup)}</div>`)
      .addTo(this.group);
    L.marker(drop, { icon: dropDivIcon(), title: 'Drop' })
      .bindPopup(`<h4>Drop</h4><div class="small">${escapeHtml(booking.dropoff)}</div>`)
      .addTo(this.group);

    const lat = Number(booking.current_lat);
    const lng = Number(booking.current_lng);
    if (Number.isFinite(lat) && Number.isFinite(lng)) {
      this.vehicle = L.marker([lat, lng], {
        icon: vehicleDivIcon(booking.vehicle_type, booking.status === 'ongoing'),
        zIndexOffset: 1000,
        title: booking.rider_name,
      }).addTo(this.group);
    }

    const bounds = L.latLngBounds([pickup, drop, ...(this.vehicle ? [[lat, lng]] : [])]);
    this.map.fitBounds(bounds.pad(0.35), { maxZoom: 15 });
  }

  moveVehicle(lat, lng) {
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
    if (this.vehicle) this.vehicle.setLatLng([lat, lng]);
  }

  destroy() {
    this.group.clearLayers();
    this.map.removeLayer(this.group);
  }
}

export function dropDivIcon() {
  return L.divIcon({
    className: '',
    iconSize: [30, 30],
    iconAnchor: [15, 15],
    popupAnchor: [0, -16],
    html: `<div class="pin-marker pin-drop">D</div>`,
  });
}

function nearestIndex(point, latlngs) {
  let best = 0;
  let bestDistance = Infinity;
  latlngs.forEach((candidate, index) => {
    const distance = (candidate[0] - point[0]) ** 2 + (candidate[1] - point[1]) ** 2;
    if (distance < bestDistance) { bestDistance = distance; best = index; }
  });
  return best;
}

export function locateUser() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('Location is not supported by this browser.'));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (position) => resolve([position.coords.latitude, position.coords.longitude]),
      () => reject(new Error('Could not read your location. Allow location access and retry.')),
      { enableHighAccuracy: true, timeout: 10000 }
    );
  });
}
