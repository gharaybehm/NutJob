
What it is
An AI-powered farm management system for a multi-block almond farm. It continuously ingests sensor data, weather feeds, and manual field inputs, maintains a live state per block, and uses an AI reasoning engine to generate prioritised agronomic recommendations that the farm manager can accept, edit, or skip.

Architecture
Four layers working in a continuous loop: data ingestion → block state store → AI reasoning engine → recommendations and action log. The feedback loop closes when the manager logs what was actually done, writing back into the block state to inform future recommendations.

Data sources
The system ingests from four source types: in-field sensors (soil moisture, EC, temperature, humidity, wind, rainfall) updating every 15 minutes; weather forecast APIs updating every 3 hours; manual logs entered by the farm manager per event or weekly (irrigation runs, fertigation, spray applications, scouting observations, tissue samples), also initial data about the blocks (tree age, rootstock, soil and water test results to be uploaded in pdf format, and the system will extract the data from the pdf and store it in the database); and computed fields derived from the above (ETo, water deficit, GDD, chill hours, risk indices).

Interface — 7 pages
Login — email + password with remember me, there will be multiple users permissions for different modules within the applications, such as admin, worker who can only log activities, supervisor who can change different activities and add new activities, etc. After login, users with access to multiple farms will see a farm selector screen before reaching the dashboard; switching farms is available at any time from the top navigation bar without re-authenticating.
Dashboard — command center with four top metrics, 7-day weather strip, active alerts panel, block status grid (green/amber/red health status per block), upcoming calendar widget, and recent activity feed
Blocks — i want to upload an actual map of the farm, divide into physical blocks, each with the type and variety of tree/crop so the user can have a visual understanding on where he's working and on which tree per-block live profile across all five agronomic domains (soil & water, phenology, nutrition, pest & disease, weather) with inline alerts and source attribution. when creating the blocks, admin will feed the type of tree, date of planting and other relevant information ONCE to keep track of progress.
Calendar — month/week/day toggle, colour-coded events by activity type, ability to add events and log completions directly from entries. Calendar will include irrigation times, hours of run, litre/tree (for example from June to October you might run irrigation for 4 hours x 2 litres/ tree every 2 weeks) Fertigation times, type of fertilizer based on tree growth stage, amount of fertilizer. Spraying times, type of pesticide based on pest and disease pressure, amount of pesticide. Pruning, type of pruning based on tree growth stage after harvest (November to February)
Recommendations — AI-generated action cards filterable by category (irrigate, fertilize, spray, scout), each showing the action, rationale, and confidence score, with accept / edit / skip controls
Activity log — searchable and filterable history of all actions taken across all blocks
Settings — block configuration, sensor connections, weather API, irrigation controller (future integration), notification preferences, and team/user management

Navigation — top nav bar, fully responsive for desktop and mobile field use

Multi-farm support
A single login can own or be granted access to multiple farms. Each farm is a fully independent instance of the portal (its own blocks, calendar, inventory, recommendations, activity log, and settings). Permissions (admin/supervisor/worker) are scoped per farm, so a user can be admin on one farm and worker on another. All data, sensor feeds, and AI recommendations are isolated per farm with no cross-farm data leakage.

B2B multi-farm subscription (planned — not yet implemented)
To support B2B clients (e.g. agricultural groups or consultants managing many farms), the system will introduce an organisation layer above farms. An organisation is the billing entity: it holds a Stripe customer and subscription, and all farms created under it are billed at a per-farm seat rate (quantity-based Stripe subscription). Key design decisions: (1) Organisation table — id, name, slug, billing_email, stripe_customer_id, stripe_subscription_id, subscription_status, farm_seats, created_by. (2) Organisation members table — maps users to orgs with roles: owner (billing access), admin (farm management), member. (3) Farms gain an organization_id FK. (4) Farm creation is gated: org must have an active or trialing subscription and the current farm count must be below farm_seats; creating a new farm beyond the current seat count triggers a Stripe quantity upgrade (prorated). (5) A Stripe webhook handler syncs subscription_status and farm_seats on checkout, upgrade, payment failure, and cancellation. (6) Past-due orgs get a banner and a grace period before farms go read-only; cancelled orgs do not lose data. (7) The first farm is free for 14 days (trialing) to reduce onboarding friction. (8) A Billing page in Settings lets the org owner open the Stripe Customer Portal to manage payment method, view invoices, and upgrade/downgrade seats. Rollout is phased: Phase 1 adds the organisation data model and replaces the hardcoded farm limit; Phase 2 adds Stripe checkout and webhooks; Phase 3 adds org-level team management and a cross-farm dashboard.

Localisation
The application must support three languages: English, Arabic, and Turkish. The active language is set per user in their profile settings and persists across sessions. Arabic requires full RTL (right-to-left) layout mirroring — navigation, cards, tables, modals, and form fields must all flip correctly. Number formatting, date formats, and calendar week-start day must adapt to locale conventions. All UI strings, labels, error messages, and system-generated content (alerts, recommendation text, activity summaries) must be translatable; AI-generated agronomic recommendations should be returned in the user's active language where the underlying model supports it.

Mobile optimisation
The application is a primary field tool and must be fully usable on a smartphone browser without a native app install. Requirements: touch-friendly tap targets (minimum 44 × 44 px), bottom navigation bar on small screens replacing the top nav, swipe gestures for switching between blocks and calendar views, offline-capable reads (service worker caches the last-loaded dashboard, block profiles, and today's calendar so the manager can view data in poor-connectivity fields), background sync for activity log entries made offline, and lazy-loading of images and chart data to keep initial load under 3 seconds on a 4G connection.

Tech stack
Frontend - nextjs + tailwindcss
backend - netlify with nextjs app router
database and authentication - supabase
AI LLM - netlify AI gateway
Design reference - design.png