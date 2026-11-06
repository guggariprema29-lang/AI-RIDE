const API = 'http://127.0.0.1:8000';

/* ── State ── */
const state = {
  email: '', name: '', dob: '', title: '', password: '', phone: '', userId: null, faceVerified: false
};

/* ── Particles ── */
(function spawnParticles() {
  const container = document.getElementById('particles');
  for (let i = 0; i < 28; i++) {
    const p = document.createElement('div');
    p.className = 'particle';
    p.style.cssText = `
      left:${Math.random()*100}%;
      width:${Math.random()*3+1}px;
      height:${Math.random()*3+1}px;
      animation-duration:${Math.random()*12+8}s;
      animation-delay:${Math.random()*10}s;
      opacity:${Math.random()*0.6+0.2};
    `;
    container.appendChild(p);
  }
})();

/* ── Step navigation ── */
let currentStep = 'step-landing';

function goTo(id, back = false) {
  const cur = document.getElementById(currentStep);
  const next = document.getElementById(id);
  if (!next) return;
  cur.classList.remove('active');
  next.classList.remove('going-back');
  if (back) next.classList.add('going-back');
  next.classList.add('active');
  currentStep = id;
}

/* Back buttons */
document.querySelectorAll('.back-btn').forEach(btn => {
  btn.addEventListener('click', () => goTo(btn.dataset.target, true));
});

/* ── Landing ── */
document.getElementById('btn-signup-start').addEventListener('click', () => goTo('step-su-email'));
document.getElementById('btn-login-start').addEventListener('click',  () => goTo('step-li-email'));
document.getElementById('goto-login-from-su').addEventListener('click', e => { e.preventDefault(); goTo('step-li-email'); });
document.getElementById('goto-signup-from-li').addEventListener('click', e => { e.preventDefault(); goTo('step-su-email'); });

/* Facebook (UI only) */
document.getElementById('btn-facebook').addEventListener('click', () => {
  alert('Facebook login coming soon! Set up OAuth credentials to enable.');
});

/* Google (UI only) */
document.getElementById('btn-google').addEventListener('click', () => {
  alert('Google login coming soon! Set up Google OAuth credentials to enable.');
});

/* ── STEP 1: Signup Email ── */
function isValidEmail(v) {
  // Just check there's something before and after @ — backend validates fully
  const t = v.trim();
  const at = t.indexOf('@');
  return t.length > 4 && at > 0 && at < t.length - 1;
}

document.getElementById('btn-su-email-next').addEventListener('click', () => {
  const input = document.getElementById('su-email');
  const err   = document.getElementById('su-email-error');
  const val   = input.value.trim();
  if (!val || !isValidEmail(val)) {
    err.textContent = 'Please enter a valid email address (e.g. name@example.com).';
    input.focus();
    return;
  }
  err.textContent = '';
  state.email = val;
  goTo('step-su-name');
});
document.getElementById('su-email').addEventListener('keydown', e => {
  if (e.key === 'Enter') document.getElementById('btn-su-email-next').click();
});

/* ── STEP 2: Name ── */
document.getElementById('btn-su-name-next').addEventListener('click', () => {
  const fn  = document.getElementById('su-fname').value.trim();
  const ln  = document.getElementById('su-lname').value.trim();
  const err = document.getElementById('su-name-error');
  if (!fn || !ln) { err.textContent = 'Please enter your first and last name.'; return; }
  err.textContent = '';
  state.name = `${fn} ${ln}`;
  goTo('step-su-dob');
});

/* ── STEP 3: DOB ── */
(function populateDOB() {
  const dayEl  = document.getElementById('dob-day');
  const yearEl = document.getElementById('dob-year');
  for (let d = 1; d <= 31; d++) {
    const o = document.createElement('option'); o.value = d; o.textContent = d;
    dayEl.appendChild(o);
  }
  const now = new Date().getFullYear();
  for (let y = now - 18; y >= now - 100; y--) {
    const o = document.createElement('option'); o.value = y; o.textContent = y;
    yearEl.appendChild(o);
  }
})();

