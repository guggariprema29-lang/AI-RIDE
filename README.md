# AI Ride

Intelligent route overlap and trust-based matching for decentralised cost-sharing mobility.

Anyone already travelling somewhere can carry a passenger going the same way. The app has
**two portals** on one account:

| Portal | What it does |
|---|---|
| **Rider** | Publish where you are and where you are heading. You appear live on the map as a bike / auto / car marker with your route and free seats. |
| **Passenger** | Enter pickup and drop. See only travellers whose route passes both points, in the right order, ranked by overlap, detour and trust. Book a seat. |

Every account gets a permanent public ride ID (`AR-000042`) shown to the other party.

---

## Run it

### 1. Database

PostgreSQL is required (PostGIS optional — the app falls back to Python geometry).

```bash
createdb ride_sharing_db
```

### 2. Environment

```bash
cp .env.example backend/.env
```

Edit `backend/.env`:

| Platform | `DB_USER` | `DB_PASSWORD` |
|---|---|---|
| Windows (official installer) | `postgres` | the password you set during install |
| macOS (Homebrew) | your macOS username | leave blank — local connections are trusted |
| Linux | `postgres` | whatever you set for that role |

Twilio keys are optional — without them OTP runs in demo mode and shows the code on screen.

### 3. Backend

**macOS / Linux**

```bash
python3 -m venv .venv && source .venv/bin/activate && pip install -r requirements.txt
```

```bash
cd backend && python -m uvicorn app:app --reload --host 127.0.0.1 --port 8000
```

**Windows (PowerShell)**

```powershell
py -m venv .venv; .\.venv\Scripts\Activate.ps1; pip install -r requirements.txt
```

```powershell
cd backend; python -m uvicorn app:app --reload --host 127.0.0.1 --port 8000
```

Python 3.10+ is recommended. The code runs on 3.9, but nothing older.

### 4. Frontend

In a second terminal:

```bash
cd frontend && python3 -m http.server 8080 --bind 127.0.0.1
```

On Windows use `python` instead of `python3`. Make sure nothing else is already bound to
port 8000 — a stray `python -m http.server 8000` will answer instead of the API and every
request will fail.

| What | URL |
|---|---|
| App | http://127.0.0.1:8080/ |
| API docs | http://127.0.0.1:8000/docs |

The frontend talks to `http://127.0.0.1:8000` by default. To point it elsewhere, run
`localStorage.setItem('airide_api', 'http://your-host:8000')` in the browser console.

---

## Structure

```
backend/
  app.py           FastAPI routes: auth, rider, passenger, bookings, wallet, legacy parcel matching
  rides.py         rides + bookings tables and queries, public ID issuing
  matching.py      passenger ⇄ ride matching: overlap, direction, detour, fare
  route_engine.py  haversine, polyline length, overlap score
  ai_engine.py     trust score, risk level, carbon savings
  compliance.py    weight/category limits, cost-share, earnings cap
  models.py        users + routes tables, wallet and escrow
  schemas.py       Pydantic request/response models

frontend/
  index.html       single page shell
  css/tokens.css   design tokens (dark + light)
  css/app.css      component styles
  js/app.js        bootstrap, header, route table
  js/router.js     hash router with auth guards
  js/api.js        backend client + Nominatim geocoding
  js/map.js        Leaflet helpers, live vehicle markers
  js/store.js      session, theme, recent trips
  js/views/        landing, auth, home, rider, passenger, trips, profile
  _legacy/         previous prototype pages, kept for reference
```

## Routes

| Path | Portal | Auth |
|---|---|---|
| `#/` | Landing page with the live map | public |
| `#/login`, `#/signup` | Account | guests only |
| `#/home` | Portal chooser and activity summary | required |
| `#/rider` | Publish a ride, manage seat requests | required |
| `#/passenger` | Search and book rides on your route | required |
| `#/bookings` | Your seats, with live tracking | required |
| `#/trips` | Rides you have published | required |
| `#/profile` | Ride ID, trust breakdown, wallet | required |

## API

