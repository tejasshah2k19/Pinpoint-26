const API = "/api/v1";
let token = sessionStorage.getItem("pinpointAdminToken") || "";
let adminUser = null;
const content = document.getElementById("pageContent");
const loginView = document.getElementById("loginView");
const appView = document.getElementById("appView");
const pageTitle = document.getElementById("pageTitle");
const notice = document.getElementById("notice");

function escapeHtml(value) {
  return String(value == null ? "" : value).replace(/[&<>"']/g, function (ch) {
    return ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch];
  });
}
function dateText(value) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleDateString();
}
function showNotice(message, isError) {
  notice.textContent = message;
  notice.className = "notice" + (isError ? " error-notice" : "");
  window.scrollTo({ top: 0, behavior: "smooth" });
  window.setTimeout(function () { notice.classList.add("hidden"); }, 4500);
}
async function api(path, options) {
  const opts = options || {};
  const headers = Object.assign({ "Content-Type": "application/json" }, opts.headers || {});
  if (token) headers.Authorization = "Bearer " + token;
  const response = await fetch(API + path, Object.assign({}, opts, { headers: headers }));
  let payload = {};
  try { payload = await response.json(); } catch (_) {}
  if (!response.ok) {
    if (response.status === 401 && token) signOut();
    throw new Error(payload.message || "Request failed (" + response.status + ")");
  }
  return payload;
}
function showApp(user) {
  adminUser = user || adminUser || {};
  loginView.classList.add("hidden");
  appView.classList.remove("hidden");
  document.getElementById("adminName").textContent = adminUser.name || "Administrator";
  document.getElementById("adminEmail").textContent = adminUser.email || "";
  navigate("overview");
}
function signOut() {
  token = "";
  adminUser = null;
  sessionStorage.removeItem("pinpointAdminToken");
  appView.classList.add("hidden");
  loginView.classList.remove("hidden");
  document.getElementById("loginPassword").value = "";
}
document.getElementById("loginForm").addEventListener("submit", async function (event) {
  event.preventDefault();
  const error = document.getElementById("loginError");
  const button = this.querySelector("button[type=submit]");
  error.textContent = "";
  button.disabled = true;
  button.textContent = "Signing in…";
  try {
    const result = await api("/auth/login", { method: "POST", body: JSON.stringify({
      email: document.getElementById("loginEmail").value.trim(),
      password: document.getElementById("loginPassword").value
    }) });
    if (!result.user || result.user.role !== "admin") throw new Error("This account does not have administrator access.");
    token = result.token;
    sessionStorage.setItem("pinpointAdminToken", token);
    showApp(result.user);
  } catch (err) {
    error.textContent = err.message;
  } finally {
    button.disabled = false;
    button.textContent = "Sign in to admin";
  }
});
document.getElementById("logoutButton").addEventListener("click", signOut);
document.getElementById("navigation").addEventListener("click", function (event) {
  const button = event.target.closest("[data-page]");
  if (button) navigate(button.dataset.page);
});

