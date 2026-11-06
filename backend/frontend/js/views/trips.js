// "My bookings" (as passenger) and "My trips" (as rider).

import { api } from '../api.js';
import { icon, vehicleIconName } from '../icons.js';
import { store } from '../store.js';
import { navigate } from '../router.js';
import {
  emptyState, escapeHtml, formatCapacity, initials, km, rupees, skeletonList,
  statusBadge, timeLabel,
} from '../ui.js';

/* ── Passenger: my bookings ──────────────────────────────────────────────── */

export function bookingsView(container) {
  const user = store.user;
  let timer = null;

  container.innerHTML = `
    <div class="container page">
      <div class="page-head">
        <div>
          <h1 style="margin-bottom:var(--space-2)">${icon('ticket', 26)} My trips</h1>
          <p class="muted small">Tap any trip to track it live, pay, or leave a rating.</p>
        </div>
        <button class="btn btn-primary" data-go="/passenger">${icon('search', 16)} Find a ride</button>
      </div>
      <div data-list>${skeletonList(2)}</div>
    </div>
  `;

  const listNode = container.querySelector('[data-list]');

  function card(booking) {
    const live = ['pending', 'accepted', 'ongoing'].includes(booking.status);
    const needsPay = booking.status === 'completed';
    const needsRating = booking.status === 'paid' && !booking.rider_rating;
    return `
      <button class="trip-card" data-trip="${booking.id}">
        <div class="trip-card-top">
          <span class="avatar">${escapeHtml(initials(booking.rider_name))}</span>
          <div style="flex:1;min-width:0">
            <strong>${escapeHtml(booking.rider_name)}</strong>
            <div class="xsmall muted">
              <span class="badge-id">${escapeHtml(booking.rider_public_id || '')}</span>
              · ${escapeHtml(booking.vehicle_type || '')}
            </div>
          </div>
          <span class="badge ${statusBadge(booking.status)}">
            ${live && booking.status === 'ongoing' ? '<span class="live-dot"></span> ' : ''}${escapeHtml(booking.status)}
          </span>
        </div>

        <div class="route-line">
          <div class="route-step"><span class="dot"></span><span>${escapeHtml(booking.pickup)}</span></div>
          <div class="route-step to"><span class="dot"></span><span>${escapeHtml(booking.dropoff)}</span></div>
        </div>

        <div class="ride-meta">
          <span>${icon('clock', 13)} ${escapeHtml(timeLabel(booking.ride_departure_time))}</span>
          <span>${icon('wallet', 13)} <strong>${rupees(booking.fare)}</strong></span>
          <span>${icon('users', 13)} ${booking.seats} seat${booking.seats === 1 ? '' : 's'}</span>
        </div>

        ${needsPay ? `<span class="trip-nudge">${icon('wallet', 14)} Payment due — tap to pay</span>` : ''}
        ${needsRating ? `<span class="trip-nudge">${icon('star', 14)} Rate your rider</span>` : ''}
        ${booking.status === 'pending' ? `<span class="trip-nudge">${icon('clock', 14)} Waiting for the rider to accept</span>` : ''}
        ${booking.status === 'accepted' ? `<span class="trip-nudge">${icon('shield', 14)} Show your start code at pickup</span>` : ''}
      </button>
    `;
  }

  async function refresh() {
    try {
      const { bookings } = await api.passengerBookings(user.id);
      listNode.innerHTML = bookings.length
        ? `<div class="trip-card-list stagger">${bookings.map(card).join('')}</div>`
        : emptyState(
            'ticket',
            'No trips yet',
            'Search the passenger portal to find travellers already heading your way.',
            '<button class="btn btn-primary" data-go="/passenger">Find a ride</button>'
          );
      bind();
    } catch (error) {
      listNode.innerHTML = emptyState('alert', 'Could not load trips', error.message);
    }
  }

  function bind() {
    container.querySelectorAll('[data-go]').forEach((button) => {
      button.addEventListener('click', () => navigate(button.dataset.go));
    });
    container.querySelectorAll('[data-trip]').forEach((button) => {
      button.addEventListener('click', () => navigate(`/trip?id=${button.dataset.trip}`));
    });
  }

  refresh();
  timer = setInterval(refresh, 20000);

  return { destroy() { clearInterval(timer); } };
}

/* ── Rider: my published trips ───────────────────────────────────────────── */

export function myTripsView(container) {
  const user = store.user;

  container.innerHTML = `
    <div class="container page">
      <div class="page-head">
        <div>
          <h1 style="margin-bottom:var(--space-2)">${icon('briefcase', 26)} My trips</h1>
          <p class="muted small">Every ride you have published, newest departure first.</p>
        </div>
        <button class="btn btn-primary" data-go="/rider">${icon('plus', 16)} Publish a ride</button>
      </div>
      <div data-list>${skeletonList(3)}</div>
    </div>
  `;

  container.querySelectorAll('[data-go]').forEach((button) => {
    button.addEventListener('click', () => navigate(button.dataset.go));
  });

  const listNode = container.querySelector('[data-list]');

  function card(ride, bookings) {
    const mine = bookings.filter((booking) => booking.ride_id === ride.id);
    const accepted = mine.filter((booking) => booking.status === 'accepted');
    const earned = accepted.reduce((sum, booking) => sum + Number(booking.fare || 0), 0);
    return `
      <article class="card" style="margin-bottom:var(--space-3)">
        <div class="row-tight" style="justify-content:space-between">
          <div class="row-tight">
            ${icon(vehicleIconName(ride.vehicle_type), 18)}
            <strong>${escapeHtml(ride.origin)} → ${escapeHtml(ride.destination)}</strong>
          </div>
          <span class="badge ${statusBadge(ride.status)}">${escapeHtml(ride.status)}</span>
        </div>
        <div class="ride-meta" style="margin-top:var(--space-3)">
          <span>${icon('clock', 13)} ${escapeHtml(timeLabel(ride.departure_time))}</span>
          <span>${icon('route', 13)} ${km(ride.total_distance_m)}</span>
          <span>${formatCapacity(ride.seats_available, ride.seats_total, ride.vehicle_type)}</span>
          <span>${icon('ticket', 13)} ${mine.length} request${mine.length === 1 ? '' : 's'}</span>
          <span>${icon('wallet', 13)} <strong>${rupees(earned)}</strong> shared</span>
        </div>
        ${ride.notes ? `<p class="xsmall muted" style="margin:var(--space-3) 0 0">${escapeHtml(ride.notes)}</p>` : ''}
      </article>
    `;
  }

  (async () => {
    try {
      const [rides, bookings] = await Promise.all([
        api.ridesByRider(user.id),
        api.riderBookings(user.id),
      ]);
      listNode.innerHTML = rides.rides.length
        ? `<div class="stagger">${rides.rides.map((ride) => card(ride, bookings.bookings)).join('')}</div>`
        : emptyState(
            'route',
            'No trips published yet',
            'Publish the journey you are already making and passengers on that corridor can book a seat.',
            '<button class="btn btn-primary" data-go="/rider">Open rider portal</button>'
          );
      listNode.querySelectorAll('[data-go]').forEach((button) => {
        button.addEventListener('click', () => navigate(button.dataset.go));
      });
    } catch (error) {
      listNode.innerHTML = emptyState('alert', 'Could not load trips', error.message);
    }
  })();
}
