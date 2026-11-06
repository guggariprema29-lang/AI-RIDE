import { store } from '../store.js';
import { api } from '../api.js';
import { icon } from '../icons.js';
import { el, escapeHtml, toast } from '../ui.js';
import { placeInput } from '../components/place-input.js';
import { showCostBreakdownModal } from '../components/cost-modal.js';

export default async function parcelView(container) {
  const user = store.user;

  container.innerHTML = `
    <div class="container page">
      <div class="page-header row-tight" style="justify-content:space-between">
        <div>
          <h1 class="page-title row-tight" style="gap:var(--space-2)">
            ${icon('package', 28)}
            <span>Parcel Sharing</span>
          </h1>
          <p class="muted small" style="margin:2px 0 0">Send packages ≤5 kg with travelers already heading your way. Cost-share only.</p>
        </div>
      </div>

      <div class="segmented" style="margin-bottom:var(--space-6)">
        <button data-tab="send" aria-pressed="true">${icon('package', 18)} Send a Parcel</button>
        <button data-tab="sent" aria-pressed="false">${icon('ticket', 18)} My Sent Parcels</button>
        <button data-tab="deliver" aria-pressed="false">${icon('car', 18)} Deliver Parcels (Rider)</button>
      </div>

      <div data-tab-content="send" class="tab-pane"></div>
      <div data-tab-content="sent" class="tab-pane" style="display:none"></div>
      <div data-tab-content="deliver" class="tab-pane" style="display:none"></div>
    </div>
  `;

  const tabs = container.querySelectorAll('.segmented button');
  const panes = container.querySelectorAll('.tab-pane');

  function switchTab(targetName) {
    tabs.forEach((tab) => {
      const active = tab.dataset.tab === targetName;
      tab.setAttribute('aria-pressed', active ? 'true' : 'false');
    });
    panes.forEach((pane) => {
      pane.style.display = pane.dataset.tabContent === targetName ? 'block' : 'none';
    });

    if (targetName === 'sent') renderSentParcels(container.querySelector('[data-tab-content="sent"]'));
    if (targetName === 'deliver') renderDeliverParcels(container.querySelector('[data-tab-content="deliver"]'));
  }

  tabs.forEach((tab) => {
    tab.addEventListener('click', () => switchTab(tab.dataset.tab));
  });

  renderSendForm(container.querySelector('[data-tab-content="send"]'), {
    onCreated: () => switchTab('sent'),
  });
}

