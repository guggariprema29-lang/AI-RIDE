// Public landing page — full-bleed cinematic hero, then a bento product section.

import { icon } from '../icons.js';
import { store } from '../store.js';
import { navigate } from '../router.js';
import { api } from '../api.js';
import { createMap, LiveRidesLayer } from '../map.js';

const STEPS = [
  {
    title: 'Publish the trip you were making anyway',
    body: 'Where you are, where you are heading, your vehicle and free seats. Nothing else about your day changes.',
  },
  {
    title: 'You appear live on the map',
    body: 'A bike or car marker carries your position and direction to everyone searching that corridor.',
  },
  {
    title: 'Passengers on your path book a seat',
    body: 'Only people whose pickup and drop both sit along your route can see you, so you never detour far.',
  },
  {
    title: 'Share the cost, not a fare',
    body: 'Fares come from the shared distance alone. No surge, no commission, no profit — a legal cost split.',
  },
];

// Shown on the map tile when nothing is live, so the section is never a dead
// grey rectangle. Clearly labelled as a sample.
const SAMPLE_RIDES = [
  {
    id: -1, rider_name: 'Anusha A.', rider_public_id: 'AR-000012', vehicle_type: 'car',
    origin: 'Chikodi', destination: 'Belagavi', status: 'started',
    seats_available: 3, seats_total: 4, total_distance_m: 64900,
    departure_time: new Date(Date.now() + 18e5).toISOString(),
    origin_lat: 16.4269, origin_lng: 74.5883, current_lat: 16.4269, current_lng: 74.5883,
    polyline: [
      { latitude: 16.4269, longitude: 74.5883 },
      { latitude: 16.1383, longitude: 74.543 },
      { latitude: 15.8497, longitude: 74.4977 },
    ],
  },
  {
    id: -2, rider_name: 'Sneha S.', rider_public_id: 'AR-000031', vehicle_type: 'bike',
    origin: 'Nippani', destination: 'Hukkeri', status: 'available',
    seats_available: 1, seats_total: 1, total_distance_m: 31200,
    departure_time: new Date(Date.now() + 36e5).toISOString(),
    origin_lat: 16.44, origin_lng: 74.61, current_lat: 16.44, current_lng: 74.61,
    polyline: [
      { latitude: 16.44, longitude: 74.61 },
      { latitude: 16.3, longitude: 74.57 },
      { latitude: 16.17, longitude: 74.53 },
    ],
  },
  {
    id: -3, rider_name: 'Pradnya K.', rider_public_id: 'AR-000047', vehicle_type: 'auto',
    origin: 'Sankeshwar', destination: 'Athani', status: 'available',
    seats_available: 2, seats_total: 3, total_distance_m: 48000,
    departure_time: new Date(Date.now() + 54e5).toISOString(),
    origin_lat: 16.39, origin_lng: 74.57, current_lat: 16.39, current_lng: 74.57,
    polyline: [
      { latitude: 16.39, longitude: 74.57 },
      { latitude: 16.55, longitude: 74.4 },
      { latitude: 16.705, longitude: 74.22 },
    ],
  },
];

