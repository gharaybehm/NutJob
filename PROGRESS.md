# NutJob — Progress vs Requirements

> Last updated: 2026-05-19

## Overall Status: ~60% Complete

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

### 3. Blocks Page — ✅ Done (Phase 1 & 2)
- Route: `app/(dashboard)/blocks/page.tsx` ✅ (Now a Server Component fetching from Supabase)
- `BlocksPage.tsx` — client shell, two-column layout (farm map | detail) ✅
- `BlockMapGrid.tsx` — CSS grid-template-areas spatial farm layout, status colours, alert badges ✅
- `BlockDetailPanel.tsx` — tabbed panel with 5 domain tabs + alert count badges ✅
- `tabs/SoilWaterTab.tsx` — moisture bar, EC, ETo, water deficit, irrigation schedule ✅
- `tabs/PhenologyTab.tsx` — season timeline, growth stage, GDD, chill hours, harvest window ✅
- `tabs/NutritionTab.tsx` — nutrient gauge bars with sufficiency ranges, tissue analysis, fertigation history ✅
- `tabs/PestDiseaseTab.tsx` — risk level, observation cards, scouting schedule ✅
- `tabs/WeatherTab.tsx` — current conditions, risk flags, 24-hr forecast strip ✅
- `BlockFormModal.tsx` — live Trefle.io plant search for crop type; curated list of 19 common crops shown first (clean single result), Trefle fallback for exotic species; variety auto-populated from Trefle + curated cultivar list ✅
- `AlertBadge.tsx` + `SourceBadge.tsx` — shared UI atoms ✅
- `types.ts` + `mockData.ts` — full type system + rich mock data for domain profiles ✅
- Supabase schema + live data wiring for block creation and persistence ✅

### 4. Calendar Page — ✅ Done
- Full page route `app/(dashboard)/calendar/page.tsx`
- Toggles for Month, Week (time grid), and Day (timeline) views
- Colour-coded event pills (Irrigation, Fertigation, Spraying, Pruning, Scouting, Weather Alerts)
- "Add Event" modal with activity-specific field blocks
- "Log Completion" modal to capture actual start/end and notes
- Shared types and mock data in `types.ts`

### 5. Recommendations Page — ❌ Not started
- No route, no components
- Requires: AI-generated action cards, category filters (irrigate/fertilize/spray/scout/pollinate), rationale + confidence score, accept/edit/skip controls

### 6. Activity Log Page — ❌ Not started
- No route, no components
- Requires: searchable + filterable history of all actions across all blocks

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
| Initial block data / PDF upload & extraction | ❌ Not started | |
| Computed fields (ETo, water deficit, GDD, chill hours, risk indices) | ❌ Not started | |
| DB schema / migrations | ✅ Done | 12 migrations applied — see table list below |

---

## 🤖 AI Reasoning Engine

| Requirement | Status | Notes |
|---|---|---|
| Netlify AI Gateway integration | ❌ Not started | |
| Prioritised agronomic recommendations | ❌ Not started | |
| Confidence scoring | ❌ Not started | |
| Accept / Edit / Skip feedback loop | ❌ Not started | |
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
| Blocks page | ✅ 100% (Phase 2 — UI done, persistence wired) |
| Calendar page | ✅ 100% (UI done, data mocked) |
| Recommendations page | ❌ 0% |
| Activity Log page | ❌ 0% |
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
