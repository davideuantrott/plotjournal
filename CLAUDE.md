# CLAUDE.md — Plot Journal PWA

This file gives Claude Code context and working instructions for this project.
Read it fully before making any changes.

---

## What This Project Is

A Progressive Web App (PWA) garden diary for logging visits to a no-dig raised bed garden.
The owner (David) has four beds, each 2.4m × 1.2m, on heavy clay soil in the UK.
The app is built around a **5-minute post-visit logging habit**, so every UI decision should
prioritise speed and ease of use on mobile, especially outdoors.

### Core user journey
1. User opens app immediately after a garden visit
2. Taps **new entry** on the feed
3. Taps each tile (weather / actions / observations / problems / wins / photos / notes)
4. Each tile opens a focused full-screen card overlay — one section at a time
5. Taps **done ✓** to return to the tile grid
6. Taps **save entry** — entry syncs to Firestore in real time

---

## Deployment

- **Live URL**: `https://davideuantrott.github.io/plotjournal/`
- **GitHub repo**: `https://github.com/davideuantrott/plotjournal`
- Auto-deploys on every push to `main` via `.github/workflows/deploy.yml`
- Firebase project: `plot-journal` (Firestore region: `europe-west2`)
- Firebase config is live in `public/app.js` lines ~26–33 (real values, not placeholders)

---

## Tech Stack

| Layer | Technology | Notes |
|-------|-----------|-------|
| Hosting | GitHub Pages | Auto-deploys `public/` via `.github/workflows/deploy.yml` |
| Auth | Firebase Auth | Google Sign-In (primary) + email/password |
| Database | Cloud Firestore | Real-time sync, per-user subcollection |
| Weather | Open-Meteo API | No API key needed — free forever |
| Frontend | Vanilla JS (ES modules) | No build step, no bundler, no framework |
| PWA | Service Worker + manifest.json | Installable, offline shell |

**Important**: There is no build step. The files in `public/` are served directly.
Do not introduce npm, webpack, TypeScript, or any framework without being asked.

### Auth notes
- Google Sign-In is the primary working method
- Email/password sign-in works for existing accounts; **registration** (createUserWithEmailAndPassword)
  fails on new Firebase projects due to reCAPTCHA Enterprise being enabled by default
- New users should be added via Firebase Console → Authentication → Users, or use Google Sign-In
- Firebase web API keys are safe to commit — they are not secrets; access is restricted by authorised domain

---

## File Structure

```
plot-journal/
├── public/                 ← Served directly by GitHub Pages
│   ├── index.html          ← App shell + all HTML views + focus overlay
│   ├── style.css           ← Full stylesheet (warm organic aesthetic)
│   ├── app.js              ← All app logic (ES module, Firebase imports from CDN)
│   ├── sw.js               ← Service worker (cache name: plot-journal-v3)
│   ├── manifest.json       ← PWA manifest
│   └── icons/
│       ├── icon-192.png
│       └── icon-512.png
├── firestore.rules         ← Firestore security rules
├── .github/workflows/
│   └── deploy.yml          ← GitHub Pages deploy on push to main
├── README.md               ← Human-readable setup guide
└── CLAUDE.md               ← This file
```

---

## Design System

The app uses a warm organic aesthetic inspired by soft mobile app design.
**Do not change the colour palette, fonts, or border radii without being asked.**

### Colours (CSS variables in style.css)
```css
--bg:          #EDE5D8   /* page background — warm linen */
--surface:     #F9F4EE   /* card / screen surface — cream */
--surface-alt: #F3EBE0   /* inset areas, sub-field backgrounds */
--text:        #2C1A0E   /* primary text — deep warm brown */
--text-mid:    #6B4C35   /* secondary */
--text-soft:   #A07850   /* muted / hints */
--peach:       #E8957A   /* primary CTA — all buttons */
--peach-dark:  #D4714F   /* hover / pressed state */
--tile-sky:    #8ECFDF   /* weather tile */
--tile-mint:   #7ECAAC   /* actions tile, ✓ badge */
--tile-blush:  #F0AFAF   /* problems tile */
--tile-butter: #E8D98A   /* wins tile */
--tile-lav:    #C4B5E0   /* photos tile */
```

### Typography
- **Font**: Nunito (loaded from Google Fonts)
- **All headings and UI labels**: lowercase
- **Heading weight**: 800 (extrabold)
- **Body weight**: 500–600

### Border radius
- Tiles: `--r-lg` (22px)
- Buttons: `--r-pill` (9999px — full pill)
- Cards/sections: `--r-lg` (22px)
- Inputs: `--r-md` (16px)

---

## Responsive Layout

The app has three breakpoints:

| Viewport | Layout |
|----------|--------|
| < 480px (mobile portrait) | Sticky top header · fixed bottom nav · 2-col tile grid |
| 480–767px (landscape phone) | Same as mobile, centred at max-width 480px |
| ≥ 768px (tablet / desktop) | Left sidebar (220px) · 3-col tile grid · 4-col stats · centred modal overlay |

