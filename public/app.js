/**
 * PLOT JOURNAL — app.js  v2.0
 * Firebase Auth (Email + Google) · Firestore sync · Open-Meteo weather
 * Photo compression · Tile grid + focus overlay UI
 *
 * ⚠️  SETUP REQUIRED — see README.md for Firebase config steps
 */

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import {
  getAuth, onAuthStateChanged,
  signInWithEmailAndPassword, createUserWithEmailAndPassword,
  signInWithPopup, GoogleAuthProvider,
  updateProfile, signOut
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import {
  getFirestore, collection, doc,
  setDoc, getDoc, deleteDoc, onSnapshot,
  query, orderBy, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

// ════════════════════════════════════════════════════════════
// 🔧 FIREBASE CONFIG — replace with your values from
//    Firebase Console → Project Settings → Your Apps → Web App
// ════════════════════════════════════════════════════════════
  const firebaseConfig = {
    apiKey: "AIzaSyAGZz4iLmqlr2X5lC70af6ynOKNCnu4Xz8",
    authDomain: "plot-journal.firebaseapp.com",
    projectId: "plot-journal",
    storageBucket: "plot-journal.firebasestorage.app",
    messagingSenderId: "337287886098",
    appId: "1:337287886098:web:42351aa18cddc3beb12fcb",
    measurementId: "G-7SP1XPCK4E"
  };

const app            = initializeApp(firebaseConfig);
const auth           = getAuth(app);
const db             = getFirestore(app);
const googleProvider = new GoogleAuthProvider();

// ════════════════════════════════════════════════════════════
// STATE
// ════════════════════════════════════════════════════════════
let currentUser     = null;
let entries         = [];
let currentPhotos   = [];
let selectedWeather = null;
let editingEntryId  = null;
let draftCreatedAt  = null;
let isNewEntry      = false;
let currentFilter   = 'all';
let firestoreUnsub  = null;
let weatherData     = null;
let forecastDays    = [];
let userLocation    = null; // { lat, lon, name } — saved in Firestore settings
let locationSearchTimer = null;

// Per-section text state (mirrors what user has typed in each overlay)
const formState = {
  weatherNotes: '', sowed: '', transplanted: '', harvested: '',
  maintenance: '', health: '', pests: '', thriving: '',
  problems: '', wins: '', notes: ''
};

// ════════════════════════════════════════════════════════════
// AUTH STATE
// ════════════════════════════════════════════════════════════
onAuthStateChanged(auth, user => {
  if (user) {
    currentUser = user;
    const displayName = (user.displayName || user.email || '').split(' ')[0];
    document.getElementById('header-username').textContent = displayName;
    const sidebarName = document.getElementById('sidebar-username');
    if (sidebarName) sidebarName.textContent = displayName;
    loadUserSettings().then(() => {
      showAppScreen();
      subscribeToEntries();
    });
  } else {
    currentUser = null;
    if (firestoreUnsub) { firestoreUnsub(); firestoreUnsub = null; }
    showAuthScreen();
  }
});

// ════════════════════════════════════════════════════════════
// AUTH ACTIONS
// ════════════════════════════════════════════════════════════
document.getElementById('btn-google-signin').addEventListener('click', async () => {
  try { await signInWithPopup(auth, googleProvider); }
  catch (e) { setAuthMsg(friendlyAuthError(e.code)); }
});

document.getElementById('btn-email-login').addEventListener('click', async () => {
  const email = document.getElementById('login-email').value.trim();
  const pass  = document.getElementById('login-password').value;
  if (!email || !pass) return setAuthMsg('Please fill all fields');
  setAuthMsg('Signing in…', 'neutral');
  try { await signInWithEmailAndPassword(auth, email, pass); }
  catch (e) { setAuthMsg(friendlyAuthError(e.code)); }
});

document.getElementById('btn-email-register').addEventListener('click', async () => {
  const name  = document.getElementById('reg-name').value.trim();
  const email = document.getElementById('reg-email').value.trim();
  const pass  = document.getElementById('reg-password').value;
  if (!name || !email || !pass) return setAuthMsg('Please fill all fields');
  if (pass.length < 6) return setAuthMsg('Password must be 6+ characters');
  setAuthMsg('Creating account…', 'neutral');
  try {
    const cred = await createUserWithEmailAndPassword(auth, email, pass);
    await updateProfile(cred.user, { displayName: name });
  } catch (e) { setAuthMsg(friendlyAuthError(e.code)); }
});

document.getElementById('btn-logout').addEventListener('click', () => signOut(auth));
document.getElementById('btn-sidebar-logout').addEventListener('click', () => signOut(auth));

window.showAuthTab = function(tab) {
  document.querySelectorAll('.auth-tab').forEach((t, i) =>
    t.classList.toggle('active', (i === 0 && tab === 'login') || (i === 1 && tab === 'register'))
  );
  document.getElementById('login-form').style.display    = tab === 'login'    ? '' : 'none';
  document.getElementById('register-form').style.display = tab === 'register' ? '' : 'none';
  setAuthMsg('');
};

function setAuthMsg(msg, type = 'error') {
  const el = document.getElementById('auth-msg');
  el.textContent = msg;
  el.style.color = type === 'neutral' ? 'var(--text-soft)' : type === 'ok' ? 'var(--tile-mint)' : 'var(--peach-dark)';
}

function friendlyAuthError(code) {
  const map = {
    'auth/wrong-password':        'Incorrect password',
    'auth/user-not-found':        'No account with that email',
    'auth/email-already-in-use':  'Email already registered — sign in instead',
    'auth/invalid-email':         'Invalid email address',
    'auth/too-many-requests':     'Too many attempts — try again later',
    'auth/popup-closed-by-user':  'Google sign-in was cancelled',
    'auth/network-request-failed':'Network error — check your connection',
  };
  return map[code] || `Error: ${code}`;
}

// ════════════════════════════════════════════════════════════
// SCREENS
// ════════════════════════════════════════════════════════════
function showAuthScreen() {
  document.getElementById('auth-screen').classList.add('active');
  document.getElementById('app-screen').classList.remove('active');
  entries = [];
}

function showAppScreen() {
  document.getElementById('auth-screen').classList.remove('active');
  document.getElementById('app-screen').classList.add('active');
  initTodayLabel();
  renderFeed();
}

// ════════════════════════════════════════════════════════════
// FIRESTORE
// ════════════════════════════════════════════════════════════
function subscribeToEntries() {
  if (!currentUser) return;
  setSyncStatus('syncing');
  const q = query(
    collection(db, 'users', currentUser.uid, 'entries'),
    orderBy('date', 'desc')
  );
  firestoreUnsub = onSnapshot(q,
    snapshot => {
      entries = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
      setSyncStatus('synced');
      renderFeed();
      const active = document.querySelector('.view.active');
      if (active?.id === 'view-stats')  renderStats();
      if (active?.id === 'view-search') renderSearch(document.getElementById('search-input').value);
    },
    err => { console.error('Firestore error:', err); setSyncStatus('error'); }
  );
}

async function saveEntryToFirestore(entry) {
  setSyncStatus('syncing');
  await setDoc(doc(db, 'users', currentUser.uid, 'entries', entry.id), { ...entry, updatedAt: serverTimestamp() });
  setSyncStatus('synced');
}

async function deleteEntryFromFirestore(id) {
  setSyncStatus('syncing');
  await deleteDoc(doc(db, 'users', currentUser.uid, 'entries', id));
  setSyncStatus('synced');
}

function setSyncStatus(status) {
  const title = { synced:'Synced', syncing:'Syncing…', error:'Sync error' }[status] || '';
  [document.getElementById('sync-indicator'), document.getElementById('sidebar-sync')]
    .forEach(el => { if (el) { el.className = `sync-indicator ${status}`; el.title = title; } });
}

// ════════════════════════════════════════════════════════════
// USER SETTINGS (location preference)
// ════════════════════════════════════════════════════════════
async function loadUserSettings() {
  if (!currentUser) return;
  try {
    const snap = await getDoc(doc(db, 'users', currentUser.uid, 'settings'));
    if (snap.exists() && snap.data().location) {
      userLocation = snap.data().location;
    }
  } catch (e) {
    console.warn('Failed to load user settings:', e);
  }
}

async function saveUserLocation(location) {
  userLocation = location;
  if (!currentUser) return;
  try {
    await setDoc(doc(db, 'users', currentUser.uid, 'settings'), { location }, { merge: true });
  } catch (e) {
    console.warn('Failed to save location:', e);
  }
}

// ════════════════════════════════════════════════════════════
// NAVIGATION
// ════════════════════════════════════════════════════════════
function showView(name) {
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  document.getElementById('view-' + name).classList.add('active');
  document.querySelector('.app-main').scrollTop = 0;
}

document.querySelectorAll('.nav-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll(`.nav-btn[data-view="${btn.dataset.view}"]`).forEach(b => b.classList.add('active'));
    const v = btn.dataset.view;
    showView(v);
    if (v === 'feed')   renderFeed();
    if (v === 'stats')  renderStats();
    if (v === 'search') renderSearch('');
  });
});

