// Passenger portal — find travellers whose route already covers your trip, then book a seat.

import { api } from '../api.js';
import { icon, vehicleIconName } from '../icons.js';
import { store, rememberTrip, recentTrips } from '../store.js';
import { navigate } from '../router.js';
import { createMap, RoutePreview, LiveRidesLayer } from '../map.js';
import { placeInput } from '../components/place-input.js';
import {
  emptyState, escapeHtml, initials, km, rupees, setBusy, skeletonList,
  timeLabel, toast, trustBadge,
} from '../ui.js';

export default function passengerView(container) {
  const user = store.user;
  let matches = [];
  let activeId = null;

  container.innerHTML = `
    <div class="container page">
      <div class="page-head">
        <div>
          <h1 style="margin-bottom:var(--space-2)">${icon('users', 26)} Passenger portal</h1>
          <p class="muted small">
            Enter your pickup and drop. You will only see travellers whose route passes both
            points, in the right order.
          </p>
        </div>
        <button class="btn btn-ghost" data-go="/bookings">${icon('ticket', 16)} My bookings</button>
      </div>

      <div class="split">
        <section class="card">
          <div class="card-title">
            <span class="portal-icon">${icon('search', 20)}</span>
            <h3>Where are you going?</h3>
          </div>

          <form novalidate>
            <div data-pickup></div>
            <div data-drop></div>

            <div class="grid grid-2" style="gap:var(--space-3)">
              <div class="field">
                <label for="pax-seats">Seats needed</label>
                <input id="pax-seats" type="number" min="1" max="4" value="1">
              </div>
              <div class="field">
                <label for="pax-detour">How far will you travel to meet the ride?</label>
                <select id="pax-detour">
                  <option value="1000">1 km</option>
                  <option value="2000">2 km</option>
                  <option value="5000" selected>5 km</option>
                  <option value="10000">10 km</option>
                </select>
              </div>
            </div>

            <button class="btn btn-primary btn-block btn-lg" type="submit">
              ${icon('search', 18)} Find rides on my route
            </button>
          </form>

          <div data-recent style="margin-top:var(--space-4)"></div>
        </section>

        <div class="stack">
          <div class="map-panel">
            <div id="pax-map" class="map-canvas" role="img"
                 aria-label="Map of your trip and matching travellers"></div>
            <div class="map-count" data-live-count>Live map</div>
            <div class="map-legend">
              <span class="row-tight"><span class="legend-dot" style="background:var(--color-accent)"></span> Your trip</span>
              <span class="row-tight"><span class="legend-dot" style="background:var(--color-bike)"></span> Bike</span>
              <span class="row-tight"><span class="legend-dot" style="background:var(--color-car)"></span> Car</span>
            </div>
          </div>

          <section data-results>
            ${emptyState('route', 'No search yet', 'Set your pickup and drop to see travellers already heading that way.')}
          </section>
        </div>
      </div>
    </div>
  `;

  container.querySelectorAll('[data-go]').forEach((button) => {
    button.addEventListener('click', () => navigate(button.dataset.go));
  });

  /* ── Map ───────────────────────────────────────────────────────────────── */

  const map = createMap(container.querySelector('#pax-map'));
  const preview = new RoutePreview(map);
  const liveLayer = new LiveRidesLayer(map, { onSelect: (ride) => setActive(ride.id) });
  const countNode = container.querySelector('[data-live-count]');

  api.liveRides()
    .then(({ rides, count }) => {
      liveLayer.render(rides, { showRoutes: false });
      countNode.textContent = `${count} traveller${count === 1 ? '' : 's'} live`;
      if (count) liveLayer.fit();
    })
    .catch(() => { countNode.textContent = 'Live map unavailable'; });

  function drawTrip() {
    const pickup = pickupField.value;
    const drop = dropField.value;
    if (pickup && drop) {
      preview.draw({
        from: [pickup.lat, pickup.lng],
        to: [drop.lat, drop.lng],
        labels: ['P', 'D'],
      });
    }
  }

  const pickupField = placeInput({
    id: 'pax-pickup',
    label: 'Pickup',
    placeholder: 'Where should the rider collect you?',
    helper: 'Tap the crosshair to use GPS.',
    allowLocate: true,
    onChange: drawTrip,
  });

  const dropField = placeInput({
    id: 'pax-drop',
    label: 'Drop',
    placeholder: 'Where are you going?',
    onChange: drawTrip,
  });

  container.querySelector('[data-pickup]').replaceWith(pickupField.node);
  container.querySelector('[data-drop]').replaceWith(dropField.node);

  /* ── Recent trips ──────────────────────────────────────────────────────── */

  const recentNode = container.querySelector('[data-recent]');

  function renderRecent() {
    const trips = recentTrips();
    if (!trips.length) { recentNode.innerHTML = ''; return; }
    recentNode.innerHTML = `
      <div class="small muted" style="margin-bottom:var(--space-2)">Recent trips</div>
      <div class="row-tight">
        ${trips.map((trip, index) => `
          <button type="button" class="badge recent-chip" data-recent-index="${index}"
                  title="${escapeHtml(trip.pickup.short)} → ${escapeHtml(trip.dropoff.short)}">
            ${icon('clock', 12)}
            <span class="recent-chip-text">${escapeHtml(trip.pickup.short)} → ${escapeHtml(trip.dropoff.short)}</span>
          </button>`).join('')}
      </div>
    `;
    recentNode.querySelectorAll('[data-recent-index]').forEach((button) => {
      button.addEventListener('click', () => {
        const trip = recentTrips()[Number(button.dataset.recentIndex)];
        pickupField.value = trip.pickup;
        dropField.value = trip.dropoff;
        drawTrip();
        form.requestSubmit();
      });
    });
  }

  renderRecent();

  /* ── Search ────────────────────────────────────────────────────────────── */

  const form = container.querySelector('form');
  const resultsNode = container.querySelector('[data-results]');

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const pickupValid = pickupField.validate('Choose your pickup point');
    const dropValid = dropField.validate('Choose your destination');
    if (!pickupValid || !dropValid) return;

    const pickup = pickupField.value;
    const drop = dropField.value;
    const seats = Number(container.querySelector('#pax-seats').value) || 1;
    const maxDetour = Number(container.querySelector('#pax-detour').value);
    const button = form.querySelector('button[type="submit"]');

    setBusy(button, true, 'Searching…');
    resultsNode.innerHTML = skeletonList(3);

    try {
      const result = await api.searchRides({
        passenger_id: user.id,
        pickup: pickup.short || pickup.label,
        dropoff: drop.short || drop.label,
        pickup_lat: pickup.lat,
        pickup_lng: pickup.lng,
        drop_lat: drop.lat,
        drop_lng: drop.lng,
        seats,
        max_detour_m: maxDetour,
      });

      matches = result.matches;
      rememberTrip({ pickup, dropoff: drop });
      renderRecent();
      renderResults(seats);
      liveLayer.render(matches, { showRoutes: true });
      drawTrip();
      if (matches.length) liveLayer.fit();
    } catch (error) {
      resultsNode.innerHTML = emptyState('alert', 'Search failed', error.message);
    } finally {
      setBusy(button, false);
    }
  });

  function setActive(rideId) {
    activeId = rideId;
    container.querySelectorAll('[data-ride-card]').forEach((card) => {
      card.classList.toggle('is-active', Number(card.dataset.rideCard) === rideId);
    });
    liveLayer.highlight(rideId);
    container.querySelector(`[data-ride-card="${rideId}"]`)?.scrollIntoView({
      block: 'nearest', behavior: 'smooth',
    });
  }

  function matchCard(ride, seats) {
    const trust = trustBadge(ride.rider_trust_score);
    const percent = Math.round(ride.match_percentage);
    return `
      <article class="ride-card" tabindex="0" data-ride-card="${ride.id}"
               aria-label="Ride by ${escapeHtml(ride.rider_name)}, ${percent} percent of your route">
        <div class="ride-card-head">
          <span class="avatar">${escapeHtml(initials(ride.rider_name))}</span>
          <div style="flex:1;min-width:0">
            <div class="row-tight" style="gap:var(--space-2)">
              <strong>${escapeHtml(ride.rider_name)}</strong>
              ${ride.rider_verified ? `<span class="badge badge-success">${icon('shield', 12)} Verified</span>` : ''}
            </div>
            <div class="xsmall muted">
              <span class="badge-id">${escapeHtml(ride.rider_public_id || '')}</span>
              · ${icon('star', 11)} ${Number(ride.rider_rating || 0).toFixed(1)}
            </div>
          </div>
          <div style="text-align:right">
            <div style="font-family:var(--font-display);font-size:var(--text-lg);font-weight:600">${rupees(ride.fare)}</div>
            <div class="xsmall muted">${seats} seat${seats === 1 ? '' : 's'}</div>
          </div>
        </div>

        <div class="route-line">
          <div class="route-step"><span class="dot"></span><span>${escapeHtml(ride.origin)}</span></div>
          <div class="route-step to"><span class="dot"></span><span>${escapeHtml(ride.destination)}</span></div>
        </div>

        <div>
          <div class="row-tight" style="justify-content:space-between;margin-bottom:6px">
            <span class="xsmall muted">Route overlap</span>
            <span class="xsmall"><strong>${percent}%</strong> of your trip</span>
          </div>
          <div class="meter"><span style="width:${percent}%"></span></div>
        </div>

        <div class="ride-meta">
          <span>${icon(vehicleIconName(ride.vehicle_type), 13)} ${escapeHtml(ride.vehicle_type)}</span>
          <span>${icon('clock', 13)} ${escapeHtml(timeLabel(ride.departure_time))}</span>
          <span>${icon('navigation', 13)} ${km(ride.pickup_detour_m)} to pickup</span>
          <span>${icon('users', 13)} ${ride.seats_available} free</span>
          <span>${icon('leaf', 13)} ${Number(ride.carbon_savings_kg || 0).toFixed(2)} kg CO₂ saved</span>
        </div>

        <div class="row-tight" style="justify-content:space-between">
          <span class="badge ${trust.className}">${icon('shield', 12)} ${trust.label} · ${ride.rider_trust_score ?? '—'}/100</span>
          <button class="btn btn-primary btn-sm" data-book="${ride.id}">
            ${icon('ticket', 14)} Book seat
          </button>
        </div>
      </article>
    `;
  }

  function renderResults(seats) {
    if (!matches.length) {
      resultsNode.innerHTML = emptyState(
        'search',
        'Nobody on this route yet',
        'No published trip covers both your pickup and drop right now. Try a wider pickup radius, or check back in a few minutes.'
      );
      return;
    }

    resultsNode.innerHTML = `
      <div class="page-head" style="margin-bottom:var(--space-3)">
        <h3 style="margin:0">${matches.length} ride${matches.length === 1 ? '' : 's'} on your way</h3>
        <span class="small muted">Ranked by route overlap, then detour</span>
      </div>
      <div class="ride-list stagger">${matches.map((ride) => matchCard(ride, seats)).join('')}</div>
    `;

    resultsNode.querySelectorAll('[data-ride-card]').forEach((card) => {
      const rideId = Number(card.dataset.rideCard);
      card.addEventListener('click', (event) => {
        if (event.target.closest('[data-book]')) return;
        setActive(rideId);
      });
      card.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); setActive(rideId); }
      });
    });

    resultsNode.querySelectorAll('[data-book]').forEach((button) => {
      button.addEventListener('click', (event) => {
        event.stopPropagation();
        book(Number(button.dataset.book), button, seats);
      });
    });
  }

  async function book(rideId, button, seats) {
    const pickup = pickupField.value;
    const drop = dropField.value;
    if (!pickup || !drop) return;
    const maxDetour = Number(container.querySelector('#pax-detour').value);

    setBusy(button, true, 'Booking…');
    try {
      const created = await api.book({
        ride_id: rideId,
        passenger_id: user.id,
        pickup: pickup.short || pickup.label,
        dropoff: drop.short || drop.label,
        pickup_lat: pickup.lat,
        pickup_lng: pickup.lng,
        drop_lat: drop.lat,
        drop_lng: drop.lng,
        seats,
        max_detour_m: maxDetour,
      });
      toast(`Seat requested — your start code is ${created.otp}`, 'success', 6000);
      navigate(`/trip?id=${created.id}`);
    } catch (error) {
      toast(error.message, 'error');
      setBusy(button, false);
    }
  }

  return {
    destroy() {
      preview.destroy();
      liveLayer.destroy();
      map.remove();
    },
  };
}
