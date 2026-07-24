// ── AIRide — OpenStreetMap (Leaflet + Nominatim + OSRM) ──────────────────────
const API_BASE_URL = "http://127.0.0.1:8000";

// Map state
let map = null;
let routeLayer = null;       // Leaflet polyline for the route
let originMarker = null;
let destMarker = null;
let userLocMarker = null;
let currentPolyline = [];    // [{latitude, longitude}, ...] — sent to backend
let lastPreviewedOrigin = "";
let lastPreviewedDest = "";

// ── Helpers ──────────────────────────────────────────────────────────────────

function showMessage(elementId, text, isError = false) {
    const el = document.getElementById(elementId);
    if (!el) return;
    el.textContent = text;
    el.style.color = isError ? "#F87171" : "";
}

function setMapStatus(text, ok = true) {
    const el = document.getElementById("maps-key-status");
    if (!el) return;
    el.textContent = text;
    el.style.color = ok ? "rgba(167,243,208,0.9)" : "#F87171";
}

/** 
 * Simplifies a polyline to a maximum number of points to keep backend matching fast.
 */
function simplifyPolyline(points, maxPoints = 150) {
    if (points.length <= maxPoints) return points;
    const step = Math.floor(points.length / maxPoints);
    const result = [];
    for (let i = 0; i < points.length; i += step) {
        result.push(points[i]);
        if (result.length >= maxPoints) break;
    }
    // Ensure we always include the last point
    if (result[result.length - 1] !== points[points.length - 1]) {
        result.push(points[points.length - 1]);
    }
    return result;
}

// ── Map Initialisation ───────────────────────────────────────────────────────

function initMap() {
    if (map) return;   // already initialised
    if (typeof L === "undefined" || !document.getElementById("map")) return;

    map = L.map("map", {
        center: [12.9716, 77.5946],   // Bengaluru default
        zoom: 12,
        zoomControl: true,
        attributionControl: true,
    });

    // OpenStreetMap tile layer (free, no key)
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        attribution: '© <a href="https://www.openstreetmap.org/copyright" target="_blank">OpenStreetMap</a> contributors',
    }).addTo(map);

    setMapStatus("🗺️ OpenStreetMap loaded — enter origin & destination and click Preview", true);
}

// ── Custom SVG Markers ───────────────────────────────────────────────────────

function makeIcon(color, letter) {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="36" height="44" viewBox="0 0 36 44">
      <defs>
        <radialGradient id="g${letter}" cx="50%" cy="30%" r="70%">
          <stop offset="0%" stop-color="${color === 'origin' ? '#A78BFA' : '#F87171'}"/>
          <stop offset="100%" stop-color="${color === 'origin' ? '#7C3AED' : '#DC2626'}"/>
        </radialGradient>
        <filter id="sh"><feDropShadow dx="0" dy="3" stdDeviation="3" flood-color="rgba(0,0,0,0.45)"/></filter>
      </defs>
      <path d="M18 0C8.06 0 0 8.06 0 18c0 13.5 18 26 18 26S36 31.5 36 18C36 8.06 27.94 0 18 0z"
            fill="url(#g${letter})" filter="url(#sh)"/>
      <circle cx="18" cy="18" r="7" fill="white" opacity="0.92"/>
      <text x="18" y="23" font-family="Inter,sans-serif" font-size="10" font-weight="800"
            text-anchor="middle" fill="${color === 'origin' ? '#7C3AED' : '#DC2626'}">${letter}</text>
    </svg>`;
    return L.divIcon({
        html: svg,
        iconSize: [36, 44],
        iconAnchor: [18, 44],
        popupAnchor: [0, -44],
        className: "",
    });
}

function makeUserIcon() {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 22 22">
      <circle cx="11" cy="11" r="9" fill="#3B82F6" stroke="white" stroke-width="2.5"/>
      <circle cx="11" cy="11" r="4" fill="white"/>
    </svg>`;
    return L.divIcon({
        html: svg,
        iconSize: [22, 22],
        iconAnchor: [11, 11],
        className: "",
    });
}

// ── Geocoding via Nominatim ──────────────────────────────────────────────────