document.getElementById('btn-su-dob-next').addEventListener('click', () => {
  const d   = document.getElementById('dob-day').value;
  const m   = document.getElementById('dob-month').value;
  const y   = document.getElementById('dob-year').value;
  const err = document.getElementById('su-dob-error');
  if (!d || !m || !y) { err.textContent = 'Please select your full date of birth.'; return; }
  const dob  = new Date(y, m - 1, d);
  const age  = (new Date() - dob) / (365.25 * 24 * 3600 * 1000);
  if (age < 18) { err.textContent = 'You must be at least 18 years old.'; return; }
  err.textContent = '';
  state.dob = `${y}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
  goTo('step-su-title');
});

/* ── STEP 4: Title ── */
let selectedTitle = '';
document.querySelectorAll('.title-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.title-btn').forEach(b => b.classList.remove('selected'));
    btn.classList.add('selected');
    selectedTitle = btn.dataset.title;
    document.getElementById('btn-su-title-next').disabled = false;
  });
});
document.getElementById('btn-su-title-next').addEventListener('click', () => {
  state.title = selectedTitle;
  goTo('step-su-password');
});

/* ── STEP 5: Password ── */
const pwInput    = document.getElementById('su-password');
const pwBar      = document.getElementById('pw-bar');
const pwLabel    = document.getElementById('pw-label');
const pwBtn      = document.getElementById('btn-su-pw-next');
const rules = {
  len:     { el: document.getElementById('r-len'),     fn: p => p.length >= 8 },
  upper:   { el: document.getElementById('r-upper'),   fn: p => /[A-Z]/.test(p) },
  lower:   { el: document.getElementById('r-lower'),   fn: p => /[a-z]/.test(p) },
  num:     { el: document.getElementById('r-num'),     fn: p => /[0-9]/.test(p) },
  special: { el: document.getElementById('r-special'), fn: p => /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(p) }
};

pwInput.addEventListener('input', () => {
  const p = pwInput.value;
  let score = 0;
  Object.values(rules).forEach(r => {
    const ok = r.fn(p);
    r.el.classList.toggle('ok', ok);
    if (ok) score++;
  });
  const pct = (score / 5) * 100;
  pwBar.style.width = pct + '%';
  if (score <= 1) { pwBar.style.background = '#EF4444'; pwLabel.textContent = 'Weak';   pwLabel.style.color = '#EF4444'; }
  else if (score <= 3) { pwBar.style.background = '#F59E0B'; pwLabel.textContent = 'Fair';   pwLabel.style.color = '#F59E0B'; }
  else if (score === 4) { pwBar.style.background = '#3B82F6'; pwLabel.textContent = 'Good';   pwLabel.style.color = '#3B82F6'; }
  else { pwBar.style.background = '#22C55E'; pwLabel.textContent = 'Strong'; pwLabel.style.color = '#22C55E'; }
  pwBtn.disabled = score < 5;
});

document.getElementById('toggle-su-pw').addEventListener('click', () => {
  pwInput.type = pwInput.type === 'password' ? 'text' : 'password';
});

pwBtn.addEventListener('click', () => {
  state.password = pwInput.value;
  goTo('step-su-phone');
});

/* ── STEP 6: Phone ── */
document.getElementById('btn-su-phone-next').addEventListener('click', async () => {
  const code  = document.getElementById('phone-country').value;
  const num   = document.getElementById('su-phone').value.trim();
  const err   = document.getElementById('su-phone-error');
  if (!num || !/^\d{6,15}$/.test(num)) {
    err.textContent = 'Please enter a valid phone number (digits only).';
    return;
  }
  err.textContent = '';
  state.phone = code + num;

  try {
    const res = await fetch(`${API}/auth/send-otp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone: state.phone })
    });
    const data = await res.json();
    document.getElementById('otp-sub').textContent =
      `We sent a 6-digit code to ${state.phone}${data.dev_code ? ` (demo code: ${data.dev_code})` : ''}`;
    goTo('step-su-otp');
  } catch {
    err.textContent = 'Could not send SMS. Please try again.';
  }
});

