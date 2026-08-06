// Login and sign-up. On success a permanent ride ID (AR-XXXXXX) is issued.

import { api, ApiError } from '../api.js';
import { icon } from '../icons.js';
import { store } from '../store.js';
import { navigate } from '../router.js';
import { escapeHtml, setBusy, toast } from '../ui.js';

function shell(title, subtitle, formHtml, footerHtml) {
  return `
    <div class="container page">
      <div style="max-width:520px;margin-inline:auto">
        <div class="card">
          <div class="card-title">
            <span class="portal-icon">${icon('route', 22)}</span>
            <div>
              <h2 style="margin:0">${escapeHtml(title)}</h2>
              <p class="small muted" style="margin:0">${escapeHtml(subtitle)}</p>
            </div>
          </div>
          ${formHtml}
        </div>
        <p class="small muted" style="text-align:center;margin-top:var(--space-4)">${footerHtml}</p>
      </div>
    </div>
  `;
}

function fieldError(input, message) {
  const wrapper = input.closest('.field');
  const node = wrapper?.querySelector('.error');
  if (!node) return;
  if (message) {
    node.hidden = false;
    node.innerHTML = `${icon('alert', 14)} ${escapeHtml(message)}`;
    input.setAttribute('aria-invalid', 'true');
  } else {
    node.hidden = true;
    input.removeAttribute('aria-invalid');
  }
}

function afterAuth(user, next) {
  store.setUser(user);
  toast(`Signed in — your ride ID is ${store.publicId}`, 'success', 5000);
  navigate(next && next.startsWith('/') ? next : '/home', { replace: true });
}

/* ── Login ───────────────────────────────────────────────────────────────── */

export function loginView(container, query) {
  container.innerHTML = shell(
    'Welcome back',
    'Sign in to switch between the rider and passenger portals.',
    `
    <form novalidate>
      <div class="field">
        <label for="login-email">Email</label>
        <input id="login-email" type="email" autocomplete="email" placeholder="you@example.com" required>
        <span class="error" hidden></span>
      </div>
      <div class="field">
        <label for="login-password">Password</label>
        <input id="login-password" type="password" autocomplete="current-password" placeholder="Your password" required>
        <span class="error" hidden></span>
      </div>
      <button class="btn btn-primary btn-block btn-lg" type="submit">
        ${icon('arrowRight', 18)} Sign in
      </button>
    </form>
  `,
    `New here? <a href="#/signup">Create an account</a>`
  );

  const form = container.querySelector('form');
  const email = container.querySelector('#login-email');
  const password = container.querySelector('#login-password');

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    let valid = true;
    fieldError(email, '');
    fieldError(password, '');

    if (!email.value.includes('@')) { fieldError(email, 'Enter a valid email address'); valid = false; }
    if (password.value.length < 4) { fieldError(password, 'Enter your password'); valid = false; }
    if (!valid) return;

    const button = form.querySelector('button[type="submit"]');
    setBusy(button, true, 'Signing in…');
    try {
      const user = await api.login({ email: email.value.trim(), password: password.value });
      afterAuth(user, query.next);
    } catch (error) {
      const message = error instanceof ApiError ? error.message : 'Sign in failed';
      if (message.toLowerCase().includes('password')) fieldError(password, message);
      else fieldError(email, message);
      toast(message, 'error');
    } finally {
      setBusy(button, false);
    }
  });
}

/* ── Sign up ─────────────────────────────────────────────────────────────── */