async function geocode(placeName) {
    if (!placeName) return null;
    
    // 1. Detect coordinates (e.g. "12.97, 77.59")
    const coordMatch = placeName.match(/^(-?\d+\.\d+),\s*(-?\d+\.\d+)$/);
    if (coordMatch) {
        return { lat: parseFloat(coordMatch[1]), lng: parseFloat(coordMatch[2]), display: placeName };
    }

    // 2. Try India search first
    let url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(placeName)}&format=json&limit=10&countrycodes=in&accept-language=en`;
    let res = await fetch(url, { headers: { "Accept-Language": "en", "User-Agent": "AIRideApp/1.0" } });
    let data = await res.json();

    // 3. Fallback to global search if India yields nothing
    if (!data.length) {
        url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(placeName)}&format=json&limit=10&accept-language=en`;
        res = await fetch(url, { headers: { "Accept-Language": "en", "User-Agent": "AIRideApp/1.0" } });
        data = await res.json();
    }

    if (!data.length) throw new Error(`Location not found: "${placeName}". Try adding a city or state name.`);
    
    // Sort results to prefer specific features over broad administrative boundaries
    const preferredTypes = ["city", "town", "village", "suburb", "hamlet", "neighbourhood", "station", "airport", "bus_stop"];
    const bestMatch = data.sort((a, b) => {
        const aType = preferredTypes.indexOf(a.type);
        const bType = preferredTypes.indexOf(b.type);
        const aScore = (a.importance || 0.5) + (aType !== -1 ? 0.3 : 0);
        const bScore = (b.importance || 0.5) + (bType !== -1 ? 0.3 : 0);
        return bScore - aScore;
    })[0];
    
    return { lat: parseFloat(bestMatch.lat), lng: parseFloat(bestMatch.lon), display: bestMatch.display_name };
}

// ── Routing via OSRM ─────────────────────────────────────────────────────────

async function fetchOSRMRoute(origin, dest) {
    // OSRM public server — driving profile, full geometry
    const url = `https://router.project-osrm.org/route/v1/driving/` +
        `${origin.lng},${origin.lat};${dest.lng},${dest.lat}` +
        `?overview=full&geometries=geojson&steps=false`;

    const res = await fetch(url);
    if (!res.ok) throw new Error(`OSRM routing failed (${res.status})`);
    const data = await res.json();
    if (data.code !== "Ok" || !data.routes.length) throw new Error("No route found between these locations.");

    const route = data.routes[0];
    // GeoJSON coordinates are [lng, lat] — convert to backend format [{latitude, longitude}]
    const polyline = route.geometry.coordinates.map(([lng, lat]) => ({ latitude: lat, longitude: lng }));

    return {
        polyline,
        distanceKm: (route.distance / 1000).toFixed(1),
        durationMin: Math.round(route.duration / 60),
    };
}

// ── Draw Route on Leaflet Map ─────────────────────────────────────────────────

let routeGlowLayer = null;

function drawRouteOnMap(polyline, originInfo, destInfo) {
    if (!map) return;

    // Remove old layers
    if (routeLayer)     { map.removeLayer(routeLayer);     routeLayer = null; }
    if (routeGlowLayer) { map.removeLayer(routeGlowLayer); routeGlowLayer = null; }
    if (originMarker)   { map.removeLayer(originMarker);   originMarker = null; }
    if (destMarker)     { map.removeLayer(destMarker);     destMarker = null; }

    // Convert polyline to Leaflet format [lat, lng]
    const latlngs = polyline.map(p => [p.latitude, p.longitude]);

    // Outer glow (white, wider)
    routeGlowLayer = L.polyline(latlngs, {
        color: "rgba(255,255,255,0.18)",
        weight: 10,
        smoothFactor: 1,
    }).addTo(map);

    // Main route (purple gradient via colour)
    routeLayer = L.polyline(latlngs, {
        color: "#A78BFA",
        weight: 5,
        smoothFactor: 1,
        lineCap: "round",
        lineJoin: "round",
    }).addTo(map);

    // Markers (Draggable for ultimate precision)
    originMarker = L.marker([originInfo.lat, originInfo.lng], { icon: makeIcon("origin", "A"), draggable: true })
        .addTo(map)
        .bindPopup(`<b>Origin</b><br>${originInfo.display ? originInfo.display.split(",")[0] : 'Custom'}`);

    destMarker = L.marker([destInfo.lat, destInfo.lng], { icon: makeIcon("dest", "B"), draggable: true })
        .addTo(map)
        .bindPopup(`<b>Destination</b><br>${destInfo.display ? destInfo.display.split(",")[0] : 'Custom'}`);

    originMarker.on("dragend", updateRouteFromMarkers);
    destMarker.on("dragend", updateRouteFromMarkers);

    // Fit bounds with padding
    const bounds = L.latLngBounds(latlngs);
    map.fitBounds(bounds, { padding: [40, 40] });
}

