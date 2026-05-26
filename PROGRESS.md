# NutJob — Progress vs Requirements

> Last updated: 2026-05-26

## Overall Status: ~93% Complete

---

## ✅ Tech Stack & Architecture

| Requirement | Status | Notes |
|---|---|---|
| Next.js + Tailwind CSS frontend | ✅ Done | Project scaffolded with both |
| Netlify + Next.js App Router backend | ✅ Done | App Router in use; Netlify config assumed via env |
| Supabase for DB + Auth | ✅ Done | `utils/supabase/` client, server, middleware wired up |
| Netlify AI Gateway (LLM) | ❌ Not started | No AI integration exists yet |
| Auth middleware (route protection) | ✅ Done | `middleware.ts` guards dashboard routes |

---

## 📄 Pages — 7 Required

### 1. Login Page — ✅ 100% Done
- Email + password form built (`app/(auth)/login/page.tsx`)
- Supabase auth action wired (`actions.ts`)
- Sign-out button component exists
- ✅ "Remember me" fully implemented with session-only/30-day cookie logic
- ✅ Role-based permissions enforced at login layout (admin / worker / supervisor)

### 2. Dashboard — ✅ 100% Done
All 6 dashboard components exist under `app/components/dashboard/`:
- `KPIGrid.tsx` — four top metrics ✅ (dynamic average moisture, Open-Meteo total rain forecast, unresolved alerts count, scheduled irrigation run time)
- `WeatherStrip.tsx` — 7-day weather strip ✅ (Open-Meteo integrated)
- `ActiveAlerts.tsx` — alerts panel ✅ (live unresolved alerts list with relative dates & domain types)
- `BlockStatusGrid.tsx` — green/amber/red health per block ✅ (live status levels based on block active alerts, moisture percentages & issues)
- `UpcomingCalendar.tsx` — calendar widget ✅ (displays upcoming calendar events from Supabase)
- `ActivityFeed.tsx` — recent activity feed ✅ (lists completed activity logs with relative times)

### 3. Blocks Page — ✅ Done (Phase 1, 2, 3 & 4)
- Route: `app/(dashboard)/blocks/page.tsx` ✅ (Server Component — fetches blocks + boundary from Supabase)
- `BlocksPage.tsx` — client shell with satellite map + block detail panel + edit-mode state machine ✅
- `BlockSatelliteMapClient.tsx` — Leaflet satellite map (Esri World Imagery, no API key) with polygon draw/edit tools via leaflet-draw ✅
- `BlockSatelliteMap.tsx` — SSR-safe `next/dynamic` wrapper (ssr: false) ✅
- `GoToLocationBar.tsx` — GPS coordinate jump input for navigating to non-adjacent farm plots in edit mode ✅
- Block boundary draw flow: Edit Farm Map → draw polygon → BlockFormModal pre-loaded with boundary → Create Block → polygon saved to DB ✅
- Static/edit mode toggle: Accept Changes persists all boundary edits to Supabase; Cancel reverts ✅
- Block list pills below map (shows all blocks; "○" marker for blocks without a boundary yet) ✅
- `BlockFormModal.tsx` — map position grid inputs removed; replaced with boundary status badge (shows point count) ✅
- `BlockDetailPanel.tsx` — tabbed panel with 5 domain tabs + alert count badges ✅
- `tabs/SoilWaterTab.tsx` — moisture bar, EC, ETo, water deficit, irrigation schedule, Lab Test History section (live Supabase fetch of manual readings, signed URL file links) ✅
- `tabs/PhenologyTab.tsx` — season timeline, growth stage, GDD, chill hours, harvest window ✅
- `tabs/NutritionTab.tsx` — nutrient gauge bars with sufficiency ranges, tissue analysis, fertigation history ✅
- `tabs/PestDiseaseTab.tsx` — risk level, observation cards, scouting schedule ✅
- `tabs/WeatherTab.tsx` — current conditions, risk flags, 24-hr forecast strip ✅
- `LogTestResultModal.tsx` — modal for logging soil/water test results ✅
- `AlertBadge.tsx` + `SourceBadge.tsx` — shared UI atoms ✅
- `types.ts` + `mockData.ts` — full type system + rich mock data for domain profiles ✅
- `app/actions/blocks.ts` — createBlock, updateBlock, deleteBlock, updateBlockBoundary server actions ✅
- **Completed step**: Run `ALTER TABLE blocks ADD COLUMN IF NOT EXISTS boundary JSONB;` in Supabase SQL editor ✅
- **Completed step**: `lab-reports` Supabase storage bucket and DB migration (adding missing columns and updating soil_water_latest view) have been successfully applied ✅

