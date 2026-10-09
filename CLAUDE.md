# CLAUDE.md — NutJob Project Guide

## Project Overview

NutJob is an AI-powered, multi-farm, multi-crop farm management system (it started as an almond-only tool; the live farms grow almonds). It continuously ingests sensor data, weather feeds, and manual field inputs, maintains a live state per block, and uses an AI reasoning engine to generate prioritised agronomic recommendations that the farm manager can accept, edit, or skip.

`Requirements.md` is the product spec and `PROGRESS.md` records what is built. Sections of `Requirements.md` marked "planned, not built" describe work that has no code yet.

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
| Hosting            | Hostinger VPS via Coolify (Docker)  |
| Database & Auth    | Supabase (self-hosted on the VPS)   |
| AI / LLM           | OpenRouter                          |
| Package Manager    | npm                                 |

> Hosting and database migrated from Netlify + Supabase Cloud to the VPS
> (cutover completed 2026-08-31); `www.rootloot.ai` serves from the VPS and
> Netlify no longer receives production traffic.>
> Note the AI row: earlier versions of this file claimed Netlify AI Gateway.
> No code has ever read it — every LLM call goes directly to OpenRouter
> (`utils/generate-recommendations.ts`, `app/api/extract-soil-test/route.ts`,
> `src/trigger/extract.ts`, `scripts/ingest-knowledge-base.ts`).

## Project Structure

