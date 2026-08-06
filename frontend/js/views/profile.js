// Profile — ride ID, trust breakdown, wallet.

import { api } from '../api.js';
import { icon } from '../icons.js';
import { store } from '../store.js';
import { navigate } from '../router.js';
import { escapeHtml, initials, rupees, setBusy, toast, trustBadge, openSosEmergencyModal, toggleSirenSound } from '../ui.js';

export default function profileView(container) {
  const user = store.user;
  const trust = trustBadge(user.trust_score);

  container.innerHTML = `
    <div class="container page">
      <div class="page-head">
        <h1 style="margin:0">${icon('user', 26)} My profile</h1>
        <button class="btn btn-ghost btn-danger" data-logout>${icon('logout', 16)} Sign out</button>
      </div>

      <div class="grid grid-2">
        <section class="card">
          <div class="row" style="margin-bottom:var(--space-4)">
            <span class="avatar" style="width:56px;height:56px;flex-basis:56px;font-size:var(--text-lg)">
              ${escapeHtml(initials(user.name))}
            </span>
            <div>
              <h3 style="margin:0">${escapeHtml(user.name)}</h3>
              <div class="row-tight" style="margin-top:var(--space-1)">
                <span class="badge badge-id">${escapeHtml(store.publicId)}</span>
                <span class="badge ${trust.className}">${icon('shield', 12)} ${trust.label}</span>
              </div>
            </div>
          </div>

          <div class="stack small">
            <div class="row-tight" style="justify-content:space-between">
              <span class="muted">Email</span><span>${escapeHtml(user.email || '—')}</span>
            </div>
            <div class="row-tight" style="justify-content:space-between">
              <span class="muted">Phone</span><span>${escapeHtml(user.phone || '—')}</span>
            </div>
            <div class="row-tight" style="justify-content:space-between">
              <span class="muted">Gender</span>
              <select data-gender-select class="input" style="max-width:180px;padding:2px 8px;font-size:var(--text-xs)">
                <option value="unspecified" ${user.gender === 'unspecified' ? 'selected' : ''}>Unspecified</option>
                <option value="female" ${user.gender === 'female' ? 'selected' : ''}>Female 👧 (Women Safety)</option>
                <option value="male" ${user.gender === 'male' ? 'selected' : ''}>Male 👨</option>
                <option value="other" ${user.gender === 'other' ? 'selected' : ''}>Other 👤</option>
              </select>
            </div>
            <div class="row-tight" style="justify-content:space-between">
              <span class="muted">ID verified</span>
              <span>${user.face_verified ? `<span class="badge badge-success">${icon('check', 12)} Yes</span>` : `<span class="badge badge-warning">Pending</span>`}</span>
            </div>
          </div>

          <p class="xsmall muted" style="margin-top:var(--space-4)">
            Your ride ID is shown to the other party on every booking. It never changes.
          </p>
        </section>

        <section class="card">
          <div class="card-title">
            <span class="portal-icon">${icon('gauge', 20)}</span>
            <h3>Trust score</h3>
          </div>
          <div data-trust class="stack small muted">Loading…</div>
        </section>

        <section class="card">
          <div class="card-title">
            <span class="portal-icon" style="color:#ef4444">${icon('alert', 20)}</span>
            <h3>Safety & Emergency SOS</h3>
          </div>
          <p class="xsmall muted" style="margin-bottom:var(--space-3)">
            Save an emergency contact to receive live SMS alerts when you press SOS.
          </p>
          <form data-contact-form class="stack small">
            <div class="field">
              <label for="contact-name">Contact Name</label>
              <input id="contact-name" type="text" placeholder="e.g. Parent / Spouse" value="${escapeHtml(user.emergency_contact_name || '')}" required>
            </div>
            <div class="field">
              <label for="contact-phone">Contact Phone</label>
              <input id="contact-phone" type="tel" placeholder="+919876543210" value="${escapeHtml(user.emergency_contact_phone || '')}" required>
            </div>
            <button class="btn btn-sm btn-ghost" type="submit">${icon('check', 14)} Save Emergency Contact</button>
          </form>
          <div style="margin-top:var(--space-4);border-top:1px dashed var(--color-border);padding-top:var(--space-3)">
            <button class="btn btn-danger btn-block btn-lg" data-profile-sos style="font-weight:bold;box-shadow:0 0 15px rgba(239,68,68,0.4)">
              🚨 RED SOS BUTTON
            </button>
          </div>
        </section>

        <section class="card">
          <div class="card-title">
            <span class="portal-icon">${icon('wallet', 20)}</span>
            <h3>Wallet</h3>
          </div>
          <div class="grid grid-2" data-wallet style="gap:var(--space-3)">
            <div class="stat"><div class="label">Available</div><div class="value">—</div></div>
            <div class="stat"><div class="label">In escrow</div><div class="value">—</div></div>
          </div>
          <form class="row-tight" style="margin-top:var(--space-4);flex-wrap:nowrap" data-topup>
            <input type="number" min="10" step="10" value="200" aria-label="Amount to add">
            <button class="btn btn-primary" type="submit">${icon('plus', 16)} Add</button>
          </form>
        </section>

        <section class="card" style="grid-column: span 2">
          <div class="card-title">
            <span class="portal-icon">${icon('star', 20)}</span>
            <h3>Reviews & Feedback</h3>
          </div>
          <div data-reviews class="stack small muted">Loading reviews…</div>
        </section>
      </div>
    </div>
  `;

  container.querySelector('[data-logout]').addEventListener('click', () => {
    store.logout();
    toast('Signed out', 'info');
    navigate('/', { replace: true });
  });

  const trustNode = container.querySelector('[data-trust]');
  const walletValues = container.querySelectorAll('[data-wallet] .value');

  async function loadWallet() {
    try {
      const wallet = await api.wallet(user.id);
      walletValues[0].textContent = rupees(wallet.wallet_balance);
      walletValues[1].textContent = rupees(wallet.escrow_balance);
    } catch {
      walletValues[0].textContent = '—';
    }
  }

  (async () => {
    try {
      const profile = await api.trustProfile(user.id);
      store.patchUser({ trust_score: profile.trust_score });
      const stats = profile.stats || {};
      trustNode.innerHTML = `
        <div class="row-tight" style="justify-content:space-between">
          <span style="font-family:var(--font-display);font-size:var(--text-2xl);font-weight:600;color:var(--color-foreground)">
            ${profile.trust_score}/100
          </span>
          <span class="badge badge-accent">${escapeHtml(profile.ai_recommendation)}</span>
        </div>
        <div class="meter" style="margin:var(--space-2) 0 var(--space-3)">
          <span style="width:${profile.trust_score}%"></span>
        </div>
        <p class="small" style="margin:0">${escapeHtml(profile.risk_reason)}</p>
        <div class="stack small" style="margin-top:var(--space-3)">
          <div class="row-tight" style="justify-content:space-between"><span class="muted">Rating</span><span>${Number(stats.rating || 0).toFixed(1)} / 5</span></div>
          <div class="row-tight" style="justify-content:space-between"><span class="muted">Completed trips</span><span>${stats.completed_deliveries ?? 0}</span></div>
          <div class="row-tight" style="justify-content:space-between"><span class="muted">Cancellations</span><span>${stats.cancellation_count ?? 0}</span></div>
          <div class="row-tight" style="justify-content:space-between"><span class="muted">Reports filed</span><span>${stats.report_count ?? 0}</span></div>
        </div>
      `;
    } catch (error) {
      trustNode.textContent = error.message;
    }
  })();

  const reviewsNode = container.querySelector('[data-reviews]');

  async function loadReviews() {
    try {
      const res = await api.reviews(user.id);
      const list = res.reviews || [];
      if (!list.length) {
        reviewsNode.innerHTML = '<p class="small muted" style="margin:0">No reviews received yet. Complete trips to build your reputation!</p>';
        return;
      }
      reviewsNode.innerHTML = list.map((rev) => `
        <div class="card-sm" style="background:var(--color-surface);border:1px solid var(--color-border);padding:var(--space-3);border-radius:var(--radius-md);margin-bottom:var(--space-2)">
          <div class="row-tight" style="justify-content:space-between;margin-bottom:4px">
            <strong>${escapeHtml(rev.author || 'Anonymous')}</strong>
            <span class="xsmall badge badge-accent">${icon('star', 11)} ${rev.rating}/5 · ${escapeHtml(rev.context || '')}</span>
          </div>
          ${rev.review ? `<p class="xsmall" style="margin:4px 0 0;color:var(--color-foreground)">"${escapeHtml(rev.review)}"</p>` : '<p class="xsmall muted" style="margin:4px 0 0;font-style:italic">No written note provided</p>'}
        </div>
      `).join('');
    } catch (err) {
      reviewsNode.innerHTML = `<p class="xsmall muted" style="margin:0">${escapeHtml(err.message)}</p>`;
    }
  }

  loadWallet();
  loadReviews();

  container.querySelector('[data-topup]').addEventListener('submit', async (event) => {
    event.preventDefault();
    const input = event.currentTarget.querySelector('input');
    const button = event.currentTarget.querySelector('button');
    const amount = Number(input.value);
    if (!amount || amount <= 0) { toast('Enter an amount above zero', 'error'); return; }
    setBusy(button, true, 'Adding…');
    try {
      await api.deposit(user.id, amount);
      toast(`${rupees(amount)} added to your wallet`, 'success');
      loadWallet();
    } catch (error) {
      toast(error.message, 'error');
    } finally {
      setBusy(button, false);
    }
  });

  container.querySelector('[data-gender-select]')?.addEventListener('change', async (e) => {
    const gender = e.target.value;
    try {
      await api.updateUserActivity(user.id, { gender });
      store.login({ ...user, gender });
      toast('Gender preference updated!', 'success');
    } catch (err) {
      toast(err.message || 'Failed to update gender', 'error');
    }
  });

  container.querySelector('[data-contact-form]')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const name = container.querySelector('#contact-name').value.trim();
    const phone = container.querySelector('#contact-phone').value.trim();
    const button = event.currentTarget.querySelector('button[type="submit"]');
    setBusy(button, true, 'Saving…');
    try {
      const updated = await api.updateEmergencyContact({ user_id: user.id, name, phone });
      store.patchUser(updated);
      toast('Emergency contact saved successfully', 'success');
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setBusy(button, false);
    }
  });

  container.querySelector('[data-profile-sos]')?.addEventListener('click', async (event) => {
    const button = event.currentTarget;
    toggleSirenSound(true); // START SIREN SOUND IMMEDIATELY ON CLICK
    setBusy(button, true, 'Triggering SOS…');
    try {
      const { locateUser } = await import('../map.js');
      const [lat, lng] = await locateUser();
      const res = await api.triggerSos({ user_id: user.id, latitude: lat, longitude: lng, location_name: 'Profile Emergency SOS' });
      openSosEmergencyModal({ res });
    } catch (err) {
      // Fallback coordinates if locate fails
      const res = await api.triggerSos({ user_id: user.id, latitude: 12.9716, longitude: 77.5946, location_name: 'Profile Emergency SOS' });
      openSosEmergencyModal({ res });
    } finally {
      setBusy(button, false);
    }
  });
}
