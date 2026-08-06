import { icon } from './icons.js';
import { api } from './api.js';
import { store } from './store.js';

export function el(html) {
  const template = document.createElement('template');
  template.innerHTML = html.trim();
  return template.content.firstElementChild;
}

export function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[char]));
}

/* ── Toasts ──────────────────────────────────────────────────────────────── */

let toastStack;

export function toast(message, kind = 'info', duration = 4000) {
  if (!toastStack) {
    toastStack = el('<div class="toast-stack" role="status" aria-live="polite"></div>');
    document.body.append(toastStack);
  }
  const iconName = kind === 'success' ? 'check' : kind === 'error' ? 'alert' : 'sparkles';
  const node = el(`
    <div class="toast ${kind}">
      ${icon(iconName, 18)}
      <span>${escapeHtml(message)}</span>
    </div>
  `);
  toastStack.append(node);
  setTimeout(() => {
    node.style.opacity = '0';
    node.style.transform = 'translateY(8px)';
    setTimeout(() => node.remove(), 220);
  }, duration);
}

/* ── Formatting ──────────────────────────────────────────────────────────── */

export const rupees = (value) =>
  `₹${Number(value || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;

export function km(metres) {
  const value = Number(metres || 0);
  if (value < 1000) return `${Math.round(value)} m`;
  return `${(value / 1000).toFixed(value < 10000 ? 1 : 0)} km`;
}

export function timeLabel(value) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString('en-IN', {
    day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit',
  });
}

export function formatDate(value) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString('en-IN', {
    day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

export function timeAgo(value) {
  if (!value) return 'just now';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'just now';
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
  if (seconds < 30) return 'just now';
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return formatDate(value);
}

export const initials = (name) =>
  String(name || '?')
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');

export function trustBadge(score) {
  const value = Number(score ?? 50);
  if (value >= 90) return { label: 'Very low risk', className: 'badge-success' };
  if (value >= 75) return { label: 'Low risk', className: 'badge-success' };
  if (value >= 50) return { label: 'Medium risk', className: 'badge-warning' };
  return { label: 'High risk', className: 'badge-danger' };
}

export function statusBadge(status) {
  const map = {
    pending: 'badge-warning',
    accepted: 'badge-success',
    completed: 'badge-success',
    rejected: 'badge-danger',
    cancelled: 'badge-danger',
    available: 'badge-accent',
    started: 'badge-success',
  };
  return map[status] || '';
}

/* ── Misc ────────────────────────────────────────────────────────────────── */

export function debounce(fn, wait = 320) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), wait);
  };
}

export function setBusy(button, busy, busyLabel = 'Working…') {
  if (!button) return;
  if (busy) {
    button.dataset.label = button.innerHTML;
    button.disabled = true;
    button.innerHTML = `<span class="spinner"></span> ${escapeHtml(busyLabel)}`;
  } else {
    button.disabled = false;
    if (button.dataset.label) button.innerHTML = button.dataset.label;
  }
}

export function skeletonList(count = 3) {
  return `<div class="ride-list">${'<div class="skeleton skeleton-card"></div>'.repeat(count)}</div>`;
}

export function emptyState(iconName, title, body, actionHtml = '') {
  return `
    <div class="empty-state">
      ${icon(iconName, 32)}
      <h3>${escapeHtml(title)}</h3>
      <p class="small">${escapeHtml(body)}</p>
      ${actionHtml}
    </div>
  `;
}

export function localDateTimeValue(date = new Date()) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/* ── SOS Emergency Audio & Modal ─────────────────────────────────────────── */

let audioCtx = null;
let sirenOsc = null;
let sirenInterval = null;
let autoStopTimer = null;

export function toggleSirenSound(enable, autoStopSeconds = 10) {
  if (autoStopTimer) {
    clearTimeout(autoStopTimer);
    autoStopTimer = null;
  }

  if (enable) {
    if (sirenOsc) return;
    try {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (!audioCtx) audioCtx = new AudioContextClass();
      if (audioCtx.state === 'suspended') {
        audioCtx.resume();
      }

      sirenOsc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      sirenOsc.type = 'sawtooth';
      gain.gain.setValueAtTime(0.5, audioCtx.currentTime); // Loud volume
      sirenOsc.connect(gain);
      gain.connect(audioCtx.destination);
      sirenOsc.start();

      let freq = 600;
      let rising = true;
      sirenInterval = setInterval(() => {
        if (!sirenOsc || !audioCtx) return;
        if (rising) {
          freq += 80;
          if (freq >= 1300) rising = false;
        } else {
          freq -= 80;
          if (freq <= 550) rising = true;
        }
        sirenOsc.frequency.setValueAtTime(freq, audioCtx.currentTime);
      }, 50);

      // Auto-stop siren after autoStopSeconds (default 10s)
      if (autoStopSeconds > 0) {
        autoStopTimer = setTimeout(() => {
          toggleSirenSound(false);
          const sirenBtn = document.querySelector('[data-toggle-siren]');
          if (sirenBtn) sirenBtn.textContent = '🔈 Siren Auto-Stopped (10s)';
        }, autoStopSeconds * 1000);
      }
    } catch (err) {
      console.warn('Web Audio Siren unavailable:', err);
    }
  } else {
    if (sirenInterval) {
      clearInterval(sirenInterval);
      sirenInterval = null;
    }
    if (sirenOsc) {
      try { sirenOsc.stop(); } catch {}
      sirenOsc = null;
    }
  }
}

export function openSosEmergencyModal({ res, onResolve } = {}) {
  toggleSirenSound(true, 10); // Plays for exactly 10 seconds then stops automatically

  const existing = document.querySelector('#sos-modal-root');
  if (existing) existing.remove();

  const contactName = res?.emergency_contact_name || 'Emergency Contact';
  const contactPhone = res?.emergency_contact_phone || '';
  const cleanPhone = contactPhone.replace(/[^\d+]/g, '');
  const locationUrl = res?.live_location_url || '#';

  const smsStatusText = res?.sms_status || 'Alert sent';
  const isFailed = smsStatusText.toLowerCase().includes('failed') || smsStatusText.toLowerCase().includes('error');
  const statusColor = isFailed ? '#ef4444' : '#10b981';

  const alertText = `🚨 SOS EMERGENCY ALERT! Track my live GPS location: ${locationUrl} (Contact: ${contactName})`;
  const encodedText = encodeURIComponent(alertText);

  const waPhone = cleanPhone.replace(/^\+/, '');
  const waUrl = waPhone
    ? `https://api.whatsapp.com/send?phone=${waPhone}&text=${encodedText}`
    : `https://api.whatsapp.com/send?text=${encodedText}`;

  const smsUrl = cleanPhone
    ? `sms:${cleanPhone}?body=${encodedText}`
    : `sms:?body=${encodedText}`;

  const modalNode = el(`
    <div id="sos-modal-root" class="modal-overlay" style="position:fixed;top:0;left:0;right:0;bottom:0;z-index:9999;background:rgba(0,0,0,0.85);display:flex;align-items:center;justify-content:center;padding:var(--space-4);animation:fadeIn 0.2s ease">
      <div class="card" style="max-width:520px;width:100%;border:2px solid #ef4444;box-shadow:0 0 35px rgba(239,68,68,0.6);background:var(--color-surface);border-radius:16px;overflow:hidden">
        <div style="background:#ef4444;color:#fff;padding:var(--space-3);text-align:center;font-weight:bold;font-size:var(--text-lg);letter-spacing:1px;display:flex;align-items:center;justify-content:center;gap:8px">
          <span>🚨 SOS EMERGENCY ALERT ACTIVATED 🚨</span>
        </div>

        <div style="padding:var(--space-4)" class="stack">
          <p class="small" style="margin:0;color:var(--color-foreground)">
            Emergency alert activated! Siren sound will play for 10 seconds. Live GPS location shared with ride members and emergency contact.
          </p>

          <div style="background:rgba(239,68,68,0.08);border:1px solid rgba(239,68,68,0.2);padding:var(--space-3);border-radius:8px" class="stack small">
            <div><strong>SMS Alert Status:</strong> <span style="color:${statusColor};font-weight:600">${escapeHtml(smsStatusText)}</span></div>
            <div><strong>Emergency Contact:</strong> ${escapeHtml(contactName)} ${contactPhone ? `(${escapeHtml(contactPhone)})` : '<span style="color:#f59e0b">(Not set)</span>'}</div>
            <div><strong>Live Map:</strong> <a href="${escapeHtml(locationUrl)}" target="_blank" rel="noopener noreferrer" style="color:var(--color-accent);text-decoration:underline;font-weight:bold">Open Location Link</a></div>
          </div>

          <div style="margin-top:var(--space-2)">
            <button class="btn btn-danger btn-block btn-lg" data-stop-sos style="font-weight:bold;font-size:var(--text-md);padding:var(--space-3);box-shadow:0 0 15px rgba(239,68,68,0.5)">
              🛑 STOP SOS EMERGENCY ALERT
            </button>
          </div>

          <div class="grid grid-2" style="gap:var(--space-2);margin-top:var(--space-2)">
            <a class="btn btn-danger" href="tel:112" style="display:flex;align-items:center;justify-content:center;gap:6px;font-weight:bold;text-decoration:none">
              ${icon('phone', 18)} Call 112
            </a>
            <button class="btn btn-primary" data-share-location style="display:flex;align-items:center;justify-content:center;gap:6px;font-weight:bold">
              ${icon('navigation', 18)} Share Location
            </button>
          </div>

          <div class="grid grid-2" style="gap:var(--space-2)">
            <a class="btn btn-secondary" href="${escapeHtml(waUrl)}" target="_blank" rel="noopener noreferrer" style="display:flex;align-items:center;justify-content:center;gap:6px;background:#25D366;color:#fff;border:none;font-weight:bold;text-decoration:none">
              💬 WhatsApp Contact
            </a>
            <a class="btn btn-secondary" href="${escapeHtml(smsUrl)}" style="display:flex;align-items:center;justify-content:center;gap:6px;font-weight:bold;text-decoration:none">
              📱 Send SMS
            </a>
          </div>

          <div class="row-tight" style="justify-content:space-between;margin-top:var(--space-2)">
            <button class="btn btn-sm btn-ghost" data-toggle-siren>🔊 Siren Playing (Auto-stops in 10s)</button>
            <button class="btn btn-sm btn-success" data-resolve-sos>✅ I am safe now / Close</button>
          </div>
        </div>
      </div>
    </div>
  `);

  document.body.append(modalNode);

  const stopAlert = async () => {
    toggleSirenSound(false);
    modalNode.remove();
    toast('SOS Emergency Alert Stopped', 'info');
    if (res?.alert?.id) {
      try {
        const { api } = await import('./api.js');
        await api.resolveSos(res.alert.id);
      } catch {}
    }
    if (onResolve) onResolve();
  };

  modalNode.querySelector('[data-stop-sos]').addEventListener('click', stopAlert);
  modalNode.querySelector('[data-resolve-sos]').addEventListener('click', stopAlert);

  modalNode.querySelector('[data-share-location]').addEventListener('click', async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: '🚨 SOS Emergency Alert - AIRide',
          text: `🚨 EMERGENCY SOS ALERT! Track my live GPS location here:`,
          url: locationUrl,
        });
        toast('Location shared successfully!', 'success');
        return;
      } catch (err) {
        if (err.name === 'AbortError') return;
      }
    }
    if (locationUrl && locationUrl !== '#') {
      try {
        await navigator.clipboard.writeText(locationUrl);
        toast('Live location link copied to clipboard!', 'success');
      } catch {
        toast('Failed to copy location link', 'error');
      }
    }
  });

  let sirenOn = true;
  modalNode.querySelector('[data-toggle-siren]').addEventListener('click', (e) => {
    sirenOn = !sirenOn;
    toggleSirenSound(sirenOn, 10);
    e.target.textContent = sirenOn ? '🔊 Siren Playing (10s)' : '🔇 Siren Muted';
  });
}