function renderSendForm(parent, { onCreated }) {
  let pickupPlace = null;
  let dropoffPlace = null;

  parent.innerHTML = `
    <div class="grid grid-2" style="gap:var(--space-6);align-items:start">
      <div class="card stack">
        <h3 style="margin:0 0 var(--space-3)">Post a Parcel Request</h3>

        <form data-parcel-form class="stack">
          <div>
            <label class="form-label">Parcel Title / Items</label>
            <input type="text" name="title" class="input" placeholder="e.g. Laptop Charger & Key Set" required />
          </div>

          <div class="grid grid-2" style="gap:var(--space-3)">
            <div>
              <label class="form-label">Category</label>
              <select name="category" class="input">
                <option value="documents">📄 Documents / Papers</option>
                <option value="clothes">👕 Clothes & Accessories</option>
                <option value="electronics">💻 Electronics & Accessories</option>
                <option value="gift">🎁 Gift / Small Package</option>
                <option value="food">🍱 Home Food / Snacks</option>
                <option value="medicine">💊 Medicine / Health</option>
                <option value="personal-care">🧴 Personal Care</option>
                <option value="books">📚 Books / Stationery</option>
                <option value="other">📦 Other Small Item</option>
              </select>
            </div>
            <div>
              <label class="form-label">Weight (Max 5.0 kg)</label>
              <div class="row-tight" style="gap:var(--space-2)">
                <input type="range" name="weight_kg" min="0.5" max="5.0" step="0.5" value="1.0" class="input" style="flex:1;padding:0" />
                <span data-weight-val style="font-weight:bold;min-width:48px">1.0 kg</span>
              </div>
            </div>
          </div>

          <div class="grid grid-2" style="gap:var(--space-3)">
            <div data-pickup-slot></div>
            <div data-dropoff-slot></div>
          </div>

          <div class="grid grid-2" style="gap:var(--space-3)">
            <div>
              <label class="form-label">Receiver Name</label>
              <input type="text" name="receiver_name" class="input" placeholder="Name of person receiving" required />
            </div>
            <div>
              <label class="form-label">Receiver Phone</label>
              <input type="tel" name="receiver_phone" class="input" placeholder="+91 9876543210" required />
            </div>
          </div>

          <div>
            <label class="form-label">Delivery Notes for Rider (Optional)</label>
            <input type="text" name="notes" class="input" placeholder="e.g. Handle with care, fragile glass" />
          </div>

          <div>
            <label class="form-label">Fare Offer (₹)</label>
            <div class="row-tight" style="gap:var(--space-2)">
              <input type="number" name="fare" class="input" value="60" min="30" step="5" required />
              <span class="xsmall muted">Held in Escrow until delivery</span>
            </div>
          </div>

          <div style="margin-bottom:var(--space-4)">
            <label class="row-tight" style="gap:var(--space-2);cursor:pointer;background:var(--color-surface-dim);padding:var(--space-3);border-radius:var(--radius-md);border:1px dashed var(--color-border)">
              <input type="checkbox" name="women_only" style="width:18px;height:18px;cursor:pointer" />
              <span>🌸 <strong>Women-Only Delivery</strong> (Restricted to female riders)</span>
            </label>
          </div>

          <button type="submit" class="btn btn-primary btn-block btn-lg" data-submit-btn>
            ${icon('package', 20)} Publish Parcel Request
          </button>
        </form>
      </div>

      <div class="stack">
        <div class="card" style="background:var(--color-surface-dim)">
          <h4 style="margin:0 0 var(--space-2)">🛡️ Safety & Handoff Guidelines</h4>
          <ul class="stack small muted" style="padding-left:var(--space-4);margin:0">
            <li><strong>Weight Cap:</strong> Maximum weight limit is <strong>5.0 kg</strong>. Heavy cargo is prohibited.</li>
            <li><strong>Allowed Items:</strong> Documents, clothing, gadgets, books, medicine, gifts. No hazardous materials.</li>
            <li><strong>Dual OTP Safety:</strong>
              <ul style="padding-left:var(--space-3);margin-top:4px">
                <li>You receive a <strong>Pickup OTP</strong> to give the rider at pickup.</li>
                <li>The receiver gets a <strong>Delivery OTP</strong> to give the rider at dropoff.</li>
              </ul>
            </li>
            <li><strong>Escrow Guarantee:</strong> Fare is held in escrow and released to the rider's wallet only after Receiver's Delivery OTP is verified.</li>
          </ul>
        </div>
      </div>
    </div>
  `;

  const weightInput = parent.querySelector('input[name="weight_kg"]');
  const weightVal = parent.querySelector('[data-weight-val]');
  weightInput.addEventListener('input', (e) => {
    weightVal.textContent = `${parseFloat(e.target.value).toFixed(1)} kg`;
  });

  const pickupSlot = parent.querySelector('[data-pickup-slot]');
  const dropoffSlot = parent.querySelector('[data-dropoff-slot]');

  const pickupField = placeInput({
    id: 'parcel-pickup',
    label: 'Pickup Location',
    placeholder: 'Enter pickup address',
    allowLocate: true,
    onChange: (place) => { pickupPlace = place; },
  });

  const dropoffField = placeInput({
    id: 'parcel-dropoff',
    label: 'Dropoff Location',
    placeholder: 'Enter dropoff address',
    onChange: (place) => { dropoffPlace = place; },
  });

  pickupSlot.append(pickupField.node);
  dropoffSlot.append(dropoffField.node);

  const form = parent.querySelector('[data-parcel-form]');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const pVal = pickupField.value || pickupPlace;
    const dVal = dropoffField.value || dropoffPlace;

    if (!pVal || !dVal) {
      if (!pVal) pickupField.setError('Pick a pickup location from suggestions');
      if (!dVal) dropoffField.setError('Pick a dropoff location from suggestions');
      toast('Please select valid pickup and dropoff locations from suggestions.', 'error');
      return;
    }

    const formData = new FormData(form);
    const payload = {
      sender_id: store.user.id,
      title: formData.get('title').trim(),
      category: formData.get('category'),
      weight_kg: parseFloat(formData.get('weight_kg')),
      pickup: pVal.short || pVal.label,
      dropoff: dVal.short || dVal.label,
      pickup_lat: pVal.lat,
      pickup_lng: pVal.lng,
      drop_lat: dVal.lat,
      drop_lng: dVal.lng,
      receiver_name: formData.get('receiver_name').trim(),
      receiver_phone: formData.get('receiver_phone').trim(),
      notes: formData.get('notes')?.trim() || '',
      fare: parseFloat(formData.get('fare')),
      women_only: formData.get('women_only') === 'on',
    };

    const submitBtn = form.querySelector('[data-submit-btn]');
    submitBtn.disabled = true;
    submitBtn.textContent = 'Posting parcel...';

    try {
      await api.createParcel(payload);
      toast('Parcel request posted! Escrow funds held.', 'success');
      onCreated();
    } catch (err) {
      toast(err.message || 'Failed to post parcel request', 'error');
    } finally {
      submitBtn.disabled = false;
      submitBtn.innerHTML = `${icon('package', 20)} Publish Parcel Request`;
    }
  });
}