async function navigate(page) {
  document.querySelectorAll(".nav-item").forEach(function (item) {
    item.classList.toggle("active", item.dataset.page === page);
  });
  const titles = { overview: "Overview", users: "Users", locations: "Locations", map: "India Map", categories: "Categories", offers: "Offers" };
  pageTitle.textContent = titles[page] || "Overview";
  content.innerHTML = '<div class="loading">Loading workspace…</div>';
  try {
    if (page === "overview") await renderOverview();
    if (page === "users") await renderUsers();
    if (page === "locations") await renderLocations();
    if (page === "map") await renderIndiaMap();
    if (page === "categories") await renderCategories();
    if (page === "offers") await renderOffers();
  } catch (err) {
    content.innerHTML = '<div class="empty-state"><b>Could not load this section</b><p>' + escapeHtml(err.message) + '</p><button class="btn secondary" data-action="retry">Retry</button></div>';
  }
}
let indiaOverviewMap = null;
let indiaMapMarkers = [];
async function renderIndiaMap() {
  const result = await api("/admin/locations/map");
  const locations = result.data || [];
  const categoryDetails = new Map((result.categories || []).filter(function (category) { return category.name; }).map(function (category) { return [String(category.name).trim().toLowerCase(), { color: category.color, icon: category.icon }]; }));
  const withCoordinates = locations.filter(function (item) {
    const coords = item.coordinates && item.coordinates.coordinates;
    return Array.isArray(coords) && coords.length === 2 && Number.isFinite(Number(coords[0])) && Number.isFinite(Number(coords[1]));
  });
  const mapCategories = Array.from(new Set(withCoordinates.map(function (item) { return String(item.category || "Other").trim(); }))).sort(function (a, b) { return a.localeCompare(b); });
  const colorForCategory = function (name) {
    const value = categoryColors.get(String(name).trim().toLowerCase()) || "#d87955";
    return /^#[0-9a-f]{6}$/i.test(value) ? value : "#d87955";
  };
  content.innerHTML =
    '<div class="section-intro"><div><h2>Pinpoint locations across India</h2><p>Explore every saved location. Zoom, pan and select a pin to view its details.</p></div><span class="count-pill">' + withCoordinates.length + ' mapped · ' + locations.length + ' total</span></div>' +
    '<div class="panel india-map-panel"><div class="india-map-toolbar"><div class="india-map-category-filters"><button class="india-category-filter active" data-action="filter-india-category" data-category="__all">All <span>' + withCoordinates.length + '</span></button>' + mapCategories.map(function (name) { const count = withCoordinates.filter(function (item) { return String(item.category || "Other").trim() === name; }).length; return '<button class="india-category-filter" data-action="filter-india-category" data-category="' + escapeHtml(name) + '"><i style="background:' + colorForCategory(name) + '"></i>' + escapeHtml(name) + ' <span>' + count + '</span></button>'; }).join("") + '</div><button class="btn secondary" data-action="refresh-india-map">↻ Refresh pins</button></div><div id="indiaLocationsMap" class="india-locations-map"></div><p class="map-status" id="indiaMapStatus">Showing all categories. Select a category to filter the map.</p></div>';
  if (!window.L) {
    document.getElementById("indiaLocationsMap").innerHTML = '<div class="map-load-error">Map library could not load. Refresh the page and try again.</div>';
    return;
  }
  if (indiaOverviewMap) { indiaOverviewMap.remove(); indiaOverviewMap = null; }
  indiaOverviewMap = window.L.map("indiaLocationsMap", { scrollWheelZoom: true }).setView([22.8, 79.0], 5);
  window.L.maplibreGL({
    style: "https://tiles.openfreemap.org/styles/liberty",
    attributionControl: true
  }).addTo(indiaOverviewMap);
  const bounds = [];
  indiaMapMarkers = [];
  withCoordinates.forEach(function (item) {
    const coords = item.coordinates.coordinates;
    const latitude = Number(coords[1]), longitude = Number(coords[0]);
    const isPublic = item.isPublic === true;
    const categoryName = String(item.category || "Other");
    const categoryMeta = categoryDetails.get(categoryName.trim().toLowerCase()) || {};
    const categoryColor = /^#[0-9a-f]{6}$/i.test(categoryMeta.color || "") ? categoryMeta.color : "#d87955";
    const categoryIcon = categoryMeta.icon || "📍";
    const markerIcon = window.L.divIcon({
      className: "india-map-marker-wrap",
      html: '<span class="india-map-marker-dot" style="--pin-color:' + escapeHtml(categoryColor) + '">' + escapeHtml(categoryIcon) + '</span><span class="india-map-marker-label">' + escapeHtml(item.title || "Untitled place") + '</span>',
      iconSize: [1, 1],
      iconAnchor: [5, 5]
    });
    const marker = window.L.marker([latitude, longitude], { icon: markerIcon, title: item.title || "Untitled place", riseOnHover: true }).addTo(indiaOverviewMap);
    const owner = item.user && item.user.name ? item.user.name : "Unknown owner";
    const popup = '<div class="india-map-popup"><b>' + escapeHtml(item.title || "Untitled place") + '</b><span><i class="india-popup-category-dot" style="background:' + escapeHtml(categoryColor) + '"></i>' + escapeHtml(categoryName) + ' · ' + (isPublic ? "Public" : "Private") + '</span><small>' + escapeHtml(item.address || "No address provided") + '</small><small>Owner: ' + escapeHtml(owner) + '</small><small>' + latitude.toFixed(6) + ', ' + longitude.toFixed(6) + '</small></div>';
    marker.bindPopup(popup);
    marker._pinpointCategory = categoryName.trim();
    indiaMapMarkers.push(marker);
    bounds.push([latitude, longitude]);
  });
  if (bounds.length > 1) indiaOverviewMap.fitBounds(bounds, { padding: [28, 28], maxZoom: 10 });
  else if (bounds.length === 1) indiaOverviewMap.setView(bounds[0], 13);
  window.setTimeout(function () { if (indiaOverviewMap) indiaOverviewMap.invalidateSize(); }, 120);
}
function statCard(label, value, hint, icon) {
  return '<article class="stat-card"><div class="stat-top"><span>' + escapeHtml(label) + '</span><i>' + icon + '</i></div><strong>' + Number(value || 0).toLocaleString() + '</strong><small>' + escapeHtml(hint) + '</small></article>';
}
async function renderOverview() {
  const result = await api("/admin/overview");
  const d = result.data;
  content.innerHTML =
    '<div class="welcome-row"><div><h2>Your platform at a glance</h2><p>Manage the people and places that make Pinpoint useful.</p></div><button class="btn primary" data-action="quick-add-location">＋ Add public place</button></div>' +
    '<div class="stats-grid">' +
    statCard("Total users", d.users, d.activeUsers + " active accounts", "♙") +
    statCard("Saved locations", d.locations, d.publicLocations + " shared with the community", "⌖") +
    statCard("Categories", d.categories, "Across user accounts", "◇") +
    statCard("Offers", d.offers, d.activeOffers + " currently active", "％") +
    '</div><div class="panel intro-panel"><div><span class="eyebrow">ADMIN TOOLKIT</span><h3>Keep the Pinpoint map useful.</h3><p>Add verified public places, review shared locations, and look after the community from one workspace.</p></div><div class="intro-symbol">⌖</div></div>' +
    '<div class="quick-grid"><button class="quick-card" data-go="users"><b>Manage users</b><span>Roles and account access →</span></button><button class="quick-card" data-go="locations"><b>Review locations</b><span>Public and private saved places →</span></button><button class="quick-card" data-go="offers"><b>Manage offers</b><span>Offers linked to places →</span></button></div>';
}
async function renderUsers() {
  const result = await api("/admin/users?limit=100");
  const users = result.data || [];
  content.innerHTML =
    '<div class="section-intro"><div><h2>Community accounts</h2><p>Create accounts, assign administrator access and manage account status.</p></div><span class="count-pill">' + users.length + ' shown</span></div>' +
    '<div class="panel form-panel"><h3>Create a user account</h3><form id="userForm" class="form-grid">' +
    '<label>Name<input name="name" required maxlength="80" autocomplete="name" placeholder="Full name"></label>' +
    '<label>Email<input name="email" type="email" required maxlength="254" autocomplete="email" placeholder="name@example.com"></label>' +
    '<label>Password<input name="password" type="password" required minlength="8" autocomplete="new-password" placeholder="At least 8 characters"></label>' +
    '<label>Account role<select name="role"><option value="user">User</option><option value="admin">Admin</option></select></label>' +
    '<div class="span-2 form-actions"><button class="btn primary" type="submit">＋ Create account</button><small class="field-hint">New users can sign in immediately. Admin accounts can access this dashboard.</small></div></form></div>' +
    '<div class="table-wrap"><table><thead><tr><th>USER</th><th>JOINED</th><th>ROLE</th><th>STATUS</th><th>ACTION</th></tr></thead><tbody>' +
    (users.length ? users.map(function (u) {
      const isSelf = String(u._id) === String(adminUser && adminUser.id);
      return '<tr><td><div class="user-cell"><span class="table-avatar">' + escapeHtml((u.name || "U").charAt(0).toUpperCase()) + '</span><div><b>' + escapeHtml(u.name) + '</b><small>' + escapeHtml(u.email) + '</small></div></div></td>' +
      '<td>' + dateText(u.createdAt) + '</td><td><select class="compact-select" data-role-id="' + escapeHtml(u._id) + '"' + (isSelf ? " disabled" : "") + '><option value="user"' + (u.role !== "admin" ? " selected" : "") + '>User</option><option value="admin"' + (u.role === "admin" ? " selected" : "") + '>Admin</option></select></td>' +
      '<td><span class="status ' + (u.isActive === false ? "inactive" : "active") + '">' + (u.isActive === false ? "Inactive" : "Active") + '</span></td>' +
      '<td><button class="text-action" data-action="toggle-user" data-id="' + escapeHtml(u._id) + '" data-active="' + (u.isActive === false ? "false" : "true") + '"' + (isSelf ? " disabled" : "") + '>' + (u.isActive === false ? "Activate" : "Deactivate") + '</button></td></tr>';
    }).join("") : '<tr><td colspan="5" class="empty-cell">No accounts found.</td></tr>') +
    '</tbody></table></div><p class="table-footnote">Deactivated accounts cannot sign in or use the mobile app. At least one active administrator is always required.</p>';
}
let adminLocationMap = null;
let adminLocationMarker = null;
let placeSuggestionTimer = null;
let placeSuggestionController = null;
let placeSuggestions = [];
let lastPhotonRequestAt = 0;

