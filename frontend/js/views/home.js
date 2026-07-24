// Signed-in home — pick a portal, see your ID, trust and activity at a glance.

import { api } from '../api.js';
import { icon } from '../icons.js';
import { store } from '../store.js';
import { navigate } from '../router.js';
import { escapeHtml, km, timeLabel, trustBadge, statusBadge } from '../ui.js';

export default function homeView(container) {
  const user = store.user;
  const trust = trustBadge(user.trust_score);

  container.innerHTML = `
    <div class="container page">
      <div class="page-head">
        <div>
          <h1 style="margin-bottom:var(--space-2)">Hello, ${escapeHtml(user.name?.split(' ')[0] || 'there')}</h1>
          <div class="row-tight">
            <span class="badge badge-id">${escapeHtml(store.publicId)}</span>
            <span class="badge ${trust.className}">${icon('shield', 13)} ${trust.label}</span>
            <span class="badge">${icon('gauge', 13)} Trust ${Number(user.trust_score ?? 50)}/100</span>
          </div>
        </div>
        <button class="btn btn-ghost" data-go="/profile">${icon('user', 16)} My profile</button>
      </div>

      <div class="grid grid-2" style="margin-bottom:var(--space-6)">
        <button class="portal-card" data-go="/rider">
          <span class="portal-icon">${icon('car', 24)}</span>
          <h3>Rider portal</h3>
          <p class="small">Publish the trip you are already making and appear live on the map.</p>
          <span class="row-tight small" style="color:var(--color-accent)">Go available ${icon('arrowRight', 16)}</span>
        </button>
        <button class="portal-card" data-go="/passenger">
          <span class="portal-icon">${icon('users', 24)}</span>
          <h3>Passenger portal</h3>
          <p class="small">Find travellers whose route already covers your pickup and drop.</p>
          <span class="row-tight small" style="color:var(--color-accent)">Find a ride ${icon('arrowRight', 16)}</span>
        </button>
      </div>

      <div class="grid grid-3" style="margin-bottom:var(--space-6)" data-stats>
        <div class="stat"><div class="label">Rides published</div><div class="value">—</div></div>
        <div class="stat"><div class="label">Seats booked by you</div><div class="value">—</div></div>
        <div class="stat"><div class="label">Wallet</div><div class="value">—</div></div>
      </div>

      <div class="grid grid-2">
        <section class="card">
          <div class="card-title">
            <span class="portal-icon">${icon('route', 20)}</span>
            <h3>Your latest rides</h3>
          </div>
          <div data-my-rides class="stack small muted">Loading…</div>
          <button class="btn btn-ghost btn-block" data-go="/trips" style="margin-top:var(--space-4)">
            ${icon('briefcase', 16)} Open my trips
          </button>
        </section>

        <section class="card">
          <div class="card-title">
            <span class="portal-icon">${icon('ticket', 20)}</span>
            <h3>Your latest bookings</h3>
          </div>
          <div data-my-bookings class="stack small muted">Loading…</div>
          <button class="btn btn-ghost btn-block" data-go="/bookings" style="margin-top:var(--space-4)">
            ${icon('ticket', 16)} Open my bookings
          </button>
        </section>
      </div>
    </div>
  `;

  container.querySelectorAll('[data-go]').forEach((button) => {
    button.addEventListener('click', () => navigate(button.dataset.go));
  });

  const statNodes = container.querySelectorAll('[data-stats] .value');
  const ridesNode = container.querySelector('[data-my-rides]');
  const bookingsNode = container.querySelector('[data-my-bookings]');

  (async () => {
    const [ridesResult, bookingsResult, walletResult] = await Promise.allSettled([
      api.ridesByRider(user.id),
      api.passengerBookings(user.id),
      api.wallet(user.id),
    ]);

    const rides = ridesResult.status === 'fulfilled' ? ridesResult.value.rides : [];
    const bookings = bookingsResult.status === 'fulfilled' ? bookingsResult.value.bookings : [];
    const wallet = walletResult.status === 'fulfilled' ? walletResult.value : null;

    statNodes[0].textContent = rides.length;
    statNodes[1].textContent = bookings.reduce((sum, booking) => sum + (booking.seats || 0), 0);
    statNodes[2].textContent = wallet ? `₹${Number(wallet.wallet_balance || 0).toFixed(0)}` : '—';

    ridesNode.innerHTML = rides.length
      ? rides.slice(0, 3).map((ride) => `
          <div class="row-tight" style="justify-content:space-between;gap:var(--space-2)">
            <span>${escapeHtml(ride.origin.split(',')[0])} → ${escapeHtml(ride.destination.split(',')[0])}</span>
            <span class="badge ${statusBadge(ride.status)}">${escapeHtml(ride.status)}</span>
          </div>
          <div class="xsmall muted">${escapeHtml(timeLabel(ride.departure_time))} · ${km(ride.total_distance_m)}</div>
        `).join('')
      : 'No rides published yet.';

    bookingsNode.innerHTML = bookings.length
      ? bookings.slice(0, 3).map((booking) => `
          <div class="row-tight" style="justify-content:space-between;gap:var(--space-2)">
            <span>${escapeHtml(booking.pickup.split(',')[0])} → ${escapeHtml(booking.dropoff.split(',')[0])}</span>
            <span class="badge ${statusBadge(booking.status)}">${escapeHtml(booking.status)}</span>
          </div>
          <div class="xsmall muted">with ${escapeHtml(booking.rider_name)} · ${escapeHtml(booking.rider_public_id || '')}</div>
        `).join('')
      : 'No bookings yet.';
  })();
}
