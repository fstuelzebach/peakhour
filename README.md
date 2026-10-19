# Peakhour ◐

**Track focus time per project, rate every session, and find out when you actually work best.**

Peakhour is a minimalist time tracker for the iPhone, delivered as an installable web app (PWA). Pick a project, tap **Start**, tap **Stop**, rate the session with a smiley or slider, and optionally add a comment. Over weeks and months, Peakhour shows your cumulative hours per project and the patterns behind your best sessions: which weekdays and times of day, which session lengths, and when you never work.

Built first for one question: *when should I study for the CFA?*

## Features

- **One-tap timer**: the start time is stored immediately, so the timer survives closing the app or a phone restart
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
- Offline-capable, dark mode, no account, no server: **your data stays on the device**

## Install on your iPhone

1. Open **https://fstuelzebach.github.io/peakhour/** in **Safari**
2. Share button → **Add to Home Screen**
3. Launch it from the home screen. It runs full-screen like a native app.

> Data lives in the app's local storage (IndexedDB). Apps added to the home screen are exempt from Safari's 7-day storage cleanup, but **export a JSON backup regularly** anyway (Projekte → Export als JSON).

## Development

```bash
npm install
npm run dev          # http://localhost:5173/peakhour/
npm run dev -- --host  # test on your phone over Wi-Fi
npm test             # unit tests for the stats logic
npm run build        # production build to dist/
```

Every push to `main` deploys automatically to GitHub Pages (`.github/workflows/deploy.yml`).

**Stack:** React 19 · TypeScript · Vite · Dexie (IndexedDB) · vite-plugin-pwa · Vitest

```
src/
  screens/     Timer, History, Stats, Projects
  components/  SessionSheet (rate/edit), RatingInput, Sheet
  lib/         stats.ts (aggregation), export.ts (JSON/CSV), format.ts
  db.ts        Dexie schema + timer actions
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
    { "id": "…", "name": "CFA Level I", "color": "#2a78d6", "archived": false, "createdAt": "…" }
  ],
  "sessions": [
    {
      "id": "…",
      "projectId": "…",
      "project": "CFA Level I",
      "start": "2026-10-13T07:28:00+02:00",   // local time with offset
      "end": "2026-10-13T08:29:00+02:00",
      "durationMin": 61,
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

- Weekly goal per project (e.g. 15 h CFA) with progress ring
- Tags or location per session (library / home / café)
- Reminder when a timer has been running for an unusually long time
- Optional sync (iCloud / own backend) and a native SwiftUI version

## License

MIT
