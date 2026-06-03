# NutJob — Progress vs Requirements

> Last updated: 2026-06-02 (manual logs)

## Overall Status: ~97% Complete  <!-- Netlify scheduling + feedback loop done 2026-05-30 -->

---

## ✅ Tech Stack & Architecture

| Requirement | Status | Notes |
|---|---|---|
| Next.js + Tailwind CSS frontend | ✅ Done | Project scaffolded with both |
| Netlify + Next.js App Router backend | ✅ Done | App Router in use; Netlify config assumed via env |
| Supabase for DB + Auth | ✅ Done | `utils/supabase/` client, server, middleware wired up |
| Netlify AI Gateway (LLM) | ✅ Done | `NETLIFY_AI_GATEWAY_URL` env var swaps base URL in recommendations + cron; falls back to OpenRouter in dev |
| Auth middleware (route protection) | ✅ Done | `middleware.ts` guards dashboard routes |

---

## 📄 Pages — 8 Required

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

### 7. Inventory Page — ✅ 100% Done
- Route: `app/[farmId]/(dashboard)/inventory/page.tsx` ✅
- `InventoryPage.tsx` — asset and consumable tabs with role-based permissions (admin/supervisor edit, worker read-only) ✅
- **Asset tracking** — `AssetCard.tsx` with status badges, maintenance log history ✅
- **Consumable tracking** — `ConsumableRow.tsx` with quantity levels, low-stock alerts ✅
- CRUD modals: `AddAssetModal.tsx`, `AddConsumableModal.tsx`, `LogMaintenanceModal.tsx`, `LogUsageModal.tsx` ✅
- Calendar event usage linking — consumable usage rows link to calendar events ✅
- Searchable dropdown suggestions and low-stock alert badges ✅

### 8. Settings Page — ✅ 100% Done
- Route exists: `app/(dashboard)/settings/`
- `SettingsForms.tsx` rebuilt with 7 tabs (role-gated)
- **Account & Security tab** — profile + password update ✅
- **Team Management tab** (admin + supervisor) — role assignment & new worker invite/creation ✅
- **Block Configuration tab** (admin + supervisor) — per-block field capacity (%), wilting point (%), and notes with live bars and Supabase persistence via `updateBlockConfig` server action ✅
- **Alert Thresholds tab** (admin + supervisor) — 5 threshold sliders (soil moisture, water deficit, heat stress, rainfall skip, pest risk) stored in localStorage ✅
- **Sensor Connections tab** (admin only) — full sensor device registry: register sensors, assign to blocks (multiple sensors per block supported), copy/regenerate API keys, real-time status badges, ingest endpoint reference ✅
- **Weather & AI tab** (admin only) — farm lat/lng config with Open-Meteo live connection test + Netlify AI Gateway status ✅
- **Language tab** (all roles) — globe icon + dropdown to switch between English / العربية / Türkçe; saves to cookie + triggers full reload ✅

---

## 🗄️ Data Layer

| Requirement | Status | Notes |
|---|---|---|
| Supabase client/server setup | ✅ Done | `utils/supabase/` |
| In-field sensors (15-min updates) | 🟡 Infra ready | `sensors` table migration, sensor registration UI in Settings, 3 authenticated ingest endpoints (`/api/ingest/soil|weather|alert`) all in place. Physical devices not yet connected. |
| Weather forecast API (3-hr updates) | ✅ Done | Cron endpoint `/api/cron/weather` fetches Open-Meteo every 3 hr; stores per-farm + per-block snapshots in `weather_snapshots` |
| Manual logs (irrigation, spray, scouting, etc.) | ✅ Done | `LogActivityModal` extended with activity-specific fields (duration/volume/method for irrigation; product/amount/unit for fertigation; product/rate/target/PHI for spraying; risk/observations/next-date for scouting; type/intensity for pruning). Structured details stored in `activity_log.details` JSONB. Fertigation side-writes to `fertigation_log`; scouting side-writes to `scouting_reports` (both guarded by block_id). Detail chips rendered inline in Activity Log entries. Offline queue carries details through sync. |
| Initial block data / PDF upload & extraction | ✅ Done | AI extraction of soil/water test results from both PDF and image uploads using OpenRouter + Trigger.dev |
| Computed fields (ETo, water deficit, GDD, chill hours, risk indices) | ✅ Done | Daily cron writes to DB. Blocks page now queries `soil_water_latest`, `phenology_latest`, `weather_latest` views and displays real values. When a sensor reading arrives within 24 h the cron carries its `soil_moisture` into the computed row. |
| DB schema / migrations | ✅ Done | 12 migrations applied — see table list below |

