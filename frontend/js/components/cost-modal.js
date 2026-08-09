import { api } from '../api.js';
import { icon } from '../icons.js';
import { escapeHtml } from '../ui.js';

export async function showCostBreakdownModal(options = {}) {
  const {
    distance_m = 10000.0,
    vehicle_type = 'car',
    seats = 1,
    is_parcel = false,
    actual_fare = null,
    title = 'Fuel & Cost Share Breakdown',
  } = options;

  // Existing modal cleanup
  const existing = document.querySelector('#cost-breakdown-modal');
  if (existing) existing.remove();

  const backdrop = document.createElement('div');
  backdrop.id = 'cost-breakdown-modal';
  backdrop.className = 'modal-backdrop';
  backdrop.style.cssText = `
    position: fixed;
    top: 0; left: 0; right: 0; bottom: 0;
    background: rgba(0, 0, 0, 0.75);
    backdrop-filter: blur(12px);
    z-index: 10000;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: var(--space-4);
    animation: fadeIn 0.2s ease-out;
  `;

  backdrop.innerHTML = `
    <div class="card stack" style="max-width:480px;width:100%;background:var(--color-surface-dim);border:1px solid var(--color-border);box-shadow:0 20px 50px rgba(0,0,0,0.5);border-radius:var(--radius-lg);padding:var(--space-6);position:relative">
      <button data-close-modal style="position:absolute;top:var(--space-4);right:var(--space-4);background:none;border:none;color:var(--color-foreground-dim);cursor:pointer;padding:4px">
        ${icon('x', 20)}
      </button>

      <div class="row-tight" style="gap:var(--space-2)">
        <span style="font-size:24px">🧾</span>
        <h3 style="margin:0">${escapeHtml(title)}</h3>
      </div>
      <p class="xsmall muted" style="margin:0">Verified zero-commission cost-share receipt based on live distance & fuel rates.</p>

      <div data-modal-content class="stack" style="gap:var(--space-4);margin-top:var(--space-3)">
        <div class="muted small text-center" style="padding:var(--space-4)">Calculating fuel & savings breakdown...</div>
      </div>

      <div style="margin-top:var(--space-4);text-align:right">
        <button data-close-modal class="btn btn-primary btn-sm">${icon('check', 14)} Close Receipt</button>
      </div>
    </div>
  `;

  document.body.appendChild(backdrop);

  const closeModal = () => backdrop.remove();
  backdrop.querySelectorAll('[data-close-modal]').forEach((btn) => btn.addEventListener('click', closeModal));
  backdrop.addEventListener('click', (e) => {
    if (e.target === backdrop) closeModal();
  });

  const contentNode = backdrop.querySelector('[data-modal-content]');

  try {
    const res = await api.calculateCostBreakdown({
      distance_m,
      vehicle_type,
      seats,
      is_parcel,
      actual_fare,
    });

    const isCar = res.vehicle_type.toLowerCase() === 'car';
    const isParcel = res.is_parcel;

    contentNode.innerHTML = `
      <div class="grid grid-2" style="gap:var(--space-3)">
        <div class="card" style="background:rgba(255,255,255,0.03);border:1px solid var(--color-border);padding:var(--space-3)">
          <div class="xsmall muted">Trip Distance</div>
          <strong style="font-size:1.2rem;color:var(--color-foreground)">${res.distance_km} km</strong>
        </div>
        <div class="card" style="background:rgba(255,255,255,0.03);border:1px solid var(--color-border);padding:var(--space-3)">
          <div class="xsmall muted">Fuel Consumed</div>
          <strong style="font-size:1.2rem;color:var(--color-warning)">⛽ ${res.fuel_liters} Liters</strong>
          <div class="xsmall muted">@ ₹${res.fuel_price_per_liter}/L (${res.mileage_kpl} km/L)</div>
        </div>
      </div>

      <div class="card stack" style="background:var(--color-surface);border:1px solid var(--color-accent-soft);padding:var(--space-4)">
        <div class="row-tight" style="justify-content:space-between">
          <span class="small font-bold">🤝 Zero-Commission Cost Share</span>
          <span class="badge badge-success" style="font-size:0.9rem">₹${res.cost_share}</span>
        </div>
        <div class="xsmall muted" style="margin-top:2px">
          Rider Total Fuel Bill: <strong>₹${res.total_fuel_cost}</strong> · Rider Offset: <strong>₹${res.rider_fuel_offset}</strong>
        </div>
      </div>

      <div class="row-tight small muted" style="justify-content:center;gap:var(--space-2);background:rgba(255,255,255,0.02);padding:var(--space-2);border-radius:var(--radius-sm)">
        <span>🌱 Eco Impact: <strong>${res.co2_saved_kg} kg CO₂</strong> prevented</span>
      </div>
    `;

  } catch (err) {
    contentNode.innerHTML = `<div class="muted small text-center" style="padding:var(--space-4);color:var(--color-danger)">Failed to load breakdown: ${escapeHtml(err.message)}</div>`;
  }
}