function switchNavTo(name) {
  document.querySelectorAll('.nav-btn').forEach(b =>
    b.classList.toggle('active', b.dataset.view === name)
  );
}

// ════════════════════════════════════════════════════════════
// FEED
// ════════════════════════════════════════════════════════════
function initTodayLabel() {
  document.getElementById('today-label').textContent =
    new Date().toLocaleDateString('en-GB', { weekday:'long', day:'numeric', month:'long', year:'numeric' });
}

function renderFeed() {
  const list  = document.getElementById('entries-list');
  const count = document.getElementById('entries-count-label');
  const sub   = document.getElementById('feed-subtitle');
  count.textContent = entries.length === 0 ? '' : `${entries.length} entr${entries.length === 1 ? 'y' : 'ies'}`;
  sub.textContent   = entries.length === 0 ? 'start recording your garden story'
    : `${entries.length} visit${entries.length === 1 ? '' : 's'} recorded`;

  if (entries.length === 0) {
    list.innerHTML = `<div class="empty-state">
      <span class="big-icon">🌱</span>
      <p>No entries yet.<br>Tap <strong>new entry</strong> after your next garden visit!</p>
    </div>`;
    return;
  }
  list.innerHTML = entries.map((e, i) => entryCardHTML(e, i * 0.035)).join('');
}

function entryCardHTML(e, delay = 0) {
  const tags = [];
  if (e.wins)                    tags.push('<span class="tag tag-win">🏆 win</span>');
  if (e.problems)                tags.push('<span class="tag tag-problem">⚠️ issue</span>');
  if (e.harvested)               tags.push('<span class="tag tag-action">🥬 harvest</span>');
  if (e.sowed || e.transplanted) tags.push('<span class="tag tag-action">🌱 sowed</span>');
  if (e.pests)                   tags.push('<span class="tag tag-obs">🐛 pest</span>');
  if (e.weatherAuto)             tags.push(`<span class="tag tag-weather">${e.weatherAuto.emoji} ${e.weatherAuto.tempC}°C</span>`);

  const cls     = e.wins ? 'has-wins' : e.problems ? 'has-problems' : 'has-actions';
  const thumb   = e.photos?.length ? `<img class="entry-photo-thumb" src="${e.photos[0]}" loading="lazy" alt="">` : '';
  const preview = [e.sowed, e.transplanted, e.harvested, e.health, e.wins, e.notes]
    .filter(Boolean).join(' · ').substring(0, 120);
  const d       = new Date(e.date + 'T12:00:00');
  const dateStr = d.toLocaleDateString('en-GB', { weekday:'short', day:'numeric', month:'short', year:'numeric' });

  return `<div class="entry-card ${cls}" onclick="openDetail('${e.id}')" style="animation-delay:${delay}s">
    <div class="entry-meta">
      <div class="entry-date-text">${dateStr}${e.weather ? ' · ' + weatherEmoji(e.weather) : ''}</div>
      <div class="entry-tags">${tags.join('')}</div>
    </div>
    ${thumb}
    <div class="entry-preview">${preview || 'tap to view…'}</div>
  </div>`;
}

function weatherEmoji(w) {
  return { sunny:'☀️', cloudy:'⛅', rainy:'🌧', cold:'🌨' }[w] || '🌿';
}

// ════════════════════════════════════════════════════════════
// NEW ENTRY — tile grid
// ════════════════════════════════════════════════════════════
document.getElementById('btn-new-entry').addEventListener('click', openNewEntry);
document.getElementById('btn-form-back').addEventListener('click', () => showView('feed'));