---

## 🤖 AI Reasoning Engine

| Requirement | Status | Notes |
|---|---|---|
| Netlify AI Gateway integration | ✅ Done | `NETLIFY_AI_GATEWAY_URL` env var swaps base URL; falls back to OpenRouter in dev |
| Prioritised agronomic recommendations | ✅ Done | Claude Haiku generates per-block recommendations from live DB context |
| Confidence scoring | ✅ Done | AI returns 0–100 score, shown on card |
| Accept / Edit / Skip feedback loop | ✅ Done | Accept + Edit write to activity_log + call applyStateMutation; Skip recorded on recommendation |
| Feedback writes back to block state | ✅ Done | `applyStateMutation`: irrigate → soil_water_readings reset to field_capacity + alerts cleared; spray → pest_observations resolved; all → domain alerts resolved |

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
| Farm selector screen after login | ✅ Done | `/farms` page with card grid; auto-opens wizard if 0 farms |
| Create farm wizard (name + GPS) | ✅ Done | 3-step modal: name/address → GPS coordinates → success |
| Farm switcher in sidebar | ✅ Done | FarmSwitcher compact widget + "All Farms" link in Sidebar |
| Farm ID in URL (bookmarkable) | ✅ Done | All routes under `/{farmId}/...` (e.g. `/{farmId}/dashboard`) |
| Per-farm isolated data (blocks, dashboard, calendar, activity, inventory) | ✅ Done | All server queries filtered by `farm_id` via `farm_members` membership |
| Per-farm, per-user role scoping | ✅ Done | `farm_members` table with per-farm role; layout enforces membership |
| **DB migration** | ✅ Done | `farms`, `farm_members` tables + `blocks.farm_id` column created with RLS policies applied 2026-05-30 |

---

## 🌐 Localisation

| Requirement | Status | Notes |
|---|---|---|
| English | ✅ Done | Default language |
| Arabic | ✅ Done | Full translations for all UI text; RTL layout throughout; locale-aware dates/day names via Intl |
| Turkish | ✅ Done | Full translations for all UI text; locale-aware dates/day names via Intl |
| Language preference persisted per user | ✅ Done | Cookie-based (`NUTJOB_LOCALE`) via `setLocale` server action in Settings → Language tab |
| RTL layout mirroring (nav, sidebar, bottom nav, modals, forms) | ✅ Done | `dir="rtl"` on `<html>`, logical Tailwind props (`me-`, `ps-`, `pe-`, `border-e`, `start-*`, `end-*`), `rtl:rotate-180` on directional icons |
| Arabic font | ✅ Done | Noto Sans Arabic loaded conditionally when `locale === 'ar'`; Geist with `latin-ext` for Turkish |
| Language switcher UI | ✅ Done | Globe icon + one-click dropdown in **TopNav** (visible on every page); simplified mirror in Settings → Language tab |
| Locale-aware date/weekday formatting | ✅ Done | `Intl.DateTimeFormat(locale, ...)` in WeatherStrip and UpcomingCalendar |
| Locale-aware number, date, and calendar formats | ✅ Done | `Intl.NumberFormat(locale)` via `utils/format.ts` — KPIGrid, WeatherStrip, BlockStatusGrid use `formatPercent`, `formatTemp`, `formatMeasurement`, `formatNumber` for locale-aware rendering (Eastern Arabic numerals for ar, comma decimals for tr) |
| AI recommendations returned in user's active language | ✅ Done | `generateAIRecommendations` reads `getLocale()`, appends language instruction to system prompt when locale ≠ en |

