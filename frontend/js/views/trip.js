// Live trip screen — one page shared by both sides, like a food-delivery tracker.
// Map on top, status rail, and a contextual action sheet that changes with the
// stage of the trip.

import { api, API_BASE_URL } from '../api.js';
import { icon, vehicleIconName } from '../icons.js';
import { store } from '../store.js';
import { navigate } from '../router.js';
import { createMap, TripMap } from '../map.js';
import { escapeHtml, initials, km, rupees, setBusy, timeLabel, toast, openSosEmergencyModal, toggleSirenSound } from '../ui.js';

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
        <button class="btn btn-danger btn-sm" data-trip-sos style="position:absolute;top:var(--space-3);right:var(--space-3);z-index:900;font-weight:bold;box-shadow:0 0 15px rgba(239,68,68,0.5)">
          🚨 RED SOS BUTTON
        </button>
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

  container.querySelector('[data-trip-sos]')?.addEventListener('click', async (event) => {
    const button = event.currentTarget;
    toggleSirenSound(true); // START SIREN SOUND IMMEDIATELY ON CLICK
    setBusy(button, true, 'SOS…');
    try {
      const lat = Number(booking?.current_lat || booking?.pickup_lat || 12.9716);
      const lng = Number(booking?.current_lng || booking?.pickup_lng || 77.5946);
      const res = await api.triggerSos({
        user_id: user.id,
        booking_id: bookingId,
        latitude: lat,
        longitude: lng,
        location_name: `Trip #${bookingId} Live GPS`
      });
      openSosEmergencyModal({ res });
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setBusy(button, false);
    }
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
        <div class="row-tight" style="gap:6px">
          ${person.phone ? `<a class="icon-btn" href="tel:${escapeHtml(person.phone)}" aria-label="Call ${escapeHtml(person.name)}">${icon('phone', 18)}</a>` : ''}
          <button class="btn btn-sm btn-accent" data-open-chat style="gap:4px;font-weight:600">
            ${icon('message-circle', 16)} Live Chat
          </button>
        </div>
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
    const dev = rideData?.route_deviation;
    const deviationBanner = dev && dev.is_deviated ? `
      <div class="${dev.is_critical ? 'off-route-banner-critical' : 'off-route-banner-warning'}" style="margin-bottom:var(--space-4)">
        ${escapeHtml(dev.message || `⚠️ Vehicle off-route by ${dev.deviation_distance_m}m`)}
      </div>
    ` : '';

    bodyNode.innerHTML = `
      ${deviationBanner}
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

    bodyNode.querySelectorAll('[data-open-chat]').forEach((btn) => {
      btn.addEventListener('click', openLiveChatModal);
    });
  }

  let chatModal = null;
  let chatPollTimer = null;

  async function openLiveChatModal() {
    if (chatModal) return;
    const person = counterparty();
    const modalHtml = `
      <div class="modal-backdrop" id="chat-modal-bg" style="display:flex;align-items:center;justify-content:center;z-index:9999;background:rgba(0,0,0,0.65);backdrop-filter:blur(5px);position:fixed;inset:0">
        <div class="modal-card" style="width:92%;max-width:440px;height:530px;display:flex;flex-direction:column;background:var(--color-surface);border:1px solid var(--color-border);border-radius:var(--radius-lg);box-shadow:var(--shadow-xl);padding:0;overflow:hidden">
          
          <!-- Header -->
          <div style="padding:var(--space-3);background:var(--color-surface-2);border-bottom:1px solid var(--color-border);display:flex;align-items:center;justify-content:space-between">
            <div class="row-tight" style="gap:10px">
              <span class="avatar" style="width:34px;height:34px;font-size:12px;background:var(--color-primary);color:#fff">${escapeHtml(initials(person.name))}</span>
              <div>
                <strong style="font-size:14px;display:block">${escapeHtml(person.name)}</strong>
                <span class="xsmall muted" style="display:flex;align-items:center;gap:4px">
                  <span class="live-dot" style="background:#22c55e"></span> Live Chat (${person.role})
                </span>
              </div>
            </div>
            <button class="btn btn-ghost btn-sm" id="close-chat-btn">${icon('x', 18)}</button>
          </div>

          <!-- Quick Chips -->
          <div class="row-tight" style="padding:6px 12px;background:var(--color-surface);border-bottom:1px solid var(--color-border);overflow-x:auto;gap:6px;white-space:nowrap">
            <button class="chip" data-quick-chat="I am at the pickup point 📍">📍 At pickup</button>
            <button class="chip" data-quick-chat="On my way, 5 mins away 🚗">🚗 5 mins away</button>
            <button class="chip" data-quick-chat="Stuck in traffic, slight delay 🚦">🚦 Traffic delay</button>
          </div>

          <!-- Messages Body -->
          <div id="chat-msg-body" style="flex:1;padding:var(--space-3);overflow-y:auto;display:flex;flex-direction:column;gap:10px">
            <div class="muted xsmall text-center" style="margin:auto">Loading conversation history…</div>
          </div>

          <!-- Input Footer -->
          <form id="chat-form" style="padding:var(--space-2) var(--space-3);background:var(--color-surface-2);border-top:1px solid var(--color-border);display:flex;gap:8px">
            <input type="text" id="chat-input" placeholder="Type a message…" style="flex:1;border-radius:var(--radius-full);padding:8px 14px;border:1px solid var(--color-border);background:var(--color-surface);color:var(--color-foreground)" required autocomplete="off">
            <button class="btn btn-primary" type="submit" style="border-radius:var(--radius-full);padding:8px 16px;font-weight:bold">
              ${icon('send', 16)}
            </button>
          </form>

        </div>
      </div>
    `;

    document.body.insertAdjacentHTML('beforeend', modalHtml);
    chatModal = document.getElementById('chat-modal-bg');

    const msgBody = chatModal.querySelector('#chat-msg-body');
    const chatForm = chatModal.querySelector('#chat-form');
    const chatInput = chatModal.querySelector('#chat-input');

    chatModal.querySelector('#close-chat-btn').addEventListener('click', closeLiveChatModal);

    chatModal.querySelectorAll('[data-quick-chat]').forEach((btn) => {
      btn.addEventListener('click', () => {
        chatInput.value = btn.dataset.quickChat;
        chatForm.dispatchEvent(new Event('submit'));
      });
    });

    async function loadMessages() {
      try {
        const res = await api.getChatMessages(booking.id);
        const list = res.messages || [];
        if (!list.length) {
          msgBody.innerHTML = '<div class="muted xsmall text-center" style="margin:auto">No messages yet. Send a quick message to coordinate pickup!</div>';
          return;
        }

        const isAtBottom = msgBody.scrollHeight - msgBody.clientHeight <= msgBody.scrollTop + 60;

        msgBody.innerHTML = list.map((msg) => {
          const isMe = Number(msg.sender_id) === Number(user.id);
          return `
            <div style="display:flex;flex-direction:column;align-items:${isMe ? 'flex-end' : 'flex-start'};max-width:85%;align-self:${isMe ? 'flex-end' : 'flex-start'}">
              <span class="xsmall muted" style="margin-bottom:2px;font-size:10px">${escapeHtml(msg.sender_name)}</span>
              <div style="padding:8px 12px;border-radius:14px;font-size:13px;line-height:1.4;${isMe ? 'background:var(--color-primary);color:#fff;border-bottom-right-radius:2px' : 'background:var(--color-surface-2);color:var(--color-foreground);border:1px solid var(--color-border);border-bottom-left-radius:2px'}">
                ${escapeHtml(msg.message)}
              </div>
            </div>
          `;
        }).join('');

        if (isAtBottom) msgBody.scrollTop = msgBody.scrollHeight;
      } catch (err) {
        console.error('Chat refresh error:', err);
      }
    }

    await loadMessages();
    chatPollTimer = setInterval(loadMessages, 3000);

    // Establish WebSocket Connection for Sub-Millisecond Instant Chat Delivery
    let ws = null;
    try {
      const wsUrl = API_BASE_URL.replace(/^http/, 'ws') + `/ws/${user.id}`;
      ws = new WebSocket(wsUrl);
      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.type === 'chat_message' && Number(data.booking_id) === Number(booking.id)) {
            loadMessages();
          }
        } catch (e) { console.error('WS Parse Error', e); }
      };
    } catch (e) {
      console.log('WS Connection fallback to polling:', e);
    }

    chatForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const text = chatInput.value.trim();
      if (!text) return;
      chatInput.value = '';

      // Try sending via WebSocket first for instant latency
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({
          type: 'chat_message',
          booking_id: booking.id,
          sender_id: user.id,
          sender_name: user.name || 'Commuter',
          message: text
        }));
        setTimeout(loadMessages, 100);
      } else {
        try {
          await api.sendChatMessage(booking.id, {
            sender_id: user.id,
            sender_name: user.name || 'Commuter',
            message: text
          });
          await loadMessages();
        } catch (err) {
          toast(err.message, 'error');
        }
      }
    });

    chatModal._ws = ws;
  }

  function closeLiveChatModal() {
    if (chatPollTimer) clearInterval(chatPollTimer);
    if (chatModal) {
      if (chatModal._ws) {
        try { chatModal._ws.close(); } catch {}
      }
      chatModal.remove();
    }
    chatModal = null;
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
      if (timer) {
        clearInterval(timer);
        timer = null;
      }
      bodyNode.innerHTML = `
        <div class="card" style="max-width:480px;margin:var(--space-6) auto;text-align:center;padding:var(--space-5)">
          <div style="font-size:36px;margin-bottom:var(--space-2)">🎫</div>
          <h3 style="margin-bottom:var(--space-2)">Trip Not Found</h3>
          <p class="small muted" style="margin-bottom:var(--space-4)">
            No active booking found for ID #${escapeHtml(String(bookingId))}. It may have been closed or cancelled.
          </p>
          <button class="btn btn-primary" data-go="/passenger">${icon('search', 16)} Find Rides</button>
        </div>
      `;
      bodyNode.querySelector('[data-go]')?.addEventListener('click', (e) => {
        navigate(e.currentTarget.dataset.go);
      });
    }
  }

  refresh();
  timer = setInterval(() => refresh(false), 8000);

  return {
    destroy() {
      closeLiveChatModal();
      clearInterval(timer);
      tripMap.destroy();
      map.remove();
    },
  };
}