function openNewEntry() {
  clearFormState();
  editingEntryId = Date.now().toString(36) + Math.random().toString(36).slice(2);
  draftCreatedAt = new Date().toISOString();
  isNewEntry     = true;
  document.getElementById('form-mode-label').textContent    = 'new entry';
  document.getElementById('entry-date').value = todayISO();
  setEntryDateDisplay(new Date());
  renderAllTilePreviews();
  showView('new');
  fetchWeatherForToday();
}
window.openNewEntry = openNewEntry;

function clearFormState() {
  Object.keys(formState).forEach(k => formState[k] = '');
  selectedWeather = null;
  weatherData     = null;
  currentPhotos   = [];
  // Clear tile has-content classes
  document.querySelectorAll('.section-tile').forEach(t => t.classList.remove('has-content'));
}

function todayISO() {
  return new Date().toISOString().split('T')[0];
}

function ordinal(n) {
  const s = ['th','st','nd','rd'];
  const v = n % 100;
  return s[(v - 20) % 10] || s[v] || s[0];
}

function formatEntryDate(date) {
  const weekday = date.toLocaleDateString('en-GB', { weekday: 'long' });
  const day     = date.getDate();
  const month   = date.toLocaleDateString('en-GB', { month: 'long' });
  const year    = date.getFullYear();
  return `${weekday} ${day}${ordinal(day)} ${month} ${year}`;
}

function getWeekNumber(date) {
  const d      = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
}

function setEntryDateDisplay(date) {
  document.getElementById('entry-date-display').textContent = formatEntryDate(date);
  document.getElementById('entry-week-label').textContent   = `week ${getWeekNumber(date)}`;
}

// ── TILE PREVIEWS ──────────────────────────────────────────
const TILE_HINTS = {
  weather:  'what was the weather like today?',
  actions:  'what have you sown, transplanted or harvested?',
  observe:  'how are the plants looking?',
  problems: 'any issues or concerns?',
  wins:     'what went well today?',
  photos:   'add photos from your visit',
  notes:    'anything else worth noting?'
};

function renderAllTilePreviews() {
  updateTilePreview('weather',  selectedWeather ? `${weatherEmoji(selectedWeather)} ${formState.weatherNotes || selectedWeather}` : '');
  updateTilePreview('actions',  [formState.sowed, formState.transplanted, formState.harvested, formState.maintenance].filter(Boolean).join(' · '));
  updateTilePreview('observe',  [formState.health, formState.pests, formState.thriving].filter(Boolean).join(' · '));
  updateTilePreview('problems', formState.problems);
  updateTilePreview('wins',     formState.wins);
  updateTilePreview('photos',   currentPhotos.length ? `${currentPhotos.length} photo${currentPhotos.length === 1 ? '' : 's'}` : '');
  updateTilePreview('notes',    formState.notes);
}

function updateTilePreview(section, text) {
  const preview = document.getElementById('tile-preview-' + section);
  const tile    = document.getElementById('tile-' + section);
  if (!preview || !tile) return;
  if (text) {
    const short = text.length > 55 ? text.substring(0, 55) + '…' : text;
    preview.innerHTML = escHtml(short);
    tile.classList.add('has-content');
  } else {
    const hint = TILE_HINTS[section] || 'tap to add';
    preview.innerHTML = `<span class="tile-empty-hint">${hint}</span>`;
    tile.classList.remove('has-content');
  }
}

// ════════════════════════════════════════════════════════════
// FOCUS OVERLAY — opens when a tile is tapped
// ════════════════════════════════════════════════════════════

// Section configs
const SECTIONS = {
  weather: {
    icon: '🌤', iconBg: 'rgba(142,207,223,0.25)',
    name: 'weather',
    hint: 'what was it like outside today?',
    type: 'weather'   // special: shows tile grid + notes textarea
  },
  actions: {
    icon: '🌱', iconBg: 'rgba(126,202,172,0.25)',
    name: 'actions taken',
    hint: 'sowing, transplanting, harvesting, maintenance',
    type: 'multi',
    fields: [
      { key: 'sowed',        label: '🌰 sowed / started',   placeholder: 'e.g. Direct sowed carrots Bed 1, row 3. 30 seeds.', rows: 3 },
      { key: 'transplanted', label: '🌿 transplanted',       placeholder: 'e.g. Potted on 12 tomato seedlings to 9cm pots.', rows: 3 },
      { key: 'harvested',    label: '🥬 harvested',          placeholder: 'e.g. 4 lettuce heads. First courgette!', rows: 2 },
      { key: 'maintenance',  label: '🔧 maintenance',        placeholder: 'e.g. Weeded Bed 2. Earthed up potatoes.', rows: 2 }
    ]
  },
  observe: {
    icon: '🔍', iconBg: 'rgba(242,196,155,0.25)',
    name: 'observations',
    hint: 'plant health, pests, what\'s thriving or struggling',
    type: 'multi',
    fields: [
      { key: 'health',    label: '💚 plant health',          placeholder: 'e.g. Leeks looking strong. Brassicas showing good leaf development.', rows: 3 },
      { key: 'pests',     label: '🐛 pests spotted',         placeholder: 'e.g. Aphids on nasturtiums (trap crop working!). Slug trail on Bed 3.', rows: 2 },
      { key: 'thriving',  label: '📊 thriving / struggling', placeholder: 'e.g. Tomato Gardener\'s Delight thriving. Parsnips very slow.', rows: 2 }
    ]
  },
  problems: {
    icon: '⚠️', iconBg: 'rgba(240,175,175,0.25)',
    name: 'problems',
    hint: 'issues, disease, poor germination — leave blank if all good',
    type: 'single', key: 'problems',
    placeholder: 'e.g. Damping off on batch 2 brassicas. Poor germination on parsnips row 2.'
  },
  wins: {
    icon: '🏆', iconBg: 'rgba(232,217,138,0.3)',
    name: 'wins & highlights',
    hint: 'celebrate what went well — even small wins count',
    type: 'single', key: 'wins',
    placeholder: 'e.g. First harvest of the year! Lettuce tasted incredible.'
  },
  photos: {
    icon: '📷', iconBg: 'rgba(196,181,224,0.25)',
    name: 'photos',
    hint: 'add photos from today\'s visit',
    type: 'photos'
  },
  notes: {
    icon: '📝', iconBg: 'rgba(200,216,176,0.3)',
    name: 'extra notes',
    hint: 'anything else worth remembering',
    type: 'single', key: 'notes',
    placeholder: 'e.g. Remember to order more fleece before next frost.'
  }
};

