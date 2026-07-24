// Profile — ride ID, trust breakdown, wallet.

import { api } from '../api.js';
import { icon } from '../icons.js';
import { store } from '../store.js';
import { navigate } from '../router.js';
import { escapeHtml, initials, rupees, setBusy, toast, trustBadge } from '../ui.js';

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

  loadWallet();

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
}
