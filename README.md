# Peakhour ◐

**Track focus time per project, rate every session, and find out when you actually work best.**

Peakhour is a minimalist time tracker for the iPhone, delivered as an installable web app (PWA). Pick a project, tap **Start**, tap **Stop**, rate the session with a smiley or slider, and optionally add a comment. Over weeks and months, Peakhour shows your cumulative hours per project and the patterns behind your best sessions: which weekdays and times of day, which session lengths, and when you never work.

Built first for one question: *when should I study for the CFA?*

## Features

- **One-tap timer**: the start time is stored immediately, so the timer survives closing the app or a phone restart
- **Pause / Resume**: pauses don't count toward your time; the session stays one session
- **Weekly goal per project** (e.g. 15 h CFA): progress on the timer screen including the needed hours per day, plus a history of the last 8 weeks in Insights
- **Session rating**: 5 smileys (Zäh → Flow) plus a slider for fine-tuning (0–100), optional comment
- **Edit and add sessions** if you forgot to press Stop
- **Insights**
  - Total hours per project, this week, streak, average rating
  - Top 3 time windows (weekday × time of day) by rating
  - Weekly rhythm heatmap (weekday × hour) by quality or time
  - Weekdays and times of day you never use
  - Ideal session length
- **Export** as JSON (for AI and scripts) or CSV (Excel/Numbers) via the iOS share sheet: Mail, AirDrop, Files …
- **Import** a JSON backup
- **Sync across iPhone, Mac and desktop (any browser)** via Supabase, signing in with an email code. Works offline and syncs when back online. Conflicts resolve as last write wins. The running timer syncs too: start on the Mac, stop on the iPhone.
- Offline-capable, dark mode. Without signing in, everything stays local on the device.

## Install on your iPhone

1. Open **https://fstuelzebach.github.io/peakhour/** in **Safari**
2. Share button → **Add to Home Screen**
3. Launch it from the home screen. It runs full-screen like a native app.

> Data lives in the app's local storage (IndexedDB). Apps added to the home screen are exempt from Safari's 7-day storage cleanup, but **export a JSON backup regularly** anyway (Projekte → Export als JSON).

## Sync setup (Supabase, one-time)

1. Create a free project at [supabase.com](https://supabase.com)
2. **SQL Editor** → paste [`supabase/schema.sql`](supabase/schema.sql) → **Run**
3. **Authentication → Emails → Magic Link** template: make sure the body contains the code, e.g. `Dein Peakhour-Code: {{ .Token }}`. A code works inside the home-screen app; a link would open plain Safari instead.
4. **Project Settings → API**: copy the *Project URL* and the *anon / publishable* key, then
   - for GitHub Pages: `gh variable set VITE_SUPABASE_URL` and `gh variable set VITE_SUPABASE_ANON_KEY`, then re-run the deploy
   - for local dev: copy `.env.example` to `.env.local` and fill it in
5. In the app: **Projekte → Sync** → email → enter the code. Do the same on every device.

The anon key is meant to be public; row level security ensures each user only sees their own rows. For analysis, the view `session_stats` provides one row per session with net minutes and local time. Query it in the Supabase SQL editor or connect any Postgres tool.

## Development

```bash
npm install
npm run dev          # http://localhost:5173/peakhour/
npm run dev -- --host  # test on your phone over Wi-Fi
npm test             # unit tests for the stats logic
npm run build        # production build to dist/
```

Every push to `main` deploys automatically to GitHub Pages (`.github/workflows/deploy.yml`).

**Stack:** React 19 · TypeScript · Vite · Dexie (IndexedDB) · Supabase · vite-plugin-pwa · Vitest

```
src/
  screens/     Timer, History, Stats, Projects
  components/  SessionSheet (rate/edit), RatingInput, Sheet
  lib/         stats.ts (aggregation), export.ts (JSON/CSV), format.ts
  sync/        local-first sync engine (dirty tracking, LWW) + Supabase adapter
  db.ts        Dexie schema + timer actions
supabase/      SQL schema with row level security
analysis/      Python analysis of the JSON export
scripts/       icon generator
```

## Analysis with Python

```bash
python3 -m venv .venv
.venv/bin/pip install -r analysis/requirements.txt

.venv/bin/python analysis/analyze.py ~/Downloads/peakhour-export-2026-10-19.json
.venv/bin/python analysis/analyze.py export.json --project "CFA Level I" --charts
```

The script prints hours per project and week, rating by weekday, time of day and session length, the top and bottom time windows, unused times, and the comments from your best sessions. `--charts` writes PNGs to `analysis/out/`. Save personal exports to `analysis/data/`, which git ignores.

## Data format (JSON export)

```jsonc
{
  "app": "peakhour",
  "version": 1,
  "exportedAt": "2026-10-19T18:54:50.328Z",
  "projects": [
    { "id": "…", "name": "CFA Level I", "color": "#2a78d6", "archived": false, "weeklyGoalHours": 15, "createdAt": "…" }
  ],
  "sessions": [
    {
      "id": "…",
      "projectId": "…",
      "project": "CFA Level I",
      "start": "2026-10-13T07:28:00+02:00",   // local time with offset
      "end": "2026-10-13T08:29:00+02:00",
      "durationMin": 61,                      // net, pauses excluded
      "pausedMin": 0,
      "weekday": "Dienstag",
      "rating": 75,                           // 0–100; smileys = 0/25/50/75/100
      "ratingKind": "smiley",                 // or "slider"
      "comment": "Bibliothek, Kaffee, Handy weg"
    }
  ]
}
```

The CSV has the same session fields, one row per session. Both formats can go straight to an AI, for example: *"Here is my Peakhour export. When do I study best, and what should I change?"*

## Roadmap ideas

- Tags or location per session (library / home / café)
- Reminder when a timer has been running for an unusually long time
- Native wrapper (Capacitor) or SwiftUI version for Live Activities and widgets

## License

MIT