let activeFocusSection = null;

window.openFocusOverlay = function(sectionKey) {
  const cfg = SECTIONS[sectionKey];
  if (!cfg) return;
  activeFocusSection = sectionKey;

  // Set header
  const iconBg = document.getElementById('focus-icon-bg');
  iconBg.textContent  = cfg.icon;
  iconBg.style.background = cfg.iconBg;
  document.getElementById('focus-section-name').textContent = cfg.name;
  document.getElementById('focus-section-hint').textContent = cfg.hint;

  // Build field area
  const area = document.getElementById('focus-field-area');
  area.innerHTML = buildFocusFieldHTML(cfg);

  // If weather overlay and data already loaded, populate immediately
  if (sectionKey === 'weather' && weatherData) {
    const auto      = wmoCategoryAndEmoji(weatherData.weatherCode);
    const autoStrip = document.getElementById('focus-weather-auto-strip');
    if (autoStrip) {
      autoStrip.style.display = 'flex';
      autoStrip.innerHTML = `
        <div class="weather-auto-icon">${auto.emoji}</div>
        <div>
          <div class="weather-auto-main">${auto.description} · ${weatherData.tempC}°C (feels ${weatherData.feelsLike}°C)</div>
          <div class="weather-auto-sub">↑${weatherData.maxTemp}° ↓${weatherData.minTemp}° · 💧${weatherData.humidity}% · 🌬${weatherData.wind}km/h · 🌅${weatherData.sunrise} 🌇${weatherData.sunset}${weatherData.rainTotal > 0 ? ` · 🌧${weatherData.rainTotal}mm` : ''}</div>
        </div>
        <div style="font-size:0.58rem;color:var(--text-soft);opacity:0.7;align-self:flex-start;margin-left:auto">Open-Meteo</div>`;
    }
    document.querySelectorAll('.weather-tile').forEach(t => t.classList.remove('selected'));
    const cls = auto.category === 'sunny' ? 'sky' : auto.category === 'cloudy' ? 'cloud' : auto.category === 'rainy' ? 'rain' : 'cold';
    document.querySelector(`.weather-tile.${cls}`)?.classList.add('selected');
    renderForecastStrip();
  }

  // Open overlay
  document.getElementById('focus-overlay').classList.add('open');

  // Auto-focus first textarea after transition
  setTimeout(() => {
    const first = area.querySelector('textarea');
    if (first) first.focus();
  }, 400);
};

function buildFocusFieldHTML(cfg) {
  switch (cfg.type) {
    case 'single':
      return `<textarea class="focus-textarea" id="focus-ta-main" rows="10"
        placeholder="${escAttr(cfg.placeholder)}">${escHtml(formState[cfg.key])}</textarea>`;

    case 'multi':
      return `<div class="focus-sub-fields">${cfg.fields.map(f => `
        <div class="focus-sub-field">
          <span class="focus-sub-label">${f.label}</span>
          <textarea class="focus-sub-textarea" id="focus-ta-${f.key}" rows="${f.rows}"
            placeholder="${escAttr(f.placeholder)}">${escHtml(formState[f.key])}</textarea>
        </div>`).join('')}</div>`;

    case 'weather': {
      const locName = userLocation?.name || 'device location';
      return `
        <div class="location-bar" id="focus-location-bar">
          <span>📍</span>
          <span class="location-bar-name" id="focus-location-name">${escHtml(locName)}</span>
          <button class="location-change-btn" onclick="toggleLocationSearch()">change</button>
        </div>
        <div class="location-search-inline" id="focus-location-search" style="display:none">
          <div class="location-search-row">
            <input type="text" id="location-search-input" class="location-search-input"
              placeholder="search for a place…" oninput="debounceLocationSearch(this.value)">
            <button class="location-cancel-btn" onclick="toggleLocationSearch()">cancel</button>
          </div>
          <div id="location-search-results" class="location-results"></div>
        </div>
        <div class="weather-fetch-status" id="focus-weather-status"></div>
        <div id="focus-weather-auto-strip" class="weather-auto-strip" style="display:none"></div>
        <div id="focus-forecast-strip" class="forecast-strip" style="display:none"></div>
        <div class="weather-tile-grid">
          <div class="weather-tile sky${selectedWeather==='sunny'?' selected':''}" onclick="selectWeatherTile(this,'sunny')">
            <div class="weather-tile-inner">☀️</div><div class="weather-tile-label">sunny</div>
          </div>
          <div class="weather-tile cloud${selectedWeather==='cloudy'?' selected':''}" onclick="selectWeatherTile(this,'cloudy')">
            <div class="weather-tile-inner">⛅</div><div class="weather-tile-label">cloudy</div>
          </div>
          <div class="weather-tile rain${selectedWeather==='rainy'?' selected':''}" onclick="selectWeatherTile(this,'rainy')">
            <div class="weather-tile-inner">🌧</div><div class="weather-tile-label">rainy</div>
          </div>
          <div class="weather-tile cold${selectedWeather==='cold'?' selected':''}" onclick="selectWeatherTile(this,'cold')">
            <div class="weather-tile-inner">🌨</div><div class="weather-tile-label">cold</div>
          </div>
        </div>
        <span class="focus-sub-label">additional notes</span>
        <textarea class="focus-sub-textarea" id="focus-ta-weatherNotes" rows="3"
          placeholder="e.g. Cool morning, warmed up by midday. Light frost overnight.">${escHtml(formState.weatherNotes)}</textarea>`;
    }

    case 'photos':
      return `
        <div class="photo-upload-area" id="focus-photo-drop">
          <div class="photo-upload-icon">📸</div>
          <div class="photo-upload-text">tap to add photos<br><span style="opacity:0.6;font-size:0.65rem">compressed automatically · max 800px</span></div>
          <input type="file" id="focus-photo-input" accept="image/*" multiple>
        </div>
        <div class="photo-previews" id="focus-photo-previews"></div>`;

    default:
      return '';
  }
}

