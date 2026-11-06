import { api } from '../api.js';
import { icon } from '../icons.js';
import { store } from '../store.js';
import { escapeHtml, rupees, toast } from '../ui.js';

/**
 * Displays an interactive Cancellation Confirmation Modal.
 * Queries /bookings/{id}/cancellation-preview to fetch exact server-side fees,
 * displays policy details, refund amount, anti-fraud warning (if applicable),
 * and requires explicit user confirmation before executing cancellation.
 */
export async function showCancellationModal(bookingId, onSuccess, cancelledBy = 'passenger') {
  const userId = store.user?.id;
  if (!userId) {
    toast('Please log in to manage your booking', 'warning');
    return;
  }

  // Create modal container
  const overlay = document.createElement('div');
  overlay.className = 'modal-backdrop active';
  overlay.style.zIndex = '99999';

  overlay.innerHTML = `
    <div class="modal-card" style="max-width:440px; border-radius: var(--radius-lg); padding: var(--space-5); text-align: left;">
      <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:var(--space-3)">
        <div style="display:flex; align-items:center; gap:var(--space-3)">
          <div style="background:rgba(239, 68, 68, 0.15); color:#ef4444; width:40px; height:40px; border-radius:50%; display:flex; align-items:center; justify-content:center;">
            ${icon('alert-triangle', 22)}
          </div>
          <div>
            <h3 style="margin:0; font-size:1.15rem; font-weight:700;">Cancel Booking?</h3>
            <p class="xsmall muted" style="margin:2px 0 0">Booking #${bookingId}</p>
          </div>
        </div>
        <button class="btn-icon" data-close style="background:none; border:none; color:var(--text-muted); cursor:pointer;">
          ${icon('x', 20)}
        </button>
      </div>

      <p class="small muted" style="margin-bottom:var(--space-4)">
        Your seat is currently reserved for this ride. Cancelling may result in a small cancellation fee based on the cancellation policy.
      </p>

      <div data-preview-body style="min-height:120px; display:flex; align-items:center; justify-content:center;">
        <div class="spinner" style="width:24px; height:24px; border:2px solid var(--border); border-top-color:var(--brand);"></div>
      </div>

      <div style="display:grid; grid-template-columns: 1fr 1fr; gap:var(--space-3); margin-top:var(--space-4)">
        <button class="btn btn-outline" data-keep style="width:100%; border-radius:var(--radius-md)">
          Keep Booking
        </button>
        <button class="btn btn-danger" data-confirm disabled style="width:100%; border-radius:var(--radius-md)">
          ${icon('x', 16)} Cancel & Pay Fee
        </button>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);

  const closeBtn = overlay.querySelector('[data-close]');
  const keepBtn = overlay.querySelector('[data-keep]');
  const confirmBtn = overlay.querySelector('[data-confirm]');
  const previewBody = overlay.querySelector('[data-preview-body]');

  function dismiss() {
    overlay.classList.remove('active');
    setTimeout(() => overlay.remove(), 200);
  }

  closeBtn.addEventListener('click', dismiss);
  keepBtn.addEventListener('click', dismiss);
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) dismiss();
  });

  // Fetch preview data from server
  try {
    const preview = await api.cancellationPreview(bookingId, userId);
    const fee = preview.cancellation_fee || 0;
    const refund = preview.refund_amount || 0;
    const amount = preview.booking_amount || 0;
    const policy = preview.cancellation_policy || 'Standard cancellation policy applied.';
    const warning = preview.warning_message;

    previewBody.innerHTML = `
      <div style="width:100%">
        <div style="background:var(--bg-subtle); border-radius:var(--radius-md); padding:var(--space-3); margin-bottom:var(--space-3)">
          <div style="display:flex; justify-content:space-between; margin-bottom:var(--space-2)">
            <span class="small muted">Booking Amount:</span>
            <strong class="small">${rupees(amount)}</strong>
          </div>
          <div style="display:flex; justify-content:space-between; margin-bottom:var(--space-2); color: ${fee > 0 ? '#ef4444' : 'var(--text-main)'}">
            <span class="small">Cancellation Fee:</span>
            <strong class="small">${fee > 0 ? '-' + rupees(fee) : '₹0 (Free)'}</strong>
          </div>
          <div style="border-top:1px dashed var(--border); margin:var(--space-2) 0; padding-top:var(--space-2); display:flex; justify-content:space-between; font-weight:700">
            <span>Net Wallet Refund:</span>
            <span style="color:#10b981">${rupees(refund)}</span>
          </div>
        </div>

        <div style="font-size:0.8rem; background:rgba(59, 130, 246, 0.08); color:var(--text-main); border:1px solid rgba(59, 130, 246, 0.2); border-radius:var(--radius-sm); padding:var(--space-2) var(--space-3); margin-bottom:var(--space-3)">
          ℹ️ <strong>Policy:</strong> ${escapeHtml(policy)}
        </div>

        ${warning ? `
          <div style="font-size:0.8rem; background:rgba(239, 68, 68, 0.1); border:1px solid rgba(239, 68, 68, 0.3); color:#dc2626; border-radius:var(--radius-sm); padding:var(--space-2) var(--space-3); display:flex; gap:var(--space-2); align-items:center;">
            <span>⚠️</span>
            <div><strong>Anti-Fraud Notice:</strong> ${escapeHtml(warning)}</div>
          </div>
        ` : ''}
      </div>
    `;

    confirmBtn.disabled = false;
    confirmBtn.addEventListener('click', async () => {
      confirmBtn.disabled = true;
      confirmBtn.innerHTML = `<span class="spinner-sm"></span> Processing...`;
      try {
        const res = await api.cancelBooking(bookingId, userId, 'Change of plans', cancelledBy);
        dismiss();
        toast(`Booking cancelled. Fee: ${rupees(res.cancellation_fee)}. Refund: ${rupees(res.refund_amount)}.`, 'info');
        if (onSuccess) onSuccess(res);
      } catch (err) {
        confirmBtn.disabled = false;
        confirmBtn.innerHTML = `${icon('x', 16)} Cancel & Pay Fee`;
        toast(err.message || 'Failed to cancel booking', 'error');
      }
    });
  } catch (err) {
    previewBody.innerHTML = `
      <div style="color:var(--danger); font-size:0.9rem; text-align:center;">
        Failed to fetch cancellation policy: ${escapeHtml(err.message)}
      </div>
    `;
  }
}
