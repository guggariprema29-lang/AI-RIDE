// Shared UI helpers: toasts, formatting, DOM utilities.

import { icon } from './icons.js';

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