async function renderSentParcels(parent) {
  parent.innerHTML = `<div class="muted small text-center" style="padding:var(--space-6)">Loading your parcel requests...</div>`;
  try {
    const res = await api.senderParcels(store.user.id);
    const parcels = res?.parcels || [];

    if (!parcels.length) {
      parent.innerHTML = `
        <div class="empty-state">
          ${icon('package', 36)}
          <h3>No parcel requests yet</h3>
          <p class="small muted">Post a parcel delivery request to send items along existing traveler routes.</p>
        </div>
      `;
      return;
    }

    parent.innerHTML = `
      <div class="stack" style="gap:var(--space-4)">
        ${parcels.map((p) => `
          <div class="card stack" data-parcel-card="${p.id}">
            <div class="row-tight" style="justify-content:space-between;flex-wrap:wrap">
              <div class="row-tight" style="gap:var(--space-2)">
                ${icon('package', 20)}
                <strong style="font-size:var(--text-md)">${escapeHtml(p.title)}</strong>
                <span class="badge category-${p.category}">${escapeHtml(p.category)}</span>
                <span class="badge-id xsmall">${p.weight_kg} kg</span>
                ${p.women_only ? `<span class="badge badge-women-only">🌸 Women-Only</span>` : ''}
              </div>
              <span class="badge ${p.status === 'delivered' ? 'badge-success' : p.status === 'picked_up' ? 'badge-primary' : p.status === 'accepted' ? 'badge-warning' : 'badge-neutral'}">
                ${p.status.toUpperCase()}
              </span>
            </div>

            <div class="grid grid-2 small" style="gap:var(--space-2)">
              <div><strong>Pickup:</strong> ${escapeHtml(p.pickup)}</div>
              <div><strong>Dropoff:</strong> ${escapeHtml(p.dropoff)}</div>
              <div><strong>Receiver:</strong> ${escapeHtml(p.receiver_name)} (${escapeHtml(p.receiver_phone)})</div>
              <div><strong>Fare Offer:</strong> <span style="color:var(--color-success);font-weight:bold">₹${p.fare}</span> (Held in Escrow)</div>
            </div>

            ${p.status !== 'delivered' && p.status !== 'cancelled' ? `
              <div class="grid grid-2" style="gap:var(--space-3)">
                ${p.pickup_otp ? `
                  <div class="card" style="background:var(--color-surface-dim);border:1px dashed var(--color-accent);padding:var(--space-3)">
                    <div class="row-tight" style="justify-content:space-between">
                      <div>
                        <strong style="font-size:var(--text-xs);color:var(--color-accent)">SENDER PICKUP OTP</strong>
                        <div class="xsmall muted">Give to rider at pickup</div>
                      </div>
                      <div class="otp-digits" style="font-size:var(--text-lg);font-weight:bold;letter-spacing:4px;color:var(--color-accent)">
                        ${p.pickup_otp}
                      </div>
                    </div>
                  </div>
                ` : ''}

                ${p.delivery_otp ? `
                  <div class="card" style="background:var(--color-surface-dim);border:1px dashed var(--color-success);padding:var(--space-3)">
                    <div class="row-tight" style="justify-content:space-between">
                      <div>
                        <strong style="font-size:var(--text-xs);color:var(--color-success)">RECEIVER DELIVERY OTP</strong>
                        <div class="xsmall muted">Receiver gives to rider at dropoff</div>
                      </div>
                      <div class="otp-digits" style="font-size:var(--text-lg);font-weight:bold;letter-spacing:4px;color:var(--color-success)">
                        ${p.delivery_otp}
                      </div>
                    </div>
                  </div>
                ` : ''}
              </div>
            ` : ''}

            ${p.rider_name ? `
              <div class="row-tight small muted" style="gap:var(--space-3);background:var(--color-muted);padding:var(--space-2);border-radius:var(--radius-sm)">
                <span><strong>Rider:</strong> ${escapeHtml(p.rider_name)} (${escapeHtml(p.rider_public_id)})</span>
                <span><strong>Phone:</strong> ${escapeHtml(p.rider_phone || 'N/A')}</span>
                <span><strong>Trust Score:</strong> ${p.rider_trust_score}/100</span>
              </div>
            ` : ''}

            ${p.status === 'pending' ? `
              <div class="row-tight" style="justify-content:flex-end">
                <button class="btn btn-sm btn-ghost danger" data-cancel-parcel="${p.id}">
                  ${icon('x', 14)} Cancel Parcel Request
                </button>
              </div>
            ` : ''}
          </div>
        `).join('')}
      </div>
    `;

    parent.querySelectorAll('[data-cancel-parcel]').forEach((btn) => {
      btn.addEventListener('click', async (e) => {
        const id = Number(e.currentTarget.dataset.cancelParcel);
        if (confirm('Cancel parcel request and refund escrow fare?')) {
          try {
            await api.cancelParcel(id, store.user.id);
            toast('Parcel request cancelled and escrow refunded!', 'info');
            renderSentParcels(parent);
          } catch (err) {
            toast(err.message || 'Failed to cancel parcel', 'error');
          }
        }
      });
    });

  } catch (err) {
    parent.innerHTML = `<div class="muted small text-center" style="padding:var(--space-4);color:var(--color-danger)">Failed to load sent parcels.</div>`;
  }
}