```
NutJob/
├── app/
│   ├── (auth)/login/           # Login (email + password, Google)
│   ├── farms/                  # Farm selector
│   ├── [farmId]/(dashboard)/   # Farm pages: dashboard, blocks, calendar,
│   │                           #   recommendations, activity, inventory, settings
│   ├── (dashboard)/settings/   # Settings forms and actions shared by the farm page
│   ├── (superadmin)/admin/     # Platform operator area (overview, knowledge, subscribers)
│   ├── actions/                # Server actions shared across pages
│   ├── api/                    # Route handlers: cron/*, ingest, webhooks, push, extract-soil-test
│   └── components/             # UI by area (blocks, calendar, recommendations, knowledge, admin, ui, ...)
├── engines/                # Pure agronomic calculations with tests (irrigation, frost/heat,
│   │                       #   nutrition, nitrogen, maturity, snapshot, watchdog): the live engines
│   ├── core/ rules/ pack/ framework/   # Decision engine foundation: calculators, rule tables, pack format, engine contract
│   ├── decision/           # Decision engines (phenology, yield forecast, salinity, irrigation, fertigation, frost, insect pests, diseases) and the per-block daily run
│   └── safeguards/         # Hard safeguards (spray rules SG-SPR-1 to 8)
├── packs/                  # Crop Knowledge Packs as YAML: packs/<crop>/<version>/ (almond 0.1.0)
├── utils/                  # Domain logic: generate-recommendations, build-block-context, decision/ (shadow run),
│   │                       #   kb-retrieval, kb-coverage, kb-requests, crops, push, stripe, ...
│   └── supabase/           # Clients, types, farm-access.ts (requireFarmRole)
├── scripts/                # ingest-knowledge-base.ts, test-kb-retrieval.ts, validate-pack.ts, install-pack.ts, bind-blocks-to-pack.ts
├── knowledge-base-source/  # Source documents for the knowledge base, per crop
├── supabase/migrations/    # SQL migrations (the user runs them in Supabase Studio)
├── src/trigger/            # Trigger.dev task (soil-test extraction only)
├── messages/               # en.json, ar.json, tr.json (next-intl); i18n/ holds the config
├── proxy.ts                # Next.js 16 request proxy (replaces middleware)
├── docs/                   # nut-job-cdss-spec.md: decision engine specification v3.0 (foundation built)
├── Requirements.md         # Product requirements
├── PROGRESS.md             # Status tables and dated changelog
├── design.png              # Design reference (AgriTech SaaS Platform)
└── AGENTS.md               # Next.js agent rules (auto-generated)
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

## Pages (8 total)

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

### 7. Inventory
- Asset tracking with maintenance log history
- Consumables tracking with usage logs linked to calendar events
- Searchable suggestions and low stock alerts

### 8. Settings
- Block configuration
- Sensor connections
- Weather API settings
- Irrigation controller (future integration)
- Notification preferences
- Team/user management

## Roles

- Farm roles are per farm (`farm_members`): `admin`, `supervisor`, `worker`. Workers log activities and complete calendar entries only; they do not see Recommendations or Settings.
- Every server action and route handler that touches farm data gates on `requireFarmRole(farmId, minimum)` from `utils/supabase/farm-access.ts`; the same matrix is enforced in RLS.
- `super_admin` is a global platform role with the `/admin` area. The platform operator is not a farm member and must never be shown a farm's log text, notes, alert messages or recommendation text — counts, times and settings only.

## Field Assistant (built: `utils/assistant/`, `app/api/farms/[farmId]/assistant/`, `app/actions/assistant*.ts`)

A chat drawer for supervisors and admins on every farm page. The full requirement is the "Field assistant" section of `Requirements.md`. Rules to hold when building it:

- **Supervisor and admin only.** Gate the route with `requireFarmRole(farmId, "supervisor")` and hide the control from workers.
- **Server-side model calls only.** The browser calls a streaming route handler; it never calls OpenRouter. Reuse `utils/openrouter.ts`.
- **Reuse, do not fork.** Block context comes from `utils/build-block-context.ts`; retrieval from `utils/kb-retrieval.ts` and `match_knowledge_base` with the existing embedding model (`text-embedding-3-small`, `VECTOR(1536)`). Do not change the embedding model or dimension.
- **Model choice.** Same low-cost tier as the weekly run (`OPENROUTER_MODEL` in `utils/generate-recommendations.ts`, currently `google/gemini-2.5-flash`). No free models and no escalation ladder; one retry on a stronger model only for failures code can detect (invalid output, no citation when passages were supplied), plus a fallback model for outages. Keep model names in one place and change them only after the test question set passes.
- **The knowledge base is platform-wide.** Only threads and messages are per farm (RLS).
- **Numbers come from `engines/`,** never from the model. If an engine is off for a block, the assistant says so.
- **Source rules are enforced in code,** using the chunk's `country`, `region` and `regulatory` columns, not by asking the model to check. Pesticide product and dose only from a regulatory source for the farm's country.
- **Advisory only.** The one write is "Accept and schedule" on a draft card: it inserts a `recommendations` row already `accepted` (or `edited`) with an assistant origin marker and books the calendar event through the existing accept path. It never inserts a `pending` row, so the weekly batch's supersede step in `utils/generate-recommendations.ts` does not touch it. Block effects still apply only on completion (`utils/recommendation-effects.ts`).
- **Operator privacy.** Admin pages get counts only; conversation text is readable by the operator only for a thread the user shared with support.
- **Farm notes and guide text are untrusted input** to the prompt.

## Decision Engine (foundation and shadow run built; most engines not built)

`docs/nut-job-cdss-spec.md` (v3.0) specifies a crop-agnostic, five-layer recommendation engine (science core, twelve decision engines, arbitrator, LLM narrator, hard safeguards) with a recommendation log, shadow mode and a learning loop. All crop science comes from versioned Crop Knowledge Packs; a crop number in platform code is a defect. The summary and the open points are in the "Decision engine" section of `Requirements.md`. Two decisions (2026-10-09) override the specification file:

- **TypeScript, not Python.** Build it as pure modules in `engines/` with tests; no separate Python service. The specification's acceptance tests apply unchanged, and its Python code is the reference to check against.
- **Packs are platform-wide.** The platform operator installs, validates and updates packs after review, like guide documents. A farm binds blocks to an installed pack and variety; calibrated values, Shadow or Live per engine and the product library are per farm.

Built (2026-10-09), with tests: the science core (`engines/core/`), decision tables (`engines/rules/`), the pack format, loader, validator and `PackContext` (`engines/pack/`), the engine contract (`engines/framework/`), almond pack 0.1 (`packs/almond/0.1.0/`), a daily shadow run of eight engines: phenology, yield forecast, salinity, irrigation, fertigation, frost, insect pests and diseases (`engines/decision/`, `utils/decision/run-decision-engine.ts`, `/api/cron/decision-engine`), and the spray safeguards (`engines/safeguards/spray.ts`), fed by `field_observations` and the per-farm product library `farm_products` that writes `weather_hourly`, `block_engine_state` and `engine_recommendation_log`. Packs are installed into `crop_packs` with `npm run install:pack` and blocks are bound with `npm run bind:blocks`. Not built: the four seasonal engines (pollination, pruning, weeds and groundcover, harvest), the other safeguards, arbitrator, narrator, manager decisions in the log, live mode, interface. Rules for this code:

- **No crop content in `engines/core`, `rules`, `pack`, `framework`, `decision` or `safeguards`.** A test (`engines/framework/framework.test.ts`) fails on a variety, pest, disease or phase name there.
- **A value the source does not give is `to be sourced` in the pack, never invented.** An engine that depends on one stays in Shadow.
- **After any change to a pack file,** run `npm run validate:pack -- --pack=<id> --version=<x.y.z> --sign`; the manifest signature is a digest of the files and the tests fail when it is stale.
- **Shadow only.** The run must not write to `recommendations`, `block_alerts` or `calendar_events`, and its route returns counts and errors, never recommendation text. `engine_recommendation_log` is append-only and has no operator policy.
- **Safeguard limits come from the product library, never from code.** A missing label value, an unrecorded registration or bee toxicity, or an unapproved product blocks the product; nothing is assumed. Safeguards are not tuned, calibrated or switched off.
- **An engine that cannot decide says so.** A missing input is reported with its name; it never falls through to a 'hold' or 'no action' result.
- **An installed pack version is never changed;** a change is a new version.
- **Engines talk only through the block state.** An engine adds values with `publish`, in the order set in `engines/decision/run-block.ts`; it never calls another engine.
- **The live engines stay** until each replacement has run beside the old one (order of work in `Requirements.md`, point 12).

The other open points are not decided; settle the ones a task touches with the user before writing code.

## Navigation

- Top navigation bar, left sidebar on desktop, bottom navigation with a More drawer on mobile; all role-gated
- Fully responsive for desktop and mobile field use, with RTL mirroring for Arabic

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
npm test         # Unit tests (vitest)
npm run test:kb  # Live knowledge-base retrieval test (costs a few embedding calls)
npm run test:photos -- --dir=photo-test   # Photo diagnosis accuracy test on labelled photos (2-3 model calls per case)
npm run ingest:kb -- --crop=almond   # Load knowledge-base documents (--dry-run to skip DB and embedding)
npm run validate:pack -- --pack=almond --version=0.1.0   # Check a Crop Knowledge Pack and print its report (--sign after a reviewed change)
npm run install:pack -- --pack=almond --version=0.1.0    # Install a valid pack into crop_packs (--dry-run validates only); writes to production
npm run bind:blocks -- --pack=almond --version=0.1.0     # Bind blocks of the pack's crop to it (--dry-run, --farm=); writes to production
```