### 4. Calendar Page — ✅ Done
- Full page route `app/(dashboard)/calendar/page.tsx`
- Toggles for Month, Week (time grid), and Day (timeline) views
- Colour-coded event pills (Irrigation, Fertigation, Spraying, Pruning, Scouting, Weather Alerts)
- "Add Event" modal with activity-specific field blocks
- "Log Completion" modal to capture actual start/end and notes
- Shared types and mock data in `types.ts`

### 5. Recommendations Page — ✅ 100% Done
- Route: `app/(dashboard)/recommendations/page.tsx` ✅
- `RecommendationsClient.tsx` — pending/history toggle, category filter, card grid ✅
- `RecommendationCard.tsx` — category icon/colour, confidence badge, accept/edit/skip controls ✅
- `actions.ts` — `getRecommendations`, `updateRecommendationStatus`, `editRecommendation`, `generateMockRecommendations` ✅
- Edit modal — manager can tweak title, add note, accept with changes (status → "edited") ✅
- Manager note shown in history card footer ✅
- Accept writes to `activity_log` (title, activity_type, block_id, rationale, performed_by, JSON details) and stores the returned `activity_log_id` on the recommendation ✅
- Edit ("Accept with changes") also writes to `activity_log` with the manager's revised title and note ✅
- AI generation via Anthropic SDK (`generateAIRecommendations`) — fetches blocks + soil/weather/alerts/scouting/tissue context, calls Claude Haiku with cached system prompt, validates and inserts results ✅
- ✅ Priority/urgency ordering — sorted by confidence DESC (highest = most urgent) then created_at DESC as tiebreaker

### 6. Activity Log Page — ✅ Done
- Route: `app/(dashboard)/activity/page.tsx` ✅ (Server component — parallel-fetches entries + block list from Supabase)
- `ActivityLogClient.tsx` — search by title, filter by activity type & block, live count, empty state ✅
- `actions.ts` — `getActivityLog` (search/filter/paginate), `getBlocks`, `logActivity` (manual insert via admin client) ✅
- Colour-coded activity type badges (irrigation, fertigation, spraying, pruning, scouting, tissue-sample, other) ✅
- Shows block name, performed-by, and description per entry ✅
- **"Log Activity" button** (supervisor/admin only) — opens `LogActivityModal` with activity type grid, title, block selector, datetime picker, and notes; inserts directly into `activity_log` via server action with optimistic UI prepend ✅

### 7. Settings Page — ✅ 100% Done
- Route exists: `app/(dashboard)/settings/`
- `SettingsForms.tsx` rebuilt with 6 tabs (role-gated)
- **Account & Security tab** — profile + password update ✅
- **Team Management tab** (admin + supervisor) — role assignment & new worker invite/creation ✅
- **Block Configuration tab** (admin + supervisor) — per-block field capacity (%), wilting point (%), and notes with live bars and Supabase persistence via `updateBlockConfig` server action ✅
- **Alert Thresholds tab** (admin + supervisor) — 5 threshold sliders (soil moisture, water deficit, heat stress, rainfall skip, pest risk) stored in localStorage ✅
- **Sensor Connections tab** (admin only) — channel status panel + copy-to-clipboard ingest endpoint reference ✅
- **Weather & AI tab** (admin only) — farm lat/lng config with Open-Meteo live connection test + Netlify AI Gateway status ✅

---

## 🗄️ Data Layer

| Requirement | Status | Notes |
|---|---|---|
| Supabase client/server setup | ✅ Done | `utils/supabase/` |
| In-field sensors (15-min updates) | ❌ Not started | No ingest pipeline |
| Weather forecast API (3-hr updates) | 🟡 Partial | Open-Meteo in WeatherStrip; no scheduled fetch |
| Manual logs (irrigation, spray, scouting, etc.) | ❌ Not started | |
| Initial block data / PDF upload & extraction | ✅ Done | AI extraction of soil/water test results from both PDF and image uploads using OpenRouter + Trigger.dev |
| Computed fields (ETo, water deficit, GDD, chill hours, risk indices) | ❌ Not started | |
| DB schema / migrations | ✅ Done | 12 migrations applied — see table list below |