export default function landingView(container) {
  const authed = store.isAuthed;
  const startPath = authed ? '/home' : '/signup';

  container.innerHTML = `
    <section class="hero-cine">
      <div class="hero-media">
        <video autoplay muted loop playsinline preload="auto"
               poster="assets/video/hero-poster.jpg"
               aria-hidden="true" tabindex="-1"></video>
      </div>

      <div class="hero-inner">
        <span class="eyebrow">${icon('sparkles', 14)} Two portals · one journey</span>
        <h1>
          Every traveller is<br>
          <span class="accent-text">already a ride.</span>
        </h1>
        <p class="lede">
          Share the seat you were driving empty. Ride with someone already going your way.
        </p>
        <div class="hero-actions">
          <button class="btn btn-primary btn-lg" data-go="${startPath}">
            ${authed ? 'Open my dashboard' : 'Get started'} ${icon('arrowRight', 18)}
          </button>
          ${authed ? '' : `<button class="btn btn-lg btn-ghost-light" data-go="/login">Sign in</button>`}
        </div>
      </div>

      <button class="scroll-cue" data-scroll-next aria-label="Scroll to see how it works">
        <span>How it works</span>
        ${icon('arrowRight', 16, 'rotate-down')}
      </button>
    </section>

    <section class="section" id="how-it-works">
      <div class="container">
        <div class="section-head reveal">
          <h2>One account. Both sides of the trip.</h2>
          <p>Most people ride out and travel back. The same profile, ride ID and trust score carries across both.</p>
        </div>

        <div class="bento reveal">
          <article class="tile tile-map">
            <div class="tile-head">
              <div>
                <h3>Live right now</h3>
                <p class="small muted" style="margin:0">Every published trip, moving in real time.</p>
              </div>
              <span class="badge" data-live-count>Loading…</span>
            </div>
            <div id="landing-map" class="tile-map-canvas" role="img"
                 aria-label="Live map of travellers currently sharing their route"></div>
          </article>

          <button class="tile tile-action" data-go="${authed ? '/rider' : '/signup'}">
            <span class="portal-icon">${icon('car', 22)}</span>
            <h3>Rider portal</h3>
            <p class="small">Publish your trip, set free seats, go live on the map in one tap.</p>
            <span class="tile-cta">Offer a ride ${icon('arrowRight', 15)}</span>
          </button>

          <button class="tile tile-action" data-go="${authed ? '/passenger' : '/login'}">
            <span class="portal-icon">${icon('users', 22)}</span>
            <h3>Passenger portal</h3>
            <p class="small">See only travellers whose route already covers your pickup and drop.</p>
            <span class="tile-cta">Find a ride ${icon('arrowRight', 15)}</span>
          </button>

          <article class="tile tile-trust">
            <div class="trust-dial" style="--score:82">
              <span class="trust-dial-value">82</span>
            </div>
            <div>
              <h3>Trust score on every profile</h3>
              <p class="small" style="margin:0">
                Identity checks, ratings, cancellations and reports collapse into one 0–100 number,
                shown before you book.
              </p>
            </div>
          </article>

          <article class="tile tile-match">
            <div class="tile-head">
              <h3>Real route overlap</h3>
              <span class="badge badge-accent">100% match</span>
            </div>
            <div class="route-line">
              <div class="route-step"><span class="dot"></span><span>Chikodi</span></div>
              <div class="route-step to"><span class="dot"></span><span>Belagavi</span></div>
            </div>
            <div class="meter"><span style="width:100%"></span></div>
            <p class="xsmall muted" style="margin:0">
              Matching compares full polylines, in direction order — "on the way" actually means on the way.
            </p>
          </article>

          <article class="tile tile-split">
            <div>
              <div class="tile-figure">₹0</div>
              <h3>Commission taken</h3>
              <p class="small" style="margin:0">Fares are computed from shared distance alone. No surge, no cut, no profit.</p>
            </div>
            <div>
              <div class="tile-figure">${icon('leaf', 26)}</div>
              <h3>Carbon counted</h3>
              <p class="small" style="margin:0">Every shared kilometre reports the emissions avoided against two separate trips.</p>
            </div>
          </article>
        </div>
      </div>
    </section>

    <section class="section">
      <div class="container steps-layout">
        <div class="steps-intro reveal">
          <h2>How a shared trip works</h2>
          <p>Four steps. No dispatcher, no fleet, no middleman between you and the person in the next seat.</p>
          <button class="btn btn-primary" data-go="${startPath}">
            ${authed ? 'Open my dashboard' : 'Create my account'} ${icon('arrowRight', 16)}
          </button>
        </div>

        <ol class="steps-list reveal">
          ${STEPS.map((step, index) => `
            <li>
              <span class="steps-num">0${index + 1}</span>
              <div>
                <h3>${step.title}</h3>
                <p class="small" style="margin:0">${step.body}</p>
              </div>
            </li>
          `).join('')}
        </ol>
      </div>
    </section>

    <section class="section">
      <div class="container">
        <div class="closing reveal">
          <h2>Ready to share<br>the road?</h2>
          <div class="row" style="justify-content:center">
            <button class="btn btn-primary btn-lg" data-go="${startPath}">
              ${authed ? 'Open my dashboard' : 'Create my account'} ${icon('arrowRight', 18)}
            </button>
          </div>
          <p class="xsmall muted" style="margin:0">
            You get a permanent ride ID like <span class="badge badge-id">AR-000042</span>, shown to the other party before every trip.
          </p>
        </div>
      </div>
    </section>
  `;

  container.querySelectorAll('[data-go]').forEach((button) => {
    button.addEventListener('click', () => navigate(button.dataset.go));
  });

  container.querySelector('[data-scroll-next]').addEventListener('click', () => {
    container.querySelector('#how-it-works').scrollIntoView({ behavior: 'smooth', block: 'start' });
  });

  /* ── Hero video ────────────────────────────────────────────────────────── */

  const video = container.querySelector('.hero-media video');

  // Serve the encode that matches the panel, so a 4K display gets true 4K and
  // a phone on mobile data does not pull 15 MB.
  function pickSource() {
    if (navigator.connection?.saveData) return 'assets/video/hero-720.mp4';
    const pixels = window.innerWidth * Math.min(window.devicePixelRatio || 1, 2);
    if (pixels >= 2400) return 'assets/video/hero-2160.mp4';
    if (pixels >= 1100) return 'assets/video/hero-1440.mp4';
    return 'assets/video/hero-720.mp4';
  }

  video.src = pickSource();
  video.muted = true;
  video.loop = true;
  video.autoplay = true;

  // The hero loops forever on its own. There is no control for it — if
  // anything ever stops it while the hero is on screen, it starts again.
  let heroVisible = true;

  async function tryPlay() {
    if (!heroVisible) return;
    try {
      await video.play();
    } catch {
      // Autoplay blocked until the first interaction — retried below.
    }
  }

  tryPlay();
  video.addEventListener('pause', () => { if (heroVisible) tryPlay(); });
  video.addEventListener('ended', tryPlay);
  window.addEventListener('pointerdown', tryPlay, { once: true });
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) tryPlay();
  });

  // Decoding a full-bleed 4K video while it is off screen drains a phone for
  // nothing — park it there, and pick straight back up on return.
  const heroWatcher = new IntersectionObserver(
    ([entry]) => {
      heroVisible = entry.isIntersecting;
      if (heroVisible) tryPlay();
      else video.pause();
    },
    { threshold: 0.05 }
  );
  heroWatcher.observe(container.querySelector('.hero-cine'));

  /* ── Scroll reveal ─────────────────────────────────────────────────────── */

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add('is-visible');
        observer.unobserve(entry.target);
      });
    },
    { rootMargin: '0px 0px -10% 0px' }
  );
  container.querySelectorAll('.reveal').forEach((node) => observer.observe(node));

  /* ── Live map tile ─────────────────────────────────────────────────────── */

  const map = createMap(container.querySelector('#landing-map'));
  const layer = new LiveRidesLayer(map);
  const countNode = container.querySelector('[data-live-count]');
  let timer = null;

  function showSample() {
    layer.render(SAMPLE_RIDES);
    layer.fit();
    countNode.textContent = 'Sample view';
    countNode.className = 'badge';
  }

  async function refresh() {
    try {
      const { rides, count } = await api.liveRides();
      if (!count) { showSample(); return; }
      layer.render(rides);
      layer.fit();
      countNode.innerHTML = `<span class="live-dot"></span> ${count} live now`;
      countNode.className = 'badge badge-success';
    } catch {
      showSample();
    }
  }

  refresh();
  timer = setInterval(refresh, 15000);

  return {
    destroy() {
      clearInterval(timer);
      observer.disconnect();
      heroWatcher.disconnect();
      layer.destroy();
      map.remove();
    },
  };
}
