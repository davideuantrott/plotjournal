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

## Tech Stack

| Layer | Technology | Notes |
|-------|-----------|-------|
| Hosting | GitHub Pages | Auto-deploys `public/` via `.github/workflows/deploy.yml` |
| Auth | Firebase Auth | Google Sign-In + email/password |
| Database | Cloud Firestore | Real-time sync, per-user subcollection |
| Weather | Open-Meteo API | No API key needed — free forever |
| Frontend | Vanilla JS (ES modules) | No build step, no bundler, no framework |
| PWA | Service Worker + manifest.json | Installable, offline shell |

**Important**: There is no build step. The files in `public/` are served directly.
Do not introduce npm, webpack, TypeScript, or any framework without being asked.

---

## File Structure

```
plot-journal/
├── public/                 ← Served directly by GitHub Pages
│   ├── index.html          ← App shell + all HTML views + focus overlay
│   ├── style.css           ← Full stylesheet (warm organic aesthetic)
│   ├── app.js              ← All app logic (ES module, Firebase imports from CDN)
│   ├── sw.js               ← Service worker
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

## Key App.js Patterns

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

### Focus overlay
- Opened by `openFocusOverlay(sectionKey)`
- HTML for each section is built dynamically by `buildFocusFieldHTML(cfg)`
- Closed by `closeFocusOverlay(save)` — pass `true` to save, `false`/empty to discard
- The overlay slides up from the bottom over a blurred darker backdrop

---

## Weather Integration (Open-Meteo)

**Status: Fully wired in. No API key required.**

`fetchWeatherForToday()` is called automatically when a new entry is opened.

Flow:
1. Requests browser geolocation (5s timeout)
2. Falls back to `DEFAULT_LAT = 52.48, DEFAULT_LON = -1.89` (Birmingham, central UK)
3. Calls `https://api.open-meteo.com/v1/forecast` with current + daily params
4. Maps WMO weather code → `sunny / cloudy / rainy / cold` category via `wmoCategoryAndEmoji()`
5. Pre-fills `formState.weatherNotes` with a natural-language summary
6. Auto-selects the matching weather tile
7. If the weather overlay is open when data arrives, updates it live

To change the default location, edit `app.js`:
```javascript
const DEFAULT_LAT = 52.48;  // your latitude
const DEFAULT_LON = -1.89;  // your longitude
```

Common UK defaults: London `51.51, -0.12` · Manchester `53.48, -2.24` · Edinburgh `55.95, -3.19`

---

## Firebase Configuration

The `firebaseConfig` object in `app.js` lines ~22–30 contains placeholder values.
**The user must replace these with their own Firebase project values before deploying.**

```javascript
const firebaseConfig = {
  apiKey:            "REPLACE_WITH_YOUR_API_KEY",
  authDomain:        "REPLACE_WITH_YOUR_AUTH_DOMAIN",
  projectId:         "REPLACE_WITH_YOUR_PROJECT_ID",
  storageBucket:     "REPLACE_WITH_YOUR_STORAGE_BUCKET",
  messagingSenderId: "REPLACE_WITH_YOUR_MESSAGING_SENDER_ID",
  appId:             "REPLACE_WITH_YOUR_APP_ID"
};
```

**Never commit real Firebase credentials.** The README.md explains how to set these up.

---

## Firestore Data Schema

Each entry at `/users/{uid}/entries/{entryId}`:

```
id, date (YYYY-MM-DD), weather (sunny|cloudy|rainy|cold),
weatherAuto { tempC, feelsLike, humidity, wind, precipitation, weatherCode,
              maxTemp, minTemp, rainTotal, sunrise, sunset, emoji, description, category, lat, lon },
weatherNotes, sowed, transplanted, harvested, maintenance,
health, pests, thriving, problems, wins, notes,
photos (base64 JPEG array), createdAt (ISO string), updatedAt (Firestore serverTimestamp)
```

Security rules in `firestore.rules` ensure strict per-user isolation.

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
- Do not store real API keys or Firebase credentials in any file
- Do not break the focus overlay slide-up animation (transition in `.focus-card`)
- Do not add `localStorage` — state is in-memory (`formState`, `currentPhotos`, etc.)
  and persisted to Firestore
- Do not use `innerHTML` for user content without `escHtml()` sanitisation

---

## Common Tasks

### Run locally
```bash
cd public && python3 -m http.server 8080
# then open http://localhost:8080
# (add localhost to Firebase authorised domains for Google sign-in)
```

### Deploy
```bash
git add . && git commit -m "your message" && git push origin main
# GitHub Actions deploys automatically — check Actions tab for progress
```

### Test weather without a real entry
Open the browser console and run:
```javascript
fetchWeatherForToday()
```
(The function is module-scoped, so attach it to `window` temporarily if needed.)

### Add a new tile section
See "Adding a new section" under Key App.js Patterns above.