async function updateRouteFromMarkers() {
    setMapStatus("🛣️ Updating route from new marker position…", true);
    try {
        const oLatLng = originMarker.getLatLng();
        const dLatLng = destMarker.getLatLng();
        
        const originInfo = { lat: oLatLng.lat, lng: oLatLng.lng, display: "Custom Location" };
        const destInfo = { lat: dLatLng.lat, lng: dLatLng.lng, display: "Custom Location" };

        // Fetch the new driving route
        const { polyline, distanceKm, durationMin } = await fetchOSRMRoute(originInfo, destInfo);
        currentPolyline = polyline;
        
        // Redraw route with new coordinates
        drawRouteOnMap(polyline, originInfo, destInfo);
        setMapStatus(`✅ Route updated — ${distanceKm} km · ~${durationMin} min`, true);

        // Update summary boxes
        document.getElementById("route-summary").style.display = "flex";
        document.getElementById("summary-distance").textContent = `${distanceKm} km`;
        document.getElementById("summary-duration").textContent = durationMin >= 60 
            ? `${Math.floor(durationMin/60)}h ${durationMin%60}m` 
            : `${durationMin} min`;

        // Reverse geocode to update the text boxes automatically
        Promise.all([
            fetch(`https://nominatim.openstreetmap.org/reverse?lat=${oLatLng.lat}&lon=${oLatLng.lng}&format=json`).then(r=>r.json()),
            fetch(`https://nominatim.openstreetmap.org/reverse?lat=${dLatLng.lat}&lon=${dLatLng.lng}&format=json`).then(r=>r.json())
        ]).then(([oData, dData]) => {
            if (oData.display_name) {
                const name = oData.display_name.split(",")[0];
                document.getElementById("route-origin").value = name;
                lastPreviewedOrigin = name;
            }
            if (dData.display_name) {
                const name = dData.display_name.split(",")[0];
                document.getElementById("route-destination").value = name;
                lastPreviewedDest = name;
            }
        }).catch(() => {});

    } catch (err) {
        setMapStatus(`❌ Route update failed: ${err.message}`, false);
    }
}

// ── Preview Route ─────────────────────────────────────────────────────────────

