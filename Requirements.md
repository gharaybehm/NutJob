
What it is
An AI-powered farm management system for a multi-block almond farm. It continuously ingests sensor data, weather feeds, and manual field inputs, maintains a live state per block, and uses an AI reasoning engine to generate prioritised agronomic recommendations that the farm manager can accept, edit, or skip.

Architecture
Four layers working in a continuous loop: data ingestion → block state store → AI reasoning engine → recommendations and action log. The feedback loop closes when the manager logs what was actually done, writing back into the block state to inform future recommendations.

Data sources
The system ingests from four source types: in-field sensors (soil moisture, EC, temperature, humidity, wind, rainfall) updating every 15 minutes; weather forecast APIs updating every 3 hours; manual logs entered by the farm manager per event or weekly (irrigation runs, fertigation, spray applications, scouting observations, tissue samples); and computed fields derived from the above (ETo, water deficit, GDD, chill hours, risk indices).

Interface — 7 pages
Login — email + password with remember me
Dashboard — command center with four top metrics, 7-day weather strip, active alerts panel, block status grid (green/amber/red health status per block), upcoming calendar widget, and recent activity feed
Blocks — per-block live profile across all five agronomic domains (soil & water, phenology, nutrition, pest & disease, weather) with inline alerts and source attribution
Calendar — month/week/day toggle, colour-coded events by activity type, ability to add events and log completions directly from entries
Recommendations — AI-generated action cards filterable by category (irrigate, fertilize, spray, scout), each showing the action, rationale, and confidence score, with accept / edit / skip controls
Activity log — searchable and filterable history of all actions taken across all blocks
Settings — block configuration, sensor connections, weather API, irrigation controller (future integration), notification preferences, and team/user management

Navigation — top nav bar, fully responsive for desktop and mobile field use