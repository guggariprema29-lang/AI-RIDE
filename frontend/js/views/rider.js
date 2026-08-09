// Rider portal — publish the journey you are already making and go live on the map.

import { api, roadRoute } from '../api.js';
import { icon, vehicleIconName } from '../icons.js';
import { store } from '../store.js';
import { navigate } from '../router.js';
import { createMap, RoutePreview, LiveRidesLayer, locateUser } from '../map.js';
import { placeInput } from '../components/place-input.js';
import {
  escapeHtml, formatCapacity, initials, km, localDateTimeValue, setBusy, statusBadge, timeLabel, toast,
} from '../ui.js';
import { showCostBreakdownModal } from '../components/cost-modal.js';

const VEHICLES = [
  { id: 'bike', label: 'Bike', seats: 1, rate: 3.5 },
  { id: 'auto', label: 'Auto', seats: 3, rate: 4.5 },
  { id: 'car', label: 'Car', seats: 4, rate: 6.0 },
];

export default function riderView(container) {
  const user = store.user;
  let vehicle = 'car';
  let refreshTimer = null;

  container.innerHTML = `
    <div class="container page">
      <div class="page-head">
        <div>
          <h1 style="margin-bottom:var(--space-2)">${icon('car', 26)} Rider portal</h1>
          <p class="muted small">
            Publish where you are and where you are heading. Passengers travelling the same
            corridor will see you on the map as <span class="badge badge-id">${escapeHtml(store.publicId)}</span>.
          </p>
        </div>
        <button class="btn btn-ghost" data-refresh>${icon('refresh', 16)} Refresh</button>
      </div>

      <div class="split">
        <section class="card" data-form-card>
          <div class="card-title">
            <span class="portal-icon">${icon('navigation', 20)}</span>
            <h3>Announce your trip</h3>
          </div>

          <form novalidate>
            <div data-from></div>
            <div data-to></div>

            <div class="field">
              <label id="vehicle-label">Vehicle</label>
              <div class="segmented" role="group" aria-labelledby="vehicle-label">
                ${VEHICLES.map((item) => `
                  <button type="button" data-vehicle="${item.id}" aria-pressed="${item.id === 'car'}">
                    ${icon(vehicleIconName(item.id), 16)} ${item.label}
                  </button>`).join('')}
              </div>
            </div>

            <div class="grid grid-2" style="gap:var(--space-3)">
              <div class="field">
                <label for="seats">Seats free</label>
                <input id="seats" type="number" min="1" max="4" value="4">
              </div>
              <div class="field">
                <label for="rate">Cost share ₹/km</label>
                <input id="rate" type="number" min="1" max="30" step="0.5" value="6">
                <span class="helper">Fuel split only — no profit.</span>
              </div>
            </div>

            <div class="field">
              <label for="departure">Leaving at</label>
              <input id="departure" type="datetime-local" value="${localDateTimeValue()}">
            </div>

            <div class="field">
              <label for="vehicle-number">Vehicle number <span class="muted">(optional)</span></label>
              <input id="vehicle-number" type="text" placeholder="KA 22 AB 1234">
            </div>

            <div class="field">
              <label for="notes">Note for passengers <span class="muted">(optional)</span></label>
              <textarea id="notes" placeholder="Two helmets available. Can wait 10 minutes at pickup."></textarea>
            </div>

            <div class="field" style="margin-bottom:var(--space-4)">
              <label class="row-tight" style="gap:var(--space-2);cursor:pointer;background:var(--color-surface-dim);padding:var(--space-3);border-radius:var(--radius-md);border:1px dashed var(--color-border)">
                <input id="women-only" type="checkbox" style="width:18px;height:18px;cursor:pointer">
                <span>🌸 <strong>Women-Only Ride</strong> (Visible exclusively to female passengers)</span>
              </label>
            </div>

            <button class="btn btn-primary btn-block btn-lg" type="submit">
              ${icon('navigation', 18)} I'm available — publish ride
            </button>
          </form>

          <section class="card" style="margin-top:var(--space-4);background:var(--color-surface-dim)">
            <div class="card-title">
              <span class="portal-icon">${icon('clock', 20)}</span>
              <h3>📅 Recurring Office/College Commute</h3>
            </div>
            <p class="xsmall muted" style="margin-bottom:var(--space-3)">
              Set an automated weekly schedule (e.g. Mon-Fri at 8:30 AM). Your ride auto-publishes and auto-books subscribed daily commuters!
            </p>

            <form data-recurring-form class="stack small">
              <div class="field">
                <label for="rec-title">Commute Name</label>
                <input id="rec-title" type="text" placeholder="Daily Office Route" value="Daily Office/College Commute" required />
              </div>

              <div class="field">
                <label>Repeat Days</label>
                <div class="row-tight" style="gap:var(--space-2);flex-wrap:wrap">
                  <label class="badge" style="cursor:pointer;background:var(--color-surface);border:1px solid var(--color-border)"><input type="checkbox" name="rec_day" value="mon" checked /> Mon</label>
                  <label class="badge" style="cursor:pointer;background:var(--color-surface);border:1px solid var(--color-border)"><input type="checkbox" name="rec_day" value="tue" checked /> Tue</label>
                  <label class="badge" style="cursor:pointer;background:var(--color-surface);border:1px solid var(--color-border)"><input type="checkbox" name="rec_day" value="wed" checked /> Wed</label>
                  <label class="badge" style="cursor:pointer;background:var(--color-surface);border:1px solid var(--color-border)"><input type="checkbox" name="rec_day" value="thu" checked /> Thu</label>
                  <label class="badge" style="cursor:pointer;background:var(--color-surface);border:1px solid var(--color-border)"><input type="checkbox" name="rec_day" value="fri" checked /> Fri</label>
                  <label class="badge" style="cursor:pointer;background:var(--color-surface);border:1px solid var(--color-border)"><input type="checkbox" name="rec_day" value="sat" /> Sat</label>
                  <label class="badge" style="cursor:pointer;background:var(--color-surface);border:1px solid var(--color-border)"><input type="checkbox" name="rec_day" value="sun" /> Sun</label>
                </div>
              </div>

              <div class="field">
                <label for="rec-time">Daily Departure Time</label>
                <input id="rec-time" type="time" value="08:30" required />
              </div>

              <button class="btn btn-sm btn-ghost" type="submit">${icon('check', 14)} Save Recurring Schedule</button>
            </form>

            <div style="margin-top:var(--space-4);border-top:1px dashed var(--color-border);padding-top:var(--space-3)">
              <h4 class="small" style="margin:0 0 var(--space-2)">Your Active Schedules</h4>
              <div data-schedules-list class="stack small muted">Loading schedules...</div>
            </div>
          </section>
        </section>

        <div class="stack">
          <div class="map-panel">
            <div id="rider-map" class="map-canvas tall" role="img"
                 aria-label="Map preview of your route and other live travellers"></div>
            <div class="map-count" data-live-count>Live map</div>
            <div class="map-legend">
              <span class="row-tight"><span class="legend-dot" style="background:var(--color-accent)"></span> Your route</span>
              <span class="row-tight"><span class="legend-dot" style="background:var(--color-bike)"></span> Bike</span>
              <span class="row-tight"><span class="legend-dot" style="background:var(--color-car)"></span> Car</span>
            </div>
          </div>

          <section class="card">
            <div class="card-title">
              <span class="portal-icon">${icon('briefcase', 20)}</span>
              <h3>Your active rides</h3>
            </div>
            <div data-active class="stack">Loading…</div>
          </section>

          <section class="card">
            <div class="card-title">
              <span class="portal-icon">${icon('ticket', 20)}</span>
              <h3>Seat requests</h3>
            </div>
            <div data-requests class="stack">Loading…</div>
          </section>
        </div>
      </div>
    </div>
  `;

  /* ── Map ───────────────────────────────────────────────────────────────── */

  const map = createMap(container.querySelector('#rider-map'));
  const preview = new RoutePreview(map);
  const liveLayer = new LiveRidesLayer(map);
  const countNode = container.querySelector('[data-live-count]');

  function drawPreview() {
    const from = fromField.value;
    const to = toField.value;
    if (from && to) {
      preview.draw({
        from: [from.lat, from.lng],
        to: [to.lat, to.lng],
        labels: ['You', 'To'],
      });
    } else if (from) {
      preview.draw({ from: [from.lat, from.lng], labels: ['You', 'To'] });
    }
  }

  const fromField = placeInput({
    id: 'rider-from',
    label: 'You are here',
    placeholder: 'Current location',
    helper: 'Tap the crosshair to use GPS.',
    allowLocate: true,
    onChange: drawPreview,
  });

  const toField = placeInput({
    id: 'rider-to',
    label: 'You are going to',
    placeholder: 'Destination',
    helper: 'Passengers along this line will find you.',
    onChange: drawPreview,
  });

  container.querySelector('[data-from]').replaceWith(fromField.node);
  container.querySelector('[data-to]').replaceWith(toField.node);

  // Pre-fill the origin with GPS without blocking the form.
  locateUser()
    .then(([lat, lng]) => map.setView([lat, lng], 13))
    .catch(() => { /* location denied — default view is fine */ });

  /* ── Vehicle selector ──────────────────────────────────────────────────── */

  const seatsInput = container.querySelector('#seats');
  const rateInput = container.querySelector('#rate');

  container.querySelectorAll('[data-vehicle]').forEach((button) => {
    button.addEventListener('click', () => {
      vehicle = button.dataset.vehicle;
      container.querySelectorAll('[data-vehicle]').forEach((other) => {
        other.setAttribute('aria-pressed', String(other === button));
      });
      const preset = VEHICLES.find((item) => item.id === vehicle);
      seatsInput.value = preset.seats;
      seatsInput.max = preset.seats;
      rateInput.value = preset.rate;
    });
  });

  /* ── Publish ───────────────────────────────────────────────────────────── */

  const form = container.querySelector('form');

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const fromValid = fromField.validate('Set where you are starting from');
    const toValid = toField.validate('Set where you are heading');
    if (!fromValid || !toValid) return;

    const from = fromField.value;
    const to = toField.value;
    const button = form.querySelector('button[type="submit"]');
    setBusy(button, true, 'Plotting route…');

    try {
      // Publish the road you will actually drive, not a straight line — that is
      // what decides which passengers can find you.
      const route = await roadRoute(from, to);
      if (route.source === 'straight-line') {
        toast('Road routing unavailable — using a direct line', 'info');
      }

      await api.publishRide({
        rider_id: user.id,
        origin: from.short || from.label,
        destination: to.short || to.label,
        origin_lat: from.lat,
        origin_lng: from.lng,
        dest_lat: to.lat,
        dest_lng: to.lng,
        current_lat: from.lat,
        current_lng: from.lng,
        polyline: route.polyline,
        vehicle_type: vehicle,
        vehicle_number: container.querySelector('#vehicle-number').value.trim() || null,
        seats_total: Number(seatsInput.value) || 1,
        fare_per_km: Number(rateInput.value) || null,
        departure_time: new Date(container.querySelector('#departure').value || Date.now()).toISOString(),
        notes: container.querySelector('#notes').value.trim() || null,
        women_only: container.querySelector('#women-only').checked,
      });

      toast('You are live on the map', 'success');
      form.reset();
      fromField.clear();
      toField.clear();
      preview.clear();
      container.querySelector('#departure').value = localDateTimeValue();
      refresh();
    } catch (error) {
      toast(error.message, 'error');
    } finally {
      setBusy(button, false);
    }
  });

  /* ── Active rides + requests ───────────────────────────────────────────── */

  const activeNode = container.querySelector('[data-active]');
  const requestsNode = container.querySelector('[data-requests]');

  function rideCard(ride) {
    const canStart = ride.status === 'available';
    const canComplete = ride.status === 'started';
    const closed = ['completed', 'cancelled'].includes(ride.status);
    const dev = ride.route_deviation;
    const deviationHtml = dev && dev.is_deviated ? `
      <div class="${dev.is_critical ? 'off-route-banner-critical' : 'off-route-banner-warning'}" style="margin-top:var(--space-2)">
        ${escapeHtml(dev.message || `⚠️ Vehicle off-route by ${dev.deviation_distance_m}m`)}
      </div>
    ` : '';

    return `
      <article class="card card-tight" data-ride="${ride.id}">
        <div class="row-tight" style="justify-content:space-between">
          <span class="row-tight">
            ${icon(vehicleIconName(ride.vehicle_type), 18)}
            <strong>${escapeHtml(ride.origin.split(',')[0])} → ${escapeHtml(ride.destination.split(',')[0])}</strong>
            ${ride.women_only ? `<span class="badge badge-women-only">🌸 Women-Only</span>` : ''}
          </span>
          <span class="badge ${statusBadge(ride.status)}">${escapeHtml(ride.status)}</span>
        </div>
        ${deviationHtml}
        <div class="ride-meta" style="margin-top:var(--space-2)">
          <span>${icon('clock', 13)} ${escapeHtml(timeLabel(ride.departure_time))}</span>
          <span>${formatCapacity(ride.seats_available, ride.seats_total, ride.vehicle_type)}</span>
          <span>${icon('route', 13)} ${km(ride.total_distance_m)}</span>
        </div>
        ${closed ? '' : `
          <div class="row-tight" style="margin-top:var(--space-3);flex-wrap:wrap">
            <button class="btn btn-xs btn-ghost" data-view-rider-receipt="${ride.id}" style="color:var(--color-accent)">
              ${icon('file-text', 12)} 📊 Fuel & Cost Receipt
            </button>
            <button class="btn btn-sm" data-locate-ride="${ride.id}">${icon('crosshair', 14)} Update location</button>
            ${canStart ? `<button class="btn btn-sm btn-primary" data-status="started" data-id="${ride.id}">${icon('navigation', 14)} Start trip</button>` : ''}
            ${canComplete ? `<button class="btn btn-sm btn-primary" data-status="completed" data-id="${ride.id}">${icon('check', 14)} Complete</button>` : ''}
            <button class="btn btn-sm btn-danger" data-status="cancelled" data-id="${ride.id}">${icon('x', 14)} Cancel</button>
          </div>`}
      </article>
    `;
  }

  function requestCard(booking) {
    const nudge = {
      pending: 'Tap to accept or decline',
      accepted: 'Tap to enter their start code',
      ongoing: 'Trip running — tap to end it',
      completed: 'Waiting for payment',
      paid: 'Tap to rate your passenger',
    }[booking.status];

    return `
      <button class="trip-card" data-trip="${booking.id}">
        <div class="trip-card-top">
          <span class="avatar">${escapeHtml(initials(booking.passenger_name))}</span>
          <div style="flex:1;min-width:0">
            <strong>${escapeHtml(booking.passenger_name)}</strong>
            <div class="xsmall muted">
              <span class="badge-id">${escapeHtml(booking.passenger_public_id || '')}</span>
              · trust ${booking.passenger_trust_score ?? '—'}
            </div>
          </div>
          <span class="badge ${statusBadge(booking.status)}">
            ${booking.status === 'ongoing' ? '<span class="live-dot"></span> ' : ''}${escapeHtml(booking.status)}
          </span>
        </div>
        <div class="route-line">
          <div class="route-step"><span class="dot"></span><span>${escapeHtml(booking.pickup)}</span></div>
          <div class="route-step to"><span class="dot"></span><span>${escapeHtml(booking.dropoff)}</span></div>
        </div>
        <div class="ride-meta">
          <span>${icon('users', 13)} ${booking.seats} seat${booking.seats === 1 ? '' : 's'}</span>
          <span>${icon('wallet', 13)} ₹${Number(booking.fare).toFixed(0)}</span>
          <span>${icon('navigation', 13)} ${km(booking.detour_m || 0)} detour</span>
        </div>
        ${nudge ? `<span class="trip-nudge">${icon('arrowRight', 14)} ${nudge}</span>` : ''}
      </button>
    `;
  }

  async function refresh() {
    try {
      const [mine, requests, live] = await Promise.all([
        api.ridesByRider(user.id),
        api.riderBookings(user.id),
        api.liveRides(),
      ]);

      const activeRides = mine.rides.filter((ride) => !['completed', 'cancelled'].includes(ride.status));
      activeNode.innerHTML = activeRides.length
        ? activeRides.map(rideCard).join('')
        : '<p class="small muted" style="margin:0">No active rides. Publish one on the left.</p>';

      const openRequests = requests.bookings.filter(
        (booking) => !['cancelled', 'rejected', 'closed'].includes(booking.status)
      );
      requestsNode.innerHTML = openRequests.length
        ? `<div class="trip-card-list">${openRequests.map(requestCard).join('')}</div>`
        : '<p class="small muted" style="margin:0">No seat requests yet.</p>';

      liveLayer.render(live.rides);
      countNode.textContent = `${live.count} live`;
      bindActions();
    } catch (error) {
      activeNode.innerHTML = `<p class="small muted" style="margin:0">${escapeHtml(error.message)}</p>`;
      requestsNode.innerHTML = '';
    }
  }

  function bindActions() {
    container.querySelectorAll('[data-status]').forEach((button) => {
      button.addEventListener('click', async () => {
        setBusy(button, true, 'Saving…');
        try {
          await api.updateRideStatus(Number(button.dataset.id), button.dataset.status);
          toast(`Ride marked ${button.dataset.status}`, 'success');
          refresh();
        } catch (error) {
          toast(error.message, 'error');
          setBusy(button, false);
        }
      });
    });

    container.querySelectorAll('[data-locate-ride]').forEach((button) => {
      button.addEventListener('click', async () => {
        setBusy(button, true, 'Locating…');
        try {
          const [lat, lng] = await locateUser();
          await api.updateRideLocation(Number(button.dataset.locateRide), lat, lng);
          toast('Live position updated', 'success');
          refresh();
        } catch (error) {
          toast(error.message, 'error');
          setBusy(button, false);
        }
      });
    });

    container.querySelectorAll('[data-trip]').forEach((button) => {
      button.addEventListener('click', () => navigate(`/trip?id=${button.dataset.trip}`));
    });

    container.querySelectorAll('[data-view-rider-receipt]').forEach((button) => {
      button.addEventListener('click', async () => {
        const rideId = Number(button.dataset.viewRiderReceipt);
        try {
          const res = await api.rideCostBreakdown(rideId);
          showCostBreakdownModal(res);
        } catch (err) {
          toast(err.message, 'error');
        }
      });
    });
  }

  container.querySelector('[data-refresh]').addEventListener('click', refresh);

  const schedulesListNode = container.querySelector('[data-schedules-list]');

  async function loadSchedules() {
    if (!schedulesListNode) return;
    try {
      const res = await api.userSchedules(user.id);
      const list = res.schedules || [];
      if (!list.length) {
        schedulesListNode.innerHTML = '<p class="xsmall muted" style="margin:0">No recurring schedules created yet.</p>';
        return;
      }
      schedulesListNode.innerHTML = list.map((s) => `
        <div class="card-sm" style="background:var(--color-surface);border:1px solid var(--color-border);padding:var(--space-2) var(--space-3);border-radius:var(--radius-md);margin-bottom:var(--space-2)">
          <div class="row-tight" style="justify-content:space-between;margin-bottom:4px">
            <strong>${escapeHtml(s.title)}</strong>
            <span class="badge ${s.status === 'active' ? 'badge-success' : 'badge-warning'}">${s.status.toUpperCase()}</span>
          </div>
          <div class="xsmall muted">
            <div><strong>Route:</strong> ${escapeHtml(s.origin.split(',')[0])} ➔ ${escapeHtml(s.destination.split(',')[0])}</div>
            <div><strong>Time:</strong> ${escapeHtml(s.departure_time_str)} · <strong>Days:</strong> ${(s.days_of_week || []).join(', ').toUpperCase()}</div>
            <div><strong>Subscribers:</strong> ${s.subscriber_count || 0} daily commuters</div>
          </div>
          <div class="row-tight" style="justify-content:flex-end;margin-top:var(--space-2)">
            <button class="btn btn-xs btn-ghost" data-toggle-schedule="${s.id}">
              ${s.status === 'active' ? '⏸ Pause Schedule' : '▶️ Resume Schedule'}
            </button>
          </div>
        </div>
      `).join('');

      schedulesListNode.querySelectorAll('[data-toggle-schedule]').forEach((btn) => {
        btn.addEventListener('click', async () => {
          const id = Number(btn.dataset.toggleSchedule);
          try {
            await api.toggleSchedule(id);
            toast('Schedule status updated', 'success');
            loadSchedules();
          } catch (err) {
            toast(err.message, 'error');
          }
        });
      });
    } catch (err) {
      schedulesListNode.innerHTML = `<p class="xsmall muted" style="margin:0">${escapeHtml(err.message)}</p>`;
    }
  }

  loadSchedules();

  container.querySelector('[data-recurring-form]')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const from = fromField.value;
    const to = toField.value;
    if (!from || !to) {
      toast('Please set your origin and destination location first above.', 'error');
      return;
    }

    const title = container.querySelector('#rec-title').value.trim();
    const timeStr = container.querySelector('#rec-time').value;
    const selectedDays = Array.from(container.querySelectorAll('input[name="rec_day"]:checked')).map((cb) => cb.value);

    if (!selectedDays.length) {
      toast('Select at least one day for recurring commute.', 'error');
      return;
    }

    const button = e.currentTarget.querySelector('button[type="submit"]');
    setBusy(button, true, 'Saving schedule...');

    try {
      const route = await roadRoute(from, to);
      await api.createRecurringSchedule({
        user_id: user.id,
        schedule_type: 'rider_ride',
        title: title || 'Daily Commute',
        days_of_week: selectedDays,
        departure_time_str: timeStr,
        origin: from.short || from.label,
        destination: to.short || to.label,
        origin_lat: from.lat,
        origin_lng: from.lng,
        dest_lat: to.lat,
        dest_lng: to.lng,
        polyline: route.polyline,
        total_distance_m: route.distance_m || 0.0,
        vehicle_type: vehicle,
        vehicle_number: container.querySelector('#vehicle-number').value.trim() || null,
        seats_total: Number(seatsInput.value) || 1,
        fare_per_km: Number(rateInput.value) || 6.0,
        women_only: container.querySelector('#women-only')?.checked || false,
        notes: container.querySelector('#notes').value.trim() || null,
      });

      toast('Recurring commute schedule created!', 'success');
      loadSchedules();
      refresh();
    } catch (err) {
      toast(err.message || 'Failed to create recurring schedule', 'error');
    } finally {
      setBusy(button, false);
    }
  });

  refresh();
  refreshTimer = setInterval(refresh, 20000);

  return {
    destroy() {
      clearInterval(refreshTimer);
      preview.destroy();
      liveLayer.destroy();
      map.remove();
    },
  };
}