window.closeFocusOverlay = function(save = false) {
  if (save && activeFocusSection) {
    saveFocusState(activeFocusSection);
    updateTilePreviews(activeFocusSection);
    autoSaveDraft();
  }
  document.getElementById('focus-overlay').classList.remove('open');
  activeFocusSection = null;
};

function saveFocusState(sectionKey) {
  const cfg = SECTIONS[sectionKey];
  switch (cfg.type) {
    case 'single': {
      const ta = document.getElementById('focus-ta-main');
      if (ta) formState[cfg.key] = ta.value.trim();
      break;
    }
    case 'multi': {
      cfg.fields.forEach(f => {
        const ta = document.getElementById('focus-ta-' + f.key);
        if (ta) formState[f.key] = ta.value.trim();
      });
      break;
    }
    case 'weather': {
      const ta = document.getElementById('focus-ta-weatherNotes');
      if (ta) formState.weatherNotes = ta.value.trim();
      break;
    }
    case 'photos':
      break; // photos managed separately
  }
  renderAllTilePreviews();
}

function updateTilePreviews() {
  // Just re-run all previews — simpler and always correct
  renderAllTilePreviews();
}

// ── LOCATION SEARCH ────────────────────────────────────────
window.toggleLocationSearch = function() {
  const bar    = document.getElementById('focus-location-bar');
  const search = document.getElementById('focus-location-search');
  if (!search) return;
  const isOpen = search.style.display !== 'none';
  search.style.display = isOpen ? 'none' : 'block';
  if (bar) bar.style.display = isOpen ? 'flex' : 'none';
  if (!isOpen) {
    document.getElementById('location-search-results').innerHTML = '';
    setTimeout(() => document.getElementById('location-search-input')?.focus(), 50);
  }
};

window.debounceLocationSearch = function(query) {
  clearTimeout(locationSearchTimer);
  if (!query.trim()) {
    document.getElementById('location-search-results').innerHTML = '';
    return;
  }
  locationSearchTimer = setTimeout(() => searchLocation(query), 450);
};

async function searchLocation(query) {
  const resultsEl = document.getElementById('location-search-results');
  if (!resultsEl) return;
  resultsEl.innerHTML = '<div class="location-searching">searching…</div>';
  try {
    const res  = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(query)}&count=6&language=en&format=json`);
    const data = await res.json();
    if (!data.results?.length) {
      resultsEl.innerHTML = '<div class="location-no-results">no places found</div>';
      return;
    }
    resultsEl.innerHTML = data.results.map(r => {
      const sub  = [r.admin1, r.country].filter(Boolean).join(', ');
      const name = r.name + (sub ? ', ' + sub : '');
      return `<div class="location-result-item" onclick="selectLocation(${r.latitude}, ${r.longitude}, '${escAttr(name)}')">
        <span class="location-result-name">${escHtml(r.name)}</span>
        <span class="location-result-sub">${escHtml(sub)}</span>
      </div>`;
    }).join('');
  } catch (e) {
    resultsEl.innerHTML = '<div class="location-no-results">search failed — check connection</div>';
  }
}

window.selectLocation = async function(lat, lon, name) {
  await saveUserLocation({ lat, lon, name });
  const locNameEl = document.getElementById('focus-location-name');
  if (locNameEl) locNameEl.textContent = name;
  window.toggleLocationSearch();
  forecastDays = [];
  document.getElementById('focus-forecast-strip').style.display = 'none';
  document.getElementById('focus-weather-auto-strip').style.display = 'none';
  fetchWeatherForToday();
};

// ── WEATHER TILES inside overlay ──────────────────────────
window.selectWeatherTile = function(el, weather) {
  document.querySelectorAll('.weather-tile').forEach(t => t.classList.remove('selected'));
  el.classList.add('selected');
  selectedWeather = weather;
};

// ════════════════════════════════════════════════════════════
// OPEN-METEO WEATHER AUTO-FETCH
// ════════════════════════════════════════════════════════════
const DEFAULT_LAT = 52.48;
const DEFAULT_LON = -1.89;

async function fetchWeatherForToday() {
  const setStatus = (msg) => {
    const el = document.getElementById('focus-weather-status');
    if (el) el.textContent = msg;
  };

  try {
    const { lat, lon } = await getLocation();
    const url = `https://api.open-meteo.com/v1/forecast?` +
      `latitude=${lat}&longitude=${lon}` +
      `&current=temperature_2m,apparent_temperature,precipitation,weather_code,wind_speed_10m,relative_humidity_2m` +
      `&daily=temperature_2m_max,temperature_2m_min,precipitation_sum,sunrise,sunset,weather_code` +
      `&timezone=Europe%2FLondon&forecast_days=7`;

    const res  = await fetch(url);
    const data = await res.json();
    const c    = data.current;
    const d    = data.daily;

    weatherData = {
      tempC: Math.round(c.temperature_2m), feelsLike: Math.round(c.apparent_temperature),
      humidity: c.relative_humidity_2m,    wind: Math.round(c.wind_speed_10m),
      precipitation: c.precipitation,      weatherCode: c.weather_code,
      maxTemp: Math.round(d.temperature_2m_max[0]), minTemp: Math.round(d.temperature_2m_min[0]),
      rainTotal: d.precipitation_sum[0],
      sunrise: d.sunrise[0]?.split('T')[1] || '',
      sunset:  d.sunset[0]?.split('T')[1] || '',
      lat, lon
    };
    const auto = wmoCategoryAndEmoji(c.weather_code);
    Object.assign(weatherData, { category: auto.category, emoji: auto.emoji, description: auto.description });

    // Build 7-day forecast array
    const dayNames = ['sun','mon','tue','wed','thu','fri','sat'];
    forecastDays = d.time.map((dateStr, i) => {
      const dow = new Date(dateStr + 'T12:00:00').getDay();
      const wmo = wmoCategoryAndEmoji(d.weather_code[i]);
      return {
        dateStr,
        dayName:  i === 0 ? 'today' : dayNames[dow],
        emoji:    wmo.emoji,
        maxTemp:  Math.round(d.temperature_2m_max[i]),
        minTemp:  Math.round(d.temperature_2m_min[i]),
        rainMm:   d.precipitation_sum[i] || 0,
        isToday:  i === 0
      };
    });

    // Auto-select weather
    if (!selectedWeather) selectedWeather = auto.category;
    // Pre-fill weather notes if empty
    if (!formState.weatherNotes) formState.weatherNotes = buildWeatherNotes(weatherData);

    // If weather overlay is open, update it live
    const autoStrip = document.getElementById('focus-weather-auto-strip');
    if (autoStrip) {
      autoStrip.style.display = 'flex';
      autoStrip.innerHTML = `
        <div class="weather-auto-icon">${auto.emoji}</div>
        <div>
          <div class="weather-auto-main">${auto.description} · ${weatherData.tempC}°C (feels ${weatherData.feelsLike}°C)</div>
          <div class="weather-auto-sub">↑${weatherData.maxTemp}° ↓${weatherData.minTemp}° · 💧${weatherData.humidity}% · 🌬${weatherData.wind}km/h · 🌅${weatherData.sunrise} 🌇${weatherData.sunset}${weatherData.rainTotal > 0 ? ` · 🌧${weatherData.rainTotal}mm` : ''}</div>
        </div>
        <div style="font-size:0.58rem;color:var(--text-soft);opacity:0.7;align-self:flex-start;margin-left:auto">Open-Meteo</div>`;
      // Refresh tile selects
      document.querySelectorAll('.weather-tile').forEach(t => t.classList.remove('selected'));
      const match = document.querySelector(`.weather-tile.${auto.category === 'sunny' ? 'sky' : auto.category === 'cloudy' ? 'cloud' : auto.category === 'rainy' ? 'rain' : 'cold'}`);
      if (match) match.classList.add('selected');
      // Refresh notes textarea
      const notesTA = document.getElementById('focus-ta-weatherNotes');
      if (notesTA && !notesTA.value) notesTA.value = formState.weatherNotes;
      setStatus('');
      // Render forecast strip
      renderForecastStrip();
    }
    // Update tile preview
    updateTilePreview('weather', `${auto.emoji} ${auto.description} · ${weatherData.tempC}°C`);

  } catch (err) {
    console.warn('Weather fetch failed:', err);
  }
}

