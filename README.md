# 🌿 Plot Journal

**A 5-minute garden diary for your phone · Firebase sync · Google Sign-In · Auto weather · GitHub Pages**

---

## What it does

Plot Journal is a Progressive Web App (PWA) for logging garden visits.
Open it after every visit, fill in what you did, and build up a season-long record
of what worked, what didn't, and what to do differently next year.

Each entry covers:
- 🌤 **Weather** — auto-fetched from Open-Meteo (no API key needed)
- 🌱 **Actions** — what you sowed, transplanted, harvested, and maintained
- 🔍 **Observations** — plant health, pests, what's thriving or struggling
- ⚠️ **Problems** — disease, poor germination, anything going wrong
- 🏆 **Wins** — first harvests, good germination, anything worth celebrating
- 📷 **Photos** — compressed and synced to your account
- 📝 **Notes** — anything else worth remembering

### How the entry form works
The form is a **tile grid** — six tiles on one screen, one per section.
Tap any tile to open a focused full-screen input card for just that section.
No scrolling through a long form. Tap **done ✓** to return to the grid, then **save entry**.

---

## Tech stack

| Layer | Technology |
|-------|-----------|
| Hosting | GitHub Pages (free, auto-deploys on push) |
| Auth | Firebase Auth (Google Sign-In + email/password) |
| Database | Cloud Firestore (real-time cross-device sync) |
| Weather | Open-Meteo API (no key, free, UK data) |
| PWA | Service Worker + manifest.json (installable, offline shell) |
| Frontend | Vanilla JS · HTML · CSS (no build step) |

---

## File structure

```
plot-journal/
├── public/                      ← Served directly by GitHub Pages
│   ├── index.html               ← App shell, all views, focus overlay
│   ├── style.css                ← Full stylesheet
│   ├── app.js                   ← All app logic (ES module)
│   ├── sw.js                    ← Service worker
│   ├── manifest.json            ← PWA manifest
│   └── icons/
│       ├── icon-192.png         ← App icon (replace with your own)
│       └── icon-512.png
├── firestore.rules              ← Firestore security rules
├── .github/workflows/
│   └── deploy.yml               ← Auto-deploy to GitHub Pages
├── CLAUDE.md                    ← Instructions for Claude Code
└── README.md                    ← This file
```

---

## ⚙️ Setup guide

### Step 1 — Create a Firebase project