Deployment: Coolify does not deploy on push; the user redeploys manually. Migrations are run by the user in Supabase Studio. Local `.env.local` points at production.

## Standing Rules

- **Always update `PROGRESS.md`** after completing any task. Update the relevant status row(s) and add a dated entry to the Changelog section. This is mandatory — do not skip it.

## Conventions

- Use TypeScript for all files (`.tsx` / `.ts`)
- Use the App Router (`app/` directory) — no Pages Router
- Follow Next.js 16 conventions (check `node_modules/next/dist/docs/` for breaking changes)
- Use Tailwind CSS v4 utility classes for styling
- Use Supabase client libraries (`@supabase/supabase-js`, `@supabase/ssr`) for auth and database
- Keep components modular and reusable
- Use server components by default; add `"use client"` only when needed
- Environment variables should be prefixed with `NEXT_PUBLIC_` for client-side access

- All user-facing strings go in `messages/en.json`, `ar.json` and `tr.json`
- Crop-specific knowledge belongs to a crop profile in `utils/crops.ts`; a crop with no profile gets "no data loaded", never another crop's numbers

## Environment Variables

```env
# Supabase
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
# App and scheduled jobs
NEXT_PUBLIC_APP_URL=
CRON_SECRET=
# AI
OPENROUTER_API_KEY=
NEXT_PUBLIC_OPENROUTER_CONFIGURED=
GEMINI_API_KEY=
TRIGGER_SECRET_KEY=
# Billing
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
STRIPE_PRICE_ID_FARM_SEAT=
# Notifications
NEXT_PUBLIC_VAPID_PUBLIC_KEY=
VAPID_PRIVATE_KEY=
VAPID_SUBJECT=
RESEND_API_KEY=
EMAIL_FROM=
# Plant catalogue
TREFLE_API_KEY=
```
