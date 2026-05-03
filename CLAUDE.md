# CLAUDE.md — NutJob Project Guide

## Project Overview

NutJob is an AI-powered farm management system for a multi-block almond farm. It continuously ingests sensor data, weather feeds, and manual field inputs, maintains a live state per block, and uses an AI reasoning engine to generate prioritised agronomic recommendations that the farm manager can accept, edit, or skip.

## Architecture

Four layers working in a continuous loop:

```
Data Ingestion → Block State Store → AI Reasoning Engine → Recommendations & Action Log
                       ↑                                              |
                       └──────────── Manager Feedback ────────────────┘
```

The feedback loop closes when the manager logs what was actually done, writing back into the block state to inform future recommendations.

## Tech Stack

| Layer              | Technology                          |
|--------------------|-------------------------------------|
| Frontend           | Next.js (App Router) + TypeScript   |
| Styling            | Tailwind CSS v4                     |
| Backend            | Netlify with Next.js App Router     |
| Database & Auth    | Supabase                            |
| AI / LLM           | Netlify AI Gateway                  |
| Package Manager    | npm                                 |

## Project Structure

```
NutJob/
├── app/                    # Next.js App Router pages & layouts
│   ├── layout.tsx          # Root layout
│   ├── page.tsx            # Home / landing page
│   ├── globals.css         # Global styles (Tailwind)
│   └── favicon.ico
├── public/                 # Static assets
├── design.png              # Design reference (AgriTech SaaS Platform)
├── Requirements.md         # Full requirements document
├── CLAUDE.md               # This file — project conventions & guide
├── AGENTS.md               # Next.js agent rules (auto-generated)
├── next.config.ts          # Next.js configuration
├── tsconfig.json           # TypeScript configuration
├── postcss.config.mjs      # PostCSS config (Tailwind)
├── eslint.config.mjs       # ESLint configuration
├── package.json            # Dependencies & scripts
└── package-lock.json
```

## Data Sources

The system ingests from four source types:

1. **In-field sensors** — soil moisture, EC, temperature, humidity, wind, rainfall (updates every 15 min)
2. **Weather forecast APIs** — updates every 3 hours
3. **Manual logs** — entered by the farm manager per event or weekly:
   - Irrigation runs, fertigation, spray applications
   - Scouting observations, tissue samples
4. **Computed fields** — derived from the above:
   - ETo (evapotranspiration), water deficit, GDD (growing degree days)
   - Chill hours, risk indices

## Pages (7 total)

### 1. Login
- Email + password authentication
- "Remember me" checkbox
- Supabase Auth integration

### 2. Dashboard
- Command center with four top KPI metrics
- 7-day weather strip
- Active alerts panel
- Block status grid (green / amber / red health status per block)
- Upcoming calendar widget
- Recent activity feed

### 3. Blocks
- Per-block live profile across five agronomic domains:
  - Soil & Water
  - Phenology
  - Nutrition
  - Pest & Disease
  - Weather
- Inline alerts with source attribution

### 4. Calendar
- Month / week / day toggle
- Colour-coded events by activity type
- Add events and log completions directly from entries

### 5. Recommendations
- AI-generated action cards
- Filterable by category: irrigate, fertilize, spray, scout
- Each card shows: action, rationale, confidence score
- Controls: accept / edit / skip

### 6. Activity Log
- Searchable and filterable history
- All actions taken across all blocks

### 7. Settings
- Block configuration
- Sensor connections
- Weather API settings
- Irrigation controller (future integration)
- Notification preferences
- Team/user management

## Navigation

- Top navigation bar
- Fully responsive for desktop and mobile field use

## Design Reference

The UI should follow the AgriTech SaaS Platform aesthetic shown in `design.png`:
- Clean, modern interface with green accent colours
- Card-based layouts with clear hierarchy
- Map/satellite views for spatial data
- Data visualisation with colour indicators (pH scales, condition badges)
- Weather forecast strips
- Left sidebar with icon navigation

## Development Commands

```bash
npm run dev      # Start dev server (Turbopack)
npm run build    # Production build
npm run start    # Start production server
npm run lint     # Run ESLint
```

## Conventions

- Use TypeScript for all files (`.tsx` / `.ts`)
- Use the App Router (`app/` directory) — no Pages Router
- Follow Next.js 16 conventions (check `node_modules/next/dist/docs/` for breaking changes)
- Use Tailwind CSS v4 utility classes for styling
- Use Supabase client libraries (`@supabase/supabase-js`, `@supabase/ssr`) for auth and database
- Keep components modular and reusable
- Use server components by default; add `"use client"` only when needed
- Environment variables should be prefixed with `NEXT_PUBLIC_` for client-side access

## Environment Variables (to be configured)

```env
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
```