async function previewRoute() {
    const originVal = document.getElementById("route-origin").value.trim();
    const destVal   = document.getElementById("route-destination").value.trim();

    if (!originVal || !destVal) {
        showMessage("route-result", "⚠️ Please enter both origin and destination.", true);
        return;
    }

    const btn = document.getElementById("preview-route");
    if (btn) { btn.disabled = true; btn.textContent = "Loading…"; }
    setMapStatus("🔍 Geocoding locations…", true);

    try {
        initMap();

        // Geocode both places - sequentially to avoid Nominatim 429/rate limits
        const originInfo = await geocode(originVal);
        const destInfo   = await geocode(destVal);

        setMapStatus("🛣️ Fetching driving route…", true);
        const { polyline, distanceKm, durationMin } = await fetchOSRMRoute(originInfo, destInfo);

        // Update input fields with the official full display name found
        const oShort = originInfo.display ? originInfo.display.split(",")[0] : originVal;
        const dShort = destInfo.display ? destInfo.display.split(",")[0] : destVal;
        
        document.getElementById("route-origin").value = oShort;
        document.getElementById("route-destination").value = dShort;

        currentPolyline = polyline;
        lastPreviewedOrigin = oShort;
        lastPreviewedDest   = dShort;
        
        drawRouteOnMap(polyline, originInfo, destInfo);

        setMapStatus(`✅ Route loaded — ${distanceKm} km · ~${durationMin} min`, true);
        
        // Update summary boxes
        document.getElementById("route-summary").style.display = "flex";
        document.getElementById("summary-distance").textContent = `${distanceKm} km`;
        document.getElementById("summary-duration").textContent = durationMin >= 60 
            ? `${Math.floor(durationMin/60)}h ${durationMin%60}m` 
            : `${durationMin} min`;

        showMessage(
            "route-result",
            `📍 Route preview ready: ${distanceKm} km, ~${durationMin} min · ${polyline.length} points. Click "Submit & Find Matches" to proceed.`
        );

    } catch (err) {
        setMapStatus(`❌ ${err.message}`, false);
        showMessage("route-result", `Error: ${err.message}`, true);
        
        // Clear old markers/paths if geocoding/routing failed to avoid confusion
        if (routeLayer) { map.removeLayer(routeLayer); routeLayer = null; }
        if (routeGlowLayer) { map.removeLayer(routeGlowLayer); routeGlowLayer = null; }
        if (originMarker) { map.removeLayer(originMarker); originMarker = null; }
        if (destMarker) { map.removeLayer(destMarker); destMarker = null; }
        currentPolyline = [];
        
        throw err; // Re-throw so submitRoute knows it failed
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg> Preview on Map`;
        }
    }
}

// ── Use My Location ───────────────────────────────────────────────────────────

function useMyLocation() {
    const btn = document.getElementById("btn-my-location");
    if (btn) { btn.disabled = true; btn.textContent = "Locating…"; }
    setMapStatus("📡 Getting your location…", true);

    const onLocationSuccess = async (lat, lng, source = "GPS") => {
        initMap();

        if (userLocMarker) { map.removeLayer(userLocMarker); }
        userLocMarker = L.marker([lat, lng], { icon: makeUserIcon() })
            .addTo(map)
            .bindPopup(`📍 You are here (${source})`)
            .openPopup();

        map.setView([lat, lng], 14);

        try {
            const res = await fetch(
                `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json`,
                { headers: { "Accept-Language": "en", "User-Agent": "AIRideApp/1.0" } }
            );
            const data = await res.json();
            const place = data.display_name
                ? data.address?.suburb || data.address?.city || data.display_name.split(",")[0]
                : `${lat.toFixed(4)}, ${lng.toFixed(4)}`;

            document.getElementById("route-origin").value = place;
            setMapStatus(`📍 Location detected: ${place}`, true);
        } catch {
            document.getElementById("route-origin").value = `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
            setMapStatus("📍 Location detected", true);
        }

        if (btn) { btn.disabled = false; btn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/></svg> My Location`; }
    };

    if (!navigator.geolocation) {
        showMessage("route-result", "⚠️ Geolocation is not supported by your browser.", true);
        return;
    }

    const geolocationOptions = { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 };

    navigator.geolocation.getCurrentPosition(
        (pos) => onLocationSuccess(pos.coords.latitude, pos.coords.longitude, "Precise GPS"),
        (err) => {
            console.warn("High accuracy location failed, trying low accuracy...", err);
            // Fallback to low accuracy
            navigator.geolocation.getCurrentPosition(
                (pos) => onLocationSuccess(pos.coords.latitude, pos.coords.longitude, "Approximate Location"),
                (err2) => {
                    let errMsg = err2.message;
                    if (err2.code === 1) {
                        errMsg = "Permission denied by browser. Please allow location access.";
                    } else if (err2.code === 2) {
                        errMsg = "Position unavailable. Windows is blocking location access.";
                        alert("Windows OS is blocking location access.\n\nTo fix this on Windows:\n1. Open Settings -> Privacy & security -> Location\n2. Turn ON 'Location services'\n3. Turn ON 'Let desktop apps access your location'\n\nThen refresh the page and try again.");
                    } else if (err2.code === 3) {
                        errMsg = "Location request timed out. Check your connection.";
                    }
                    
                    setMapStatus(`❌ Location error: ${errMsg}`, false);
                    showMessage("route-result", `⚠️ ${errMsg}`, true);
                    if (btn) { btn.disabled = false; btn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/></svg> My Location`; }
                },
                { enableHighAccuracy: false, timeout: 10000, maximumAge: 600000 }
            );
        },
        geolocationOptions
    );
}

// ── Submit Route & Find Matches ───────────────────────────────────────────────