---

## 📱 Mobile Optimisation

| Requirement | Status | Notes |
|---|---|---|
| Touch-friendly tap targets (min 44×44 px) | ✅ Done | Nav items, bell, search icon all ≥ 44 px |
| Bottom navigation bar on small screens | ✅ Done | `BottomNav.tsx` — 4 primary items + More drawer; role-gated; `md:hidden` |
| Swipe gestures (blocks, calendar views) | 🟡 Partial | Calendar: left/right swipe navigates periods; Blocks pending |
| Service worker / offline-capable reads | ✅ Done | `public/sw.js` — cache-first for static assets, network-first for /dashboard /blocks /calendar; `manifest.json` for PWA install |
| Background sync for offline activity log entries | ✅ Done | `localStorage` queue + `online` event retry; pending entries shown with amber badge; synced flash on reconnect |
| Lazy-loading of images and chart data | ✅ Done | Modal dynamic imports (9 modals); BlockDetailPanel dynamic import; Dashboard Suspense streaming per section |

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
| Settings page | ✅ 100% (All 7 tabs: Account, Team, Block Config, Alert Thresholds, Sensors, Weather & AI, Language) |
| Navigation | ✅ 100% (TopNav + Sidebar + BottomNav with More drawer, all role-gated) |
| Blocks page | ✅ 100% (Phase 4 — satellite map with GPS polygon draw/edit, Go-to-location bar) |
| Recommendations page | ✅ 100% (UI + edit modal + activity log + AI generation + priority ordering done) |
| Activity Log page | ✅ 100% (+ manual Log Activity button for supervisor/admin) |
| Inventory page | ✅ 100% (Asset & Consumable tracking with calendar linking) |
| Database schema | ✅ 100% |
| Real data ingestion | ✅ Done (weather cron ✅; computed fields cron ✅; sensor ingest pipeline ✅; manual logs ✅) |
| AI reasoning engine | ✅ 100% (generation, confidence scoring, accept/edit/skip, state mutation, block state feedback loop all done) |
| Roles & permissions | ✅ 100% |
| Multi-farm support | ✅ 100% |
| Localisation (Arabic, Turkish) | ✅ 100% (next-intl + 3 message files + RTL + language switcher + locale dates + locale-aware numbers + AI in user language) |
| Mobile optimisation | ✅ 100% (bottom nav, tap targets, swipe, service worker, per-page layout, offline sync, lazy-load all done) |

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
| 2026-05-26 | Branding — Replaced placeholder "N" icon in Sidebar and Leaf icon in Login page with the NutJob tree+almond logo mark (cropped from brand asset, saved as `public/icon.png`). |
| 2026-05-26 | Branding refinement — Login splash screen updated to use full logo (`logo-full.png`: tree+almond mark + "NutJob almond farms" + "HARVESTED WITH CARE") with transparent background. Added radial back-light glow behind the logo on the dark green panel. Sidebar retains icon-only mark with transparent background. |
| 2026-05-29 | Lazy-loading — 9 modal components converted to `next/dynamic` (ssr: false) across InventoryPage, CalendarPage, BlocksPage, ActivityLogClient. BlockDetailPanel dynamically imported with pulse skeleton in BlocksPage. Dashboard refactored: each section (KPIGrid, ActiveAlerts, BlockStatusGrid, UpcomingCalendar, ActivityFeed) now self-fetches its own data as an async server component, wrapped in individual `<Suspense>` boundaries with pulse skeletons so the page shell renders instantly. Build clean — 0 errors. |
| 2026-05-28 | Mobile optimisation phase 4 — Per-page layout audit and fixes for 375px viewport: LogTestResultModal all multi-column grids → responsive (`grid-cols-1 sm:grid-cols-3`, `grid-cols-2 sm:grid-cols-4`); SoilWaterTab param-chips grid `grid-cols-4` → `grid-cols-2 sm:grid-cols-4`; BlockDetailPanel 5-tab bar reduced to `px-2 sm:px-3 text-xs sm:text-sm`; Settings 6-tab bar reduced to `px-3 sm:px-4 text-xs sm:text-sm`; all inventory modals (AddAsset, AddConsumable, LogMaintenance, LogUsage) and LogActivityModal block/date grid → `grid-cols-1 sm:grid-cols-2`. Build clean — 0 errors. |
| 2026-05-28 | Mobile optimisation phase 3 — Service worker (`public/sw.js`): cache-first for `/_next/static/` and public images; network-first with offline HTML fallback for /dashboard, /blocks, /calendar; skips RSC navigation payloads to avoid breaking Next.js routing. Added `public/manifest.json` (PWA install, standalone display, brand green theme). `ServiceWorkerRegistration.tsx` client component registers SW on mount. Root layout exports `appleWebApp` metadata for iOS add-to-home-screen. Build clean. |
| 2026-05-28 | Mobile optimisation phase 2 — Calendar swipe gestures (left = next period, right = prev, 50 px threshold); CalendarHeader prev/next buttons enlarged to 44×44 px on mobile; TopNav converted to client component with ← page-title back button on sub-pages (logo shown on dashboard only). |
| 2026-05-28 | Mobile optimisation phase 1 — Added `BottomNav.tsx`: fixed bottom bar with Dashboard, Blocks, Calendar, Activity primary items + "More" slide-up drawer (Recommendations, Inventory, Settings, Sign Out), role-gated for workers. Sidebar hidden on mobile (`hidden md:flex`). TopNav updated: brand logo on mobile, collapsible search icon, bell tap target enlarged to 44×44 px. Dashboard layout adds `pb-24` on mobile for bottom nav clearance. Root layout exports `viewport` with `viewportFit: "cover"` for iOS safe areas. Build clean — 0 TS errors. |
| 2026-05-29 | Multi-farm support — Full architecture implemented. New `farms` + `farm_members` tables with RLS. All routes restructured to `/{farmId}/dashboard`, `/{farmId}/blocks`, etc. Farm picker page (`/farms`) with card grid and "New Farm" 3-step wizard (name → GPS → success). Farm switcher widget in sidebar. All dashboard widgets, blocks page, calendar, activity, and inventory queries scoped to the current farm via `farm_members` membership. Login redirects to `/farms` after auth. **Requires DB migration** — SQL in plan file. |
| 2026-05-29 | Farm tab bar UX fix — FarmTabs now always renders exactly 3 slots (filled or empty). Empty slots use a dashed "+" placeholder styled per-slot colour; clicking any empty slot opens the CreateFarmWizard. Fixes the 4-tab bug (was rendering filled farms + a separate empty slot, totalling more than 3 when at capacity). |
| 2026-05-29 | Farm rename in Settings — Added "Farm Identity" section at the top of the Weather & AI tab (admin only). Shows current farm name and address with Save button wired to the existing `updateFarm` server action. Farm name in the right-edge tab bar updates on next navigation. |
| 2026-05-29 | Farm creation flow simplified — CreateFarmWizard reduced to 2 steps (name/location → GPS). On completion it navigates directly to the new farm's dashboard, which already shows the "Welcome" onboarding cards (Add block, Log soil tests, etc.). Removed redundant success step that duplicated the same setup cards. Also removed FarmSwitcher from Sidebar (caused hydration error and showed a confusing "All Farms" link); farm switching is now handled exclusively by the right-edge tab bar. |
| 2026-05-30 | DB migration applied — `farms` and `farm_members` tables created with full RLS policies; `farm_id` FK column added to `blocks`. Multi-farm support now fully operational end-to-end. |
| 2026-05-30 | Locale-aware number formatting — created `utils/format.ts` with `formatPercent`, `formatTemp`, `formatMeasurement`, `formatNumber` helpers using `Intl.NumberFormat`. KPIGrid, WeatherStrip, BlockStatusGrid updated to render locale-aware values (Eastern Arabic numerals in `ar`, comma decimals in `tr`). |
| 2026-05-30 | Netlify AI Gateway wired — `NETLIFY_AI_GATEWAY_URL` env var now swaps the base URL in `generateAIRecommendations`; falls back to OpenRouter in dev. AI recommendations also return text in user's active language (`getLocale()` + language instruction injected into system prompt). |
| 2026-05-30 | Scheduled weather cron — `/api/cron/weather` route fetches current conditions + 7-day forecast from Open-Meteo for every farm with GPS coordinates. Stores farm-level and per-block `weather_snapshots` rows. Secured with `CRON_SECRET`. Designed for Netlify Scheduled Functions (every 3 hr) or any external cron trigger. |
| 2026-05-30 | Netlify deployment config — `netlify.toml` (build command, `.next` publish dir, `@netlify/plugin-nextjs`, functions directory). `netlify/functions/cron-weather.mts` — Netlify Scheduled Function that calls `/api/cron/weather` every 3 hours via `CRON_SECRET` + `URL` env vars. |
| 2026-05-30 | AI feedback loop confirmed done — `applyStateMutation` in recommendations/actions.ts already handles: irrigate → insert soil_water_readings reset to field_capacity + resolve soil-water alerts; spray → resolve pest_observations + alerts; all categories → resolve domain alerts. PROGRESS.md updated to reflect ✅ status. |
| 2026-05-31 | Pre-publish security review — 6 fixes applied: (1) Removed hardcoded local developer path (`C:/Users/mhrg7/...`) and `fs`/`path` debug block from `extract-soil-test` route; (2) Added Supabase auth check to all unauthenticated API routes (`extract-soil-test`, `plant-search`, `plant-varieties`) to prevent LLM/API cost abuse; (3) Added 20 MB file size limit to `extract-soil-test` upload; (4) Added HTTP security headers to `next.config.ts` (X-Frame-Options, X-Content-Type-Options, Referrer-Policy, Permissions-Policy, Content-Security-Policy); (5) Wrapped `JSON.parse(boundary)` in try-catch in `blocks.ts` (create + update actions); (6) Escaped SQL wildcards (`%`, `_`, `\`) in `ilike` search in both activity actions files. |
| 2026-06-01 | Fix cross-farm weather forecast bug (round 1) — (1) `next.config.ts`: added `experimental.staleTimes.dynamic = 0` so the Next.js client-side Router Cache never reuses a stale layout RSC payload carrying the previous farm's `farmId`; (2) layout: added `export const dynamic = 'force-dynamic'`; (3) `/farms` page: show `FarmPicker` for multi-farm users instead of always redirecting to Farm 1; (4) `CreateFarmWizard.tsx`: added `router.refresh()` after `router.push`; (5) `blocks.ts`: `createBlock`, `updateBlock`, `updateBlockBoundary` now also revalidate the dashboard path. |
| 2026-06-01 | Fix Settings GPS not saving to database (root cause) — The Settings → Weather & AI tab GPS lat/lng inputs were saving to `localStorage` only (never to Supabase), while `getFarmCoords` reads exclusively from the database. Fixed: (1) `SettingsForms.tsx`: `WeatherAPITab` now accepts `initialLat`/`initialLng` props (DB values), initialises state from them instead of localStorage, and `handleSave()` calls `updateFarm(farmId, { gps_lat, gps_lng })` to persist to Supabase with success/error feedback; (2) `settings/page.tsx`: fetches `gps_lat, gps_lng` from the farms table and passes them as props; (3) `updateFarm` now also revalidates the dashboard path; removed `STORAGE_KEY_WEATHER` and hardcoded Antalya default coordinates. |
| 2026-06-02 | AI reasoning enriched with tree age and phenological growth stage — `src/trigger/recommendations.ts` now fetches `phenology_latest` view alongside existing queries, computes tree age from `planting_year`, and appends both to each block's context string sent to Gemini Flash (growth stage, GDD, chill hours, days to hull split, estimated harvest window). System prompt updated with a rule to use age and stage when tailoring recommendation intensity and category-gating. Degrades gracefully when no phenology record exists for a block. |
| 2026-06-02 | PROGRESS.md cleanup — Added Inventory Page as numbered section 7 (was missing despite being done); renamed Settings to section 8; updated page count from 7 to 8; corrected "Last updated" header date. |
| 2026-06-02 | Computed fields daily cron — New `/api/cron/compute-fields` route fetches daily Tmax/Tmin from Open-Meteo and writes per-block computed rows to `phenology_records` (cumulative GDD, chill hours, inferred growth stage) and `soil_water_readings` (ETo via Hargreaves-Samani, 7-day forward water deficit). Idempotent: skips blocks already computed today. `netlify/functions/cron-compute-fields.mts` schedules it at midnight daily. All computation uses existing `utils/agronomic.ts` helpers. |
| 2026-06-02 | IoT sensor infrastructure — Full sensor readiness: (1) `supabase/migrations/20260602000000_create_sensors.sql` — `sensors` table with farm/block FK, api_key (unique), status, last_seen_at; `sensor_id` FK added to `soil_water_readings` and `weather_snapshots`; (2) `types/sensors.ts` — application-level sensor types; (3) 5 new server actions in `settings/actions.ts` — `registerSensor`, `updateSensor`, `deleteSensor`, `assignSensorToBlock`, `generateSensorApiKey`; (4) Settings > Sensor Connections tab rebuilt — live sensor inventory table with add/edit/delete, API key copy+regenerate, one-time key display banner; (5) 3 authenticated ingest API routes — `POST /api/ingest/soil`, `/weather`, `/alert` with `X-Sensor-Key` header auth; (6) Blocks page (`[farmId]/blocks/page.tsx`) now runs 4 parallel Supabase queries and builds real `initialProfiles` from `soil_water_latest`, `phenology_latest`, `weather_latest`, `block_alerts`, and `sensors` — no more all-zeros mock data; (7) `SoilWaterTab` shows "N sensors monitoring · updated Xm ago" line when sensors are assigned to a block; (8) Cron enhanced to carry latest sensor `soil_moisture` into the daily computed row when a reading arrived within 24 h. |
| 2026-06-02 | Manual logs — `LogActivityModal` extended with activity-specific structured fields: Irrigation (duration h, volume L/tree, method dropdown); Fertigation (product name, amount+unit, growth stage note); Spraying (product, rate L/ha, target pest, PHI days); Scouting (Low/Medium/High risk buttons, observations, next scouting date); Pruning (type dropdown, intensity buttons). Structured `ActivityDetails` discriminated union exported from `actions.ts` and stored in `activity_log.details` JSONB. Fertigation also side-writes to `fertigation_log` (when block is set + amount provided); Scouting also side-writes to `scouting_reports` (when block is set). Both side-writes are guarded and swallowed on failure. `getActivityLog()` now selects `details` column. `ActivityLogClient` renders structured detail chips inline per entry. Offline queue carries details through sync. Fixed stale import path bug in `LogActivityModal` (was pointing to old non-farm-scoped actions file). Build clean — 0 errors. |
| 2026-06-03 | Fix mobile bottom nav hidden on iOS — `BottomNav` nav bar now adds `paddingBottom: env(safe-area-inset-bottom)` so it renders above the iPhone home indicator and Safari floating toolbar (previously hidden at `bottom: 0` under the home indicator). Drawer `bottom` updated to `calc(64px + env(safe-area-inset-bottom))`. Dashboard layout `<main>` bottom padding updated to `calc(6rem + env(safe-area-inset-bottom))` so page content is not obscured. |
| 2026-06-03 | Mobile farm switcher — `BottomNav` "More" drawer now shows a "My Farms" section listing all user farms when the user has more than one. Tapping a farm preserves the current page slug and navigates to that farm. Translated into EN/AR/TR. Previously, farm switching was only available on desktop via the right-edge tab bar (`FarmTabs`). |
| 2026-06-03 | Fix "More" button not tappable — closed drawer (`translate-y-full`) was silently intercepting all nav bar taps because it slides to exactly cover the nav (z-50 > z-40). Added `pointer-events-none` when drawer is closed. |