export function signupView(container, query) {
  container.innerHTML = shell(
    'Create your account',
    'One account, both portals. You get a permanent ride ID on sign-up.',
    `
    <form novalidate>
      <div class="field">
        <label for="su-name">Full name</label>
        <input id="su-name" type="text" autocomplete="name" placeholder="Prema Guggari" required>
        <span class="error" hidden></span>
      </div>
      <div class="field">
        <label for="su-email">Email</label>
        <input id="su-email" type="email" autocomplete="email" placeholder="you@example.com" required>
        <span class="error" hidden></span>
      </div>
      <div class="field">
        <label for="su-phone">Phone</label>
        <input id="su-phone" type="tel" autocomplete="tel" placeholder="+91 90000 00000" required>
        <span class="helper">Used for trip OTP and rider contact. Never shown publicly.</span>
        <span class="error" hidden></span>
      </div>
      <div class="field">
        <label for="su-gov">Government ID number</label>
        <input id="su-gov" type="text" placeholder="Aadhaar / DL / Passport number" required>
        <span class="helper">Verification raises your trust score, which decides how often you get booked.</span>
        <span class="error" hidden></span>
      </div>
      <div class="field">
        <label for="su-password">Password</label>
        <input id="su-password" type="password" autocomplete="new-password" placeholder="At least 6 characters" required>
        <span class="error" hidden></span>
      </div>
      <div class="field">
        <label for="su-gender">Gender</label>
        <select id="su-gender" class="input">
          <option value="unspecified">Unspecified / Decline to state</option>
          <option value="female">Female 👧 (Enables Women Safety Mode)</option>
          <option value="male">Male 👨</option>
          <option value="other">Other 👤</option>
        </select>
        <span class="helper">Required to access or publish Women-Only rides and parcels.</span>
      </div>

      <div class="card card-tight" style="background:var(--color-muted);margin-bottom:var(--space-4)">
        <div class="row-tight" style="justify-content:space-between">
          <span class="small"><strong>Verify phone</strong> <span class="muted">(optional)</span></span>
          <button type="button" class="btn btn-sm" data-otp-send>${icon('phone', 14)} Send code</button>
        </div>
        <div data-otp-box hidden style="margin-top:var(--space-3)">
          <div class="field" style="margin:0">
            <label for="su-otp">6-digit code</label>
            <input id="su-otp" inputmode="numeric" maxlength="6" placeholder="123456">
            <span class="helper" data-otp-hint></span>
          </div>
          <button type="button" class="btn btn-sm" data-otp-verify style="margin-top:var(--space-2)">
            ${icon('check', 14)} Verify code
          </button>
        </div>
      </div>

      <button class="btn btn-primary btn-block btn-lg" type="submit">
        ${icon('arrowRight', 18)} Create account
      </button>
    </form>
  `,
    `Already registered? <a href="#/login">Sign in</a>`
  );

  const form = container.querySelector('form');
  const fields = {
    name: container.querySelector('#su-name'),
    email: container.querySelector('#su-email'),
    phone: container.querySelector('#su-phone'),
    gov: container.querySelector('#su-gov'),
    password: container.querySelector('#su-password'),
  };

  let phoneVerified = false;
  const otpBox = container.querySelector('[data-otp-box]');
  const otpHint = container.querySelector('[data-otp-hint]');

  container.querySelector('[data-otp-send]').addEventListener('click', async (event) => {
    const phone = fields.phone.value.trim();
    if (phone.length < 8) { fieldError(fields.phone, 'Enter your phone number first'); return; }
    fieldError(fields.phone, '');
    const button = event.currentTarget;
    setBusy(button, true, 'Sending…');
    try {
      const result = await api.sendOtp(phone);
      otpBox.hidden = false;
      otpHint.textContent = result.dev_code
        ? `Demo mode — your code is ${result.dev_code}`
        : 'Code sent by SMS. Valid for 5 minutes.';
      toast('Verification code sent', 'success');
    } catch (error) {
      toast(error.message, 'error');
    } finally {
      setBusy(button, false);
    }
  });

  container.querySelector('[data-otp-verify]').addEventListener('click', async (event) => {
    const code = container.querySelector('#su-otp').value.trim();
    const button = event.currentTarget;
    setBusy(button, true, 'Checking…');
    try {
      await api.verifyOtp(fields.phone.value.trim(), code);
      phoneVerified = true;
      otpHint.textContent = 'Phone verified.';
      toast('Phone verified', 'success');
    } catch (error) {
      toast(error.message, 'error');
    } finally {
      setBusy(button, false);
    }
  });

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    let valid = true;
    Object.values(fields).forEach((input) => fieldError(input, ''));

    if (fields.name.value.trim().length < 2) { fieldError(fields.name, 'Enter your full name'); valid = false; }
    if (!fields.email.value.includes('@')) { fieldError(fields.email, 'Enter a valid email address'); valid = false; }
    const cleanPhone = fields.phone.value.trim().replace(/\D/g, '');
    const phoneRegex = /^[6-9]\d{9}$/;
    if (!phoneRegex.test(cleanPhone)) {
      fieldError(fields.phone, 'Enter a valid 10-digit Indian phone number starting with 6-9');
      valid = false;
    }

    const govId = fields.gov.value.trim().toUpperCase().replace(/\s|-/g, '');
    const isAadhaar = /^\d{12}$/.test(govId);
    const isPan = /^[A-Z]{5}[0-9]{4}[A-Z]{1}$/.test(govId);
    const isDl = /^[A-Z]{2}\d{13}$/.test(govId);
    if (!isAadhaar && !isPan && !isDl) {
      fieldError(fields.gov, 'Enter valid 12-digit Aadhaar, PAN (e.g. ABCDE1234F), or Driving License number');
      valid = false;
    }
    if (fields.password.value.length < 6) { fieldError(fields.password, 'Use at least 6 characters'); valid = false; }
    if (!valid) return;

    const button = form.querySelector('button[type="submit"]');
    setBusy(button, true, 'Creating account…');
    try {
      const user = await api.register({
        name: fields.name.value.trim(),
        email: fields.email.value.trim(),
        phone: fields.phone.value.trim(),
        government_id: fields.gov.value.trim(),
        password: fields.password.value,
        gender: form.querySelector('#su-gender').value,
        face_verified: phoneVerified,
      });
      afterAuth(user, query.next);
    } catch (error) {
      toast(error.message, 'error');
    } finally {
      setBusy(button, false);
    }
  });
}