function renderMatchResults(matches) {
    const el = document.getElementById("match-results");
    if (!matches || matches.length === 0) {
        el.innerHTML = `<div class="match-empty">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.15)" stroke-width="1.5" stroke-linecap="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
          <p>No matches found for this route yet. More riders needed in your area.</p></div>`;
        return;
    }
    el.innerHTML = matches.map(m => {
        const dt = m.departure_time ? new Date(m.departure_time).toLocaleString("en-IN", {
            day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit",
        }) : "—";
        const carbon = m.carbon_savings_kg ? m.carbon_savings_kg.toFixed(1) : "0.0";
        
        const riskClass = String(m.risk_level).toLowerCase().replace(/\s+/g, '-');
        const detourText = m.detour_m >= 1000 ? `${(m.detour_m / 1000).toFixed(1)} km` : `${m.detour_m.toFixed(0)} m`;
        const successRate = m.estimated_delivery_success ? `${m.estimated_delivery_success.toFixed(0)}%` : "N/A";
        
        let recBadgeColor = "#3B82F6"; // Recommended
        if (m.ai_recommendation === "Highly Recommended") recBadgeColor = "#10B981"; // Highly Recommended
        if (m.ai_recommendation === "Not Recommended") recBadgeColor = "#EF4444"; // Not Recommended
        
        let connectBtnHtml = `<button class="btn-match-connect">Connect</button>`;
        if (m.risk_level === "High Risk") {
            connectBtnHtml = `<button class="btn-match-connect" style="background:#4b5563; cursor:not-allowed;" disabled>Blocked (High Risk)</button>`;
        }
        
        return `
      <div class="match-card-item">
        <div class="match-card-top">
          <div class="match-id">Route #${m.route_id}</div>
          <div style="display:flex; gap:6px; align-items:center;">
            <span style="font-size:10px; font-weight:700; text-transform:uppercase; padding:2px 6px; border-radius:12px; background:rgba(255,255,255,0.08); color:${recBadgeColor}; border:1px solid ${recBadgeColor};">${m.ai_recommendation}</span>
            <div class="match-trust">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
              Trust: ${m.trust_score}
            </div>
          </div>
        </div>
        <div class="match-card-body" style="grid-template-columns: 1fr 1fr; gap: 8px;">
          <div class="match-stat"><span>Overlap</span> <b>${m.match_percentage ? m.match_percentage.toFixed(0) : (m.overlap_score * 100).toFixed(0)}%</b></div>
          <div class="match-stat"><span>Risk Level</span> <b class="risk-${riskClass}">${m.risk_level}</b></div>
          <div class="match-stat"><span>Detour</span> <b>${detourText}</b></div>
          <div class="match-stat"><span>Success Rate</span> <b>${successRate}</b></div>
          <div class="match-stat"><span>Cost Share</span> <b class="price">&#8377;${m.estimated_cost_share.toFixed(0)}</b></div>
          <div class="match-stat"><span>🌱 Savings</span> <b class="carbon-savings">${carbon} kg</b></div>
        </div>
        <div class="match-card-route">${m.origin} → ${m.destination}</div>
        <div class="match-card-time">🕐 Departs: ${dt}</div>
        <div style="font-size: 11px; color: #E5E7EB; margin-top: 6px; padding: 6px 8px; border-radius: 6px; background: rgba(0,0,0,0.25); border-left: 2px solid #F59E0B; line-height: 1.4;">
          💡 <b>AI Reason:</b> ${m.risk_reason || "Verified profile with clean activity."}
        </div>
        <div style="margin-top: 8px;">
          ${connectBtnHtml}
        </div>
      </div>`;
    }).join("");

    // Also draw matched routes as dashed lines on the map if we have them
    renderMatchesOnMap(matches);

    // Bind event listeners to connect buttons
    const btns = el.querySelectorAll(".btn-match-connect");
    btns.forEach((btn, idx) => {
        btn.addEventListener("click", () => handleConnectClick(matches[idx]));
    });
}

function renderMatchesOnMap(matches) {
    // Highlight matched routes' origins/destinations with small cyan dots
    matches.forEach((m, i) => {
        if (i > 2) return; // show up to 3 to avoid clutter
        geocode(m.origin).then(o => {
            L.circleMarker([o.lat, o.lng], {
                radius: 6, color: "#22D3EE", fillColor: "#22D3EE",
                fillOpacity: 0.7, weight: 2,
            }).addTo(map).bindPopup(`Match #${m.route_id} origin`);
        }).catch(() => {});
    });
}

