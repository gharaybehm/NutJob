# NutJob — Progress vs Requirements

> Last updated: 2026-05-19

## Overall Status: ~65% Complete

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

### 1. Login Page — ✅ ~80% Done
- Email + password form built (`app/(auth)/login/page.tsx`)
- Supabase auth action wired (`actions.ts`)
- Sign-out button component exists
- ❌ "Remember me" not implemented
- ❌ Role-based permissions not enforced at login (admin / worker / supervisor)

### 2. Dashboard — ✅ ~70% Done
All 6 dashboard components exist under `app/components/dashboard/`:
- `KPIGrid.tsx` — four top metrics ✅
- `WeatherStrip.tsx` — 7-day weather strip ✅ (Open-Meteo integrated)
- `ActiveAlerts.tsx` — alerts panel ✅
- `BlockStatusGrid.tsx` — green/amber/red health per block ✅
- `UpcomingCalendar.tsx` — calendar widget ✅
- `ActivityFeed.tsx` — recent activity feed ✅

❌ Data is currently mostly **mock/static** — needs real Supabase queries

### 3. Blocks Page — ✅ Done (Phase 1, 2 & 3)
- Route: `app/(dashboard)/blocks/page.tsx` ✅ (Now a Server Component fetching from Supabase)
- `BlocksPage.tsx` — client shell, two-column layout (farm map | detail) ✅
- `BlockMapGrid.tsx` — dynamic CSS grid (auto-sizes to max block position), north compass SVG overlay (top-right), status colours, alert badges ✅
- `BlockDetailPanel.tsx` — tabbed panel with 5 domain tabs + alert count badges ✅
- `tabs/SoilWaterTab.tsx` — moisture bar, EC, ETo, water deficit, irrigation schedule, Lab Test History section (live Supabase fetch of manual readings, signed URL file links) ✅
- `tabs/PhenologyTab.tsx` — season timeline, growth stage, GDD, chill hours, harvest window ✅
- `tabs/NutritionTab.tsx` — nutrient gauge bars with sufficiency ranges, tissue analysis, fertigation history ✅
- `tabs/PestDiseaseTab.tsx` — risk level, observation cards, scouting schedule ✅
- `tabs/WeatherTab.tsx` — current conditions, risk flags, 24-hr forecast strip ✅
- `BlockFormModal.tsx` — live Trefle.io plant search; Map Position section (column, row, col span, row span inputs) ✅
- `LogTestResultModal.tsx` — modal for logging soil/water test results (block selector, date, lab ref, pH/EC/moisture/temp/deficit fields, notes, PDF/image file attachment) ✅
- `AlertBadge.tsx` + `SourceBadge.tsx` — shared UI atoms ✅
- `types.ts` + `mockData.ts` — full type system + rich mock data for domain profiles ✅
- Supabase schema + live data wiring for block creation and persistence ✅
- `app/actions/soilTests.ts` — `logTestResult` server action (manual soil/water readings → `soil_water_readings` table, file upload → `lab-reports` Supabase storage) ✅
- ❌ `lab-reports` Supabase storage bucket and DB migration need to be applied manually (see instructions)

### 4. Calendar Page — ✅ Done
- Full page route `app/(dashboard)/calendar/page.tsx`
- Toggles for Month, Week (time grid), and Day (timeline) views
- Colour-coded event pills (Irrigation, Fertigation, Spraying, Pruning, Scouting, Weather Alerts)
- "Add Event" modal with activity-specific field blocks
- "Log Completion" modal to capture actual start/end and notes
- Shared types and mock data in `types.ts`

### 5. Recommendations Page — 🟡 ~50% Done
- Route: `app/(dashboard)/recommendations/page.tsx` ✅
- `RecommendationsClient.tsx` — pending/history toggle, category filter, card grid ✅
- `RecommendationCard.tsx` — category icon/colour, confidence badge, accept/edit/skip controls ✅
- `actions.ts` — `getRecommendations`, `updateRecommendationStatus`, `editRecommendation`, `generateMockRecommendations` ✅
- Edit modal — manager can tweak title, add note, accept with changes (status → "edited") ✅
- Manager note shown in history card footer ✅
- Accept writes to `activity_log` (title, activity_type, block_id, rationale, performed_by, JSON details) and stores the returned `activity_log_id` on the recommendation ✅
- Edit ("Accept with changes") also writes to `activity_log` with the manager's revised title and note ✅
- AI generation via Anthropic SDK (`generateAIRecommendations`) — fetches blocks + soil/weather/alerts/scouting/tissue context, calls Claude Haiku with cached system prompt, validates and inserts results ✅
- ❌ Priority/urgency ordering not implemented

### 6. Activity Log Page — ✅ Done
- Route: `app/(dashboard)/activity/page.tsx` ✅ (Server component — parallel-fetches entries + block list from Supabase)
- `ActivityLogClient.tsx` — search by title, filter by activity type & block, live count, empty state ✅
- `actions.ts` — `getActivityLog` (search/filter/paginate), `getBlocks` ✅
- Colour-coded activity type badges (irrigation, fertigation, spraying, pruning, scouting, tissue-sample, other) ✅
- Shows block name, performed-by, and description per entry ✅

### 7. Settings Page — 🟡 ~50% Done
- Route exists: `app/(dashboard)/settings/`
- `SettingsForms.tsx` built with settings UI
- Server action (`actions.ts`) present
- ❌ Block configuration incomplete
- ❌ Sensor connections not implemented
- ❌ Weather API config not implemented
- ❌ Notification preferences not implemented
- ❌ Team/user management (role assignment) not implemented

---

## 🗄️ Data Layer

| Requirement | Status | Notes |
|---|---|---|
| Supabase client/server setup | ✅ Done | `utils/supabase/` |
| In-field sensors (15-min updates) | ❌ Not started | No ingest pipeline |
| Weather forecast API (3-hr updates) | 🟡 Partial | Open-Meteo in WeatherStrip; no scheduled fetch |
| Manual logs (irrigation, spray, scouting, etc.) | ❌ Not started | |
| Initial block data / PDF upload & extraction | 🟡 Partial | Manual entry + file attachment via LogTestResultModal; AI extraction not implemented |
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

## 🔐 Roles & Permissions

| Requirement | Status | Notes |
|---|---|---|
| Admin role | ❌ Not started | |
| Worker role (log activities only) | ❌ Not started | |
| Supervisor role (change/add activities) | ❌ Not started | |
| Per-module permission enforcement | ❌ Not started | |

---

## 📊 Summary

| Area | Progress |
|---|---|
| Project scaffold & tech stack | ✅ 100% |
| Auth (basic login) | ✅ 80% |
| Dashboard page | 🟡 70% (UI done, data mocked) |
| Settings page | 🟡 50% |
| Navigation | ✅ 80% |
| Blocks page | ✅ 100% (Phase 3 — north compass, dynamic map, lab test logging) |
| Calendar page | ✅ 100% (UI done, data mocked) |
| Recommendations page | ✅ 90% (UI + edit modal + activity log + AI generation done) |
| Activity Log page | ✅ 100% |
| Database schema | ✅ 100% |
| Real data ingestion | ❌ 0% |
| AI reasoning engine | ❌ 0% |
| Roles & permissions | ❌ 0% |

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
