// Passenger portal — find travellers whose route already covers your trip, then book a seat.

import { api } from '../api.js';
import { icon, vehicleIconName } from '../icons.js';
import { store, rememberTrip, recentTrips } from '../store.js';
import { navigate } from '../router.js';
import { createMap, RoutePreview, LiveRidesLayer } from '../map.js';
import { placeInput } from '../components/place-input.js';
import {
  emptyState, escapeHtml, initials, km, rupees, setBusy, skeletonList,
  timeLabel, toast, trustBadge, openSosEmergencyModal, toggleSirenSound,
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
            <div class="field" style="margin-bottom:var(--space-3)">
              <label class="row-tight" style="gap:var(--space-2);cursor:pointer;background:var(--color-surface-dim);padding:var(--space-2) var(--space-3);border-radius:var(--radius-md)">
                <input id="pax-women-only" type="checkbox" style="width:16px;height:16px;cursor:pointer">
                <span class="small">🌸 <strong>Women-Only Rides Only</strong></span>
              </label>
            </div>

            <button class="btn btn-primary btn-block btn-lg" type="submit">
              ${icon('search', 18)} Find rides on my route
            </button>
          </form>

          <div data-recent style="margin-top:var(--space-4)"></div>

          <div class="card" style="margin-top:var(--space-4);background:var(--color-surface-dim)">
            <h4 style="margin:0 0 var(--space-2)">📅 Recurring Office/College Commutes</h4>
            <p class="xsmall muted" style="margin-bottom:var(--space-3)">
              Subscribe to regular daily commutes for auto-reserved seats every work/college day!
            </p>
            <div data-recurring-browse class="stack small muted">Loading recurring commutes...</div>
          </div>
        </section>

        <div class="stack">
          <div class="map-panel" style="position:relative">
            <div id="pax-map" class="map-canvas" role="img"
                 aria-label="Map of your trip and matching travellers"></div>
            <button class="btn btn-danger btn-sm" data-map-sos style="position:absolute;top:var(--space-3);right:var(--space-3);z-index:900;font-weight:bold;box-shadow:0 0 15px rgba(239,68,68,0.6)">
              🚨 RED SOS BUTTON
            </button>
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

  container.querySelector('[data-map-sos]')?.addEventListener('click', async (event) => {
    const button = event.currentTarget;
    toggleSirenSound(true); // START SIREN SOUND IMMEDIATELY ON CLICK
    setBusy(button, true, 'SOS…');
    try {
      const { locateUser } = await import('../map.js');
      const [lat, lng] = await locateUser();
      const res = await api.triggerSos({ user_id: user.id, latitude: lat, longitude: lng, location_name: 'Map Overlay Emergency SOS' });
      openSosEmergencyModal({ res });
    } catch {
      const res = await api.triggerSos({ user_id: user.id, latitude: 12.9716, longitude: 77.5946, location_name: 'Map Overlay Emergency SOS' });
      openSosEmergencyModal({ res });
    } finally {
      setBusy(button, false);
    }
  });

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

  const recBrowseNode = container.querySelector('[data-recurring-browse]');

  async function loadRecurringBrowse() {
    if (!recBrowseNode) return;
    try {
      const res = await api.searchSchedules(user.gender || 'unspecified');
      const list = (res.schedules || []).filter((s) => s.user_id !== user.id);
      if (!list.length) {
        recBrowseNode.innerHTML = '<p class="xsmall muted" style="margin:0">No active recurring commutes available right now.</p>';
        return;
      }
      recBrowseNode.innerHTML = list.map((s) => `
        <div class="card-sm" style="background:var(--color-surface);border:1px solid var(--color-border);padding:var(--space-2) var(--space-3);border-radius:var(--radius-md);margin-bottom:var(--space-2)">
          <div class="row-tight" style="justify-content:space-between;margin-bottom:4px">
            <strong>${escapeHtml(s.title)}</strong>
            <span class="badge badge-accent">${escapeHtml(s.user_name)}</span>
          </div>
          <div class="xsmall muted">
            <div><strong>Route:</strong> ${escapeHtml(s.origin.split(',')[0])} ➔ ${escapeHtml(s.destination.split(',')[0])}</div>
            <div><strong>Time:</strong> ${escapeHtml(s.departure_time_str)} · <strong>Days:</strong> ${(s.days_of_week || []).join(', ').toUpperCase()}</div>
          </div>
          <div class="row-tight" style="justify-content:flex-end;margin-top:var(--space-2)">
            <button class="btn btn-xs btn-primary" data-subscribe-schedule="${s.id}">
              ${icon('ticket', 12)} Subscribe Daily Pass
            </button>
          </div>
        </div>
      `).join('');

      recBrowseNode.querySelectorAll('[data-subscribe-schedule]').forEach((btn) => {
        btn.addEventListener('click', async () => {
          const id = Number(btn.dataset.subscribeSchedule);
          setBusy(btn, true, 'Subscribing…');
          try {
            await api.subscribeSchedule(id, {
              subscriber_id: user.id,
              seats: 1,
            });
            toast('Subscribed! Seats will auto-reserve on commute days.', 'success');
            loadRecurringBrowse();
          } catch (err) {
            toast(err.message || 'Failed to subscribe', 'error');
            setBusy(btn, false);
          }
        });
      });
    } catch (err) {
      recBrowseNode.innerHTML = `<p class="xsmall muted" style="margin:0">${escapeHtml(err.message)}</p>`;
    }
  }

  loadRecurringBrowse();

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
        women_only_filter: container.querySelector('#pax-women-only').checked,
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
      card.classList.toggle('is-active', String(card.dataset.rideCard) === String(rideId));
    });
    liveLayer.highlight(rideId);
    container.querySelector(`[data-ride-card="${rideId}"]`)?.scrollIntoView({
      block: 'nearest', behavior: 'smooth',
    });
  }

   function matchCard(ride, seats) {
    const trust = trustBadge(ride.rider_trust_score ?? 50);
    const percent = Math.round(ride.match_percentage);

    if (ride.is_relay) {
      return `
        <article class="ride-card ride-card-relay" tabindex="0" data-ride-card="${ride.id}" style="border: 1px solid var(--accent-primary, #6366f1); background: rgba(99, 102, 241, 0.04);">
          <div class="row-tight" style="justify-content:space-between;margin-bottom:8px">
            <span class="badge badge-info" style="background:#6366f1;color:#fff;font-weight:600">${icon('git-commit', 12)} 🔀 2-Leg Relay Carpool</span>
            <div style="text-align:right">
              <div style="font-family:var(--font-display);font-size:var(--text-lg);font-weight:600">${rupees(ride.fare)}</div>
              <div class="xsmall muted">Total for ${seats} seat${seats === 1 ? '' : 's'}</div>
            </div>
          </div>

          <div class="route-line" style="gap:4px">
            <div class="route-step"><span class="dot"></span><span><strong>Leg 1:</strong> ${escapeHtml(ride.leg1.rider_name)} (${escapeHtml(ride.leg1.origin)})</span></div>
            <div class="route-step via" style="padding-left:14px"><span class="badge badge-secondary" style="font-size:11px">📍 Transfer Hub: ${escapeHtml(ride.transfer_point.name)}</span></div>
            <div class="route-step to"><span class="dot"></span><span><strong>Leg 2:</strong> ${escapeHtml(ride.leg2.rider_name)} (${escapeHtml(ride.leg2.destination)})</span></div>
          </div>

          <div style="margin-top:8px">
            <div class="row-tight" style="justify-content:space-between;margin-bottom:6px">
              <span class="xsmall muted">Combined Route overlap</span>
              <span class="xsmall"><strong>${percent}%</strong> of your trip</span>
            </div>
            <div class="meter"><span style="width:${percent}%;background:#6366f1"></span></div>
          </div>

          <div class="ride-meta" style="margin-top:8px">
            <span>${icon('navigation', 13)} ${km(ride.pickup_detour_m)} to pickup</span>
            <span>${icon('users', 13)} ${ride.seats_available} free</span>
            <span>${icon('leaf', 13)} ${Number(ride.carbon_savings_kg || 0).toFixed(2)} kg CO₂ saved</span>
          </div>

          <div class="row-tight" style="justify-content:space-between;margin-top:10px">
            <span class="badge ${trust.className}">${icon('shield', 12)} Relay Verified · ${ride.rider_trust_score ?? '—'}/100</span>
            <button class="btn btn-primary btn-sm" data-book-relay="${ride.id}" style="background:#6366f1">
              ${icon('ticket', 14)} Book 2-Leg Relay
            </button>
          </div>
        </article>
      `;
    }

    return `
      <article class="ride-card" tabindex="0" data-ride-card="${ride.id}"
               aria-label="Ride by ${escapeHtml(ride.rider_name)}, ${percent} percent of your route">
        <div class="ride-card-head">
          <span class="avatar">${escapeHtml(initials(ride.rider_name))}</span>
          <div style="flex:1;min-width:0">
            <div class="row-tight" style="gap:var(--space-2)">
              <strong>${escapeHtml(ride.rider_name)}</strong>
              ${ride.women_only ? `<span class="badge badge-women-only">🌸 Women-Only</span>` : ''}
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
      const rideId = card.dataset.rideCard;
      card.addEventListener('click', (event) => {
        if (event.target.closest('[data-book]') || event.target.closest('[data-book-relay]')) return;
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

    resultsNode.querySelectorAll('[data-book-relay]').forEach((button) => {
      button.addEventListener('click', (event) => {
        event.stopPropagation();
        const relayId = button.dataset.bookRelay;
        const relayMatch = matches.find((m) => String(m.id) === String(relayId));
        if (relayMatch) bookRelayRide(relayMatch, button, seats);
      });
    });
  }

  function extractLocationDetails(fieldVal, defaultLabel = 'Location', defaultLat = 16.43, defaultLng = 74.59) {
    if (!fieldVal) return { label: defaultLabel, lat: defaultLat, lng: defaultLng };
    if (typeof fieldVal === 'string') {
      return { label: fieldVal, lat: defaultLat, lng: defaultLng };
    }
    const label = fieldVal.short || fieldVal.label || fieldVal.name || String(fieldVal) || defaultLabel;
    const lat = Number(fieldVal.lat ?? fieldVal.latitude ?? defaultLat);
    const lng = Number(fieldVal.lng ?? fieldVal.longitude ?? defaultLng);
    return {
      label,
      lat: Number.isFinite(lat) ? lat : defaultLat,
      lng: Number.isFinite(lng) ? lng : defaultLng,
    };
  }

  async function bookRelayRide(relayMatch, button, seats) {
    const paxId = Number(user?.id || store.user?.id || 1);
    const pickupObj = extractLocationDetails(pickupField.value, 'Pickup', 16.43, 74.59);
    const dropObj = extractLocationDetails(dropField.value, 'Dropoff', 15.87, 74.50);
    const maxDetour = Number(container.querySelector('#pax-detour').value) || 5000;

    setBusy(button, true, 'Booking 2 Legs…');
    try {
      const created = await api.bookRelay({
        passenger_id: paxId,
        leg1_ride_id: Number(relayMatch.leg1.id),
        leg2_ride_id: Number(relayMatch.leg2.id),
        pickup: pickupObj.label,
        dropoff: dropObj.label,
        transfer_point: relayMatch.transfer_point.name || 'Transfer Hub',
        pickup_lat: pickupObj.lat,
        pickup_lng: pickupObj.lng,
        transfer_lat: Number(relayMatch.transfer_point.lat),
        transfer_lng: Number(relayMatch.transfer_point.lng),
        drop_lat: dropObj.lat,
        drop_lng: dropObj.lng,
        seats: Number(seats) || 1,
        max_detour_m: maxDetour,
      });
      toast(`Relay Seats requested! Start codes: ${created.otp}`, 'success', 8000);
      navigate(`/trip?id=${created.id}`);
    } catch (error) {
      toast(error.message, 'error');
      setBusy(button, false);
    }
  }

  async function book(rideId, button, seats) {
    const targetMatch = matches.find((m) => String(m.id) === String(rideId));
    if (targetMatch && targetMatch.is_relay) {
      return bookRelayRide(targetMatch, button, seats);
    }

    const paxId = Number(user?.id || store.user?.id || 1);
    const pickupObj = extractLocationDetails(pickupField.value, 'Pickup', 16.43, 74.59);
    const dropObj = extractLocationDetails(dropField.value, 'Dropoff', 15.87, 74.50);
    const maxDetour = Number(container.querySelector('#pax-detour').value) || 5000;

    setBusy(button, true, 'Booking…');
    try {
      const created = await api.book({
        ride_id: Number(rideId),
        passenger_id: paxId,
        pickup: pickupObj.label,
        dropoff: dropObj.label,
        pickup_lat: pickupObj.lat,
        pickup_lng: pickupObj.lng,
        drop_lat: dropObj.lat,
        drop_lng: dropObj.lng,
        seats: Number(seats) || 1,
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