async function submitRoute(event) {
    if (event) {
        event.preventDefault();
        event.stopPropagation();
    }

    const form = document.getElementById("route-form");
    const submitBtn = form.querySelector("button[type=submit]");
    
    if (submitBtn) { 
        submitBtn.disabled = true; 
        submitBtn.innerHTML = `<svg class="spinner" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg> Processing…`;
    }

    const originInput = document.getElementById("route-origin");
    const destInput   = document.getElementById("route-destination");
    const originVal   = originInput.value.trim();
    const destVal     = destInput.value.trim();

    if (!originVal || !destVal) {
        showMessage("route-result", "⚠️ Please enter both origin and destination.", true);
        if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="m22 2-7 20-4-9-9-4z"/></svg> Submit & Find Matches`;
        }
        return;
    }

    // Auto-preview if not done yet OR if the text has changed since last preview
    const needsNewPreview = currentPolyline.length === 0 || 
                           originVal !== lastPreviewedOrigin || 
                           destVal !== lastPreviewedDest;

    if (needsNewPreview) {
        console.log("Input changed or polyline empty, refreshing preview...");
        try {
            await previewRoute();
        } catch (err) {
            // Error already shown by previewRoute
            if (submitBtn) {
                submitBtn.disabled = false;
                submitBtn.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="m22 2-7 20-4-9-9-4z"/></svg> Submit & Find Matches`;
            }
            return;
        }
        if (currentPolyline.length === 0) {
            if (submitBtn) {
                submitBtn.disabled = false;
                submitBtn.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="m22 2-7 20-4-9-9-4z"/></svg> Submit & Find Matches`;
            }
            return;
        }
    }

    if (submitBtn) { 
        submitBtn.innerHTML = `<svg class="spinner" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg> Submitting…`;
    }

    const userId = parseInt(document.getElementById("route-user-id").value, 10);
    const weight = parseFloat(document.getElementById("package-weight").value);
    const type = document.getElementById("route-type").value;
    const size = document.getElementById("package-size").value;

    const routeBody = {
        user_id:            isNaN(userId) ? 1 : userId,
        origin:             document.getElementById("route-origin").value,
        destination:        document.getElementById("route-destination").value,
        polyline:           simplifyPolyline(currentPolyline, 150),
        departure_time:     document.getElementById("departure-time").value,
        package_weight_kg:  isNaN(weight) ? 5.0 : weight,
        package_category:   type === "traveler" ? "none" : document.getElementById("package-category").value,
        route_type:         type,
        package_size:       size,
    };

    try {
        const response = await fetch(`${API_BASE_URL}/routes/submit`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(routeBody),
        });
        const data = await response.json();

        if (!response.ok) {
            showMessage("route-result", `Route submission failed: ${data.detail || response.statusText}`, true);
            return;
        }

        showMessage("route-result",
            `✅ Route submitted! ${data.matches.length} match${data.matches.length !== 1 ? "es" : ""} found.`
        );
        renderMatchResults(data.matches);

        // Scroll to results smoothly
        document.querySelector(".matches-card")?.scrollIntoView({ behavior: 'smooth', block: 'start' });

        // Store in activity tab
        storeRideActivity(routeBody);

    } catch (err) {
        console.error("Submission error:", err);
        showMessage("route-result", `Error: ${err.message}`, true);
    } finally {
        if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="m22 2-7 20-4-9-9-4z"/></svg> Submit & Find Matches`;
        }
    }
}

// ── Activity: store ride in localStorage ──────────────────────────────────────

function storeRideActivity(routeBody) {
    const rides = JSON.parse(localStorage.getItem("airide_rides") || "[]");
    rides.unshift({
        id: Date.now(),
        origin: routeBody.origin,
        destination: routeBody.destination,
        departure: routeBody.departure_time,
        status: "Submitted",
        ts: new Date().toISOString(),
    });
    localStorage.setItem("airide_rides", JSON.stringify(rides.slice(0, 20)));
    renderRidesActivity();
}

function renderRidesActivity() {
    const rides = JSON.parse(localStorage.getItem("airide_rides") || "[]");
    const container = document.getElementById("rides-list");
    if (!container) return;

    if (!rides.length) {
        container.innerHTML = `<div class="rides-empty">
          <svg width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.15)" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round">
            <rect x="1" y="3" width="15" height="13" rx="2"/>
            <polygon points="16 8 20 8 23 11 23 16 16 16 16 8"/>
            <circle cx="5.5" cy="18.5" r="2.5"/>
            <circle cx="18.5" cy="18.5" r="2.5"/>
          </svg>
          <p>No rides yet — submit a route from the Home tab to get started!</p>
        </div>`;
        return;
    }

    container.innerHTML = rides.map(r => {
        const dt = r.departure ? new Date(r.departure).toLocaleString("en-IN", {
            day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit",
        }) : "—";
        
        if (r.status === "Escrow Hold") {
            return `<div class="ride-item">
              <div class="ride-dot" style="background:#fbbf24;box-shadow:0 0 8px rgba(245,158,11,0.6);"></div>
              <div class="ride-route">
                <div class="ride-from-to">${r.origin} → ${r.destination}</div>
                <div class="ride-meta">🕐 ${dt} | Cost share: &#8377;${r.amount.toFixed(0)}</div>
              </div>
              <div style="display:flex; flex-direction:column; gap:4px; align-items:flex-end;">
                <span class="ride-status" style="background:rgba(245,158,11,0.12);color:#fbbf24;border:1px solid rgba(245,158,11,0.25);">${r.status}</span>
                <div style="display:flex; gap:4px; margin-top:4px;">
                  <button onclick="handleReleaseEscrow(${r.id}, ${r.driver_id}, ${r.amount})" style="padding:4px 8px; font-size:11px; font-weight:600; border-radius:6px; background:#10B981; border:none; color:#fff; cursor:pointer; font-family:'Inter',sans-serif;">Release</button>
                  <button onclick="handleRefundEscrow(${r.id}, ${r.amount})" style="padding:4px 8px; font-size:11px; font-weight:600; border-radius:6px; background:#EF4444; border:none; color:#fff; cursor:pointer; font-family:'Inter',sans-serif;">Refund</button>
                </div>
              </div>
            </div>`;
        }

        let statusStyle = "";
        let dotStyle = "";
        if (r.status === "Completed") {
            statusStyle = "background:rgba(16,185,129,0.12);color:#6EE7B7;border:1px solid rgba(16,185,129,0.25);";
            dotStyle = "background:#10B981;box-shadow:0 0 8px rgba(16,185,129,0.6);";
        } else if (r.status === "Cancelled") {
            statusStyle = "background:rgba(239,68,68,0.12);color:#FCA5A5;border:1px solid rgba(239,68,68,0.25);";
            dotStyle = "background:#EF4444;box-shadow:0 0 8px rgba(239,68,68,0.6);";
        }

        return `<div class="ride-item">
          <div class="ride-dot" style="${dotStyle}"></div>
          <div class="ride-route">
            <div class="ride-from-to">${r.origin} → ${r.destination}</div>
            <div class="ride-meta">🕐 ${dt}</div>
          </div>
          <span class="ride-status" style="${statusStyle}">${r.status}</span>
        </div>`;
    }).join("");
}