function photonAddress(properties) {
  const p = properties || {};
  const street = [p.housenumber, p.street].filter(Boolean).join(" ");
  const values = [street, p.district, p.locality, p.city, p.state, p.postcode, p.country].filter(Boolean);
  const seen = new Set();
  return values.filter(function (value) {
    const key = String(value).trim().toLocaleLowerCase();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  }).join(", ");
}
function photonTitle(feature) {
  const p = feature.properties || {};
  return p.name || [p.housenumber, p.street].filter(Boolean).join(" ") || p.city || p.locality || "";
}
function updateAdminMapPoint(latitude, longitude, zoom) {
  const lat = Number(latitude), lng = Number(longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) return;
  const latInput = document.getElementById("locationLatitude");
  const lngInput = document.getElementById("locationLongitude");
  const status = document.getElementById("locationMapStatus");
  if (latInput) latInput.value = lat.toFixed(6);
  if (lngInput) lngInput.value = lng.toFixed(6);
  if (adminLocationMap && window.L) {
    const point = [lat, lng];
    if (!adminLocationMarker) {
      adminLocationMarker = window.L.marker(point, { draggable: true }).addTo(adminLocationMap);
      adminLocationMarker.on("dragend", function (event) {
        const moved = event.target.getLatLng();
        updateAdminMapPoint(moved.lat, moved.lng, 16);
        reverseAdminMapAddress(moved.lat, moved.lng);
      });
    } else {
      adminLocationMarker.setLatLng(point);
    }
    adminLocationMap.setView(point, zoom || 16);
  }
  if (status) status.textContent = "Selected coordinates: " + lat.toFixed(6) + ", " + lng.toFixed(6) + " · Drag the pin to adjust";
}
async function reverseAdminMapAddress(latitude, longitude) {
  try {
    const payload = await api("/admin/reverse-geocode?lat=" + encodeURIComponent(latitude) + "&lon=" + encodeURIComponent(longitude));
    const feature = payload.features && payload.features[0];
    if (!feature) return;
    const address = photonAddress(feature.properties) || feature.properties.name || "";
    const field = document.getElementById("locationAddress");
    if (field && address) field.value = address;
  } catch (_) {
    // The selected pin and coordinates remain usable even if reverse lookup is unavailable.
  }
}
function parseGoogleMapsLocationLink(rawLink) {
  const raw = String(rawLink || "").trim().replace(/&amp;/g, "&");
  if (!raw) throw new Error("Paste a Google Maps link first.");
  let url;
  try { url = new URL(raw); } catch (_) { throw new Error("That does not look like a valid Google Maps URL."); }
  if (!/(^|\.)google\.[a-z.]+$/i.test(url.hostname) && !/(^|\.)maps\.app\.goo\.gl$/i.test(url.hostname)) {
    throw new Error("Please paste a link from Google Maps.");
  }
  let latitude = null, longitude = null;
  const placeLat = url.href.match(/!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/);
  const viewport = url.pathname.match(/@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)(?:,|$)/);
  const coords = placeLat || viewport;
  if (coords) {
    latitude = Number(coords[1]);
    longitude = Number(coords[2]);
  }
  let placeSegment = "";
  const placeMatch = url.pathname.match(/\/place\/([^/]+)/i);
  if (placeMatch) {
    try { placeSegment = decodeURIComponent(placeMatch[1].replace(/\+/g, " ")); }
    catch (_) { placeSegment = placeMatch[1].replace(/\+/g, " "); }
  }
  placeSegment = placeSegment.replace(/\s+/g, " ").trim();
  const rawTitle = placeSegment ? placeSegment.split(",")[0].trim() : "";
  const title = rawTitle.replace(/\b[a-z]/g, function (letter) { return letter.toUpperCase(); });
  const address = placeSegment || "";
  if (latitude === null || longitude === null || latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
    throw new Error("This Google Maps link does not contain extractable coordinates. Open the place in Google Maps and copy its full browser URL, not the short share link.");
  }
  if (!title && !address) throw new Error("The link contains coordinates but no place name. You can enter the name manually.");
  return { title: title, address: address, latitude: latitude, longitude: longitude };
}
function importGoogleMapsLink() {
  try {
    const linkInput = document.getElementById("googleMapsImportLink");
    const extracted = parseGoogleMapsLocationLink(linkInput && linkInput.value);
    const title = document.getElementById("locationTitle");
    const address = document.getElementById("locationAddress");
    const search = document.getElementById("placeSearchInput");
    if (title && extracted.title) title.value = extracted.title;
    if (address && extracted.address) address.value = extracted.address;
    if (search) search.value = extracted.title || extracted.address;
    updateAdminMapPoint(extracted.latitude, extracted.longitude, 17);
    const status = document.getElementById("locationMapStatus");
    if (status) status.textContent = "Imported from Google Maps URL · " + extracted.latitude.toFixed(7) + ", " + extracted.longitude.toFixed(7) + " · Verify the pin before saving";
    showNotice("Google Maps details extracted. Check the name, address and pin, then save the location.");
  } catch (error) {
    showNotice(error.message, true);
  }
}