function renderForecastStrip() {
  const el = document.getElementById('focus-forecast-strip');
  if (!el || !forecastDays.length) return;
  const nextRain = forecastDays.slice(1).find(d => d.rainMm > 0.1);
  el.style.display = 'block';
  el.innerHTML = `
    <div class="forecast-header">
      <span class="forecast-label">7-day forecast</span>
      <span class="forecast-rain-note">${nextRain ? `🌧 next rain: ${nextRain.dayName}` : '☀️ no rain forecast'}</span>
    </div>
    <div class="forecast-days">
      ${forecastDays.map(d => `
        <div class="forecast-day${d.isToday ? ' today' : ''}">
          <div class="forecast-day-name">${d.dayName}</div>
          <div class="forecast-day-emoji">${d.emoji}</div>
          <div class="forecast-day-max">${d.maxTemp}°</div>
          <div class="forecast-day-min">${d.minTemp}°</div>
        </div>`).join('')}
    </div>`;
}

function getLocation() {
  if (userLocation) return Promise.resolve({ lat: userLocation.lat, lon: userLocation.lon });
  return new Promise(resolve => {
    if (!navigator.geolocation) return resolve({ lat: DEFAULT_LAT, lon: DEFAULT_LON });
    navigator.geolocation.getCurrentPosition(
      p => resolve({ lat: p.coords.latitude, lon: p.coords.longitude }),
      ()  => resolve({ lat: DEFAULT_LAT, lon: DEFAULT_LON }),
      { timeout: 5000 }
    );
  });
}

function wmoCategoryAndEmoji(code) {
  if (code === 0)                  return { category:'sunny',  emoji:'☀️', description:'Clear sky' };
  if ([1,2].includes(code))        return { category:'sunny',  emoji:'🌤', description:'Mainly clear' };
  if (code === 3)                  return { category:'cloudy', emoji:'☁️', description:'Overcast' };
  if ([45,48].includes(code))      return { category:'cloudy', emoji:'🌫', description:'Fog' };
  if ([51,53,55].includes(code))   return { category:'rainy',  emoji:'🌦', description:'Drizzle' };
  if ([61,63,65].includes(code))   return { category:'rainy',  emoji:'🌧', description:'Rain' };
  if ([71,73,75].includes(code))   return { category:'cold',   emoji:'❄️', description:'Snow' };
  if ([77].includes(code))         return { category:'cold',   emoji:'🌨', description:'Snow grains' };
  if ([80,81,82].includes(code))   return { category:'rainy',  emoji:'🌧', description:'Rain showers' };
  if ([85,86].includes(code))      return { category:'cold',   emoji:'🌨', description:'Snow showers' };
  if ([95,96,99].includes(code))   return { category:'rainy',  emoji:'⛈', description:'Thunderstorm' };
  return                             { category:'cloudy', emoji:'🌥', description:'Mixed' };
}

function buildWeatherNotes(w) {
  const parts = [`${w.description}, ${w.tempC}°C (feels ${w.feelsLike}°C)`];
  if (w.rainTotal > 0)  parts.push(`${w.rainTotal}mm rain`);
  if (w.wind > 20)      parts.push(`Windy: ${w.wind} km/h`);
  if (w.humidity > 80)  parts.push(`High humidity: ${w.humidity}%`);
  return parts.join('. ') + '.';
}

// ════════════════════════════════════════════════════════════
// PHOTOS
// ════════════════════════════════════════════════════════════
// Photo input inside focus overlay is created dynamically — use event delegation
document.getElementById('focus-field-area').addEventListener('change', e => {
  if (e.target.id === 'focus-photo-input') {
    handlePhotoFiles(Array.from(e.target.files));
    e.target.value = '';
  }
});

function handlePhotoFiles(files) {
  files.forEach(file => compressImage(file, 800, 0.78, b64 => {
    currentPhotos.push(b64);
    renderFocusPhotoPreviews();
    updateTilePreview('photos', `${currentPhotos.length} photo${currentPhotos.length === 1 ? '' : 's'}`);
  }));
}