const getCurrentUser = () => {
    try {
        return JSON.parse(sessionStorage.getItem('airide_user') || '{}');
    } catch {
        return {};
    }
};

async function handleConnectClick(match) {
    if (match.risk_level === "High Risk") {
        alert(`❌ CONNECTION BLOCKED: This user is classified as High Risk (Trust Score: ${match.trust_score}).\nReason: ${match.risk_reason || "Violation history"}.\n\nConnection and booking are blocked.`);
        return;
    }
    if (match.risk_level === "Medium Risk") {
        const proceed = confirm(`⚠️ WARNING: This user is marked as Medium Risk (Trust Score: ${match.trust_score}).\nReason: ${match.risk_reason || "Unverified account/irregular history"}.\n\nAre you sure you want to proceed and connect?`);
        if (!proceed) return;
    }

    const user = getCurrentUser();
    if (!user || !user.id) {
        alert("Please log in first.");
        return;
    }
    
    // Refresh balance to check if they have enough money
    let wallet_balance = user.wallet_balance || 0;
    try {
        const balanceRes = await fetch(`http://127.0.0.1:8000/wallet/balance/${user.id}`);
        if (balanceRes.ok) {
            const bal = await balanceRes.json();
            wallet_balance = bal.wallet_balance;
            user.wallet_balance = bal.wallet_balance;
            user.escrow_balance = bal.escrow_balance;
            sessionStorage.setItem('airide_user', JSON.stringify(user));
        }
    } catch (err) {
        console.error("Error updating balance:", err);
    }

    if (wallet_balance < match.estimated_cost_share) {
        if (confirm(`Insufficient balance (\u20B9${wallet_balance.toFixed(2)}) for this connection (\u20B9${match.estimated_cost_share.toFixed(2)}).\n\nWould you like to go to the Payments page to deposit funds?`)) {
            window.location.href = 'payments.html';
        }
        return;
    }

    if (!confirm(`Connect to Route #${match.route_id}?\n\nThis will lock \u20B9${match.estimated_cost_share.toFixed(2)} in a secure escrow hold.`)) {
        return;
    }

    try {
        const res = await fetch("http://127.0.0.1:8000/escrow/hold", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ sender_id: user.id, amount: match.estimated_cost_share })
        });
        if (res.ok) {
            alert("Funds locked in escrow successfully! Connection established.");
            
            // Add connection to activity list
            const rides = JSON.parse(localStorage.getItem("airide_rides") || "[]");
            rides.unshift({
                id: Date.now(),
                origin: match.origin,
                destination: match.destination,
                departure: match.departure_time,
                status: "Escrow Hold",
                amount: match.estimated_cost_share,
                driver_id: match.user_id,
                ts: new Date().toISOString(),
            });
            localStorage.setItem("airide_rides", JSON.stringify(rides));
            
            // Refresh UI
            renderRidesActivity();
            if (typeof window.refreshWalletBalances === 'function') {
                window.refreshWalletBalances();
            }
        } else {
            const err = await res.json();
            alert("Connection failed: " + (err.detail || "Unknown error"));
        }
    } catch (err) {
        alert("Network error connecting to route.");
    }
}