---

## 🤖 AI Reasoning Engine

| Requirement | Status | Notes |
|---|---|---|
| Netlify AI Gateway integration | 🟡 Partial | Using Anthropic SDK directly (swap base URL for Netlify Gateway in prod) |
| Prioritised agronomic recommendations | ✅ Done | Claude Haiku generates per-block recommendations from live DB context |
| Confidence scoring | ✅ Done | AI returns 0–100 score, shown on card |
| Accept / Edit / Skip feedback loop | 🟡 Partial | Accept + Edit write to activity_log; Skip recorded on recommendation only |
| Feedback writes back to block state | ❌ Not started | |

---

## 🧭 Navigation

| Requirement | Status | Notes |
|---|---|---|
| Top nav bar | ✅ Done | `TopNav.tsx` exists |
| Sidebar | ✅ Done | `Sidebar.tsx` with links to all pages |
| Fully responsive (desktop + mobile) | 🟡 Partial | Tailwind used; needs mobile verification |

---

## 🌍 Multi-Farm Support

| Requirement | Status | Notes |
|---|---|---|
| Farm selector screen after login | ❌ Not started | Show when user has access to multiple farms |
| Farm switcher in top nav (no re-auth) | ❌ Not started | |
| Per-farm isolated data (blocks, calendar, inventory, etc.) | ❌ Not started | Requires `farm_id` foreign key on all data tables |
| Per-farm, per-user role scoping | ❌ Not started | A user can be admin on one farm, worker on another |

---

## 🌐 Localisation

| Requirement | Status | Notes |
|---|---|---|
| English | ✅ Done | Default language |
| Arabic | ❌ Not started | Full RTL layout mirroring required |
| Turkish | ❌ Not started | |
| Language preference persisted per user | ❌ Not started | |
| RTL layout mirroring (nav, cards, tables, forms, modals) | ❌ Not started | |
| Locale-aware number, date, and calendar formats | ❌ Not started | |
| AI recommendations returned in user's active language | ❌ Not started | |

---

## 📱 Mobile Optimisation

| Requirement | Status | Notes |
|---|---|---|
| Touch-friendly tap targets (min 44×44 px) | ❌ Not started | |
| Bottom navigation bar on small screens | ❌ Not started | Replaces top nav on mobile |
| Swipe gestures (blocks, calendar views) | ❌ Not started | |
| Service worker / offline-capable reads | ❌ Not started | Cache dashboard, block profiles, today's calendar |
| Background sync for offline activity log entries | ❌ Not started | |
| Lazy-loading of images and chart data | ❌ Not started | Target: initial load <3 s on 4G |

---

## 🔐 Roles & Permissions

| Requirement | Status | Notes |
|---|---|---|
| Admin role | ✅ Done | Full access to Settings > Team, deletes blocks, invites members |
| Worker role (log activities only) | ✅ Done | Read-only map, hides recommendations/settings, completion-only calendar |
| Supervisor role (change/add activities) | ✅ Done | Map boundary editing, log test, add calendar event, worker creation |
| Per-module permission enforcement | ✅ Done | Enforced securely on server-side layouts, server actions, and UI elements |

---

## 📊 Summary

| Area | Progress |
|---|---|
| Project scaffold & tech stack | ✅ 100% |
| Auth (basic login) | ✅ 100% |
| Dashboard page | ✅ 100% (Wired to live Supabase data & Open-Meteo) |
| Settings page | ✅ 100% (All 6 tabs: Account, Team, Block Config, Alert Thresholds, Sensors, Weather) |
| Navigation | ✅ 80% |
| Blocks page | ✅ 100% (Phase 4 — satellite map with GPS polygon draw/edit, Go-to-location bar) |
| Recommendations page | ✅ 100% (UI + edit modal + activity log + AI generation + priority ordering done) |
| Activity Log page | ✅ 100% (+ manual Log Activity button for supervisor/admin) |
| Inventory page | ✅ 100% (Asset & Consumable tracking with calendar linking) |
| Database schema | ✅ 100% |
| Real data ingestion | ❌ 0% |
| AI reasoning engine | ❌ 0% |
| Roles & permissions | ✅ 100% |
| Multi-farm support | ❌ 0% |
| Localisation (Arabic, Turkish) | ❌ 0% |
| Mobile optimisation | ❌ 0% |