/* ── STEP 7: OTP ── */
const otpBoxes = document.querySelectorAll('.otp-box');
otpBoxes.forEach((box, i) => {
  box.addEventListener('input', () => {
    box.value = box.value.replace(/\D/g,'').slice(-1);
    box.classList.toggle('filled', box.value !== '');
    if (box.value && i < otpBoxes.length - 1) otpBoxes[i + 1].focus();
  });
  box.addEventListener('keydown', e => {
    if (e.key === 'Backspace' && !box.value && i > 0) otpBoxes[i - 1].focus();
  });
  box.addEventListener('paste', e => {
    e.preventDefault();
    const paste = (e.clipboardData || window.clipboardData).getData('text').replace(/\D/g,'');
    otpBoxes.forEach((b, j) => { b.value = paste[j] || ''; b.classList.toggle('filled', !!b.value); });
  });
});

document.getElementById('resend-btn').addEventListener('click', async e => {
  e.preventDefault();
  const err = document.getElementById('otp-error');
  err.textContent = '';
  try {
    const res = await fetch(`${API}/auth/send-otp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone: state.phone })
    });
    const data = await res.json();
    if (data.dev_code) {
      document.getElementById('otp-sub').textContent = `Code resent (demo: ${data.dev_code})`;
    } else {
      document.getElementById('otp-sub').textContent = 'Code resent!';
    }
  } catch { err.textContent = 'Could not resend code.'; }
});

document.getElementById('btn-verify-otp').addEventListener('click', async () => {
  const code = Array.from(otpBoxes).map(b => b.value).join('');
  const err  = document.getElementById('otp-error');
  if (code.length < 6) { err.textContent = 'Please enter all 6 digits.'; return; }

  try {
    /* Verify OTP */
    const verRes = await fetch(`${API}/auth/verify-otp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone: state.phone, code })
    });
    if (!verRes.ok) { const d = await verRes.json(); err.textContent = d.detail || 'Invalid code.'; return; }
    err.textContent = '';
    goTo('step-su-face');
    initFaceVerification();
  } catch (ex) {
    err.textContent = 'Something went wrong. Please try again.';
  }
});

/* ── STEP 8: FACE VERIFICATION ── */
let faceDetectionInterval = null;
let isFaceApiLoaded = false;

async function initFaceVerification() {
  const status = document.getElementById('face-status');
  const captureBtn = document.getElementById('btn-capture-face');
  
  try {
    if (!isFaceApiLoaded) {
      status.textContent = 'Loading AI models...';
      const MODEL_URL = './assets/models';
      await Promise.all([
        faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
        faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
        faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL)
      ]);
      isFaceApiLoaded = true;
    }
    
    startCamera();
  } catch (err) {
    console.error('FaceAPI init error:', err);
    status.textContent = 'Verification error. Please skip.';
  }
}

async function startCamera() {
  const video = document.getElementById('camera-feed');
  const status = document.getElementById('face-status');
  const canvas = document.getElementById('camera-overlay');
  
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 480 } });
    video.srcObject = stream;
    
    video.onloadedmetadata = () => {
      const displaySize = { width: video.offsetWidth, height: video.offsetHeight };
      faceapi.matchDimensions(canvas, displaySize);
      
      faceDetectionInterval = setInterval(async () => {
        const detections = await faceapi.detectSingleFace(video, new faceapi.TinyFaceDetectorOptions()).withFaceLandmarks();
        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        
        if (detections) {
          const resizedDetections = faceapi.resizeResults(detections, displaySize);
          faceapi.draw.drawDetections(canvas, resizedDetections);
          status.textContent = '✅ Face detected! Hold still...';
          status.style.color = '#4ADE80';
          document.getElementById('btn-capture-face').disabled = false;
        } else {
          status.textContent = '🔍 Adjust camera to see your face';
          status.style.color = '#fff';
          document.getElementById('btn-capture-face').disabled = true;
        }
      }, 200);
    };
  } catch (err) {
    status.textContent = '❌ Camera access denied';
    console.error('Camera error:', err);
  }
}