### Desktop sidebar structure (index.html)
```html
<aside class="app-sidebar-shell">
  <header class="app-header">   ← logo only on desktop; full bar on mobile
  <nav class="app-nav">         ← bottom bar on mobile; vertical in sidebar on desktop
  <div class="sidebar-footer">  ← desktop only: username, sync dot, sign out
</aside>
<main class="app-main">
```

- `.header-actions` is hidden on desktop (user info moves to `.sidebar-footer`)
- `.sidebar-footer` is hidden on mobile
- Nav buttons use class `nav-btn` + `data-view` — JS selects all matching buttons so
  both mobile and desktop nav stay in sync when switching views

### Focus overlay
- **Mobile**: slides up from bottom (`.focus-card` transform: translateY)
- **Desktop**: centred modal with scale+opacity fade-in transition
- Do not break either animation

---

## Key App.js Patterns

### Auto-save
A new entry ID (`editingEntryId`) is assigned the moment `openNewEntry()` is called.
Each time a tile overlay closes with `save=true`, `autoSaveDraft()` writes the current
state to Firestore — so partial entries survive navigation away.
The final "save entry" button just does a last write and navigates to the feed.

### Week number
`getWeekNumber(date)` returns the ISO week number. Displayed below the date on the
new entry form via `#entry-week-label` (e.g. "week 10").

### Form state
All entry field values live in the `formState` object, not in DOM elements:
```javascript
const formState = {
  weatherNotes: '', sowed: '', transplanted: '', harvested: '',
  maintenance: '', health: '', pests: '', thriving: '',
  problems: '', wins: '', notes: ''
};
```
When the focus overlay closes with `save=true`, `saveFocusState()` reads textareas
into `formState`. When `saveEntry()` runs, it reads from `formState`, not the DOM.

### Section tile config
Each tile is defined in the `SECTIONS` object:
```javascript
const SECTIONS = {
  weather: { icon, iconBg, name, hint, type: 'weather' },
  actions: { icon, iconBg, name, hint, type: 'multi', fields: [...] },
  problems: { icon, iconBg, name, hint, type: 'single', key: 'problems', placeholder: '...' },
  // etc.
}
```
Types: `'single'` (one textarea) · `'multi'` (multiple sub-textareas) · `'weather'` (tiles + notes) · `'photos'`

### Adding a new section
1. Add to `SECTIONS` in `app.js`
2. Add a tile `<div>` in `index.html` inside `.section-tile-grid`
3. Add tile colour class to `style.css`
4. Add field key to `formState` and to the entry object in `saveEntry()`
5. Add to `detail view` rendering in `openDetail()`

### Dual display elements (mobile + desktop)
Some UI values are shown in both the mobile header and desktop sidebar footer.
When updating these in JS, always update both:
- Username: `#header-username` (mobile) and `#sidebar-username` (desktop)
- Sync status: `#sync-indicator` (mobile) and `#sidebar-sync` (desktop) — handled by `setSyncStatus()`
- Logout: `#btn-logout` (mobile) and `#btn-sidebar-logout` (desktop)

---

## Weather Integration (Open-Meteo)

**Status: Fully wired in. No API key required.**

`fetchWeatherForToday()` is called on app load (`showAppScreen()`) and again when a new entry is opened.

Flow:
1. Checks `userLocation` (saved in Firestore `/users/{uid}/settings`) — uses it if set
2. Otherwise requests browser geolocation (5s timeout)
3. Falls back to `DEFAULT_LAT = 52.48, DEFAULT_LON = -1.89` (Birmingham, central UK)
4. Calls `https://api.open-meteo.com/v1/forecast` with current + 7-day daily params
5. Maps WMO weather code → `sunny / cloudy / rainy / cold` category via `wmoCategoryAndEmoji()`
6. Pre-fills `formState.weatherNotes` with a natural-language summary
7. Auto-selects the matching weather tile
8. Renders a 7-day forecast strip on the feed home screen (`renderFeedForecast()`)
9. Renders a 7-day forecast strip inside the weather overlay (`renderForecastStrip()`)
10. Shows "next rain" prediction in both forecast headers

### Manual location
Users can tap **change** in the weather overlay to search for a place by name.
Uses the Open-Meteo geocoding API (no key needed). Location is saved to Firestore
at `/users/{uid}/settings` and loaded on every sign-in.

**Foundation for future multi-location profiles:** the settings doc schema is
`{ location: { lat, lon, name } }` — easily extended to `{ locations: [...] }`.

To change the hard-coded fallback location, edit `app.js`:
```javascript
const DEFAULT_LAT = 52.48;  // your latitude
const DEFAULT_LON = -1.89;  // your longitude
```

Common UK defaults: London `51.51, -0.12` · Manchester `53.48, -2.24` · Edinburgh `55.95, -3.19`

---

## Firebase Configuration

