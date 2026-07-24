// Live trip screen — one page shared by both sides, like a food-delivery tracker.
// Map on top, status rail, and a contextual action sheet that changes with the
// stage of the trip.

import { api } from '../api.js';
import { icon, vehicleIconName } from '../icons.js';
import { store } from '../store.js';
import { navigate } from '../router.js';
import { createMap, TripMap } from '../map.js';
import { escapeHtml, initials, km, rupees, setBusy, timeLabel, toast } from '../ui.js';

const STAGES = [
  { key: 'pending', label: 'Requested' },
  { key: 'accepted', label: 'Accepted' },
  { key: 'ongoing', label: 'On trip' },
  { key: 'completed', label: 'Dropped' },
  { key: 'paid', label: 'Paid' },
];

const STAGE_ORDER = STAGES.map((stage) => stage.key);

export default function tripView(container, query) {
  const user = store.user;
  const bookingId = Number(query.id);
  let booking = null;
  let timer = null;
  let map = null;
  let tripMap = null;

  if (!bookingId) {
    container.innerHTML = `<div class="container page"><p>No trip selected.</p></div>`;
    return;
  }

  container.innerHTML = `
    <div class="trip-screen">
      <div class="trip-map-wrap">
        <div id="trip-map" class="trip-map" role="img" aria-label="Live trip map"></div>
        <button class="icon-btn trip-back" data-back aria-label="Back">${icon('arrowRight', 18, 'rotate-180')}</button>
        <div class="trip-eta glass" data-eta></div>
      </div>

      <div class="trip-sheet">
        <div class="trip-sheet-inner container">
          <ol class="trip-rail" data-rail></ol>
          <div data-body>
            <div class="skeleton" style="height:150px"></div>
          </div>
        </div>
      </div>
    </div>
  `;

  container.querySelector('[data-back]').addEventListener('click', () => {
    navigate(isRider() ? '/rider' : '/bookings');
  });

  map = createMap(container.querySelector('#trip-map'));
  // Keep the top-left corner clear for the back button.
  map.zoomControl.setPosition('bottomright');
  tripMap = new TripMap(map);

  const railNode = container.querySelector('[data-rail]');
  const bodyNode = container.querySelector('[data-body]');
  const etaNode = container.querySelector('[data-eta]');

  const isRider = () => booking && booking.rider_id === user.id;

  /** Straight-line pickup→drop, in metres — the booking row stores no distance. */
  function legDistance() {
    const toRad = (deg) => (deg * Math.PI) / 180;
    const [lat1, lng1] = [Number(booking.pickup_lat), Number(booking.pickup_lng)];
    const [lat2, lng2] = [Number(booking.drop_lat), Number(booking.drop_lng)];
    if (![lat1, lng1, lat2, lng2].every(Number.isFinite)) return 0;
    const dLat = toRad(lat2 - lat1);
    const dLng = toRad(lng2 - lng1);
    const a = Math.sin(dLat / 2) ** 2
      + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
    return 6371000 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  function renderRail() {
    const current = STAGE_ORDER.indexOf(booking.status);
    const closed = booking.status === 'closed';
    railNode.innerHTML = STAGES.map((stage, index) => {
      const done = closed || (current >= 0 && index < current);
      const active = !closed && index === current;
      return `
        <li class="${done ? 'is-done' : ''} ${active ? 'is-active' : ''}">
          <span class="trip-rail-dot">${done ? icon('check', 12) : ''}</span>
          <span>${stage.label}</span>
        </li>
      `;
    }).join('');
  }

  function counterparty() {
    return isRider()
      ? { name: booking.passenger_name, id: booking.passenger_public_id, phone: booking.passenger_phone, role: 'Passenger', trust: booking.passenger_trust_score }
      : { name: booking.rider_name, id: booking.rider_public_id, phone: booking.rider_phone, role: 'Rider', trust: booking.rider_trust_score };
  }

  function personCard() {
    const person = counterparty();
    return `
      <div class="trip-person">
        <span class="avatar">${escapeHtml(initials(person.name))}</span>
        <div style="flex:1;min-width:0">
          <strong>${escapeHtml(person.name || '—')}</strong>
          <div class="xsmall muted">
            <span class="badge-id">${escapeHtml(person.id || '')}</span> · ${person.role}
            · ${icon('star', 11)} trust ${person.trust ?? '—'}
          </div>
        </div>
        ${person.phone ? `<a class="icon-btn" href="tel:${escapeHtml(person.phone)}" aria-label="Call ${escapeHtml(person.name)}">${icon('phone', 18)}</a>` : ''}
      </div>
    `;
  }

  function tripFacts() {
    return `
      <div class="trip-facts">
        <div><span class="label">Fare</span><strong>${rupees(booking.fare)}</strong></div>
        <div><span class="label">Seats</span><strong>${booking.seats}</strong></div>
        <div><span class="label">Vehicle</span><strong>${escapeHtml(booking.vehicle_type || '—')}${booking.vehicle_number ? ` · ${escapeHtml(booking.vehicle_number)}` : ''}</strong></div>
        <div><span class="label">Departs</span><strong>${escapeHtml(timeLabel(booking.ride_departure_time))}</strong></div>
      </div>
    `;
  }

  function routeCard() {
    return `
      <div class="route-line trip-route">
        <div class="route-step"><span class="dot"></span><span>${escapeHtml(booking.pickup)}</span></div>
        <div class="route-step to"><span class="dot"></span><span>${escapeHtml(booking.dropoff)}</span></div>
      </div>
    `;
  }

  function otpBlock() {
    return `
      <div class="otp-card">
        <div>
          <span class="label">Start code</span>
          <p class="xsmall muted" style="margin:0">Read this out to your rider at pickup.</p>
        </div>
        <div class="otp-digits">
          ${String(booking.otp || '----').split('').map((d) => `<span>${escapeHtml(d)}</span>`).join('')}
        </div>
      </div>
    `;
  }

  function ratingForm(rater) {
    const already = rater === 'passenger' ? booking.rider_rating : booking.passenger_rating;
    const person = counterparty();
    if (already) {
      return `
        <div class="trip-done">
          ${icon('check', 20)}
          <div>
            <strong>You rated ${escapeHtml(person.name)} ${already}/5</strong>
            <p class="xsmall muted" style="margin:0">Thanks — it feeds their trust score.</p>
          </div>
        </div>
      `;
    }
    return `
      <form data-rate-form>
        <h3 style="margin:0 0 var(--space-2)">Rate ${escapeHtml(person.name)}</h3>
        <p class="xsmall muted" style="margin:0 0 var(--space-3)">Your score changes their trust rating.</p>
        <div class="star-row" role="radiogroup" aria-label="Rating out of 5">
          ${[1, 2, 3, 4, 5].map((n) => `
            <button type="button" class="star" data-star="${n}" role="radio"
                    aria-checked="false" aria-label="${n} star${n > 1 ? 's' : ''}">${icon('star', 24)}</button>
          `).join('')}
        </div>
        <div class="field" style="margin-top:var(--space-3)">
          <label for="review">Leave a note <span class="muted">(optional)</span></label>
          <textarea id="review" placeholder="Was pickup on time? Was the trip comfortable?"></textarea>
        </div>
        <button class="btn btn-primary btn-block btn-lg" type="submit">${icon('check', 18)} Submit rating</button>
      </form>
    `;
  }

  function actionSheet() {
    const rider = isRider();
    const status = booking.status;

    if (status === 'rejected' || status === 'cancelled') {
      return `
        <div class="trip-done">
          ${icon('alert', 20)}
          <div>
            <strong>This trip was ${escapeHtml(status)}.</strong>
            <p class="xsmall muted" style="margin:0">The seat has been released back to the ride.</p>
          </div>
        </div>
        <button class="btn btn-block" data-go="${rider ? '/rider' : '/passenger'}">Find another ${rider ? 'request' : 'ride'}</button>
      `;
    }

    if (rider) {
      if (status === 'pending') {
        return `
          <p class="small" style="margin:0 0 var(--space-3)">${escapeHtml(booking.passenger_name)} wants a seat on your trip.</p>
          <div class="trip-actions">
            <button class="btn btn-primary" data-status="accepted">${icon('check', 16)} Accept request</button>
            <button class="btn btn-danger" data-status="rejected">${icon('x', 16)} Decline</button>
          </div>
        `;
      }
      if (status === 'accepted') {
        return `
          <p class="small" style="margin:0 0 var(--space-3)">
            Head to the pickup. Ask ${escapeHtml(booking.passenger_name.split(' ')[0])} for their 4-digit start code.
          </p>
          <form data-otp-form>
            <div class="field">
              <label for="otp-input">Start code</label>
              <input id="otp-input" inputmode="numeric" maxlength="4" autocomplete="off"
                     class="otp-input" placeholder="0000" required>
              <span class="helper">The passenger can read it from their screen.</span>
            </div>
            <button class="btn btn-primary btn-block btn-lg" type="submit">
              ${icon('navigation', 18)} Start ride
            </button>
          </form>
        `;
      }
      if (status === 'ongoing') {
        return `
          <p class="small" style="margin:0 0 var(--space-3)">Trip running. End it once you drop them at ${escapeHtml(booking.dropoff)}.</p>
          <div class="trip-actions">
            <button class="btn" data-locate>${icon('crosshair', 16)} Update my position</button>
            <button class="btn btn-primary" data-complete>${icon('check', 16)} End ride</button>
          </div>
        `;
      }
      if (status === 'completed') {
        return `
          <div class="trip-done">
            ${icon('clock', 20)}
            <div>
              <strong>Waiting for payment</strong>
              <p class="xsmall muted" style="margin:0">${escapeHtml(booking.passenger_name)} owes ${rupees(booking.fare)} for the shared distance.</p>
            </div>
          </div>
        `;
      }
      return ratingForm('rider');
    }

    // Passenger side
    if (status === 'pending') {
      return `
        <p class="small" style="margin:0 0 var(--space-3)">
          Waiting for ${escapeHtml(booking.rider_name.split(' ')[0])} to accept. You can cancel free until then.
        </p>
        ${otpBlock()}
        <button class="btn btn-danger btn-block" data-status="cancelled" style="margin-top:var(--space-3)">
          ${icon('x', 16)} Cancel request
        </button>
      `;
    }
    if (status === 'accepted') {
      return `
        <p class="small" style="margin:0 0 var(--space-3)">
          Accepted. Meet at <strong>${escapeHtml(booking.pickup)}</strong> and read your code to the rider.
        </p>
        ${otpBlock()}
        <button class="btn btn-danger btn-block" data-status="cancelled" style="margin-top:var(--space-3)">
          ${icon('x', 16)} Cancel
        </button>
      `;
    }
    if (status === 'ongoing') {
      return `
        <div class="trip-done">
          ${icon('navigation', 20)}
          <div>
            <strong>On the way to ${escapeHtml(booking.dropoff)}</strong>
            <p class="xsmall muted" style="margin:0">The map updates as your rider moves.</p>
          </div>
        </div>
      `;
    }
    if (status === 'completed') {
      return `
        <p class="small" style="margin:0 0 var(--space-3)">You have arrived. Settle the cost share to close the trip.</p>
        <div class="pay-row">
          <div>
            <span class="label">Amount</span>
            <div class="pay-amount">${rupees(booking.fare)}</div>
          </div>
          <button class="btn btn-primary btn-lg" data-pay>${icon('wallet', 18)} Pay from wallet</button>
        </div>
        <p class="xsmall muted" style="margin:var(--space-3) 0 0">
          Cost share only — no commission is taken. Top up in <a href="#/profile">your profile</a> if the balance is short.
        </p>
      `;
    }
    return ratingForm('passenger');
  }

  function render() {
    renderRail();
    bodyNode.innerHTML = `
      ${personCard()}
      ${routeCard()}
      ${tripFacts()}
      <div class="trip-action-area">${actionSheet()}</div>
    `;

    etaNode.innerHTML = `
      <span class="badge ${booking.status === 'ongoing' ? 'badge-success' : ''}">
        ${booking.status === 'ongoing' ? '<span class="live-dot"></span> ' : ''}${escapeHtml(booking.status)}
      </span>
      <span class="xsmall">${icon(vehicleIconName(booking.vehicle_type), 13)} ${km(legDistance())}</span>
    `;

    bindActions();
  }

  function bindActions() {
    bodyNode.querySelectorAll('[data-go]').forEach((button) => {
      button.addEventListener('click', () => navigate(button.dataset.go));
    });

    bodyNode.querySelectorAll('[data-status]').forEach((button) => {
      button.addEventListener('click', async () => {
        setBusy(button, true, 'Saving…');
        try {
          await api.updateBookingStatus(booking.id, button.dataset.status);
          toast(`Trip ${button.dataset.status}`, 'success');
          await refresh();
        } catch (error) {
          toast(error.message, 'error');
          setBusy(button, false);
        }
      });
    });

    bodyNode.querySelector('[data-otp-form]')?.addEventListener('submit', async (event) => {
      event.preventDefault();
      const input = bodyNode.querySelector('#otp-input');
      const button = event.currentTarget.querySelector('button[type="submit"]');
      setBusy(button, true, 'Checking…');
      try {
        await api.startBooking(booking.id, input.value.trim());
        toast('Code verified — ride started', 'success');
        await refresh();
      } catch (error) {
        toast(error.message, 'error');
        input.setAttribute('aria-invalid', 'true');
        setBusy(button, false);
      }
    });

    bodyNode.querySelector('[data-complete]')?.addEventListener('click', async (event) => {
      const button = event.currentTarget;
      setBusy(button, true, 'Ending…');
      try {
        await api.completeBooking(booking.id);
        toast('Ride ended', 'success');
        await refresh();
      } catch (error) {
        toast(error.message, 'error');
        setBusy(button, false);
      }
    });

    bodyNode.querySelector('[data-pay]')?.addEventListener('click', async (event) => {
      const button = event.currentTarget;
      setBusy(button, true, 'Paying…');
      try {
        await api.payBooking(booking.id);
        toast('Paid — thanks for sharing the road', 'success');
        await refresh();
      } catch (error) {
        toast(error.message, 'error');
        setBusy(button, false);
      }
    });

    bodyNode.querySelector('[data-locate]')?.addEventListener('click', async (event) => {
      const button = event.currentTarget;
      setBusy(button, true, 'Locating…');
      try {
        const { locateUser } = await import('../map.js');
        const [lat, lng] = await locateUser();
        await api.updateRideLocation(booking.ride_id, lat, lng);
        toast('Position shared', 'success');
        await refresh();
      } catch (error) {
        toast(error.message, 'error');
        setBusy(button, false);
      }
    });

    // Star rating
    let chosen = 0;
    const stars = [...bodyNode.querySelectorAll('[data-star]')];
    const paint = (value) => stars.forEach((star, index) => {
      star.classList.toggle('is-on', index < value);
      star.setAttribute('aria-checked', String(index + 1 === value));
    });
    stars.forEach((star) => {
      star.addEventListener('click', () => { chosen = Number(star.dataset.star); paint(chosen); });
      star.addEventListener('mouseenter', () => paint(Number(star.dataset.star)));
    });
    bodyNode.querySelector('.star-row')?.addEventListener('mouseleave', () => paint(chosen));

    bodyNode.querySelector('[data-rate-form]')?.addEventListener('submit', async (event) => {
      event.preventDefault();
      if (!chosen) { toast('Pick a star rating first', 'error'); return; }
      const button = event.currentTarget.querySelector('button[type="submit"]');
      setBusy(button, true, 'Sending…');
      try {
        await api.rateBooking(booking.id, {
          rater: isRider() ? 'rider' : 'passenger',
          rating: chosen,
          review: bodyNode.querySelector('#review').value.trim() || null,
        });
        toast('Rating saved', 'success');
        await refresh();
      } catch (error) {
        toast(error.message, 'error');
        setBusy(button, false);
      }
    });
  }

  async function refresh(redraw = true) {
    try {
      const fresh = await api.booking(bookingId);
      const changed = !booking || booking.status !== fresh.status;
      booking = fresh;
      if (redraw || changed) {
        tripMap.draw(booking);
      } else {
        tripMap.moveVehicle(Number(booking.current_lat), Number(booking.current_lng));
      }
      render();
    } catch (error) {
      bodyNode.innerHTML = `<p class="small">${escapeHtml(error.message)}</p>`;
    }
  }

  refresh();
  timer = setInterval(() => refresh(false), 8000);

  return {
    destroy() {
      clearInterval(timer);
      tripMap.destroy();
      map.remove();
    },
  };
}