function initAdminLocationMap() {
  const element = document.getElementById("adminLocationMap");
  if (!element) return;
  if (!window.L) {
    element.innerHTML = '<div class="map-load-error">Map library could not load. Refresh the page and try again.</div>';
    return;
  }
  if (adminLocationMap) {
    adminLocationMap.remove();
    adminLocationMap = null;
    adminLocationMarker = null;
  }
  adminLocationMap = window.L.map(element, { scrollWheelZoom: true }).setView([23.0225, 72.5714], 12);
  window.L.maplibreGL({
    style: "https://tiles.openfreemap.org/styles/liberty",
    attributionControl: true
  }).addTo(adminLocationMap);
  adminLocationMap.on("click", function (event) {
    updateAdminMapPoint(event.latlng.lat, event.latlng.lng, 16);
    reverseAdminMapAddress(event.latlng.lat, event.latlng.lng);
  });
  window.setTimeout(function () { if (adminLocationMap) adminLocationMap.invalidateSize(); }, 100);
}
function searchAdminPlaceNames(query) {
  if (placeSuggestionTimer) window.clearTimeout(placeSuggestionTimer);
  if (placeSuggestionController) placeSuggestionController.abort();
  const box = document.getElementById("placeSuggestions");
  if (!box) return;
  if (query.trim().length < 3) {
    box.classList.add("hidden");
    box.innerHTML = "";
    placeSuggestions = [];
    return;
  }
  box.classList.remove("hidden");
  box.innerHTML = '<div class="suggestion-message">Searching places…</div>';
  const controller = new AbortController();
  placeSuggestionController = controller;
  placeSuggestionTimer = window.setTimeout(async function () {
    try {
      const wait = Math.max(0, 1100 - (Date.now() - lastPhotonRequestAt));
      if (wait) await new Promise(function (resolve) { window.setTimeout(resolve, wait); });
      if (controller.signal.aborted) return;
      lastPhotonRequestAt = Date.now();
      const payload = await api("/admin/place-search?q=" + encodeURIComponent(query.trim()), { signal: controller.signal });
      placeSuggestions = (payload.features || []).filter(function (feature) {
        return feature.geometry && Array.isArray(feature.geometry.coordinates) && feature.geometry.coordinates.length === 2;
      });
      const currentSearch = document.getElementById("placeSearchInput");
      if (!currentSearch || currentSearch.value.trim() !== query.trim()) return;
      if (!placeSuggestions.length) {
        box.innerHTML = '<div class="suggestion-message">No matches found. Try a nearby area or a different spelling.</div>';
        return;
      }
      box.innerHTML = placeSuggestions.map(function (feature, index) {
        const title = photonTitle(feature) || "Unnamed place";
        const address = photonAddress(feature.properties) || feature.properties.name || "";
        return '<button type="button" class="suggestion-option" data-suggestion-index="' + index + '">' +
          '<span class="suggestion-pin">⌖</span><span class="suggestion-copy"><b>' + escapeHtml(title) + '</b><small>' + escapeHtml(address) + '</small></span></button>';
      }).join("");
    } catch (error) {
      if (error.name === "AbortError") return;
      box.innerHTML = '<div class="suggestion-message">Could not search right now. You can still select the location on the map.</div>';
    }
  }, 650);
}
function chooseAdminPlaceSuggestion(index) {
  const feature = placeSuggestions[index];
  if (!feature) return;
  const coordinates = feature.geometry.coordinates;
  const longitude = Number(coordinates[0]), latitude = Number(coordinates[1]);
  const title = photonTitle(feature);
  const address = photonAddress(feature.properties);
  const titleInput = document.getElementById("locationTitle");
  const addressInput = document.getElementById("locationAddress");
  const searchInput = document.getElementById("placeSearchInput");
  const box = document.getElementById("placeSuggestions");
  if (titleInput && title) titleInput.value = title;
  if (addressInput && address) addressInput.value = address;
  if (searchInput) searchInput.value = [title, address].filter(Boolean).join(" · ");
  if (box) { box.classList.add("hidden"); box.innerHTML = ""; }
  updateAdminMapPoint(latitude, longitude, 17);
}