/* ── Notification Center Drawer ─────────────────────────────────────────── */

export async function showNotificationDrawer(userId, { onUpdate } = {}) {
  const existing = document.querySelector('#notification-drawer-root');
  if (existing) existing.remove();

  const drawerNode = el(`
    <div id="notification-drawer-root" class="drawer-overlay">
      <div class="drawer-panel">
        <div class="drawer-header">
          <div class="row-tight" style="gap:var(--space-2)">
            ${icon('bell', 20)}
            <h3 style="margin:0;font-size:var(--text-lg);font-weight:700">Notification Center</h3>
            <span class="badge" data-drawer-unread-count style="background:var(--color-primary);color:#fff">0</span>
          </div>
          <div class="row-tight" style="gap:var(--space-2)">
            <button class="btn btn-ghost btn-sm" data-action="mark-all-read" title="Mark all as read">
              ${icon('checkCheck', 16)} <span class="desktop-only">Mark read</span>
            </button>
            <button class="btn btn-ghost btn-sm" data-action="clear-all" title="Clear all notifications">
              ${icon('trash', 16)} <span class="desktop-only">Clear all</span>
            </button>
            <button class="icon-btn" data-action="close-drawer" aria-label="Close drawer">
              ${icon('x', 20)}
            </button>
          </div>
        </div>

        <div class="drawer-tabs">
          <button class="tab-btn is-active" data-cat="all">All</button>
          <button class="tab-btn" data-cat="ride">Ride Updates</button>
          <button class="tab-btn" data-cat="booking">Booking Updates</button>
          <button class="tab-btn" data-cat="payment">Payment Updates</button>
          <button class="tab-btn" data-cat="emergency">Emergency Alerts</button>
          <button class="tab-btn" data-cat="system">System</button>
        </div>

        <div class="drawer-body" data-drawer-list>
          <div class="muted small text-center" style="padding:var(--space-6)">Loading notifications...</div>
        </div>
      </div>
    </div>
  `);

  document.body.append(drawerNode);
  requestAnimationFrame(() => drawerNode.classList.add('is-open'));

  const listNode = drawerNode.querySelector('[data-drawer-list]');
  const countNode = drawerNode.querySelector('[data-drawer-unread-count]');
  let currentCat = 'all';

  const closeDrawer = () => {
    drawerNode.classList.remove('is-open');
    setTimeout(() => drawerNode.remove(), 250);
  };

  drawerNode.querySelector('[data-action="close-drawer"]').addEventListener('click', closeDrawer);
  drawerNode.addEventListener('click', (e) => {
    if (e.target === drawerNode) closeDrawer();
  });

  const formatTimeAgo = (isoString) => {
    if (!isoString) return '';
    const date = new Date(isoString);
    const seconds = Math.floor((new Date() - date) / 1000);
    if (seconds < 60) return 'Just now';
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
  };

  const getCategoryIcon = (category) => {
    switch ((category || '').toLowerCase()) {
      case 'ride': return 'car';
      case 'booking': return 'ticket';
      case 'payment': return 'wallet';
      case 'emergency': return 'alertTriangle';
      default: return 'sparkles';
    }
  };

  const loadNotifications = async () => {
    try {
      const res = await api.notifications(userId, currentCat);
      const notes = res?.notifications || [];
      const unreadCount = res?.unread_count || 0;
      countNode.textContent = String(unreadCount);
      store.setUnreadNotificationCount(unreadCount);
      if (onUpdate) onUpdate(unreadCount);

      if (!notes.length) {
        listNode.innerHTML = `
          <div class="empty-state" style="padding:var(--space-6)">
            ${icon('bellOff', 36)}
            <h4>No notifications</h4>
            <p class="small muted">You're all caught up in ${currentCat === 'all' ? 'all categories' : currentCat}.</p>
          </div>
        `;
        return;
      }

      listNode.innerHTML = notes.map((item) => `
        <div class="notification-card ${item.is_read ? 'is-read' : 'is-unread'}" data-id="${item.id}">
          <div class="notification-icon category-${item.category || 'system'}">
            ${icon(getCategoryIcon(item.category), 18)}
          </div>
          <div class="notification-content">
            <div class="row-tight" style="justify-content:space-between">
              <strong class="notification-title">${escapeHtml(item.title)}</strong>
              <span class="notification-time">${formatTimeAgo(item.created_at)}</span>
            </div>
            <p class="notification-msg">${escapeHtml(item.message)}</p>
            <div class="notification-actions row-tight">
              ${!item.is_read ? `<button class="btn-text-action" data-action="mark-read" data-id="${item.id}">${icon('check', 14)} Mark read</button>` : ''}
              <button class="btn-text-action danger" data-action="delete" data-id="${item.id}">${icon('trash', 14)} Delete</button>
            </div>
          </div>
        </div>
      `).join('');

      listNode.querySelectorAll('[data-action="mark-read"]').forEach((btn) => {
        btn.addEventListener('click', async (e) => {
          const id = Number(e.currentTarget.dataset.id);
          await api.markNotificationRead(id);
          loadNotifications();
        });
      });

      listNode.querySelectorAll('[data-action="delete"]').forEach((btn) => {
        btn.addEventListener('click', async (e) => {
          const id = Number(e.currentTarget.dataset.id);
          const card = listNode.querySelector(`.notification-card[data-id="${id}"]`);
          if (card) card.style.opacity = '0';
          await api.deleteNotification(id);
          loadNotifications();
        });
      });

    } catch (err) {
      listNode.innerHTML = `<div class="muted small text-center" style="padding:var(--space-4);color:var(--color-danger)">Failed to load notifications.</div>`;
    }
  };

  drawerNode.querySelectorAll('.tab-btn').forEach((tab) => {
    tab.addEventListener('click', (e) => {
      drawerNode.querySelectorAll('.tab-btn').forEach((t) => t.classList.remove('is-active'));
      e.currentTarget.classList.add('is-active');
      currentCat = e.currentTarget.dataset.cat;
      loadNotifications();
    });
  });

  drawerNode.querySelector('[data-action="mark-all-read"]').addEventListener('click', async () => {
    await api.markAllNotificationsRead(userId);
    toast('All notifications marked as read', 'success');
    loadNotifications();
  });

  drawerNode.querySelector('[data-action="clear-all"]').addEventListener('click', async () => {
    if (confirm('Clear all notifications?')) {
      await api.clearNotifications(userId);
      toast('Notifications cleared', 'info');
      loadNotifications();
    }
  });

  loadNotifications();
}