| Method | Path | Purpose |
|---|---|---|
| `POST` | `/users/register` | Create account, issues `public_id` |
| `POST` | `/auth/login` | Sign in |
| `POST` | `/auth/send-otp`, `/auth/verify-otp` | Phone verification |
| `POST` | `/rides/publish` | Rider goes available |
| `GET` | `/rides/live` | Every ride currently on the map |
| `POST` | `/rides/search` | Passenger match search |
| `POST` | `/rides/{id}/location` | Push live position |
| `POST` | `/rides/{id}/status` | available / started / completed / cancelled |
| `POST` | `/bookings` | Book seats |
| `GET` | `/bookings/passenger/{id}`, `/bookings/rider/{id}` | Booking lists |
| `POST` | `/bookings/{id}/status` | accept / reject / complete / cancel |
| `GET` | `/wallet/balance/{id}`, `POST /wallet/deposit` | Wallet |
| `POST` | `/escrow/hold`, `/escrow/release`, `/escrow/refund` | Escrow |

## How matching works

1. Only rides with status `available` or `started` and enough free seats are considered.
2. The passenger's pickup and drop are each snapped to the nearest point on the rider's polyline.
3. The drop must come **after** the pickup along that polyline — same direction of travel.
4. Both snap distances must be under the passenger's chosen walk radius (default 2 km).
5. Overlap = shared corridor length ÷ the passenger's direct distance. Below 45% the ride is dropped.
6. Fare = shared kilometres × the rider's ₹/km cost share. No commission, no surge.
7. Results are sorted by overlap, then detour, then departure time.

## Deploying free (Vercel + Render)

Full walkthrough with screenshots of every setting is in
[docs/AI-Ride-Documentation.pdf](docs/AI-Ride-Documentation.pdf), section 7. Short version:

### 1. Backend + database on Render

Push to GitHub, then on Render pick **New → Blueprint** and select the repo. The bundled
[render.yaml](render.yaml) provisions the FastAPI service and a free PostgreSQL instance
together, and wires `DATABASE_URL` automatically. Tables are created on first boot.

### 2. Frontend on Vercel

Put the Render URL into `frontend/index.html`:

```html
<meta name="airide-api" content="https://airide-api.onrender.com">
```

Push, then on Vercel choose **Add New → Project** and import the repo. [vercel.json](vercel.json)
already points at `frontend/`; framework preset **Other**, no build command.

### 3. Let them talk

In Render, set `ALLOWED_ORIGINS` to your Vercel URL and redeploy. Preview deployments on
`*.vercel.app` are allowed automatically.

### Free-tier caveats

- The API sleeps after ~15 min idle; the next request takes ~50 s. The app shows a "waking up"
  message rather than an error. Open the site a minute before any demo.
- Render's free Postgres expires after 30 days.
- `frontend/assets/video/` is 25 MB. If pushing that bothers you, drop `hero-2160.mp4` — the
  1440p file still looks sharp on a laptop.

## Documentation

[docs/AI-Ride-Documentation.pdf](docs/AI-Ride-Documentation.pdf) — 10 pages covering the working
flow with diagrams, login and credential rules, matching logic, trust scoring, the API, hosting
and known limitations.

## Browser support

Built for current Chrome, Edge, Safari and Firefox on desktop and mobile. The glass
surfaces need `backdrop-filter` and `color-mix()` — Chrome/Edge 111+, Safari 16.4+,
Firefox 113+. Older browsers still render everything, just with flatter panels.

Layout is verified free of horizontal scrolling from 320px (iPhone SE) through 1536px.
Top navigation switches to a bottom tab bar below 960px.

## Known gaps

- No JWT/session tokens: endpoints trust the `user_id` sent by the client. This is the
  most important thing to fix before any real deployment.
- Polylines are straight lines between endpoints. Wiring OSRM would make overlap realistic.
- Trust scoring is a weighted formula, not a trained model.
- Wallet and fare columns are `REAL`; money should be `NUMERIC`.
- OTP codes are stored in memory and returned in the response in demo mode.
# AI-RIDE