async function renderLocations() {
  const results = await Promise.all([api("/admin/locations?limit=100"), api("/admin/categories"), api("/admin/users?limit=100")]);
  const places = results[0].data || [];
  const categoryRecords = results[1].data || [];
  const users = results[2].data || [];
  const ownerOptions = users.map(function (user) {
    return '<option value="' + escapeHtml(user._id) + '">' + escapeHtml((user.name || user.email) + " · " + user.email) + '</option>';
  }).join("");
  const categoryNames = [];
  const seenNames = new Set();
  categoryRecords.concat(places.map(function (p) { return { name: p.category || "Other" }; })).forEach(function (item) {
    const name = String(item.name || "").trim();
    const key = name.toLocaleLowerCase();
    if (name && !seenNames.has(key)) { seenNames.add(key); categoryNames.push(name); }
  });
  if (!seenNames.has("other")) categoryNames.push("Other");
  function categoryOptions(selected) {
    const names = categoryNames.slice();
    if (selected && !names.some(function (name) { return name.toLocaleLowerCase() === selected.toLocaleLowerCase(); })) names.push(selected);
    return names.map(function (name) {
      return '<option value="' + escapeHtml(name) + '"' + (selected && name.toLocaleLowerCase() === selected.toLocaleLowerCase() ? " selected" : "") + '>' + escapeHtml(name) + '</option>';
    }).join("");
  }
  content.innerHTML =
    '<div class="section-intro"><div><h2>Location directory</h2><p>Add a useful public place or moderate saved locations from the community.</p></div><span class="count-pill">' + places.length + ' shown</span></div>' +
    '<div class="panel form-panel google-import-panel"><div class="form-heading"><div><h3>Import from Google Maps</h3><p>Paste the full Google Maps browser link to extract the place name, address and coordinates.</p></div><span class="import-tag">QUICK IMPORT</span></div>' +
    '<div class="google-import-row"><input id="googleMapsImportLink" type="url" placeholder="Paste Google Maps link here…" autocomplete="off"><button type="button" class="btn secondary" data-action="import-google-maps">Import link</button></div>' +
    '<small class="field-hint">Tip: Open the place in Google Maps and copy the full URL from your browser address bar. Short share links may not include coordinates.</small></div>' +
    '<div class="panel form-panel"><div class="form-heading"><div><h3>Add a location</h3><p>Review imported details, adjust the map pin if needed, then save.</p></div><span class="public-tag">PUBLIC PLACE</span></div>' +
    '<form id="locationForm" class="form-grid">' +
    '<div class="span-2 place-search-field"><label>Search place name or address' +
    '<input id="placeSearchInput" type="search" autocomplete="off" placeholder="Start typing e.g. Sabarmati Riverfront, Ahmedabad"></label>' +
    '<div id="placeSuggestions" class="place-suggestions hidden"></div>' +
    '<small class="field-hint">Choose a suggestion to automatically fill the place name, address and map pin.</small></div>' +
    '<label class="span-2">Place name<input id="locationTitle" name="title" required maxlength="120" placeholder="e.g. Sabarmati Riverfront"></label>' +
    '<label>Category<select name="category" id="locationCategorySelect" required>' + categoryOptions("Other") + '</select></label>' +
    '<div class="category-add-wrap"><button type="button" class="text-action" data-action="show-add-location-category">＋ Add custom category</button><div id="locationCustomCategoryBox" class="hidden custom-category-inline"><input id="newLocationCategory" maxlength="50" placeholder="New category name"><button type="button" class="btn secondary" data-action="save-location-category">Save category</button></div></div>' +
    '<label class="span-2">Location owner<select name="userId" id="locationOwnerSelect" required>' + ownerOptions + '</select><small class="field-hint">Choose which user owns this location. Admins can change the owner later.</small></label>' +
    '<label class="span-2">Full address<input id="locationAddress" name="address" maxlength="300" placeholder="Street, area, city, state, PIN code"></label>' +
    '<div class="span-2 map-picker-heading"><div><b>Pinpoint the exact location</b><small>Click the map to drop a pin, or drag the marker to fine-tune it.</small></div><button type="button" class="text-action" data-action="reset-admin-map">Reset map</button></div>' +
    '<div class="span-2"><div id="adminLocationMap" class="admin-location-map"></div><p id="locationMapStatus" class="map-status">No coordinates selected. Choose a search suggestion or click the map.</p></div>' +
    '<label>Latitude<input id="locationLatitude" name="latitude" type="number" step="any" min="-90" max="90" required placeholder="Click the map or choose a suggestion"></label>' +
    '<label>Longitude<input id="locationLongitude" name="longitude" type="number" step="any" min="-180" max="180" required placeholder="Click the map or choose a suggestion"></label>' +
    '<label class="span-2">Notes<textarea name="notes" rows="2" maxlength="2000" placeholder="Useful details for visitors"></textarea></label>' +
    '<label class="check-label span-2"><input name="isPublic" type="checkbox" checked> Publish this place to all Pinpoint users</label>' +
    '<div class="span-2 form-actions"><button class="btn primary" type="submit">＋ Save location</button></div></form></div>' +
    '<div class="table-heading"><h3>All saved locations</h3><span>' + places.length + ' recent records</span></div>' +
    '<div class="table-wrap"><table><thead><tr><th>PLACE</th><th>CATEGORY</th><th>OWNER</th><th>VISIBILITY</th><th>ADDED</th><th>ACTIONS</th></tr></thead><tbody>' +
    (places.length ? places.map(function (p) {
      const owner = p.user && (p.user.name || p.user.email) || "Unknown";
      return '<tr><td><b>' + escapeHtml(p.title) + '</b><small>' + escapeHtml(p.address || "—") + '</small></td>' +
      '<td><select class="compact-select" data-location-category="' + escapeHtml(p._id) + '">' + categoryOptions(p.category || "Other") + '</select></td>' +
      '<td><select class="compact-select" data-location-owner="' + escapeHtml(p._id) + '">' + users.map(function (user) {
        return '<option value="' + escapeHtml(user._id) + '"' + (p.user && String(p.user._id) === String(user._id) ? " selected" : "") + '>' + escapeHtml(user.name || user.email) + '</option>';
      }).join("") + '</select><small>' + escapeHtml(owner) + '</small></td><td><span class="status ' + (p.isPublic ? "public" : "private") + '">' + (p.isPublic ? "Public" : "Private") + '</span></td><td>' + dateText(p.createdAt) + '</td>' +
      '<td class="actions"><button class="text-action" data-action="edit-location" data-id="' + escapeHtml(p._id) + '" data-title="' + escapeHtml(p.title) + '" data-address="' + escapeHtml(p.address || "") + '" data-notes="' + escapeHtml(p.notes || "") + '">Edit</button><button class="text-action" data-action="toggle-place" data-id="' + escapeHtml(p._id) + '" data-public="' + (!!p.isPublic) + '">' + (p.isPublic ? "Make private" : "Publish") + '</button><button class="text-action danger-text" data-action="delete-place" data-id="' + escapeHtml(p._id) + '">Delete</button></td></tr>';
    }).join("") : '<tr><td colspan="6" class="empty-cell">No places have been saved yet.</td></tr>') +
    '</tbody></table></div>';
  initAdminLocationMap();
}