window.handleReleaseEscrow = async function(activityId, driverId, amount) {
    const user = getCurrentUser();
    if (!user || !user.id) return;

    if (!confirm(`Release \u20B9${amount.toFixed(2)} from Escrow to the traveler?\n\nThis action cannot be undone.`)) {
        return;
    }

    try {
        const res = await fetch("http://127.0.0.1:8000/escrow/release", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ sender_id: user.id, driver_id: driverId, amount: amount })
        });
        if (res.ok) {
            alert("Funds released successfully! Connection completed.");
            // Update status in activity list
            const rides = JSON.parse(localStorage.getItem("airide_rides") || "[]");
            const ride = rides.find(r => r.id === activityId);
            if (ride) {
                ride.status = "Completed";
            }
            localStorage.setItem("airide_rides", JSON.stringify(rides));
            renderRidesActivity();
            if (typeof window.refreshWalletBalances === 'function') {
                window.refreshWalletBalances();
            }
        } else {
            const err = await res.json();
            alert("Release failed: " + (err.detail || "Unknown error"));
        }
    } catch (err) {
        alert("Network error releasing funds.");
    }
};

window.handleRefundEscrow = async function(activityId, amount) {
    const user = getCurrentUser();
    if (!user || !user.id) return;

    if (!confirm(`Cancel connection and refund \u20B9${amount.toFixed(2)} back to your wallet?`)) {
        return;
    }

    try {
        const res = await fetch("http://127.0.0.1:8000/escrow/refund", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ sender_id: user.id, amount: amount })
        });
        if (res.ok) {
            alert("Funds refunded successfully to your wallet!");
            // Update status in activity list
            const rides = JSON.parse(localStorage.getItem("airide_rides") || "[]");
            const ride = rides.find(r => r.id === activityId);
            if (ride) {
                ride.status = "Cancelled";
            }
            localStorage.setItem("airide_rides", JSON.stringify(rides));
            renderRidesActivity();
            if (typeof window.refreshWalletBalances === 'function') {
                window.refreshWalletBalances();
            }
        } else {
            const err = await res.json();
            alert("Refund failed: " + (err.detail || "Unknown error"));
        }
    } catch (err) {
        alert("Network error refunding funds.");
    }
};


// ── Boot ─────────────────────────────────────────────────────────────────────

document.addEventListener("DOMContentLoaded", () => {
    const previewBtn     = document.getElementById("preview-route");
    const myLocationBtn  = document.getElementById("btn-my-location");
    const routeForm      = document.getElementById("route-form");

    if (previewBtn)    previewBtn.addEventListener("click", previewRoute);
    if (myLocationBtn) myLocationBtn.addEventListener("click", useMyLocation);
    if (routeForm)     routeForm.addEventListener("submit", submitRoute);

    // Set default departure time to now
    const depTimeEl = document.getElementById("departure-time");
    if (depTimeEl && !depTimeEl.value) {
        const now = new Date();
        now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
        depTimeEl.value = now.toISOString().slice(0, 16);
    }

    // Input listeners for smart splitting and resetting state
    const originInput = document.getElementById("route-origin");
    const destInput   = document.getElementById("route-destination");

    if (originInput) {
        originInput.addEventListener("input", (e) => {
            const val = e.target.value;
            // Check for "to" split (e.g. "Chikodi to Bengaluru")
            if (val.toLowerCase().includes(" to ")) {
                const parts = val.split(/\s+to\s+/i);
                if (parts.length >= 2) {
                    originInput.value = parts[0].trim();
                    if (destInput) destInput.value = parts[1].trim();
                    // Don't clear currentPolyline yet, let the user trigger preview
                }
            }
            // If the user is typing, we might want to invalidate the current preview
            // but we'll handle that at submission time or via the "Preview" button.
        });
    }

    // Init the map on DOMContentLoaded (Leaflet needs the #map element)
    initMap();

    // Load activity rides from localStorage
    renderRidesActivity();
});


// ── Toggle form fields based on Route Type ────────────────────────────────────

function toggleRouteTypeFields() {
    const typeSelect = document.getElementById("route-type");
    if (!typeSelect) return;
    const type = typeSelect.value;
    
    const sizeLabel = document.getElementById("lbl-package-size");
    const weightLabel = document.getElementById("lbl-package-weight");
    const catGroup = document.getElementById("package-category-group");
    const weightInput = document.getElementById("package-weight");
    
    if (type === "traveler") {
        if (sizeLabel) sizeLabel.textContent = "Max Available Size Capacity";
        if (weightLabel) weightLabel.textContent = "Available Weight Capacity (kg)";
        if (weightInput) weightInput.value = "5.0";
        if (catGroup) catGroup.style.display = "none";
    } else {
        if (sizeLabel) sizeLabel.textContent = "Required Package Size";
        if (weightLabel) weightLabel.textContent = "Package Weight (kg)";
        if (weightInput) weightInput.value = "1.0";
        if (catGroup) catGroup.style.display = "flex";
    }
}