1. Go to [console.firebase.google.com](https://console.firebase.google.com)
2. Click **Add project** → name it `plot-journal` → disable Analytics → **Create**

### Step 2 — Enable Authentication

1. Firebase Console → **Authentication** → **Get started**
2. **Sign-in method** tab → enable:
   - **Email/Password** → toggle on → Save
   - **Google** → toggle on → add your email as support contact → Save

### Step 3 — Enable Firestore

1. Firebase Console → **Firestore Database** → **Create database**
2. Choose **Start in production mode**
3. Region: `europe-west2` (London) for best UK latency → **Enable**

### Step 4 — Deploy Firestore security rules

The rules are already written in `firestore.rules`.

**Option A — Firebase CLI:**
```bash
npm install -g firebase-tools
firebase login
firebase init firestore    # select your project, accept defaults
firebase deploy --only firestore:rules
```

**Option B — Firebase Console:**
Copy the contents of `firestore.rules` into:
Firebase Console → Firestore Database → **Rules** tab → paste → **Publish**

### Step 5 — Get your Firebase config

1. Firebase Console → gear icon → **Project settings** → **Your apps**
2. Click **</>** (Web) → name it `plot-journal-web` → **Register app**
3. Copy the `firebaseConfig` object shown
4. Open `public/app.js` and replace the placeholder values (~lines 22–30):

```javascript
const firebaseConfig = {
  apiKey:            "AIzaSy...",
  authDomain:        "your-project.firebaseapp.com",
  projectId:         "your-project-id",
  storageBucket:     "your-project.appspot.com",
  messagingSenderId: "123456789",
  appId:             "1:123:web:abc123"
};
```

> The Firebase API key is safe to be in client-side code — Firebase restricts it
> by authorised domain, not by keeping it secret.

### Step 6 — Add authorised domains for Google Sign-In

1. Firebase Console → Authentication → **Settings** → **Authorised domains**
2. Add: `YOUR-USERNAME.github.io`
3. Also add `localhost` for local development

### Step 7 — Create app icons

You need two PNG icons at `public/icons/icon-192.png` and `public/icons/icon-512.png`.

Quickest approach: [favicon.io/emoji-favicons](https://favicon.io/emoji-favicons/) →
search for 🌿 → download → rename and place in `public/icons/`.

### Step 8 — Create GitHub repo and deploy

```bash
# In the plot-journal/ folder:
git init
git add .
git commit -m "Initial commit — Plot Journal PWA"
git branch -M main
git remote add origin https://github.com/YOUR-USERNAME/plot-journal.git
git push -u origin main
```

Then in GitHub → repo → **Settings** → **Pages** → Source: **GitHub Actions**

Your app will be live at `https://YOUR-USERNAME.github.io/plot-journal/`
within a minute or two. Check the **Actions** tab to watch the deploy.

Every push to `main` deploys automatically.

---

## 🌤 Weather — Open-Meteo

Weather is auto-fetched every time you open a new entry. No API key. No account. Free forever.

**What happens:**
1. The app requests your browser location (one-time prompt, 5s timeout)
2. If you allow it, your actual coordinates are used
3. If you deny it, it defaults to central UK (Birmingham, 52.48°N, 1.89°W)
4. Current conditions fetched: temperature, feels-like, humidity, wind, precipitation, weather code, sunrise/sunset, daily max/min
5. The WMO weather code is mapped to: sunny / cloudy / rainy / cold
6. The matching weather tile is auto-selected and notes are pre-filled

**To set a custom default location**, edit `app.js`:
```javascript
const DEFAULT_LAT = 52.48;   // your garden's latitude
const DEFAULT_LON = -1.89;   // your garden's longitude
```

UK reference points: London `51.51, -0.12` · Manchester `53.48, -2.24` · Edinburgh `55.95, -3.19`

---

## 📱 Installing as a PWA

**iPhone / iPad (Safari):** Share icon → Add to Home Screen → Add

**Android (Chrome):** Menu (⋮) → Install app

**Desktop:** Install icon in the address bar, or browser menu → Install Plot Journal

---

## 🗄️ Data structure

Each entry at `/users/{uid}/entries/{entryId}`:

```
id, date (YYYY-MM-DD), weather (sunny|cloudy|rainy|cold),
weatherAuto { tempC, feelsLike, humidity, wind, precipitation, weatherCode,
              maxTemp, minTemp, rainTotal, sunrise, sunset,
              emoji, description, category, lat, lon },
weatherNotes, sowed, transplanted, harvested, maintenance,
health, pests, thriving, problems, wins, notes,
photos (base64 JPEG array, max 800px), createdAt, updatedAt
```

---

## 💰 Cost estimate

| Service | Free tier | Expected usage |
|---------|-----------|----------------|
| Firebase Auth | 10K sign-ins/month | ~30/month ✅ |
| Firestore reads | 50K/day | ~500/day ✅ |
| Firestore writes | 20K/day | ~10/day ✅ |
| Firestore storage | 1 GB | ~200 MB/year ✅ |
| GitHub Pages | Unlimited | Free ✅ |
| Open-Meteo | Unlimited | Free ✅ |

**Expected monthly cost: £0**

---

## Local development

```bash
cd public && python3 -m http.server 8080
# then open http://localhost:8080
```

Add `localhost` to Firebase's authorised domains for Google Sign-In to work locally.

---

## 🔐 Security

- Firestore rules enforce strict per-user data isolation
- No user can read or write another user's entries
- Firebase handles all auth — no passwords in app code
- The Firebase API key in `app.js` is restricted by authorised domain in Firebase Console

---

*Built for a no-dig raised bed garden · 4 beds · 2.4m × 1.2m · clay soil · UK*