function stopCamera() {
  const video = document.getElementById('camera-feed');
  const stream = video.srcObject;
  if (stream) {
    stream.getTracks().forEach(track => track.stop());
    video.srcObject = null;
  }
  if (faceDetectionInterval) clearInterval(faceDetectionInterval);
  const canvas = document.getElementById('camera-overlay');
  if (canvas) {
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  }
}

document.getElementById('btn-skip-face').addEventListener('click', () => {
  state.faceVerified = false;
  finalizeRegistration();
});

document.getElementById('btn-capture-face').addEventListener('click', () => {
  state.faceVerified = true;
  finalizeRegistration();
});

async function finalizeRegistration() {
  stopCamera();
  const err = document.getElementById('otp-error'); // Reuse OTP error field or add to face step
  
  try {
    const [fname, ...rest] = state.name.split(' ');
    const regRes = await fetch(`${API}/users/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name:                 state.name,
        email:                state.email,
        government_id:        `AUTO-${Date.now()}`,
        face_verified:        state.faceVerified,
        rating:               5.0,
        delivery_success_rate: 1.0,
        cancellation_count:   0,
        password:             state.password,
        dob:                  state.dob,
        title:                state.title,
        phone:                state.phone
      })
    });
    const user = await regRes.json();
    if (!regRes.ok) { 
        // Redirect back to OTP if registration fails
        goTo('step-su-otp');
        err.textContent = user.detail || 'Registration failed.'; 
        return; 
    }

    state.userId = user.id;
    sessionStorage.setItem('airide_user', JSON.stringify(user));
    goTo('step-success');
  } catch (ex) {
    console.error(ex);
    goTo('step-su-otp');
    err.textContent = 'Connection error. Please try again.';
  }
}

/* Original Registration logic removed from OTP Verify button as it's now in finalizeRegistration */

/* ── LOGIN: Email ── */
document.getElementById('btn-li-email-next').addEventListener('click', () => {
  const val = document.getElementById('li-email').value.trim();
  const err = document.getElementById('li-email-error');
  if (!val || val.indexOf('@') < 1) {
    err.textContent = 'Please enter your email address (e.g. name@gmail.com).'; return;
  }
  err.textContent = '';
  document.getElementById('li-pw-sub').textContent = `Logging in as ${val}`;
  goTo('step-li-password');
});
document.getElementById('li-email').addEventListener('keydown', e => {
  if (e.key === 'Enter') document.getElementById('btn-li-email-next').click();
});

/* Login: Password */
document.getElementById('toggle-li-pw').addEventListener('click', () => {
  const f = document.getElementById('li-password');
  f.type = f.type === 'password' ? 'text' : 'password';
});

document.getElementById('btn-li-submit').addEventListener('click', async () => {
  const email = document.getElementById('li-email').value.trim();
  const pw    = document.getElementById('li-password').value;
  const err   = document.getElementById('li-pw-error');
  if (!pw) { err.textContent = 'Please enter your password.'; return; }

  try {
    const res = await fetch(`${API}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password: pw })
    });
    const data = await res.json();
    if (res.status === 422) { err.textContent = 'Invalid email format. Please go back and re-enter.'; return; }
    if (!res.ok) { err.textContent = data.detail || 'Login failed. Check your email and password.'; return; }

    sessionStorage.setItem('airide_user', JSON.stringify(data));
    document.getElementById('success-title').textContent = `Welcome back, ${data.name.split(' ')[0]}!`;
    document.getElementById('success-sub').textContent   = 'You\'re logged in to AIRide';
    err.textContent = '';
    goTo('step-success');
  } catch {
    err.textContent = 'Could not connect to server. Please check your connection.';
  }
});
document.getElementById('li-password').addEventListener('keydown', e => {
  if (e.key === 'Enter') document.getElementById('btn-li-submit').click();
});

/* ── Success → App ── */
document.getElementById('btn-go-app').addEventListener('click', () => {
  window.location.href = 'http://127.0.0.1:8080/index.html';
});

/* ── Auth guard: redirect to auth if no session ── */
// (index.html checks for airide_user in sessionStorage)
