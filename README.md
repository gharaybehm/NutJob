# NutJob — AI-Powered Almond Farm Management

NutJob is an AI-powered farm management system for multi-block almond farms. It continuously ingests IoT sensor data, weather feeds, and manual field logs, maintains a live agronomic state per block, and uses an AI reasoning engine to generate prioritised recommendations the farm manager can accept, edit, or skip.

## Architecture

```
Data Ingestion → Block State Store → AI Reasoning Engine → Recommendations & Action Log
                       ↑                                              |
                       └──────────── Manager Feedback ────────────────┘
```

The loop closes when the manager logs what was actually done, writing back into block state to inform future recommendations.

## Features

- **Dashboard** — KPI metrics, 7-day weather strip, active alerts, block health grid, calendar widget, activity feed
- **Blocks** — Leaflet satellite map with GPS polygon boundaries; per-block profiles across Soil & Water, Phenology, Nutrition, Pest & Disease, and Weather
- **Calendar** — month/week/day views, colour-coded events, planned-materials linking with automatic inventory deduction on completion
- **AI Recommendations** — weekly Claude/Gemini-generated action cards with confidence scores and accept/edit/skip feedback loop
- **Activity Log** — searchable history with structured per-activity detail fields and offline queue sync
- **Inventory** — asset + consumable tracking, maintenance logs, low-stock alerts
- **Settings** — team management, block config, alert thresholds, IoT sensor registry (incl. SenseCAP cloud sync), weather/AI config
- **Multi-farm** — up to 3 farms per account with per-farm roles (admin / supervisor / worker)
- **Localisation** — English, Arabic (full RTL), Turkish
- **Mobile / PWA** — bottom nav, offline-capable service worker, web push notifications, installable

## Tech Stack

| Layer            | Technology                        |
|------------------|-----------------------------------|
| Frontend         | Next.js (App Router) + TypeScript |
| Styling          | Tailwind CSS v4                   |
| Hosting          | Netlify (`@netlify/plugin-nextjs`)|
| Database & Auth  | Supabase (Postgres + RLS)         |
| AI / LLM         | OpenRouter / Netlify AI Gateway   |
| Background jobs  | Trigger.dev + Netlify Scheduled Functions |

## Getting Started

1. **Install dependencies**

   ```bash
   npm install
   ```

2. **Configure environment** — copy `.env.local.example` to `.env.local` and fill in your Supabase, OpenRouter, and VAPID keys (see comments in the file).

3. **Apply database migrations** — run the SQL files in `supabase/migrations/` (in filename order) against your Supabase project.

4. **Run the dev server**

   ```bash
   npm run dev
   ```

   Open [http://localhost:3000](http://localhost:3000).

## Scripts

```bash
npm run dev      # Start dev server (Turbopack)
npm run build    # Production build
npm run start    # Start production server
npm run lint     # Run ESLint
```

## Deployment

The app deploys to Netlify via `netlify.toml`. Scheduled functions in `netlify/functions/` run the weather fetch (every 3 h) and computed-fields cron (daily); Trigger.dev tasks in `src/trigger/` handle weekly AI recommendation runs and SenseCAP sensor sync (3×/day). Set all environment variables from `.env.local.example` in the Netlify dashboard, including `CRON_SECRET` and the VAPID key pair.

## Project Docs

- `Requirements.md` — full requirements document
- `PROGRESS.md` — implementation status vs requirements + changelog
- `CLAUDE.md` — project conventions and structure guide