async function renderDeliverParcels(parent) {
  parent.innerHTML = `<div class="muted small text-center" style="padding:var(--space-6)">Loading published rides...</div>`;
  try {
    const res = await api.ridesByRider(store.user.id);
    const rides = (res?.rides || []).filter((r) => r.status === 'available' || r.status === 'started');

    if (!rides.length) {
      parent.innerHTML = `
        <div class="empty-state">
          ${icon('car', 36)}
          <h3>No active published ride</h3>
          <p class="small muted">Publish a ride first in the Rider Portal to view and accept matching parcel delivery jobs along your route.</p>
          <a class="btn btn-primary btn-sm" href="#/rider">Go to Rider Portal</a>
        </div>
      `;
      return;
    }

    const activeRide = rides[0];
    const nearbyRes = await api.nearbyParcels(activeRide.id);
    const jobs = nearbyRes?.parcels || [];

    const myJobsRes = await api.riderParcels(store.user.id);
    const myActiveJobs = (myJobsRes?.parcels || []).filter((p) => p.status === 'accepted' || p.status === 'picked_up');

    parent.innerHTML = `
      <div class="stack" style="gap:var(--space-5)">
        <div class="card row-tight" style="justify-content:space-between;background:var(--color-surface-dim)">
          <div>
            <strong>Active Published Ride #${activeRide.id}</strong>
            <div class="xsmall muted">${escapeHtml(activeRide.origin)} ➔ ${escapeHtml(activeRide.destination)}</div>
          </div>
          <span class="badge badge-success">${activeRide.status.toUpperCase()}</span>
        </div>

        ${myActiveJobs.length ? `
          <div class="card stack">
            <h3 style="margin:0 0 var(--space-2)">🚚 My Active Parcel Delivery Jobs</h3>
            <div class="stack" style="gap:var(--space-3)">
              ${myActiveJobs.map((job) => `
                <div class="card stack" style="border:1px solid var(--color-accent-soft)">
                  <div class="row-tight" style="justify-content:space-between">
                    <strong>${escapeHtml(job.title)} (${job.weight_kg} kg)</strong>
                    <span class="badge ${job.status === 'picked_up' ? 'badge-primary' : 'badge-warning'}">${job.status.toUpperCase()}</span>
                  </div>
                  <div class="small">
                    <div><strong>Pickup:</strong> ${escapeHtml(job.pickup)} (Sender: ${escapeHtml(job.sender_name)})</div>
                    <div><strong>Dropoff:</strong> ${escapeHtml(job.dropoff)} (Receiver: ${escapeHtml(job.receiver_name)} - ${escapeHtml(job.receiver_phone)})</div>
                    <div><strong>Payout:</strong> <span style="color:var(--color-success);font-weight:bold">₹${job.fare}</span></div>
                  </div>

                  ${job.status === 'accepted' ? `
                    <form data-verify-pickup-form="${job.id}" class="row-tight" style="gap:var(--space-2);margin-top:var(--space-2)">
                      <input type="text" name="otp" class="input" placeholder="Enter Sender Pickup OTP" maxlength="4" style="max-width:180px;letter-spacing:2px" required />
                      <button type="submit" class="btn btn-sm btn-primary">${icon('check', 14)} Confirm Pickup</button>
                    </form>
                  ` : ''}

                  ${job.status === 'picked_up' ? `
                    <form data-verify-delivery-form="${job.id}" class="row-tight" style="gap:var(--space-2);margin-top:var(--space-2)">
                      <input type="text" name="otp" class="input" placeholder="Enter Receiver Delivery OTP" maxlength="4" style="max-width:180px;letter-spacing:2px" required />
                      <button type="submit" class="btn btn-sm btn-success">${icon('check', 14)} Complete & Collect Payout</button>
                    </form>
                  ` : ''}
                </div>
              `).join('')}
            </div>
          </div>
        ` : ''}

        <div class="card stack">
          <h3 style="margin:0 0 var(--space-2)">📦 Available Parcel Jobs on Your Route</h3>
          ${!jobs.length ? `
            <p class="small muted" style="margin:0">No matching parcel requests along your route right now.</p>
          ` : `
            <div class="stack" style="gap:var(--space-3)">
              ${jobs.map((p) => `
                <div class="card stack">
                  <div class="row-tight" style="justify-content:space-between">
                    <div class="row-tight" style="gap:var(--space-2)">
                      ${icon('package', 18)}
                      <strong>${escapeHtml(p.title)}</strong>
                      <span class="badge category-${p.category}">${escapeHtml(p.category)}</span>
                      <span class="badge-id xsmall">${p.weight_kg} kg</span>
                      ${p.women_only ? `<span class="badge badge-women-only">🌸 Women-Only</span>` : ''}
                    </div>
                    <span class="badge badge-success">${p.match_percentage}% Route Overlap</span>
                  </div>

                  <div class="grid grid-2 small" style="gap:var(--space-2)">
                    <div><strong>Pickup:</strong> ${escapeHtml(p.pickup)}</div>
                    <div><strong>Dropoff:</strong> ${escapeHtml(p.dropoff)}</div>
                    <div><strong>Detour:</strong> ${Math.round(p.detour_m || 0)}m</div>
                    <div><strong>Payout:</strong> <span style="color:var(--color-success);font-weight:bold;font-size:var(--text-md)">₹${p.fare}</span></div>
                  </div>

                  <div class="row-tight" style="justify-content:space-between">
                    <button class="btn btn-xs btn-ghost" data-view-parcel-receipt="${p.id}" style="color:var(--color-accent)">
                      ${icon('file-text', 12)} 📊 View Fuel & Cost Receipt
                    </button>
                    <button class="btn btn-primary btn-sm" data-accept-parcel="${p.id}">
                      ${icon('check', 14)} Accept Delivery Job (Earn ₹${p.fare})
                    </button>
                  </div>
                </div>
              `).join('')}
            </div>
          `}
        </div>
      </div>
    `;

    parent.querySelectorAll('[data-view-parcel-receipt]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        const id = Number(e.currentTarget.dataset.viewParcelReceipt);
        const job = jobs.find((j) => Number(j.id) === id);
        showCostBreakdownModal({
          distance_m: job?.distance_m || 8000.0,
          vehicle_type: 'car',
          is_parcel: true,
          actual_fare: job?.fare,
          title: `Courier Receipt (${job?.title || 'Parcel'})`
        });
      });
    });

    parent.querySelectorAll('[data-accept-parcel]').forEach((btn) => {
      btn.addEventListener('click', async (e) => {
        const id = Number(e.currentTarget.dataset.acceptParcel);
        try {
          await api.acceptParcel(id, store.user.id, activeRide.id);
          toast('Parcel delivery job accepted!', 'success');
          renderDeliverParcels(parent);
        } catch (err) {
          toast(err.message || 'Failed to accept job', 'error');
        }
      });
    });

    parent.querySelectorAll('[data-verify-pickup-form]').forEach((form) => {
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const id = Number(form.dataset.verifyPickupForm);
        const otp = new FormData(form).get('otp').trim();
        try {
          await api.verifyParcelPickup(id, otp);
          toast('Pickup verified! Package marked picked up.', 'success');
          renderDeliverParcels(parent);
        } catch (err) {
          toast(err.message || 'Incorrect Pickup OTP', 'error');
        }
      });
    });

    parent.querySelectorAll('[data-verify-delivery-form]').forEach((form) => {
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const id = Number(form.dataset.verifyDeliveryForm);
        const otp = new FormData(form).get('otp').trim();
        try {
          await api.verifyParcelDelivery(id, otp);
          toast('Delivery verified! Payout released to your wallet.', 'success');
          renderDeliverParcels(parent);
        } catch (err) {
          toast(err.message || 'Incorrect Delivery OTP', 'error');
        }
      });
    });

  } catch (err) {
    parent.innerHTML = `<div class="muted small text-center" style="padding:var(--space-4);color:var(--color-danger)">Failed to load parcel delivery jobs.</div>`;
  }
}