async function renderCategories() {
  const result = await api("/admin/categories");
  const categories = result.data || [];
  const iconOptions = ["◇","⌖","🍽️","☕","🏛️","🏞️","🌳","🏖️","🛍️","🛒","✈️","🚗","🏨","🏕️","🏥","🎓","🏢","🏠","📍","⭐","🎯","🎭","⛩️","🕌","⛪"];
  content.innerHTML =
    '<div class="section-intro"><div><h2>Categories</h2><p>Review categories created by accounts and add or edit a category under the admin account.</p></div><span class="count-pill">' + categories.length + ' categories</span></div>' +
    '<div class="panel form-panel"><h3 id="categoryFormHeading">Create a category</h3><form id="categoryForm" class="category-editor-form"><input type="hidden" name="categoryId" value=""><label>Category name<input name="name" required maxlength="50" placeholder="e.g. Heritage"></label><label>Choose category colour <span class="category-color-control"><input name="color" type="color" value="#D97855" aria-label="Choose category colour"><output id="categoryColorValue">#D97855</output></span></label><fieldset class="category-icon-picker"><legend>Choose an icon</legend><div class="category-icon-options">' + iconOptions.map(function (icon) { return '<button type="button" class="category-icon-option' + (icon === "◇" ? " selected" : "") + '" data-action="choose-category-icon" data-icon="' + escapeHtml(icon) + '" aria-label="Choose icon ' + escapeHtml(icon) + '">' + icon + '</button>'; }).join("") + '</div><input type="hidden" name="icon" value="◇"></fieldset><div class="category-editor-actions"><button class="btn primary" type="submit" id="categorySubmitButton">Add category</button><button class="btn secondary hidden" type="button" data-action="cancel-category-edit" id="categoryCancelButton">Cancel</button></div></form></div>' +
    '<div class="table-wrap"><table><thead><tr><th>NAME</th><th>OWNER</th><th>CREATED</th><th>ACTION</th></tr></thead><tbody>' +
    (categories.length ? categories.map(function (c) {
      const owner = c.user && (c.user.name || c.user.email) || "Unknown";
      return '<tr><td><b><span class="category-table-icon" style="background:' + escapeHtml(/^#[0-9a-f]{6}$/i.test(c.color || "") ? c.color : "#D97855") + '">' + escapeHtml(c.icon || "◇") + '</span> ' + escapeHtml(c.name) + '</b><small>' + escapeHtml(c.color || "Default color") + '</small></td><td>' + escapeHtml(owner) + '</td><td>' + dateText(c.createdAt) + '</td><td class="actions"><button class="text-action" data-action="edit-category" data-id="' + escapeHtml(c._id) + '" data-name="' + escapeHtml(c.name) + '" data-color="' + escapeHtml(/^#[0-9a-f]{6}$/i.test(c.color || "") ? c.color : "#D97855") + '" data-icon="' + escapeHtml(c.icon || "◇") + '">Edit</button><button class="text-action danger-text" data-action="delete-category" data-id="' + escapeHtml(c._id) + '">Delete</button></td></tr>';
    }).join("") : '<tr><td colspan="4" class="empty-cell">No categories found.</td></tr>') +
    '</tbody></table></div>';
}
async function renderOffers() {
  const results = await Promise.all([api("/admin/offers"), api("/admin/locations?limit=100")]);
  const offers = results[0].data || [];
  const places = results[1].data || [];
  content.innerHTML =
    '<div class="section-intro"><div><h2>Offers and promotions</h2><p>Create and manage offers linked to saved places.</p></div><span class="count-pill">' + offers.length + ' offers</span></div>' +
    '<div class="panel form-panel"><h3>Create an offer</h3><form id="offerForm" class="form-grid">' +
    '<label class="span-2">Location<select name="locationId" required><option value="">Choose a place</option>' + places.map(function (p) { return '<option value="' + escapeHtml(p._id) + '">' + escapeHtml(p.title) + (p.address ? " — " + escapeHtml(p.address) : "") + '</option>'; }).join("") + '</select></label>' +
    '<label class="span-2">Offer title<input name="title" required maxlength="120" placeholder="e.g. 20% off weekday meals"></label>' +
    '<label class="span-2">Description<textarea name="description" rows="2" maxlength="1000" placeholder="Offer details and terms"></textarea></label>' +
    '<label>Discount type<select name="discountType"><option value="text">Text</option><option value="percentage">Percentage</option><option value="amount">Amount</option></select></label>' +
    '<label>Discount value<input name="discountValue" type="number" min="0" step="any" placeholder="Optional"></label>' +
    '<label>Start date<input name="startsAt" type="date"></label><label>Expiry date<input name="expiresAt" type="date"></label>' +
    '<div class="span-2 form-actions"><button class="btn primary" type="submit"' + (places.length ? "" : " disabled") + '>＋ Create offer</button></div></form>' +
    (places.length ? "" : '<p class="form-hint">Add a location first to attach an offer.</p>') + '</div>' +
    '<div class="table-wrap"><table><thead><tr><th>OFFER</th><th>LOCATION</th><th>VALID UNTIL</th><th>STATUS</th><th>ACTION</th></tr></thead><tbody>' +
    (offers.length ? offers.map(function (o) {
      const loc = o.location && o.location.title || "Location removed";
      return '<tr><td><b>' + escapeHtml(o.title) + '</b><small>' + escapeHtml(o.description || "—") + '</small></td><td>' + escapeHtml(loc) + '</td><td>' + dateText(o.expiresAt) + '</td><td><span class="status ' + (o.status === "active" ? "active" : "inactive") + '">' + escapeHtml(o.status || "inactive") + '</span></td>' +
      '<td class="actions"><button class="text-action" data-action="toggle-offer" data-id="' + escapeHtml(o._id) + '" data-status="' + escapeHtml(o.status || "inactive") + '">' + (o.status === "active" ? "Deactivate" : "Activate") + '</button><button class="text-action danger-text" data-action="delete-offer" data-id="' + escapeHtml(o._id) + '">Delete</button></td></tr>';
    }).join("") : '<tr><td colspan="5" class="empty-cell">No offers found.</td></tr>') +
    '</tbody></table></div>';
}

content.addEventListener("click", async function (event) {
  const suggestion = event.target.closest("[data-suggestion-index]");
  if (suggestion) {
    chooseAdminPlaceSuggestion(Number(suggestion.dataset.suggestionIndex));
    return;
  }
  const go = event.target.closest("[data-go]");
  if (go) return navigate(go.dataset.go);
  const quick = event.target.closest('[data-action="quick-add-location"]');
  if (quick) return navigate("locations");
  const button = event.target.closest("[data-action]");
  if (!button) return;
  if (button.dataset.action === "retry") return window.location.reload();
  if (button.dataset.action === "refresh-india-map") return renderIndiaMap().catch(function (err) { showNotice(err.message, true); });
  if (button.dataset.action === "filter-india-category") {
    const selected = button.dataset.category;
    content.querySelectorAll("[data-action=filter-india-category]").forEach(function (chip) { chip.classList.toggle("active", chip === button); });
    let visible = 0;
    indiaMapMarkers.forEach(function (marker) {
      const show = selected === "__all" || marker._pinpointCategory === selected;
      if (show) { if (!indiaOverviewMap.hasLayer(marker)) marker.addTo(indiaOverviewMap); visible++; }
      else if (indiaOverviewMap.hasLayer(marker)) indiaOverviewMap.removeLayer(marker);
    });
    const status = document.getElementById("indiaMapStatus");
    if (status) status.textContent = (selected === "__all" ? "Showing all categories" : "Showing " + selected) + " · " + visible + " locations. Select All to clear the filter.";
    return;
  }
  const id = button.dataset.id;
  try {
    if (button.dataset.action === "import-google-maps") {
      importGoogleMapsLink();
      return;
    }
    if (button.dataset.action === "reset-admin-map") {
      const title = document.getElementById("locationTitle");
      const search = document.getElementById("placeSearchInput");
      const address = document.getElementById("locationAddress");
      const lat = document.getElementById("locationLatitude");
      const lng = document.getElementById("locationLongitude");
      if (title) title.value = "";
      if (search) search.value = "";
      if (address) address.value = "";
      if (lat) lat.value = "";
      if (lng) lng.value = "";
      const suggestions = document.getElementById("placeSuggestions");
      if (suggestions) { suggestions.innerHTML = ""; suggestions.classList.add("hidden"); }
      if (adminLocationMap) {
        if (adminLocationMarker) adminLocationMap.removeLayer(adminLocationMarker);
        adminLocationMarker = null;
        adminLocationMap.setView([23.0225, 72.5714], 12);
      }
      const status = document.getElementById("locationMapStatus");
      if (status) status.textContent = "No coordinates selected. Choose a search suggestion or click the map.";
      return;
    }
    if (button.dataset.action === "show-add-location-category") {
      document.getElementById("locationCustomCategoryBox").classList.toggle("hidden");
      return;
    }
    if (button.dataset.action === "save-location-category") {
      const input = document.getElementById("newLocationCategory");
      const name = input.value.trim().replace(/\s+/g, " ");
      if (!name || name.length > 50) return showNotice("Enter a category name (maximum 50 characters).", true);
      const result = await api("/admin/categories", { method: "POST", body: JSON.stringify({ name: name }) });
      const select = document.getElementById("locationCategorySelect");
      if (select && result.data && result.data.name) {
        let option = Array.from(select.options).find(function (item) { return item.value.toLocaleLowerCase() === result.data.name.toLocaleLowerCase(); });
        if (!option) {
          option = document.createElement("option");
          option.value = result.data.name;
          option.textContent = result.data.name;
          select.appendChild(option);
        }
        select.value = result.data.name;
      }
      input.value = "";
      document.getElementById("locationCustomCategoryBox").classList.add("hidden");
      showNotice(result.alreadyExists ? "Existing category selected. No duplicate was created." : "Category added to the shared dropdown.");
      return;
    }
    if (button.dataset.action === "toggle-user") {
      await api("/admin/users/" + id, { method: "PATCH", body: JSON.stringify({ isActive: button.dataset.active === "false" }) });
      showNotice("User account updated.");
      await renderUsers();
    }
    if (button.dataset.action === "toggle-place") {
      await api("/admin/locations/" + id, { method: "PUT", body: JSON.stringify({ isPublic: button.dataset.public !== "true" }) });
      showNotice("Location visibility updated.");
      await renderLocations();
    }
    if (button.dataset.action === "edit-location") {
      const title = window.prompt("Place name", button.dataset.title);
      if (title === null) return;
      const address = window.prompt("Address", button.dataset.address);
      if (address === null) return;
      const notes = window.prompt("Notes", button.dataset.notes);
      if (notes === null) return;
      await api("/admin/locations/" + id, { method: "PUT", body: JSON.stringify({ title: title, address: address, notes: notes }) });
      showNotice("Location details updated.");
      await renderLocations();
    }
    if (button.dataset.action === "delete-place") {
      if (!window.confirm("Delete this location and its linked offers? This cannot be undone.")) return;
      await api("/admin/locations/" + id, { method: "DELETE" });
      showNotice("Location and linked offers deleted.");
      await renderLocations();
    }
    if (button.dataset.action === "edit-category") {
      const form = document.getElementById("categoryForm");
      form.elements.categoryId.value = id;
      form.elements.name.value = button.dataset.name || "";
      form.elements.color.value = button.dataset.color || "#D97855";
      form.elements.icon.value = button.dataset.icon || "◇";
      document.getElementById("categoryColorValue").textContent = form.elements.color.value.toUpperCase();
      document.getElementById("categoryFormHeading").textContent = "Edit category";
      document.getElementById("categorySubmitButton").textContent = "Save changes";
      document.getElementById("categoryCancelButton").classList.remove("hidden");
      content.querySelectorAll(".category-icon-option").forEach(function (option) { option.classList.toggle("selected", option.dataset.icon === form.elements.icon.value); });
      form.scrollIntoView({ behavior: "smooth", block: "center" });
      form.elements.name.focus();
      return;
    }
    if (button.dataset.action === "choose-category-icon") {
      const form = document.getElementById("categoryForm");
      form.elements.icon.value = button.dataset.icon;
      content.querySelectorAll(".category-icon-option").forEach(function (option) { option.classList.toggle("selected", option === button); });
      return;
    }
    if (button.dataset.action === "cancel-category-edit") return renderCategories();
    if (button.dataset.action === "delete-category") {
      if (!window.confirm("Delete this category?")) return;
      await api("/admin/categories/" + id, { method: "DELETE" });
      showNotice("Category deleted.");
      await renderCategories();
    }
    if (button.dataset.action === "toggle-offer") {
      const status = button.dataset.status === "active" ? "inactive" : "active";
      await api("/admin/offers/" + id, { method: "PUT", body: JSON.stringify({ status: status }) });
      showNotice("Offer status updated.");
      await renderOffers();
    }
    if (button.dataset.action === "delete-offer") {
      if (!window.confirm("Delete this offer?")) return;
      await api("/admin/offers/" + id, { method: "DELETE" });
      showNotice("Offer deleted.");
      await renderOffers();
    }
  } catch (err) { showNotice(err.message, true); }
});
content.addEventListener("input", function (event) {
  if (event.target && event.target.name === "color" && event.target.form && event.target.form.id === "categoryForm") {
    const output = document.getElementById("categoryColorValue");
    if (output) output.textContent = event.target.value.toUpperCase();
  }
});
content.addEventListener("input", function (event) {
  if (event.target && event.target.id === "placeSearchInput") {
    searchAdminPlaceNames(event.target.value);
  }
});
content.addEventListener("change", async function (event) {
  const ownerSelect = event.target.closest("[data-location-owner]");
  if (ownerSelect) {
    try {
      ownerSelect.disabled = true;
      await api("/admin/locations/" + ownerSelect.dataset.locationOwner, { method: "PUT", body: JSON.stringify({ userId: ownerSelect.value }) });
      showNotice("Location owner changed successfully.");
      await renderLocations();
    } catch (err) {
      showNotice(err.message, true);
      ownerSelect.disabled = false;
    }
    return;
  }
  const categorySelect = event.target.closest("[data-location-category]");
  if (categorySelect) {
    try {
      await api("/admin/locations/" + categorySelect.dataset.locationCategory, { method: "PUT", body: JSON.stringify({ category: categorySelect.value }) });
      showNotice("Location category updated.");
    } catch (err) { showNotice(err.message, true); await renderLocations(); }
    return;
  }
  const select = event.target.closest("[data-role-id]");
  if (!select) return;
  try {
    await api("/admin/users/" + select.dataset.roleId, { method: "PATCH", body: JSON.stringify({ role: select.value }) });
    showNotice("User role updated.");
    await renderUsers();
  } catch (err) { showNotice(err.message, true); await renderUsers(); }
});
content.addEventListener("submit", async function (event) {
  const form = event.target;
  if (!["userForm", "locationForm", "categoryForm", "offerForm"].includes(form.id)) return;
  event.preventDefault();
  const button = form.querySelector('button[type="submit"]');
  button.disabled = true;
  const data = new FormData(form);
  try {
    if (form.id === "userForm") {
      const result = await api("/admin/users", { method: "POST", body: JSON.stringify({
        name: data.get("name"), email: data.get("email"), password: data.get("password"), role: data.get("role")
      }) });
      showNotice(result.data.role === "admin" ? "New administrator account created." : "New user account created.");
      await renderUsers();
    }
    if (form.id === "locationForm") {
      const body = {
        title: data.get("title"), category: data.get("category"), userId: data.get("userId") || undefined,
        address: data.get("address"), latitude: Number(data.get("latitude")), longitude: Number(data.get("longitude")),
        notes: data.get("notes"), isPublic: data.get("isPublic") === "on"
      };
      await api("/admin/locations", { method: "POST", body: JSON.stringify(body) });
      showNotice(body.isPublic ? "Public location added and shared with Pinpoint users." : "Private location added.");
      await renderLocations();
    }
    if (form.id === "categoryForm") {
      const categoryId = data.get("categoryId");
      const payload = { name: data.get("name"), color: data.get("color"), icon: data.get("icon") };
      if (categoryId) {
        await api("/admin/categories/" + encodeURIComponent(categoryId), { method: "PUT", body: JSON.stringify(payload) });
        showNotice("Category updated.");
      } else {
        const categoryResult = await api("/admin/categories", { method: "POST", body: JSON.stringify(payload) });
        showNotice(categoryResult.alreadyExists ? "That category already exists in the shared catalogue." : "Category added to the shared catalogue.");
      }
      await renderCategories();
    }
    if (form.id === "offerForm") {
      await api("/admin/offers", { method: "POST", body: JSON.stringify({
        locationId: data.get("locationId"), title: data.get("title"), description: data.get("description"),
        discountType: data.get("discountType"), discountValue: data.get("discountValue") ? Number(data.get("discountValue")) : undefined,
        startsAt: data.get("startsAt") || undefined, expiresAt: data.get("expiresAt") || undefined, status: "active"
      }) });
      showNotice("Offer created.");
      await renderOffers();
    }
  } catch (err) {
    showNotice(err.message, true);
    button.disabled = false;
  }
});

async function resumeSession() {
  if (!token) return;
  try {
    const result = await api("/auth/me");
    if (result.user.role !== "admin") throw new Error("Administrator access required");
    showApp(result.user);
  } catch (_) {
    signOut();
  }
}
resumeSession();