Firebase config is live in `public/app.js` lines ~26–33.
The Firebase web API key is safe to be in client-side code — it is not a secret.
Access is restricted by authorised domain in Firebase Console.

Authorised domains configured:
- `davideuantrott.github.io`
- `localhost`

**Never replace the real config with placeholder values.**

---

## Firestore Data Schema

Each entry at `/users/{uid}/entries/{entryId}`:

```
id, date (YYYY-MM-DD), weather (sunny|cloudy|rainy|cold),
weatherAuto { tempC, feelsLike, humidity, wind, precipitation, weatherCode,
              maxTemp, minTemp, rainTotal, sunrise, sunset, emoji, description, category, lat, lon },
weatherNotes, sowed, transplanted, harvested, maintenance,
health, pests, thriving, problems, wins, notes,
photos (base64 JPEG array, max 5), createdAt (ISO string), updatedAt (Firestore serverTimestamp)
```

Security rules in `firestore.rules` ensure strict per-user isolation.

### Photo storage constraints
Photos are stored as base64 JPEG strings inside the Firestore entry document.
**Firestore has a hard 1 MB document limit.** To stay within it:
- Photos are compressed to max 600px and 0.65 JPEG quality (`compressImage`)
- Maximum 5 photos per entry (`MAX_PHOTOS` constant in `app.js`)
- `saveEntry()` measures the serialised entry before writing; if > 950 KB it strips photos
  and saves the rest, warning the user
- `autoSaveDraft()` skips the write entirely if the entry is > 950 KB
- If budget becomes a problem in future, migrate photos to Firebase Storage and store URLs

---

## Garden Context (for content / copy decisions)

- **4 raised beds**, each 2.4m × 1.2m
- **No-dig method** — 15cm compost layer over heavy clay
- **Beds are themed by crop family**:
  - Bed 1: Alliums & roots (leeks, onions, carrots, parsnips)
  - Bed 2: Brassicas (kale, cabbage, broccoli, Brussels sprouts)
  - Bed 3: Solanaceae & greens (tomatoes, peppers, lettuce, spinach)
  - Bed 4: Potatoes & perennials
- **Companion planting**: nasturtiums as trap crops for aphids, marigolds throughout
- **Family of four**: harvests should be meaningful quantities, not gluts
- **Succession planting**: carrots, lettuce, beetroot, radishes sown in intervals
- **Indoor seed starting**: kitchen windowsill propagators and deep root trainers

When writing any UI copy, placeholder text, or error messages, keep this context in mind.
Use gardening vocabulary naturally. Placeholder examples should reference realistic scenarios
(e.g. "e.g. Sowed Chantenay carrots Bed 1, row 3. Direct, ~30 seeds.").

---

## Things to Avoid

- Do not add a build step, bundler, or framework
- Do not change `--bg`, `--surface`, `--peach`, or font from Nunito without being asked
- Do not remove the botanical SVG leaf decorations
- Do not change lowercase UI convention (headings, buttons, labels are all lowercase)
- Do not replace the live Firebase config with placeholder values
- Do not break the focus overlay animation (slide-up on mobile, scale+fade on desktop)
- Do not add `localStorage` — state is in-memory (`formState`, `currentPhotos`, etc.)
  and persisted to Firestore
- Do not use `innerHTML` for user content without `escHtml()` sanitisation
- When bumping the service worker cache version (`CACHE_NAME` in `sw.js`), increment
  the number (currently `plot-journal-v4`) to force browsers to discard stale caches
- The SW calls `self.clients.claim()` + `skipWaiting()` on activate; the page
  listens for `controllerchange` to auto-reload — users get updates without reinstalling
- Toast uses `opacity` transition (not just `translateY`) to ensure reliable fade-out
- `.header-actions` must stay `display: flex` to prevent mobile header items wrapping
- Do not increase photo compression quality above 0.65 or max size above 600px — Firestore 1 MB limit
- Do not raise `MAX_PHOTOS` above 5 without also reducing compression further

---

## Common Tasks

### Run locally (Windows — use VSCode Live Server)
1. Install the **Live Server** extension in VSCode (by Ritwick Dey)
2. Right-click `public/index.html` in the Explorer panel → **Open with Live Server**
3. Opens at `http://127.0.0.1:5500/public/`

Note: `python -m http.server` is blocked by antivirus on this machine.

### Deploy
```bash
git add . && git commit -m "your message" && git push origin main
# GitHub Actions deploys automatically — check Actions tab for progress
```

### Force browsers to pick up new app.js (if service worker is caching stale files)
Bump the cache version in `sw.js`:
```javascript
const CACHE_NAME = 'plot-journal-v5';  // increment each time
```

### Test weather without a real entry
Open the browser console and run:
```javascript
fetchWeatherForToday()
```
(The function is module-scoped, so attach it to `window` temporarily if needed.)

### Add a new tile section
See "Adding a new section" under Key App.js Patterns above.