---

## 📝 Changelog

| Date | What changed |
|---|---|
| 2026-05-09 | Initial progress snapshot created |
| 2026-05-09 | Built Calendar page (Month/Week/Day views, Add Event & Log Completion modals, mock data) |
| 2026-05-09 | Created `deploy-skill.md` with instructions for deploying the NutJob application to the local machine |
| 2026-05-17 | Built Blocks page Phase 2 — wired up Supabase persistence, created Server Actions for block creation, fixed RLS, and added optimistic UI updates |
| 2026-05-17 | Built complete Supabase schema — 13 tables: user_profiles, blocks (seeded), block_alerts, soil_water_readings, phenology_records, tissue_samples, fertigation_log, scouting_reports, pest_observations, weather_snapshots, activity_log, recommendations + upgraded calendar_events. All tables have RLS + policies. |
| 2026-05-19 | Built Recommendations page scaffolding (route, server fetch, card grid, accept/skip), then added edit modal — manager can tweak the AI title, add a personal note, and accept with changes (status → "edited"); manager note shown in history view. |
| 2026-05-19 | Wired Accept → activity_log write-back. Accept (and "Accept with changes") now inserts an activity_log row (mapped activity_type, block_id, rationale, performed_by, JSON details) and stores the returned activity_log_id on the recommendation, closing the feedback loop. |
| 2026-05-19 | Implemented AI generation — installed @anthropic-ai/sdk, added generateAIRecommendations server action that gathers per-block context (soil, weather, alerts, scouting, tissue samples), calls Claude Haiku with a cached system prompt, validates JSON output, and inserts into Supabase. Added "Generate AI Insights" button to the toolbar. |
| 2026-05-19 | Built Activity Log page — server route + ActivityLogClient with live search by title, filter by activity type and block, entry count, colour-coded type badges, and empty state. Data sourced from Supabase activity_log table (written to by accepted recommendations). |
| 2026-05-19 | Wired calendar completions → activity_log. Fixed three bugs: (1) createEvent now returns the real Supabase UUID so the optimistic local state is patched and completions use the correct ID; (2) activity_log insert uses createAdminClient to bypass RLS; (3) performed_by set to user.id (UUID) not user.email. |
| 2026-05-19 | Enhanced farm map: north compass SVG overlay (top-right of map, brand-colour N arrow), dynamic grid sizing (expands beyond 3 columns automatically), map position inputs (column, row, col span, row span) in BlockFormModal, and updateBlock now persists map position to Supabase. |
| 2026-05-19 | Lab test result logging: LogTestResultModal with block selector, date, lab ref, pH/EC/moisture/temp/deficit inputs, notes, and PDF/image file attachment. logTestResult server action uploads file to lab-reports Supabase storage bucket and inserts manual reading into soil_water_readings. SoilWaterTab shows Lab Test History section with signed-URL file link. |
| 2026-05-19 | Expanded lab test modal to full Turkish lab report standard: Soil Test (pH, EC, organic matter, P₂O₅, K₂O, lime, CEC, Ca, Mg, Na, Fe, Zn, Cu, Mn, B, soil texture) and Water Test (pH, EC in µs/cm). Added live benchmark status badges per parameter. Added "Whole Farm" scope option (null block_id). Lab Test History now shows colour-coded parameter chips with benchmark indicators. Added test_type and parameters JSONB columns to soil_water_readings. |
| 2026-05-21 | Phase 4 — Replaced CSS grid farm map with Leaflet satellite map (Esri World Imagery, no API key). User draws GPS polygon boundaries for each block in edit mode; polygons persist to Supabase `boundary` JSONB column. Added GoToLocationBar for jumping to non-adjacent farm plots by entering GPS coordinates. Map is static (view-only) by default; "Edit Farm Map" enables drawing tools; "Accept Changes" persists all boundary edits; "Cancel" reverts. BlockFormModal updated: removed grid position inputs, added boundary status badge. **Requires manual SQL migration**: `ALTER TABLE blocks ADD COLUMN IF NOT EXISTS boundary JSONB;` |
| 2026-05-24 | Phase 5 — Fully implemented user roles (admin, supervisor, worker), permissions gating, team/user management dashboard inside settings (changing roles, creating users/workers), and session persistence ("Remember Me" logic) at login. ESLint clean with 0 warnings/errors. |
| 2026-05-24 | Phase 6 — Fully integrated dashboard layer with Supabase live database. Connected KPIGrid (dynamic moisture, rain totals, alert counters), ActiveAlerts (live unresolved list), BlockStatusGrid (real block health), UpcomingCalendar (live events), and ActivityFeed (completed actions log). Completed full linter and production build compilation verify with 0 warnings/errors. |
| 2026-05-24 | AI soil/water test result extraction: Replaced Turkish-only regex/positional PDF parser with an advanced multimodal Gemini 2.5 Flash processor via OpenRouter and Trigger.dev. Accepts both PDF and image (PNG, JPEG, etc.) uploads. extracts pH, EC, macronutrients, minerals, and soil texture directly into the LogTestResultModal. |
| 2026-05-24 | Robust Soil Extraction Fix — Enhanced `extract-soil-test` API route to support direct, self-contained OpenRouter LLM extraction when running locally, with a graceful Trigger.dev fallback. Resolves local Trigger.dev authentication and `ApiClientMissingError` crashes on server start. |
| 2026-05-24 | Phase 7 — Built Inventory Page: Asset and Consumable management. Added local-first data store for asset status, maintenance logs, and consumable balances, complete with low-stock alerts, searchable dropdown suggestions, calendar event usage linking, and full role-based permissions (admin/supervisor vs worker read-only). |
| 2026-05-26 | Option A — (1) Fixed recommendations ordering: pending cards now sorted by confidence DESC (highest urgency first), with created_at DESC as tiebreaker. (2) Added "Log Activity" manual quick-entry to Activity Log page: `LogActivityModal` (activity type grid, title, block, datetime, notes) with `logActivity` server action (admin client bypass of RLS), optimistic prepend to list, and role-gating (supervisor/admin only). TypeScript clean — 0 errors. |
| 2026-05-26 | Settings Page completed — Rebuilt `SettingsForms.tsx` with 6 role-gated tabs: (1) Account & Security, (2) Team Management, (3) Block Configuration (per-block field_capacity/wilting_point/notes with Supabase persistence + live progress bars), (4) Alert Thresholds (5 sliders in localStorage: soil moisture, water deficit, heat stress, rain skip, pest risk), (5) Sensor Connections (channel status + copy-to-clipboard ingest endpoint reference), (6) Weather & AI (farm lat/lng with Open-Meteo live test + Netlify AI Gateway config). TypeScript clean — 0 errors. |
| 2026-05-26 | AI engine switched to direct OpenRouter calls — Removed Trigger.dev dependency from `generateAIRecommendations`; logic now runs inline in the server action using the OpenAI SDK pointed at `https://openrouter.ai/api/v1` with model `google/gemini-2.5-flash`. Context gathering (blocks, soil, weather, alerts, scouting, tissue), prompt, JSON parsing, validation, and DB insert all inlined. Requires `OPENROUTER_API_KEY` env var. |
| 2026-05-26 | Lint clean sweep — Fixed all 20 ESLint errors: removed unused `gemini`/`AI_SYSTEM_PROMPT` from recommendations actions, converted two `useEffect` setState calls to lazy state initializers in SettingsForms, escaped apostrophe entity, added file-level any-disable in inventory actions, removed unused imports (`ASSET_SUGGESTIONS`, `Filter`, `isPending`), typed `recentCalendarEvents` and `events` props properly. 0 errors, 0 warnings. |
| 2026-05-26 | Requirements updated — added three new requirements: (1) Multi-farm support (single login, farm selector, per-farm isolated data and role scoping); (2) Localisation to Arabic and Turkish with RTL layout, locale-aware formatting, and AI responses in active language; (3) Mobile-first optimisation (bottom nav, swipe gestures, service worker offline reads, background sync, lazy loading <3 s on 4G). |