function compressImage(file, maxPx, quality, cb) {
  const reader = new FileReader();
  reader.onload = e => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.getElementById('compress-canvas');
      let w = img.width, h = img.height;
      if (w > h && w > maxPx) { h = h * maxPx / w; w = maxPx; }
      else if (h > maxPx)     { w = w * maxPx / h; h = maxPx; }
      canvas.width = w; canvas.height = h;
      canvas.getContext('2d').drawImage(img, 0, 0, w, h);
      cb(canvas.toDataURL('image/jpeg', quality));
    };
    img.src = e.target.result;
  };
  reader.readAsDataURL(file);
}

function renderFocusPhotoPreviews() {
  const container = document.getElementById('focus-photo-previews');
  if (!container) return;
  container.innerHTML = currentPhotos.map((src, i) => `
    <div class="photo-preview-wrap">
      <img class="photo-preview-img" src="${src}" loading="lazy">
      <button class="photo-remove" onclick="removePhoto(${i})">✕</button>
    </div>`).join('');
}

window.removePhoto = function(i) {
  currentPhotos.splice(i, 1);
  renderFocusPhotoPreviews();
  updateTilePreview('photos', currentPhotos.length ? `${currentPhotos.length} photo${currentPhotos.length === 1 ? '' : 's'}` : '');
};

// ════════════════════════════════════════════════════════════
// SAVE ENTRY
// ════════════════════════════════════════════════════════════
document.getElementById('btn-save-entry').addEventListener('click', saveEntry);

function buildEntryObject() {
  const existingEntry = entries.find(e => e.id === editingEntryId);
  return {
    id:           editingEntryId,
    date:         document.getElementById('entry-date').value,
    weather:      selectedWeather,
    weatherAuto:  weatherData || null,
    weatherNotes: formState.weatherNotes,
    sowed:        formState.sowed,
    transplanted: formState.transplanted,
    harvested:    formState.harvested,
    maintenance:  formState.maintenance,
    health:       formState.health,
    pests:        formState.pests,
    thriving:     formState.thriving,
    problems:     formState.problems,
    wins:         formState.wins,
    notes:        formState.notes,
    photos:       [...currentPhotos],
    createdAt:    existingEntry?.createdAt || draftCreatedAt || new Date().toISOString()
  };
}

async function autoSaveDraft() {
  if (!currentUser || !editingEntryId) return;
  const hasContent = selectedWeather || currentPhotos.length > 0 ||
    Object.values(formState).some(v => v.trim());
  if (!hasContent) return;
  try {
    await saveEntryToFirestore(buildEntryObject());
  } catch (e) {
    console.warn('Auto-save failed:', e);
  }
}

async function saveEntry() {
  const btn = document.getElementById('btn-save-entry');
  btn.disabled = true;
  btn.textContent = '⏳ saving…';

  try {
    await saveEntryToFirestore(buildEntryObject());
    showToast(isNewEntry ? '✅ entry saved!' : '✏️ entry updated');
    showView('feed');
    switchNavTo('feed');
  } catch (e) {
    showToast('⚠️ save failed — check connection');
    console.error(e);
  }

  btn.disabled = false;
  btn.textContent = 'save entry';
}

// ════════════════════════════════════════════════════════════
// DETAIL VIEW
// ════════════════════════════════════════════════════════════
window.openDetail = function(id) {
  const e = entries.find(x => x.id === id);
  if (!e) return;
  const d       = new Date(e.date + 'T12:00:00');
  const dateStr = d.toLocaleDateString('en-GB', { weekday:'long', day:'numeric', month:'long', year:'numeric' });

  const row = (icon, label, content) => content ? `
    <div class="detail-section">
      <div class="detail-section-label">${icon} ${label}</div>
      <div class="detail-section-content">${escHtml(content)}</div>
    </div>` : '';

  const weatherHTML = (e.weatherAuto || e.weather) ? `
    <div class="detail-weather-strip">
      <span style="font-size:1.8rem">${e.weatherAuto?.emoji || weatherEmoji(e.weather || '')}</span>
      <div>
        <div style="font-size:0.9rem;font-weight:700;color:var(--text)">${e.weatherAuto?.description || e.weather || ''}${e.weatherAuto ? ` · ${e.weatherAuto.tempC}°C (feels ${e.weatherAuto.feelsLike}°C)` : ''}</div>
        ${e.weatherAuto ? `<div style="font-size:0.7rem;color:var(--text-soft);margin-top:0.2rem;font-weight:500">↑${e.weatherAuto.maxTemp}° ↓${e.weatherAuto.minTemp}° · 💧${e.weatherAuto.humidity}% · 🌬${e.weatherAuto.wind}km/h · 🌅${e.weatherAuto.sunrise} 🌇${e.weatherAuto.sunset}${e.weatherAuto.rainTotal > 0 ? ` · 🌧${e.weatherAuto.rainTotal}mm` : ''}</div>` : ''}
        ${e.weatherNotes ? `<div style="font-size:0.82rem;color:var(--text-mid);margin-top:0.35rem;font-weight:500">${escHtml(e.weatherNotes)}</div>` : ''}
      </div>
    </div>` : '';

  const photosHTML = e.photos?.length ? `
    <div class="detail-section">
      <div class="detail-section-label">📷 photos (${e.photos.length})</div>
      <div class="detail-photos">${e.photos.map((src, i) => `<img class="detail-photo-thumb" src="${src}" loading="lazy" onclick="zoomPhoto('${e.id}',${i})">`).join('')}</div>
    </div>` : '';

  document.getElementById('detail-content').innerHTML = `
    <div class="detail-header">
      <button class="btn-back" onclick="showView('feed')">←</button>
      <div class="detail-date">${dateStr}</div>
      <button class="btn-delete" onclick="deleteEntry('${id}')">delete</button>
    </div>
    ${weatherHTML}
    ${row('🌰','sowed / started',    e.sowed)}
    ${row('🌿','transplanted',        e.transplanted)}
    ${row('🥬','harvested',           e.harvested)}
    ${row('🔧','maintenance',         e.maintenance)}
    ${row('💚','plant health',        e.health)}
    ${row('🐛','pests spotted',       e.pests)}
    ${row('📊','thriving / struggling', e.thriving)}
    ${row('⚠️','problems',            e.problems)}
    ${row('🏆','wins',                e.wins)}
    ${row('📝','notes',               e.notes)}
    ${photosHTML}
    <button class="btn-edit" onclick="editEntry('${id}')">✏️ edit entry</button>
  `;
  showView('detail');
};

window.zoomPhoto = function(entryId, i) {
  const e = entries.find(x => x.id === entryId);
  if (!e?.photos?.[i]) return;
  document.getElementById('photo-zoom-img').src = e.photos[i];
  document.getElementById('photo-zoom').style.display = 'flex';
};

window.editEntry = function(id) {
  const e = entries.find(x => x.id === id);
  if (!e) return;
  editingEntryId = id;

  // Populate formState from entry
  Object.assign(formState, {
    weatherNotes: e.weatherNotes || '', sowed: e.sowed || '',
    transplanted: e.transplanted || '', harvested: e.harvested || '',
    maintenance: e.maintenance || '',   health: e.health || '',
    pests: e.pests || '',               thriving: e.thriving || '',
    problems: e.problems || '',         wins: e.wins || '',
    notes: e.notes || ''
  });
  selectedWeather = e.weather || null;
  weatherData     = e.weatherAuto || null;
  currentPhotos   = e.photos ? [...e.photos] : [];

  isNewEntry = false;
  document.getElementById('form-mode-label').textContent    = 'edit entry';
  document.getElementById('entry-date').value = e.date;
  setEntryDateDisplay(new Date(e.date + 'T12:00:00'));

  renderAllTilePreviews();
  showView('new');
};

window.deleteEntry = async function(id) {
  if (!confirm('Delete this entry? This cannot be undone.')) return;
  try {
    await deleteEntryFromFirestore(id);
    showToast('🗑 entry deleted');
    showView('feed');
  } catch (err) {
    showToast('⚠️ delete failed');
    console.error(err);
  }
};

window.showView = showView;

// ════════════════════════════════════════════════════════════
// STATS
// ════════════════════════════════════════════════════════════
function renderStats() {
  const total    = entries.length;
  const wins     = entries.filter(e => e.wins).length;
  const problems = entries.filter(e => e.problems).length;
  const photos   = entries.reduce((n, e) => n + (e.photos?.length || 0), 0);

  const today  = new Date(); today.setHours(0,0,0,0);
  const dayMs  = 86400000;
  const dateset = new Set(entries.map(e => new Date(e.date + 'T12:00:00').toDateString()));
  let streak = 0;
  for (let i = 0; i < 365; i++) {
    if (dateset.has(new Date(today - i * dayMs).toDateString())) streak++;
    else if (i > 0) break;
  }

  const recent = [...entries].slice(0, 8).map(e => {
    const d  = new Date(e.date + 'T12:00:00');
    const ds = d.toLocaleDateString('en-GB', { day:'numeric', month:'short' });
    const snippet = [e.sowed, e.harvested, e.wins, e.health].filter(Boolean)[0] || 'visit recorded';
    return `<div class="timeline-item" onclick="openDetail('${e.id}')">
      <div class="timeline-dot"></div>
      <div class="timeline-content">
        <div class="timeline-date">${ds}${e.weather ? ' ' + weatherEmoji(e.weather) : ''}</div>
        <div class="timeline-snippet">${escHtml(snippet.substring(0, 80))}</div>
      </div>
    </div>`;
  }).join('');

  document.getElementById('stats-content').innerHTML = `
    <div class="feed-title" style="margin-bottom:1.1rem">your stats</div>
    <div class="stats-grid">
      <div class="stat-card"><div class="stat-num">${total}</div><div class="stat-label">entries</div></div>
      <div class="stat-card"><div class="stat-num">${wins}</div><div class="stat-label">wins</div></div>
      <div class="stat-card"><div class="stat-num">${photos}</div><div class="stat-label">photos</div></div>
      <div class="stat-card"><div class="stat-num">${problems}</div><div class="stat-label">issues</div></div>
    </div>
    <div class="streak-banner">
      <span class="streak-icon">${streak > 1 ? '🔥' : '🌱'}</span>
      <div class="streak-text">
        <h3>${streak > 1 ? `${streak}-day streak!` : streak === 1 ? 'active today!' : 'start your streak'}</h3>
        <p>${streak > 1 ? 'keep logging your garden visits' : 'log an entry to begin'}</p>
      </div>
    </div>
    ${total > 0 ? `<div class="timeline-label">recent timeline</div>${recent}` : ''}
  `;
}

// ════════════════════════════════════════════════════════════
// SEARCH
// ════════════════════════════════════════════════════════════
document.getElementById('search-input').addEventListener('input', e => renderSearch(e.target.value));

document.querySelectorAll('.filter-pill').forEach(pill => {
  pill.addEventListener('click', () => {
    document.querySelectorAll('.filter-pill').forEach(p => p.classList.remove('active'));
    pill.classList.add('active');
    currentFilter = pill.dataset.filter;
    renderSearch(document.getElementById('search-input').value);
  });
});

function renderSearch(q) {
  let pool = [...entries];
  if (currentFilter === 'wins')     pool = pool.filter(e => e.wins);
  if (currentFilter === 'problems') pool = pool.filter(e => e.problems);
  if (currentFilter === 'harvests') pool = pool.filter(e => e.harvested);
  if (currentFilter === 'photos')   pool = pool.filter(e => e.photos?.length > 0);
  if (q.trim()) {
    const lq = q.toLowerCase();
    pool = pool.filter(e => Object.values(e).some(v => typeof v === 'string' && v.toLowerCase().includes(lq)));
  }
  const res = document.getElementById('search-results');
  res.innerHTML = pool.length === 0
    ? `<div class="empty-state"><span class="big-icon">🔍</span><p>No entries match.</p></div>`
    : pool.map(e => entryCardHTML(e)).join('');
}

// ════════════════════════════════════════════════════════════
// HELPERS
// ════════════════════════════════════════════════════════════
let toastTimer;
function showToast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 2800);
}

function escHtml(str) {
  return String(str)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;')
    .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function escAttr(str) {
  return String(str).replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

// ════════════════════════════════════════════════════════════
// SERVICE WORKER
// ════════════════════════════════════════════════════════════
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js')
      .then(r => {
        console.log('SW registered:', r.scope);
        // When a new SW takes control, reload to get the latest version
        navigator.serviceWorker.addEventListener('controllerchange', () => {
          window.location.reload();
        });
      })
      .catch(e => console.log('SW failed:', e));
  });
}
