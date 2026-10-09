# Nut Job — Crop-Agnostic Farm Decision Support System (CDSS) Specification

**Version:** 3.0 (supersedes v2, the almond-only engine spec, and the v1 "Orchard Agronomy and AI Decision Support System Specification")
**Scope:** A crop-agnostic farm management decision engine. All crop-specific science (thresholds, models, varieties, decision tables) is delivered as downloadable **Crop Knowledge Packs**.
**First reference pack:** Almond (*Prunus dulcis*), varieties Makako and Vairo.
**Build target:** Antigravity, Python backend.

---

## How this document is organised

| Part | Contents | Crop-specific? |
|---|---|---|
| **A — Platform** | Layers, data tiers, science core, engine framework, the 12 decision engines, arbitrator, narrator, safeguards, log, shadow mode, learning loop | No. Must contain **no crop numbers in code**. |
| **B — Crop Knowledge Packs** | What a pack must contain, validation, versioning, install and update | Defines the container only |
| **C — Almond Reference Pack** | The first pack's content: Makako and Vairo | Yes |
| **D — Interface & Build** | Interface changes, build phases, acceptance | No |

**The golden rule for the build:** if a number, threshold, pest name, variety name or phenology stage appears in platform code, it is a defect. It belongs in a pack.

---

# PART A — PLATFORM (CROP-AGNOSTIC)

## A0. System Context & Purpose

You are an expert agricultural software engineer building the recommendation engine for Nut Job, an AI-assisted farm management system for any perennial or annual crop.

Recommendations must be **scientific, traceable and auditable**. The platform provides generic machinery: calculators, decision engines, an optimiser, logging and learning. The scientific content comes from the Crop Knowledge Pack installed for each crop. To prevent LLM hallucination in physical farm operations, the engine is split into five layers. Each layer has one job, and no layer may do another layer's job.

| # | Layer | Job | May NOT |
|---|---|---|---|
| 1 | **Science Core** | Generic calculators (ET₀, water balance, degree-days, chill and heat, plant water status, infection values, frost risk, salinity, nutrient budgets). Each one is parameterised by the pack. | Recommend actions |
| 2 | **Decision Engines** | 12 generic engines (§A6). Each applies the pack's decision tables to the block state and proposes actions in a standard format. | Talk to the farmer directly, or bypass the arbitrator |
| 3 | **Arbitrator** | Chooses which proposed actions run, and when, within labour, water, equipment and legal limits, by maximising expected loss avoided | Invent actions or change engine numbers |
| 4 | **LLM Narrator** | Explains the plan, flags conflicting signals, asks for missing observations, drafts task text | Generate or alter any number, threshold or schedule |
| 5 | **Hard Safeguards** | Fixed protective rules that override everything above. The rules live in platform code; their limits come from the pack, product labels and equipment specs. | Learn, be tuned by the learning loop, or be disabled by a prompt |

Two cross-cutting systems sit around these layers:
- **Recommendation Log & Shadow Mode** (§A11): every recommendation is recorded with its inputs, rule, pack version and outcome.
- **Learning Loop** (§A11.3): calibrates pack parameters per farm, block and variety from logged outcomes. It never rewrites rules.

**Governing principle:** the farm manager or agronomist has the final say. The engine recommends; humans accept, edit or skip.

## A1. Crop Binding

- R1.1 A farm has one or more **blocks**. Each block is bound to exactly one **crop pack** and one **variety** (or variety mix) from that pack, plus a planting year, spacing, irrigation system and soil profile.
- R1.2 A farm may run several crops at once. Each block uses its own pack. The arbitrator plans across all blocks and crops together, since they share labour, water and equipment.
- R1.3 Engines discover what a crop needs from its pack. If a pack does not provide content for an engine (for example, no chill model for an annual crop), that engine is **inactive** for those blocks and says so. It does not fail.
- R1.4 Changing a block's pack version is an explicit, logged action. Recommendations always record the pack version that produced them.

## A2. Data Tiers (Slow / Medium / Fast)

| Tier | Cadence | Examples (generic) | Role in the engine |
|---|---|---|---|
| **Fast** | Minutes–hourly | Weather station (T, RH, wind, solar radiation, rain, leaf wetness), soil moisture and EC probes, flow meters, valve and pump states, fertigation injector EC/pH | Drives daily state: ET₀, water balance, degree-days, chill and heat, infection values, frost risk |
| **Medium** | Days–weekly | Pest trap counts, plant water status readings, phenology scouting (BBCH), disease and pest scouting, fruit set and fruit counts | Calibrates and triggers: biofix, stress verification, phenology gates, yield forecast |
| **Slow** | Seasonal–yearly | Soil texture and water holding capacity, soil and water chemistry, leaf/tissue analysis, yield and quality per block, canopy cover and height | Sets parameters: TAW, Kc curve, nutrient budget, salinity status, damage history |

**Requirements**
- R2.1 Every fast-data reading passes sensor validation (§A10.1) before it enters the state.
- R2.2 Medium data is entered through forms in the app (§D1). **The pack defines which observations the forms ask for** (trap types, phenology scale, scouting targets). Each entry records who entered it and when.
- R2.3 Every computed state value carries a freshness flag: the age of the oldest input it depends on.
- R2.4 Units: store temperature internally in °C and mass and area in SI units. A pack may declare that a model is defined in other units (for example °F degree-days). The platform converts at the model boundary and labels outputs with their units.

## A3. Core Dependencies

| Package | Purpose | Notes |
|---|---|---|
| `pyet` (≥1.5) | FAO-56 Penman-Monteith ET₀ | Do **not** use `pyeto`. |
| `pyfao56` (≥1.4) | FAO-56 dual crop coefficient daily soil water balance, with measured soil water input | USDA-ARS |
| `numpy`, `pandas` | Vector maths, time series | |
| `ortools` (≥9) | Arbitrator (CP-SAT) | |
| Rules evaluator | Evaluates pack decision tables (YAML, DMN-style, first-hit) | Small in-house module |
| Pack loader/validator | Installs, verifies and versions Crop Knowledge Packs | §B |

## A4. Science Core (Generic Calculators)

Every calculator is crop-agnostic. Crop-specific inputs are named below as **"from pack"**.

### A4.1 Reference Evapotranspiration (ET₀)

```python
import numpy as np
import pandas as pd
import pyet

def compute_et0_daily(weather: pd.DataFrame, elevation_m: float, latitude_deg: float) -> pd.Series:
    """
    FAO-56 Penman-Monteith reference ET (mm/day). Crop-independent.
    weather: daily DataFrame with DatetimeIndex and columns
        tmean, tmax, tmin [°C], rhmax, rhmin [%], wind_2m [m/s], rs [MJ m-2 d-1]
    If wind is measured at another height, convert to 2 m first (FAO-56 Eq. 47).
    """
    return pyet.pm_fao56(
        tmean=weather["tmean"], wind=weather["wind_2m"], rs=weather["rs"],
        tmax=weather["tmax"], tmin=weather["tmin"],
        rhmax=weather["rhmax"], rhmin=weather["rhmin"],
        elevation=elevation_m, lat=np.radians(latitude_deg),
    )
```

**Acceptance test A4.1:** FAO-56 Example 18 (Brussels, 6 July: tmax 21.5, tmin 12.3, RHmax 84, RHmin 63, u₂ 2.078 m/s, n = 9.25 h, lat 50.8°N, elevation 100 m), run with `n` in place of `rs`. Expected ET₀ = 3.9 ± 0.1 mm/day. (Verified: pyet 1.5 returns 3.88.)

### A4.2 Crop Coefficient & Soil Water Balance

- Use the FAO-56 **dual crop coefficient** method via `pyfao56` (Kc = Kcb·Ks + Ke).
- **From pack:** Kcb curve by growth stage, or the Allen & Pereira (2009) density-coefficient parameters for deriving Kcb from fraction of ground cover (fc) and height (h); depletion fraction p; root depth by age or stage.
- **From the block:** fc, h, wetted fraction fw, cover crop, soil profile (TAW).
- Recompute Kcb whenever fc or h are re-measured. Young perennial crops change fast.
- **Sensor fusion:** validated soil probe readings feed the balance through pyfao56's measured-soil-water tools. Persistent model–sensor gaps raise `MODEL_SENSOR_DIVERGENCE`. That flag goes to the learning loop and the narrator; it never triggers irrigation on its own.
- **Output per block per day:** ET₀, ETc, Dr (root-zone depletion), RAW, TAW, Ks, freshness flags.

### A4.3 Degree-Days (method registry)

Every pest, disease or phenology model in a pack declares its **method** (single sine, single triangle, averaging), its **cutoff** (horizontal, vertical, intermediate), its **thresholds** and its **units**. A model is only valid with the method it was built on. The default and reference method is single sine with horizontal cutoff (Zalom et al. 1983, as used by UC IPM).

```python
import math

def degree_days_single_sine(tmin: float, tmax: float, lower: float, upper: float) -> float:
    """
    Daily degree-days, single-sine method, horizontal upper cutoff (Zalom et al. 1983).
    Units must match the model thresholds declared in the pack.
    """
    if tmax < tmin:
        raise ValueError("tmax < tmin")
    if tmax <= lower:
        return 0.0
    if tmin >= upper:
        return upper - lower
    m = (tmax + tmin) / 2.0
    a = (tmax - tmin) / 2.0
    if tmin >= lower and tmax <= upper:          # entirely between thresholds
        return m - lower
    if tmin < lower and tmax <= upper:           # crosses lower only
        t1 = math.asin((lower - m) / a)
        return ((m - lower) * (math.pi / 2 - t1) + a * math.cos(t1)) / math.pi
    if tmin >= lower and tmax > upper:           # crosses upper only
        t2 = math.asin((upper - m) / a)
        return ((m - lower) * (t2 + math.pi / 2)
                + (upper - lower) * (math.pi / 2 - t2)
                - a * math.cos(t2)) / math.pi
    t1 = math.asin((lower - m) / a)              # crosses both
    t2 = math.asin((upper - m) / a)
    return ((m - lower) * (t2 - t1)
            + a * (math.cos(t1) - math.cos(t2))
            + (upper - lower) * (math.pi / 2 - t2)) / math.pi
```

**Acceptance tests A4.3** (UC IPM published table, thresholds 43/78 °F):

| tmax °F | tmin °F | expected DD |
|---|---|---|
| 60 | 48 | 11 |
| 60 | 34 | 6 |
| 72 | 34 | 12 |
| 50 | 34 | 2 |
| 66 | 40 | 10 |

Rounded results must match. Values just above and just below each threshold boundary must differ by less than 0.01. Implement single triangle and averaging alongside, with their own tests, for packs that declare them.

### A4.4 Chill & Heat Models

- Provide **Dynamic Model** chill portions (Fishman et al. 1987), **Utah** chill units, and **chill hours** (< 7.2 °C). The pack chooses which model each variety's requirement is expressed in.
- Provide **Growing Degree Hours (GDH)** for heat accumulation to bloom.
- If hourly data is missing, reconstruct hourly temperatures from daily tmin and tmax with an idealised daily curve, and flag the result.

```python
import math

def chill_portions_dynamic(hourly_temps_c):
    """
    Dynamic Model (Fishman et al. 1987), as implemented in chillR::Dynamic_Model.
    Returns the cumulative chill portions at each hour. Crop-independent.
    """
    e0, e1, a0, a1, slp, tetmlt = 4153.5, 12888.8, 139500.0, 2.567e18, 1.6, 277.0
    aa, ee = a0 / a1, e1 - e0
    x_prev, xi_prev, cp, out = 0.0, 0.0, 0.0, []
    for t in hourly_temps_c:
        tk = t + 273.0
        sr = math.exp(slp * tetmlt * (tk - tetmlt) / tk)
        xi = sr / (1 + sr)
        xs = aa * math.exp(ee / tk)
        ak1 = a1 * math.exp(-e1 / tk)
        s = x_prev if x_prev < 1 else x_prev * (1 - xi_prev)
        x = xs - (xs - s) * math.exp(-ak1)
        if x >= 1:
            cp += x * xi
        out.append(cp)
        x_prev, xi_prev = x, xi
    return out
```

(The constants above are the model's own, not crop parameters.)

**Acceptance tests A4.4:**
- Constant 6 °C for 240 h gives about 7.8 CP. Constant 15 °C for 240 h gives 0 CP.
- Before go-live, cross-check one full winter of local hourly data against R `chillR`. Results must agree within 0.5 CP.

### A4.5 Plant Water Status Baseline

- Generic calculator: given a reading (stem/leaf water potential, trunk diameter variation, or canopy temperature) and the weather at reading time, return the **non-stressed baseline** and the **deviation** (reading − baseline).
- **From pack:** the indicator type, the baseline equation and its coefficients, and the unit.
- If the pack provides no baseline, the engine uses absolute thresholds from the pack instead and flags reduced confidence.

### A4.6 Infection Value Engine (disease risk)

A generic evaluator for leaf-wetness × temperature disease models (TOMCAST-style DSV tables, Mills-type tables, and similar).

- **From pack, per disease model:** temperature bands, a wetness-hours → risk-value lookup per band, the event separation rule (dry hours that split events), the daily aggregation (max or sum), the accumulation window (e.g. rolling 7 days), the action threshold(s), reset-on-spray behaviour, and the phenology window when the model is active.

```python
def infection_value_for_day(hourly, model):
    """
    hourly: list of (temp, is_wet) for the evaluation window, in the model's units.
    model: pack dict with 'bands' [{'tmin','tmax','steps':[[min_wet_hours, value], ...]}],
           'dry_hours_split', 'aggregate' ('max' | 'sum').
    Returns the day's infection value.
    """
    events, cur, dry = [], [], 0
    for t, wet in hourly:
        if wet:
            if dry >= model["dry_hours_split"] and cur:
                events.append(cur); cur = []
            cur.append(t); dry = 0
        else:
            dry += 1
    if cur:
        events.append(cur)

    values = []
    for ev in events:
        hours, mean_t = len(ev), sum(ev) / len(ev)
        v = 0
        for band in model["bands"]:
            if band["tmin"] <= mean_t < band["tmax"]:
                for min_h, val in band["steps"]:
                    if hours >= min_h:
                        v = val
        values.append(v)
    if not values:
        return 0
    return max(values) if model["aggregate"] == "max" else sum(values)
```

**Acceptance test A4.6:** using the almond Alternaria DSV table (§C6.2): 10 wet hours at a mean of 70 °F gives 2; 22 wet hours at 70 °F gives 4; 5 wet hours at 60 °F gives 0.

### A4.7 Frost Risk Calculator

- Inputs: forecast hourly minimum temperature (with forecast uncertainty), current phenology stage per block, dew point, wind, sky cover (for radiative-frost and inversion likelihood).
- **From pack:** critical temperatures per phenology stage, at one or more damage levels (e.g. 10% and 90% kill, or "tolerated for 30 minutes"), and the duration basis of each value.
- Output per block per night: lowest forecast temperature, margin to the critical temperature for the current stage, risk level (none / watch / warning / critical), and expected damage fraction where the pack gives two damage levels (linear interpolation between them).

### A4.8 Salinity & Leaching

- Relative yield (Maas–Hoffman): `Yr = 100 − b·(ECe − a)`, capped to 0–100. **From pack:** threshold `a` (dS/m) and slope `b` (% per dS/m).
- Leaching requirement (FAO Irrigation & Drainage Paper 29): `LR = ECw / (5·ECe_target − ECw)`, where ECe_target defaults to the pack's threshold `a`.
- Inputs: irrigation water EC (lab or inline sensor), soil ECe (lab) or estimated from soil-probe bulk EC with a site calibration.

```python
def relative_yield_pct(ece, threshold_a, slope_b):
    return max(0.0, min(100.0, 100.0 - slope_b * max(0.0, ece - threshold_a)))

def leaching_requirement(ecw, ece_target):
    if ecw >= 5 * ece_target:
        raise ValueError("Water too saline for target ECe")
    return ecw / (5 * ece_target - ecw)
```

**Acceptance tests A4.8:** a = 1.5, b = 19, ECe = 3.0 gives Yr = 71.5%. ECw = 1.2 with ECe_target = 1.5 gives LR ≈ 0.19.

### A4.9 Nutrient Budget Calculator

- Annual demand = (expected yield × removal per unit yield) + (structural growth requirement for the tree/crop age) − credits (nitrogen in irrigation water, residual soil N, organic inputs) ÷ fertiliser use efficiency.
- **From pack:** removal coefficients per nutrient per unit of harvested product; growth requirement by age; phenological split of the annual demand; leaf/tissue sampling protocol and the deficient / adequate / excessive bands.
- **From the farm:** expected yield (from the Yield Forecast engine), water nitrate analysis, soil analysis, efficiency of the fertigation system.

```python
def annual_nutrient_demand_kg_ha(expected_yield_kg_ha, removal_kg_per_kg, growth_kg_ha=0.0,
                                 credits_kg_ha=0.0, efficiency=0.7):
    need = expected_yield_kg_ha * removal_kg_per_kg + growth_kg_ha - credits_kg_ha
    return max(0.0, need) / efficiency

def split_by_phase(annual_kg_ha, phase_shares):
    """phase_shares: pack dict {phase_name: fraction}; fractions must sum to 1."""
    if abs(sum(phase_shares.values()) - 1.0) > 1e-6:
        raise ValueError("phase shares must sum to 1")
    return {p: annual_kg_ha * s for p, s in phase_shares.items()}
```

## A5. Engine Framework

### A5.1 Engine Contract (interface every engine implements)

```python
from typing import Protocol

class DecisionEngine(Protocol):
    engine_id: str               # e.g. "irrigation", "insect_pest", "frost"
    engine_class: str            # "continuous" (daily) or "seasonal" (plans a calendar + weather triggers)

    def pack_requirements(self) -> list[str]:
        """Pack sections this engine needs (e.g. 'irrigation.table', 'frost.critical_temps').
        Missing sections make the engine inactive for that crop, with a visible reason."""

    def required_state(self) -> list[str]:
        """State keys this engine reads (e.g. 'Dr', 'RAW', 'bbch', 'dd[model_id]')."""

    def evaluate(self, block_id: str, state: dict, pack: "PackContext", today) -> list[dict]:
        """Return zero or more ProposedAction dicts (fields below)."""

    def safeguards(self) -> list[str]:
        """IDs of the hard safeguards (§A10) that apply to this engine's actions."""
```

`PackContext` gives the engine read-only access to the block's pack: its decision tables, models and parameters, with this farm's calibrated values applied.

### A5.2 ProposedAction (fields every engine outputs)

| Field | Meaning |
|---|---|
| `action_id` | Unique ID |
| `engine_id`, `rule_id`, `pack_id`, `pack_version` | Which engine, which decision-table row, which pack version |
| `block_id`, `action_type`, `description` | What to do, and where |
| `quantity` + `unit` | e.g. 22 mm, 18 kg N/ha, 1 spray application |
| `earliest_day`, `latest_day` | Window in days from today |
| `expected_loss_avoided` | Money value (local currency) if done inside the window |
| `delay_cost_per_day` | Value lost per day of delay within the window |
| `cost` | Direct cost: materials, energy, contractor |
| `labour_hrs`, `water_m3`, `equipment` | Resources consumed |
| `confidence` | 0–1. Lowered automatically when inputs are stale, flagged or uncalibrated |
| `mandatory` | True only when a safeguard or legal requirement demands it |
| `inputs_snapshot` | The exact state values the rule used |
| `evidence` | Source citation from the pack row |
| `expected_outcome` | What should be observed if the action is right, and when |

### A5.3 Expected Loss Avoided (common currency)

Every engine expresses value in money, following the Stern/Pedigo **Economic Injury Level** logic: act only when the projected loss avoided exceeds the cost of acting.

`expected_loss_avoided = projected_loss_if_no_action × efficacy_of_action`

- Projected loss = expected yield (Yield Forecast engine) × price (farm setting) × the pack's **damage function** for that risk.
- An action whose `expected_loss_avoided ≤ cost` is downgraded to "Monitor" and not sent to the arbitrator.
- Risks that should never be traded against money (food safety, legal limits, water quotas) are declared by the pack or farm as **constraints**, not money (§A8).

### A5.4 Decision Tables (Matrix 1)

- Rules live in the pack as versioned YAML decision tables with a **first-hit** policy: rows are checked top to bottom, and the first matching row fires.
- Every row has an ID, conditions, an action and evidence.
- Thresholds are references to pack parameters (`$param_name`), never literals. This lets the learning loop calibrate them per farm.
- The platform evaluator supports: comparisons, ranges, set membership (`phase_in`), derived expressions on state keys, and references to other engines' published state (couplings).
- The evaluator logs which row fired, the input values, the pack version and the farm's calibrated parameter values.

### A5.5 Engine Classes

- **Continuous engines** evaluate every day (and after relevant data arrives): irrigation, fertigation & nutrition, salinity, frost, insect pest, disease, phenology.
- **Seasonal engines** produce a **season plan** of dated tasks from pack templates, adjust dates using phenology and weather, and fire weather-triggered changes: pollination, canopy & pruning, weed & groundcover, yield forecast, harvest.
- Both classes emit the same ProposedAction format and go through the same arbitrator, log and learning loop.

## A6. Engine Catalogue (12 generic engines)

Each entry lists: purpose, class, generic logic, **what the pack must supply**, outputs, safeguards and couplings. None of these contain crop numbers; those are in Part C for almond.

### A6.1 Phenology & Dormancy Engine (continuous; the "clock" for all others)

- **Purpose:** maintain each block's current phenology stage and predict upcoming stages (end of dormancy, bloom, fruit set, key development events, harvest maturity).
- **Logic:** observed stage (scouting) overrides predicted. Prediction uses chill and heat accumulation (§A4.4) and degree-day stage models (§A4.3). Emits observation requests when a predicted transition is near or scouting is overdue.
- **Pack supplies:** phenology scale (BBCH codes or crop-specific scale) with stage names; chill model and requirement per variety; heat requirement (GDH or DD) to bloom per variety; DD or day-count models for later stages; the mapping from stages to the **phases** other engines use (e.g. `kernel_fill`, `hull_split`).
- **Outputs:** `bbch`, `phase`, predicted dates with uncertainty, `chill_progress`, `heat_progress`. Actions are mostly observation requests ("scout bloom stage, Block 2").
- **Couplings:** publishes `phase` to all engines.

### A6.2 Irrigation Engine (continuous)

- **Purpose:** decide when and how much to irrigate each block, including deficit irrigation strategies.
- **Generic decision skeleton** (row order is fixed by the platform template; thresholds and phases come from the pack):
  1. Inactive phase (e.g. dormant) → no action
  2. Forecast rain refills the root zone → defer
  3. Deficit-strategy phase and plant-water-status reading below the strategy floor → irrigate (strategy fraction)
  4. Deficit-strategy phase → irrigate partial (strategy fraction of ETc)
  5. Depletion ≥ RAW → irrigate to refill (÷ efficiency, plus leaching fraction from §A6.4)
  6. Plant-water-status deviation beyond trigger while depletion < RAW → irrigate and flag `MODEL_SENSOR_DIVERGENCE`
  7. Otherwise → hold
- **Pack supplies:** Kcb or A&P parameters, p, root depth, plant-water-status indicator and baseline, trigger deviation, deficit strategies (which phases, floor, fraction), rain-deferral probability, all with bounds and evidence.
- **Outputs:** irrigation volume per block, timing window, expected outcome (e.g. "water status within the target band at next reading").
- **Safeguards:** SG-IRR-1…3 (§A10.2). **Couplings:** adds leaching fraction from Salinity; supplies water volume to Fertigation; supplies water-stress state to Disease.

### A6.3 Fertigation & Nutrition Engine (continuous, budget set seasonally)

- **Purpose:** build the annual nutrient budget per block, split it across phases, schedule fertigation doses on irrigation events, and correct the budget from tissue analysis.
- **Logic:**
  1. At season start: annual demand per nutrient (§A4.9) from the yield forecast.
  2. Split by pack phase shares into a phase plan.
  3. Schedule doses: only on irrigation events scheduled by the Irrigation engine; dose concentration kept within injector and EC limits.
  4. On tissue/leaf analysis: compare to pack bands. Deficient → raise remaining-season doses (bounded); excessive → cut and flag.
  5. Re-run the budget whenever the yield forecast changes materially.
- **Pack supplies:** removal coefficients, growth requirement by age, phase shares, sampling protocol (timing, tissue, sample size), deficient / adequate / excessive bands, maximum single-dose rates, nutrient-specific notes (e.g. excess N raises a disease risk).
- **Outputs:** fertigation doses (product, kg/ha, which irrigation event), sampling requests, budget status.
- **Safeguards:** SG-FERT-1…3. **Couplings:** reads irrigation schedule and yield forecast; publishes nutrient status to Disease (e.g. excess N).

### A6.4 Salinity & Leaching Engine (continuous, slow-data driven)

- **Purpose:** track root-zone salinity risk and set the leaching fraction used by irrigation.
- **Logic:** compute expected relative yield (§A4.8) from soil ECe; compute leaching requirement from water EC; if soil ECe trends above the pack threshold, raise the leaching fraction within bounds and request soil sampling; flag specific-ion risks (Na, Cl, B) when the pack defines limits.
- **Pack supplies:** threshold `a`, slope `b`, specific-ion limits, rootstock-specific notes.
- **Outputs:** `leaching_fraction` (state, used by Irrigation), sampling requests, water-source warnings.
- **Couplings:** feeds Irrigation.

### A6.5 Frost Protection Engine (continuous; mainly in sensitive phases)

- **Purpose:** warn of frost risk per block and recommend protection measures in time to act.
- **Logic:** nightly frost risk (§A4.7) for the next 72 h. Risk level and lead time decide the action:
  - watch → check equipment and fuel, confirm crew availability
  - warning → schedule protection (wind machines, under-tree irrigation, heaters, per farm equipment)
  - critical → mandatory protection plus post-event damage scouting request
- **Pack supplies:** critical temperatures per stage and damage level, duration basis, stages when the engine is active, damage function (fraction of crop lost per degree below critical).
- **Farm supplies:** available protection equipment, its start-up thresholds and capacity.
- **Outputs:** protection actions with exact start-condition triggers, post-frost scouting requests, yield-forecast adjustment.
- **Safeguards:** SG-FRO-1…2. **Couplings:** feeds Yield Forecast; takes priority over other night-time water use.

### A6.6 Insect Pest Engine (continuous; one engine, many pest models)

- **Purpose:** for every pest model the pack declares, track development, set biofix, and time monitoring and control.
- **Logic per pest model:** biofix from trap or observation rule → degree-day accumulation (declared method) → stage events (hatch, flights) → combine with crop phenology gates and an economic threshold → monitor / prepare / treat.
- **Pack supplies, per pest:** monitoring method (trap type, density, check frequency), biofix rule, DD model (method, cutoff, thresholds, units), event DD values, phenology gates, sampling-based thresholds (e.g. shoot strikes, % infested), damage function, control options and efficacy (product classes, not brands; brands come from the local product library).
- **Outputs:** monitoring tasks, biofix events, treatment proposals with windows, expected outcomes ("trap counts fall within 7 days").
- **Safeguards:** SG-SPR-1…7. **Couplings:** phenology gates; harvest timing (late pest pressure can bring harvest forward).

### A6.7 Disease Engine (continuous; one engine, many disease models)

- **Purpose:** for every disease model the pack declares, evaluate infection risk and time preventive or curative actions.
- **Supported model types:**
  - **Infection-value models** (wetness × temperature, §A4.6) with accumulation thresholds
  - **Phenology-timed preventive programmes** (spray at defined stages, e.g. petal fall + 2–3 weeks), optionally gated by rain
  - **Cultural-risk models** driven by other engines' state (e.g. water status or nitrogen status at a sensitive phase)
- **Pack supplies, per disease:** model type and parameters, active phenology window, action thresholds, resistance-management rules (e.g. maximum consecutive uses of one FRAC group), sanitation tasks, damage function.
- **Outputs:** treatment proposals, sanitation tasks, scouting requests, cultural recommendations sent to other engines as advisory state (e.g. "mild deficit at this phase lowers risk").
- **Safeguards:** SG-SPR-1…7. **Couplings:** reads leaf wetness, irrigation (water status), fertigation (N status), phenology.

### A6.8 Pollination Engine (seasonal)

- **Purpose:** plan pollination support for the bloom period.
- **Logic:** from the pack's variety pollination requirements (self-compatible or cross-pollination, compatible pollinisers, hive density guidance) and the predicted bloom window, plan hive arrival and removal dates. During bloom, warn about weather unfavourable to pollinator flight, and veto bee-toxic sprays.
- **Pack supplies:** per variety self-compatibility, polliniser groups, hive density range (if any), bloom stages for hive arrival and removal.
- **Outputs:** hive booking and placement tasks, bloom-period spray vetoes (feeds SG-SPR-8).

### A6.9 Canopy & Pruning Engine (seasonal)

- **Purpose:** plan pruning and training work by tree age and system, and pick weather windows that limit wound infection.
- **Logic:** season plan from pack templates (by age class and training system) → schedule in the pack's allowed phases → weather gate: no pruning when rain is forecast within the pack's wound-protection window → canopy targets (fc, height, light interception) checked against measurements.
- **Pack supplies:** pruning templates by age and system, allowed phases, wound-protection dry window, canopy targets, related disease risks.
- **Outputs:** pruning tasks with weather windows, canopy measurement requests.
- **Couplings:** updates fc and h used by Irrigation (Kcb) after pruning.

### A6.10 Weed & Groundcover Engine (seasonal)

- **Purpose:** plan weed control and cover crop management (mowing, herbicide, termination) around harvest and water needs.
- **Logic:** season plan from pack templates → adjust to phenology and harvest date (e.g. clean orchard floor before ground harvest) → herbicide applications go through the same spray safeguards.
- **Pack supplies:** templates by phase, groundcover effects on Kc (link to Irrigation), harvest-floor requirements.
- **Outputs:** mowing, herbicide and cover crop tasks.
- **Safeguards:** SG-SPR-1…7. **Couplings:** cover crop presence feeds Irrigation (Kc adjustment).

### A6.11 Yield Forecast Engine (seasonal, updated through season)

- **Purpose:** keep a current expected-yield estimate per block. **Every other engine's expected loss depends on it.**
- **Logic:** prior (block history and age) → update with bloom density, fruit set counts, fruit/nut counts, unit weight samples, frost and pest/disease damage events → Bayesian update of the estimate and its uncertainty.
- **Pack supplies:** yield-component model (e.g. nuts per tree × kernel weight), sampling protocol, age-based yield curve, typical damage-to-yield relationships.
- **Outputs:** `expected_yield` with uncertainty; sampling tasks at the right stages.
- **Couplings:** feeds every engine's expected loss, Fertigation's budget and Harvest planning.

### A6.12 Harvest Engine (seasonal, weather triggered near harvest)

- **Purpose:** decide harvest timing and sequence per block, and protect product quality after harvest.
- **Logic:** maturity indicators from the pack (e.g. hull split %, moisture, colour, brix) → readiness window → adjust for pest pressure, weather risk and pre-harvest intervals of recent sprays → sequence blocks against equipment and crew → post-harvest handling rules (e.g. drying to a moisture target, maximum time before drying).
- **Pack supplies:** maturity indicators and thresholds, harvest method notes, post-harvest moisture and timing targets, quality and food-safety constraints (e.g. aflatoxin-related handling).
- **Farm supplies:** harvest equipment, crew, buyer or processing plant requirements.
- **Outputs:** harvest window per block, block sequence, pre-harvest irrigation cut-off (to Irrigation), post-harvest handling tasks.
- **Safeguards:** SG-SPR-4 (PHI), SG-HAR-1. **Couplings:** Irrigation (pre-harvest cut-off), Insect Pest (late pressure), Yield Forecast.

## A7. Cross-Engine Coupling

- Engines read each other's outputs **only through the shared block state**, never directly.
- The **platform** defines generic couplings: phase (Phenology → all), expected yield (Yield → all), leaching fraction (Salinity → Irrigation), irrigation events (Irrigation → Fertigation), fc and h (Pruning → Irrigation), frost damage (Frost → Yield), PHI (all sprays → Harvest).
- The **pack** declares crop-specific couplings as rules over state keys (e.g. "water status during phase X modifies disease Y risk"). The platform evaluates them like any decision table.

## A8. Arbitrator (Matrix 2)

Collects ProposedActions from all engines, across all blocks and crops. Solves which actions to do, and on which day, across a rolling **7-day horizon**.

**Objective:** maximise Σ (expected_loss_avoided × confidence − delay_cost_per_day × day) over chosen actions.
**Constraints:** daily labour hours, daily water allocation (and any seasonal quota), equipment availability, action windows, `mandatory` actions, safeguard vetoes, and non-monetary constraints (food safety, legal limits, certification rules).

```python
from ortools.sat.python import cp_model

def arbitrate(actions, horizon_days, labour_hrs_per_day, water_m3_per_day, vetoed=frozenset()):
    """
    actions: ProposedAction dicts (§A5.2). vetoed: set of (action_id, day) blocked by safeguards.
    Returns the chosen plan, deferred actions, and solver status. Crop-agnostic.
    """
    m = cp_model.CpModel()
    x = {}
    for a in actions:
        days = [d for d in range(horizon_days)
                if a["earliest_day"] <= d <= a["latest_day"] and (a["action_id"], d) not in vetoed]
        for d in days:
            x[a["action_id"], d] = m.NewBoolVar(f'{a["action_id"]}_{d}')
        chosen = sum(x[a["action_id"], d] for d in days)
        m.Add(chosen == 1) if a.get("mandatory") else m.Add(chosen <= 1)

    by_id = {a["action_id"]: a for a in actions}
    for d in range(horizon_days):
        today = [(by_id[aid], v) for (aid, dd), v in x.items() if dd == d]
        m.Add(sum(int(a["labour_hrs"] * 10) * v for a, v in today) <= int(labour_hrs_per_day[d] * 10))
        m.Add(sum(int(a["water_m3"]) * v for a, v in today) <= int(water_m3_per_day[d]))

    m.Maximize(sum(
        (int(by_id[aid]["expected_loss_avoided"] * by_id[aid]["confidence"])
         - int(by_id[aid].get("delay_cost_per_day", 0)) * d) * v
        for (aid, d), v in x.items()))

    solver = cp_model.CpSolver()
    solver.parameters.max_time_in_seconds = 10
    status = solver.Solve(m)
    plan = sorted(({"action_id": aid, "day": d} for (aid, d), v in x.items() if solver.Value(v)),
                  key=lambda p: p["day"])
    done = {p["action_id"] for p in plan}
    return {"status": solver.StatusName(status), "plan": plan,
            "deferred": [a["action_id"] for a in actions if a["action_id"] not in done]}
```

**Requirements**
- R8.1 If mandatory actions cannot fit, return `INFEASIBLE` with the conflicting resources named. Never silently drop a mandatory action.
- R8.2 Every deferred action is shown with its reason: resource limit, or lower value than the competing actions.
- R8.3 Equipment constraints (one sprayer = one block per slot; one irrigation shift per manifold; frost machines) are added as per-day constraints in the same pattern.
- R8.4 Seasonal-engine tasks with long windows (pruning, mowing) fill spare capacity and are pushed back automatically when continuous engines need the resources.
- R8.5 Re-solve daily, and immediately after any manager accept, edit or skip, any safeguard event, or a frost warning.

## A9. LLM Narrator

**Role:** explain and communicate. It receives the solved plan, deferred actions, state summary, data-quality flags and safeguard events. It returns structured output only.

```text
SYSTEM: You are the Narrator Agronomist for the Nut Job farm decision system.
You receive a plan already computed by scientific models, crop knowledge pack decision tables and
an optimiser. You must NOT create, change, round or estimate any number, threshold, date or quantity.
Quote numbers exactly as given, by action_id. You do not decide what is done.
Use the crop, variety and stage names exactly as they appear in the input.

Your tasks:
1. For each planned action, explain in plain language why it was recommended, citing the rule_id,
   the key inputs and the evidence source provided.
2. For each deferred action, explain why it was deferred (resource limit or lower value).
3. Flag conflicting signals (e.g. MODEL_SENSOR_DIVERGENCE, stale data, uncalibrated parameters)
   and say what would resolve them.
4. List missing or overdue observations the farm team should collect.
5. Draft short task instructions for field staff.

INPUT (JSON): { "plan": [...], "deferred": [...], "state_summary": {...}, "flags": [...], "safeguard_events": [...] }

OUTPUT (JSON only):
{ "action_explanations": [{"action_id": "...", "text": "..."}],
  "deferred_explanations": [{"action_id": "...", "text": "..."}],
  "conflicts": [{"flag": "...", "text": "...", "resolution": "..."}],
  "observation_requests": [{"block_id": "...", "observation": "...", "why": "..."}],
  "task_drafts": [{"action_id": "...", "text": "..."}] }
```

**Requirements**
- R9.1 A post-check rejects any narrator output that contains a number not present in the input, and regenerates.
- R9.2 If the narrator fails, the plan is still shown with rule-based explanation text from the pack. The engine never depends on the LLM to function.
- R9.3 Safeguard events are always shown verbatim by the system, not paraphrased by the LLM.
- R9.4 Narration language follows the user's app language setting.

## A10. Hard Safeguards (Non-Negotiable)

Run independently of layers 1–4, on every sensor cycle and before any actuator command or task release. The **rules** are platform code. Their **limits** come from the pack, the product library (labels), equipment specifications and the farm's legal registry. They are never calibrated by the learning loop and cannot be disabled by any prompt. Changing a safeguard rule requires a code release with agronomist sign-off.

### A10.1 Sensor Validation (runs before anything else)

```python
from statistics import pstdev

def validate_probe(readings_last_6h, now, limits):
    """
    readings_last_6h: list of (timestamp, value), oldest first.
    Returns (is_valid, reason). Works for any probe type; limits are per sensor type.
    """
    if not readings_last_6h:
        return False, "NO_DATA"
    ts, latest = readings_last_6h[-1]
    if (now - ts).total_seconds() > limits["max_age_s"]:
        return False, "STALE"
    if not (limits["min_plausible"] <= latest <= limits["max_plausible"]):
        return False, "OUT_OF_RANGE"
    values = [v for _, v in readings_last_6h]
    if len(values) >= 12 and pstdev(values) == 0:
        return False, "STUCK"
    if len(values) >= 2 and abs(values[-1] - values[-2]) > limits["max_step"]:
        return False, "JUMP"
    return True, "OK"
```

### A10.2 Irrigation & Hydraulic Safeguards

```python
from statistics import median

def irrigation_safeguards(block, probe_results, valve, flow_lpm, limits):
    """
    probe_results: list of (vwc_pct, is_valid) per soil probe in the block.
    Returns a list of commands and alerts. Commands here override every other layer.
    """
    out = []
    valid = [v for v, ok in probe_results if ok]

    # SG-IRR-1  Hydraulic protection: always evaluated first
    if valve.is_open and valve.minutes_open > limits["max_run_minutes"]:
        out += [("CLOSE_VALVE", block.id), ("ALERT", "SG-IRR-1 max run time exceeded")]
    if valve.is_open and flow_lpm > limits["expected_flow_lpm"] * limits["burst_factor"]:
        out += [("CLOSE_VALVE", block.id), ("ALERT", "SG-IRR-1 possible burst / leak")]
    if valve.is_open and valve.minutes_open > 5 and flow_lpm < limits["min_flow_lpm"]:
        out += [("ALERT", "SG-IRR-1 valve open, no flow")]

    # SG-IRR-2  Not enough trustworthy sensors: never auto-irrigate on sensor data
    if len(valid) < limits["min_valid_probes"]:
        out += [("DEGRADED_MODE", block.id),
                ("ALERT", "SG-IRR-2 insufficient valid probes; schedule from water balance; manual check")]
        return out

    # SG-IRR-3  Emergency floor: needs agreement of valid probes, capped duration
    below = [v for v in valid if v <= block.emergency_floor_vwc]
    if len(below) >= limits["min_agreeing_probes"] and median(valid) <= block.emergency_floor_vwc:
        out += [("OPEN_VALVE_CAPPED", block.id, limits["emergency_minutes"]),
                ("ALERT", "SG-IRR-3 emergency floor breached; AI plan bypassed for this block")]
    return out
```

- `emergency_floor_vwc` is set per block from its soil water characteristics, **well above** permanent wilting point. The Irrigation engine handles normal scheduling; this safeguard is a last line of defence.
- The emergency open is time-capped and re-evaluated each cycle.

### A10.3 Spray & Worker Safeguards (veto actions/days in the arbitrator)

| ID | Rule | Limit source |
|---|---|---|
| SG-SPR-1 | No spraying when forecast wind > max during the window | Product label + local regulation |
| SG-SPR-2 | No spraying in calm-dawn inversion conditions (wind < min) | Label / good practice |
| SG-SPR-3 | No spraying if rain is forecast within the product's rainfast period | Product label |
| SG-SPR-4 | Block any spray whose pre-harvest interval (PHI) would extend past the planned harvest date | Product label + Harvest engine |
| SG-SPR-5 | Block labour scheduling in a block during its re-entry interval (REI) | Product label |
| SG-SPR-6 | Block a product once its maximum applications per season is reached | Product label |
| SG-SPR-7 | Block any product not registered for that crop in the operating country | Local product registry |
| SG-SPR-8 | Block bee-toxic products while hives are present or during the pack's bloom stages | Label + Pollination engine |

No default thresholds are invented in code. Label values are entered and approved by the agronomist in the product library.

### A10.4 Fertigation Safeguards

| ID | Rule | Limit source |
|---|---|---|
| SG-FERT-1 | Stop injection if inline EC or pH leaves the allowed band | Equipment + pack (crop tolerance) |
| SG-FERT-2 | Never inject unless water is flowing; flush lines after each injection | Equipment |
| SG-FERT-3 | Cap any single dose at the pack's maximum single-dose rate | Pack |

### A10.5 Frost & Harvest Safeguards

| ID | Rule | Limit source |
|---|---|---|
| SG-FRO-1 | Frost-protection water has priority over all other night-time water use in the frost window | Platform rule |
| SG-FRO-2 | Wind machines and heaters only run within equipment safety limits; alert on start failure | Equipment |
| SG-HAR-1 | Harvest tasks cannot be released while any PHI (SG-SPR-4) or REI (SG-SPR-5) is active in the block | Labels |

**Acceptance tests (Phase 1):**
- A stuck probe reading 0% produces `STUCK`, triggers no valve command, and puts the block in degraded mode.
- A single probe below the floor while the others are normal triggers no emergency irrigation.
- A valve open beyond max run time gets closed.
- A spray action with PHI past harvest is vetoed for all days.
- A bee-toxic product is vetoed while hives are recorded in the block.

## A11. Recommendation Log, Shadow Mode & Learning Loop

### A11.1 Recommendation Log (functional requirements)

For every recommendation, the system must be able to show:
- what was recommended, for which block, crop and variety, and when
- the engine, rule ID, pack ID and pack version that produced it
- the exact inputs used, their freshness, and the calibrated parameter values in force
- the expected outcome and when it should be observable
- the manager's decision (accept, edit or skip), any edits, and a **reason** chosen from a short list plus free text: *disagree with the science*, *knew something the system didn't*, *resource/practical constraint*, *data looked wrong*, *other*
- whether it ran live or in shadow
- the observed outcome, linked when it arrives

The log is append-only. Recommendations are never edited after the fact; a correction is a new entry.

### A11.2 Shadow Mode

- Setting per **engine × pack**: **Shadow** (recommends and logs; the manager decides independently and records what was actually done) or **Live** (recommendations appear for accept, edit or skip).
- A newly installed pack starts in Shadow for every engine. Each engine is switched to Live separately once its shadow record has been reviewed.

### A11.3 Learning Loop (calibrates pack parameters, never rules)

Calibrated values are stored as **farm-level overrides on top of the pack**, per block and variety. The pack itself is never modified by learning; pack updates and farm calibration stay separate.

| What learns (generic) | Learns from | Cadence | Method |
|---|---|---|---|
| Root-zone depletion / TAW per block | Validated probes vs modelled Dr | Daily | State correction (Kalman-style data assimilation) |
| Kcb per block | Water balance residuals + re-measured fc/h | Monthly | Re-fit within pack bounds |
| Plant water status baseline offset | Readings on well-watered days | Weekly | Local regression on the pack baseline |
| Pest/disease model event offsets | Predicted vs observed events | Per generation / season | Bayesian update toward observed |
| Variety chill and heat requirements | Observed phenology dates | Yearly | Re-fit (needs ~3+ seasons) |
| Frost damage function | Post-frost damage scouting | Per event | Bounded regression |
| Nutrient removal and efficiency | Tissue analysis vs applied vs yield | Yearly | Bounded re-fit |
| Yield model priors | Actual harvest per block | Yearly | Bayesian update |
| Damage functions | Harvest quality/damage vs pressure | Yearly | Regression |

**Requirements**
- R11.1 **Bounded:** every calibrated parameter stays within the pack's declared bounds. A fit outside bounds is held and flagged for agronomist review.
- R11.2 **Champion/challenger:** recalibrated parameters form a *challenger* that runs in shadow next to the live *champion*. It is promoted only when:
  - its backtest on the logged history beats the champion on the engine's metrics, and
  - the agronomist approves the promotion in the app.
- R11.3 **Metrics:** each pack declares, per engine, the metrics used to judge it (e.g. water status held within target band; spray timing error vs observed pest events; phenology prediction error in days; yield forecast error).
- R11.4 Manager overrides are **signals, not ground truth**. They feed review queues; outcomes, not overrides, change parameters.
- R11.5 Rollback: any promoted calibration can be restored in one step.
- R11.6 Safeguards (§A10) are excluded from learning.
- R11.7 **Feedback to pack authors (optional, opt-in):** anonymised calibration summaries can be exported to help improve future pack versions.

---

# PART B — CROP KNOWLEDGE PACKS

## B1. What a Pack Is

A Crop Knowledge Pack is a downloadable, versioned bundle containing **all** crop-specific science the platform needs. Installing a pack makes a crop available on the farm. The platform's engines read the pack; they contain none of its content.

## B2. Required Pack Contents (by section)

Each section is optional unless marked **required**. A missing section makes the engines that need it inactive for that crop, with a visible reason (R1.3).

| Section | Contents | Used by |
|---|---|---|
| **Manifest** (required) | Pack ID, crop (common + scientific name), version, minimum platform version, authors, review date, region(s) of validity, licence, signature | Loader |
| **Crop profile** (required) | Perennial/annual, harvested product, yield units, default price unit | All |
| **Varieties** | Per variety: name, origin, bloom class, chill and heat requirements (with model used), self-compatibility and polliniser groups, disease/pest sensitivities, maturity class | Phenology, Pollination, Disease, Harvest |
| **Phenology** (required) | Stage scale (BBCH or crop scale) with names and photos/descriptions for scouting; mapping from stages to engine **phases**; stage prediction models | Phenology, all engines |
| **Water** | Kcb curve or A&P parameters, p, root depth, plant-water-status indicator and baseline equation, deficit strategies, irrigation decision table | Irrigation |
| **Nutrition** | Removal coefficients, growth needs by age, phase splits, sampling protocol, tissue bands, max single doses, fertigation decision table | Fertigation & Nutrition |
| **Salinity** | Maas–Hoffman a and b, specific-ion limits, rootstock notes | Salinity |
| **Frost** | Critical temperatures per stage and damage level, duration basis, active stages, damage function | Frost |
| **Pest models** | One entry per pest (see §A6.6 list) + decision table | Insect Pest |
| **Disease models** | One entry per disease (see §A6.7 list) + decision table | Disease |
| **Seasonal templates** | Pollination, pruning, groundcover and harvest task templates with phase anchors and weather gates | Seasonal engines |
| **Yield model** | Yield components, sampling protocol, age curve | Yield Forecast |
| **Couplings** | Crop-specific cross-engine rules | All |
| **Parameters** (required) | Every parameter referenced by any table: start value, unit, bounds, evidence source, and status (`sourced` / `expert estimate` / `to be sourced`) | Learning loop, audit |
| **Learning metrics** | Per engine, how performance is measured | Learning loop |
| **Evidence register** (required) | Full references for every evidence citation in the pack | Narrator, audit |
| **Pack test suite** (required) | Input → expected-output cases for every decision table and model the pack defines | Validator |

**Not in packs:** product brands, prices and label values. These are local and regulatory, so they live in the farm's **product library** and **legal registry**. A pack refers only to product classes and modes of action (e.g. FRAC/IRAC groups).

## B3. Pack Validation (on install and on update)

- V1. Signature and manifest check; reject packs that require a newer platform version.
- V2. Every `$param` referenced in any table exists in the parameters section with bounds and evidence.
- V3. Every evidence citation resolves in the evidence register.
- V4. Units are declared for every model and parameter.
- V5. Every phase referenced by any table exists in the phenology phase mapping.
- V6. The pack test suite passes on the installed platform version.
- V7. Report parameters with status `to be sourced` and `expert estimate`. Engines that depend on `to be sourced` parameters stay in Shadow and cannot be switched to Live until the values are filled in.

## B4. Pack Lifecycle

- **Install:** download from the pack catalogue (or import a file), validate, assign to blocks.
- **Update:** a new pack version installs alongside the old one. Blocks move to it only when the agronomist accepts. The update screen shows a **diff**: changed rules, parameters and models. New versions start in Shadow for changed engines.
- **Farm calibration** (§A11.3) is kept per pack ID and carried across versions when the parameter still exists and its bounds still contain the calibrated value. Otherwise it is flagged for review.
- **Regional overlays:** a small pack add-on can override parameters for a region (e.g. local pest thresholds) without forking the whole pack.
- **Authoring:** packs are authored as plain files (YAML + documentation) and validated with the same validator before publishing.

---

# PART C — ALMOND REFERENCE PACK (v0.1)

This is the first pack. It doubles as the template for future packs. Values marked **`to be sourced`** must be filled in by the agronomist before the related engine can go Live (V7).

## C1. Manifest & Crop Profile

- Pack ID `almond`, version `0.1.0`, crop *Prunus dulcis*, perennial tree crop, harvested product: kernels (kg/ha), with in-shell and hull outputs tracked for processing.
- Region of validity: Mediterranean climates; to be confirmed for the farm's location.

## C2. Varieties

| Variety | Origin | Bloom | Self-compatibility | Chill requirement | Notes |
|---|---|---|---|---|---|
| **Makako** | CEBAS-CSIC (Spain) | Extra-late | Self-compatible | Intermediate (INTA trial); value `to be sourced` (CP) | |
| **Vairo** | IRTA (Spain) | Late (similar to Guara / Ferragnès) | Self-fertile, good autogamy | High (INTA trial); value `to be sourced` (CP) | Hard shell; tolerant to Fusicoccum; very tolerant to red leaf blotch (mancha ocre) |

Heat requirement to bloom (GDH): `to be sourced` per variety (CITA work on Spanish varieties is the starting point). Note that Spanish CITA studies report chill models are not well adapted to almond and values vary by method and site, so local calibration (§A11.3) matters most for this parameter.

## C3. Phenology

- Scale: BBCH for stone fruit, with almond stage descriptions and photos for scouting.
- Phase mapping used by engines: `dormant`, `bloom`, `fruit_set`, `fruit_growth`, `kernel_fill`, `hull_split`, `harvest`, `post_harvest`. Exact BBCH boundaries `to be sourced` from the agronomist.
- Hull split timing differs by variety, so phases are tracked **per block**.

## C4. Water

**Kc:** derive Kcb with the A&P approach from fc and h; reference values from Rallo et al. (2021). A young Spanish drip orchard showed Kcb-mid rising from 0.28 to 1.02 over four years as the trees grew.

**Plant water status:** midday stem water potential (SWP, pressure chamber), in bars (1 MPa = 10 bars). Baseline: UC Davis model (Shackel; UC ANR Pub. 8503, Table 14). Interim rule until coded: baseline ≈ −(T_°F / 10) bars.

**Irrigation decision table:**

```yaml
table: irrigation
pack: almond
version: 0.1.0
hit_policy: first
rows:
  - id: ALM-IRR-00
    when: { phase: dormant }
    then: { action: none }

  - id: ALM-IRR-01
    when: { rain_48h_mm_ge: "Dr", rain_prob_ge: "$rain_prob_defer" }
    then: { action: defer, note: "Forecast rain expected to refill root zone" }
    evidence: FAO56

  - id: ALM-IRR-05
    when: { phase: kernel_fill, rdi_enabled: true, swp_age_days_le: 4, swp_bar_lt: "$rdi_swp_floor_bar" }
    then: { action: irrigate, amount: "$rdi_fraction * ETc_since_last", reason: "SWP below RDI floor" }
    evidence: IRTA_RDI_VAIRO

  - id: ALM-IRR-06
    when: { phase: kernel_fill, rdi_enabled: true }
    then: { action: irrigate_partial, amount: "$rdi_fraction * ETc_since_last" }
    evidence: IRTA_RDI

  - id: ALM-IRR-02
    when: { phase_in: [bloom, fruit_set, fruit_growth, kernel_fill, hull_split, post_harvest], Dr_ge: "RAW" }
    then: { action: irrigate, amount: "Dr / efficiency * (1 + leaching_fraction)" }
    evidence: FAO56

  - id: ALM-IRR-03
    when: { swp_age_days_le: 3, swp_deviation_bar_le: "-$swp_trigger_below_baseline_bar", Dr_lt: "RAW" }
    then: { action: irrigate, amount: "Dr / efficiency", flag: MODEL_SENSOR_DIVERGENCE }
    evidence: UCD_SWP

  - id: ALM-IRR-04
    when: {}
    then: { action: hold, note: "Depletion below RAW and tree water status OK" }
```

| Parameter | Start | Bounds | Status | Evidence |
|---|---|---|---|---|
| `p` | 0.40 | 0.30–0.60 | sourced | FAO-56 Table 22 |
| `swp_trigger_below_baseline_bar` | 3.5 | 2–5 | sourced | UC Davis: irrigate ~3–4 bars below baseline |
| `rdi_swp_floor_bar` | −15 | −20 to −12 | sourced | IRTA RDI on Vairo (−1.5 / −2.0 MPa) |
| `rdi_fraction` | 0.5 | 0.4–0.7 | sourced | Spanish RDI trials (50% ETc in kernel fill) |
| `rain_prob_defer` | 0.7 | 0.6–0.9 | expert estimate | Operational |

## C5. Nutrition, Salinity & Frost

**Nitrogen budget** (CDFA/UC almond guidelines):
- Removal ≈ **68 kg N per 1,000 kg kernels** (range 50–75). The ratio is the same in pounds or kilograms.
- Phase split of annual N demand: **20%** end of bloom → full leaf expansion; **30%** → shell hardening; **30%** kernel fill → early hull split; **20%** hull split → early post-harvest.
- Growth requirement for young trees by age: `to be sourced`. Fertiliser efficiency: farm setting (default 0.7, bounds 0.5–0.9, expert estimate).

**Other removal** (per 1,000 kg kernels): P ≈ 8–9 kg; K ≈ 70–80 kg.

**Leaf analysis** (July sampling, 28 trees, ≥ 8 spurs per tree; spring sample can predict July N):

| Nutrient | Deficient | Adequate | Excessive |
|---|---|---|---|
| N (%) | < 2.0 | 2.2–2.5 | > 2.7 |
| P (%) | — | 0.1–0.3 | — |
| K (%) | < 1.0 | > 1.4 | — |
| B (hull, ppm) | < 80 | 80–150 | > 200 (possible toxicity) |

Zn, Mn, Cu, Fe bands: `to be sourced`. Maximum single fertigation dose: `to be sourced`.

**Salinity** (FAO table, sensitive crop): threshold **a = 1.5 dS/m ECe**, slope **b = 19% per dS/m**. Valid only where the rootstock does not rapidly accumulate Na or Cl; gypsiferous soils tolerate about 2 dS/m more. Specific-ion limits (Na, Cl, B) by rootstock: `to be sourced`.

**Frost critical temperatures** (maximum tolerated for 30 minutes; Saunier 1960, cited in Gil Albert 1986):

| Stage | Critical temperature |
|---|---|
| Closed buds | −3.3 °C |
| Full bloom | −2.7 °C |
| Young fruit | −1.1 °C |

10% and 90% damage levels per BBCH stage: `to be sourced`. Until then the Frost engine uses the single values as the "warning" level, with damage fraction unavailable (lower confidence). Being late- and extra-late-blooming, Makako and Vairo shift the frost window later; the engine handles this automatically through phenology.

## C6. Pest & Disease Models

### C6.1 Insect pests

**Navel orangeworm (NOW)** — UC IPM almond model
- DD method: single sine, horizontal cutoff; thresholds 55 / 94 °F.
- Monitoring: egg traps (almond meal bait), checked once or twice weekly.
- Biofix: egg counts rise across 2 consecutive checks, or ≥ 50% of traps have eggs.
- Events: first-brood hatch ≈ 100 DD after biofix; second-flight egg laying ≈ 1056 DD.
- Treat at the later of: predicted egg-lay start or hull split start, only if expected loss > cost.

```yaml
table: now
pack: almond
version: 0.1.0
hit_policy: first
rows:
  - id: ALM-NOW-01
    when: { biofix_set: false, egg_counts_rising_consecutive_checks_ge: 2 }
    then: { action: set_biofix, date: "first_of_rising_checks" }
    evidence: UCIPM_NOW
  - id: ALM-NOW-01b
    when: { biofix_set: false, share_traps_with_eggs_ge: 0.5 }
    then: { action: set_biofix, date: "check_date" }
    evidence: UCIPM_NOW
  - id: ALM-NOW-02
    when: { biofix_set: false }
    then: { action: monitor, task: "Check egg traps twice weekly" }
  - id: ALM-NOW-03
    when: { dd_F_ge: "$now_dd_second_flight_F", hull_split_pct_ge: "$hull_split_start_pct", expected_loss_avoided_gt: "cost" }
    then: { action: spray, timing: "now" }
    evidence: UCIPM_NOW
  - id: ALM-NOW-04
    when: { dd_F_ge: "$now_dd_second_flight_F", hull_split_pct_lt: "$hull_split_start_pct", expected_loss_avoided_gt: "cost" }
    then: { action: spray_scheduled, timing: "at hull split start" }
    evidence: UCIPM_NOW
  - id: ALM-NOW-05
    when: { dd_F_ge: "$now_dd_second_flight_F - 150" }
    then: { action: prepare, task: "Confirm product, sprayer, labour; increase hull split checks" }
  - id: ALM-NOW-06
    when: {}
    then: { action: monitor, task: "Continue trap checks; verify DD predictions against trap counts" }
```

| Parameter | Start | Bounds | Status |
|---|---|---|---|
| `now_dd_first_hatch_F` | 100 | 80–130 | sourced (UC IPM) |
| `now_dd_second_flight_F` | 1056 | 950–1150 | sourced (UC IPM) |
| `hull_split_start_pct` | 1 | 1–5 | sourced (UC IPM: spray at start of hull split) |

**Peach twig borer (PTB)** — UC IPM almond model
- DD thresholds 50 / 88 °F (method: single sine, horizontal cutoff, assumed per UC IPM convention; confirm).
- Monitoring: pheromone traps from mid-March, 1 per ~8 ha (minimum 2 per orchard), checked twice weekly; shoot-strike checks in mid-April.
- Biofix: first male trapped, with captures on at least 2 consecutive checks.
- Timing: most products at ≈ 400 DD after biofix; IGR 300–400 DD; Bt two applications at 300–350 and 450–500 DD.
- Threshold: several shoot strikes per tree by late April; spring spray usually unnecessary if dormant or bloom treatments worked, or with no PTB history.

**Regional pests** — `to be sourced` from Spanish sources (e.g. Capnodis, almond lace bug *Monosteira unicostata*, aphids, mites). Each needs a monitoring method, threshold and timing before activation.

### C6.2 Diseases

**Alternaria leaf spot** — infection-value model (DSV, adapted from TOMCAST)
- Evaluated daily at 11:00 over the previous 23 h; wet events separated by ≥ 2 dry hours.
- Daily value from wetness hours × mean temperature band (°F):

| Mean temp band | DSV 1 | DSV 2 | DSV 3 | DSV 4 |
|---|---|---|---|---|
| 59–63 | 7 h | 16 h | 21 h | — |
| 63–68 | 4 h | 9 h | 16 h | 23 h |
| 68–77 | 3 h | 6 h | 13 h | 21 h |
| 77–82 | 4 h | 9 h | 16 h | 23 h |

(Minimum wet hours to reach each value.)
- Rolling 7-day sum; treat at 6–12 units (6–8 for high-history orchards, 10–12 for low). Reset to 0 after an Alternaria application.
- Parameter `alt_dsv_threshold`: start 10, bounds 6–12, sourced.

**Red leaf blotch (*Polystigma amygdalinum*, mancha ocre)** — phenology-timed preventive programme
- One infection cycle per year; infection from petal fall while young leaves emerge with spring rain, continuing to about May; symptoms appear 35–40 days later.
- Preventive timings: petal fall, then +2–3 weeks and +5–6 weeks. Sprays during bloom or after symptoms are ineffective.
- Rotate FRAC groups per resistance rules; sanitation: remove or accelerate decomposition of leaf litter (effective area-wide).
- Variety modifier: Vairo is very tolerant, so the engine lowers expected loss for Vairo blocks. Makako sensitivity: `to be sourced`.

**Hull rot** — cultural-risk model (coupling rule)
- Risk raised by full water status and high N at hull split; mild deficit at hull split lowers it.
- Coupling: Disease reads SWP deviation and leaf N status during `hull_split` and sends an advisory to Irrigation and Fertigation.

**Other diseases** — shot hole, scab, rust, anthracnose, Fusicoccum, Monilinia: models and timings `to be sourced` (Spanish sources preferred). The red leaf blotch spray timings overlap with shot hole, scab and rust, so programmes can be combined.

## C7. Seasonal Templates

| Engine | Almond template content | Status |
|---|---|---|
| Pollination | Both varieties are self-compatible: hives optional or at reduced density; plan by bloom prediction; bee-toxic spray veto during bloom | Hive density `to be sourced` (agronomist) |
| Canopy & Pruning | Training years 1–3; maintenance pruning in mature years; dry-weather windows to limit wound infection | Templates and dry-window length `to be sourced` |
| Weed & Groundcover | Floor preparation before harvest; cover crop management; herbicide via spray safeguards | Templates `to be sourced` |
| Harvest | Readiness from hull split progress; pre-harvest irrigation cut-off; drying to safe moisture to limit aflatoxin risk; PHI checks | Shake threshold, moisture targets, cut-off days `to be sourced` |
| Yield Forecast | Nuts per tree × kernel weight; bloom density and set counts as early indicators; frost/pest damage adjustments | Sampling protocol `to be sourced` |

## C8. Couplings (almond-specific)

| From | To | Rule |
|---|---|---|
| Phenology (hull split %) | Irrigation | Sets the kernel-fill RDI window per block |
| Phenology (hull split %) | Insect Pest (NOW) | Gates spray timing |
| Irrigation (SWP at hull split), Fertigation (leaf N) | Disease (hull rot) | Raises or lowers hull rot risk |
| Insect Pest (NOW pressure) | Harvest | High late pressure brings harvest forward |
| Frost (bloom damage) | Yield Forecast | Reduces expected yield |

## C9. Values To Source Before Going Live

| Engine | Missing values |
|---|---|
| Phenology | Chill (CP) and heat (GDH) requirements for Makako and Vairo; BBCH → phase boundaries |
| Fertigation | Young-tree growth N by age; micronutrient bands; max single dose |
| Salinity | Na, Cl, B limits for your rootstock |
| Frost | 10% / 90% damage temperatures per BBCH stage |
| Insect Pest | Regional pest models (Capnodis, lace bug, aphids, mites) |
| Disease | Makako red leaf blotch sensitivity; shot hole, scab, rust, anthracnose, Fusicoccum, Monilinia models |
| Seasonal engines | Pollination density, pruning templates and dry window, groundcover templates, harvest thresholds, yield sampling protocol |
| All spray engines | Product library: labels (wind, rainfast, PHI, REI, max applications) and local registration |

---

# PART D — INTERFACE & BUILD

## D1. Interface Changes

**Farm setup (new)**
- Blocks: assign crop pack, variety, planting year, spacing, irrigation system, soil profile, equipment.
- Product library: products, labels, local registration (agronomist-approved).

**Crop pack manager (new, agronomist)**
- Catalogue: browse, download and install packs.
- Installed packs: version, validation report (including `to be sourced` count), update with diff, assign versions to blocks.
- Engine activation per pack: Inactive / Shadow / Live, with reasons.

**Recommendations page**
- Each card has a **"Why"** panel: rule fired (ID + plain-language row), key inputs with freshness, evidence source, pack version, expected outcome.
- Skip and Edit require a reason (short list + optional note).
- Deferred actions in a separate collapsed list with their deferral reason.
- Shadow/Live badge per engine.
- Safeguard events as a pinned banner that cannot be dismissed until acknowledged.
- Filter by crop, block and engine.

**Dashboard**
- Per-block tiles chosen by the pack: e.g. water status, phenology stage and next event, pest status, disease risk, frost outlook, nutrient status, yield forecast.
- Data-quality strip: stale sensors, overdue observations, uncalibrated parameters.

**Block profiles**
- Crop, variety and pack version; calibrated parameters with history and status (uncalibrated / calibrated / pending review).

**Calendar**
- The arbitrator's 7-day plan plus the seasonal engines' season plans; REI/PHI blocks; predicted events (bloom, pest flights, harvest window); frost nights.

**Field data entry (mobile-first; forms generated from the pack)**
- Trap checks, plant water status readings, phenology scouting with stage photos from the pack, pest and disease scouting, fruit/nut counts and samples, canopy measurements, post-frost damage scouting, harvest records.

**Engine admin (agronomist)**
- Decision tables per engine and pack: rows, evidence, versions (read-only; edits happen by pack update or regional overlay).
- Parameters: pack value, farm calibrated value, bounds, source, history.
- Champion vs challenger comparison with backtest metrics; Promote / Reject / Rollback.

## D2. Build Phases

All engines are built from the start. What differs by phase is which engines can go **Live**, which depends on data and pack completeness, not code.

### Phase 1 — Platform complete (before first season)
- Science core: A4.1–A4.9 with all acceptance tests passing.
- Engine framework (A5) and **all 12 engines** (A6), driven by pack content.
- Arbitrator (A8), Narrator (A9), Safeguards (A10), Log and Shadow mode (A11.1–A11.2).
- Pack loader, validator, lifecycle (Part B).
- Almond reference pack v0.1 (Part C) installed; its pack test suite passing.
- Learning loop machinery built (A11.3), including calibration storage, champion/challenger and rollback; **runs only once logged outcomes exist**.
- All interface changes in D1.

**Phase 1 is done when:**
- every acceptance test in this spec passes,
- the almond pack validates with its `to be sourced` list reported, and
- a 30-day replay of historical weather produces a plausible daily recommendation set across all engines, reviewed by the agronomist.

### Phase 2 — First season (Shadow)
- All almond engines run in Shadow.
- The agronomist fills in `to be sourced` values (C9) and the product library.
- Engines go Live one at a time as their values are complete and their shadow record is reviewed. Expected order: Irrigation, Insect Pest (NOW, PTB), Frost, Fertigation, Disease, then seasonal engines.

### Phase 3 — After first season
- Learning loop activated on logged outcomes.
- Second crop pack, built with the almond pack as template, to prove the platform is truly crop-agnostic: no platform code changes should be needed.

---

## References

**Platform science**
- Allen, R.G., Pereira, L.S., Raes, D., Smith, M. (1998). *Crop Evapotranspiration*, FAO Irrigation & Drainage Paper 56.
- Allen, R.G., Pereira, L.S. (2009). Estimating crop coefficients from fraction of ground cover and height. *Irrigation Science* 28.
- Ayers, R.S., Westcot, D.W. (1985). *Water Quality for Agriculture*, FAO Irrigation & Drainage Paper 29 (leaching requirement).
- Maas, E.V., Hoffman, G.J. (1977). Crop salt tolerance — current assessment. *J. Irrig. Drain. Div. ASCE* 103.
- Thorp, K.R. (2022). pyfao56: FAO-56 evapotranspiration in Python. *SoftwareX* 19, 101208.
- Vremec, M., Collenteur, R.A., Birk, S. (2024). PyEt v1.3.1. *Geosci. Model Dev.* 17, 7083–7103.
- Zalom, F.G. et al. (1983). *Degree-Days: The Calculation and Use of Heat Units in Pest Management*. UC DANR Leaflet 21373.
- Fishman, S., Erez, A., Couvillon, G.A. (1987). Dynamic Model of dormancy breaking. *J. Theor. Biol.* 124/126.
- Stern, V.M. et al. (1959). The integrated control concept. *Hilgardia* 29. Pedigo, L.P., Hutchins, S.H., Higley, L.G. (1986). Economic injury levels in theory and practice. *Annu. Rev. Entomol.* 31.

**Almond reference pack**
- Rallo, G. et al. (2021). Updated single and dual crop coefficients for tree and vine fruit crops. *Agricultural Water Management* 250, 106645.
- Shackel, K. et al. Stem water potential baseline; UC ANR Publication 8503.
- Girona, J. et al. (IRTA). Regulated deficit irrigation in almond during kernel filling; Vairo RDI trials (SWP −1.5 / −2.0 MPa).
- CDFA / UC. Almond Fertilization Guidelines (nutrient removal, leaf standards, N timing).
- FAO (2002), *Agricultural Drainage Water Management in Arid and Semi-Arid Areas*, Annex 1 (crop salt tolerance table).
- Saunier (1960), cited in Gil Albert (1986). Critical frost temperatures for almond by stage.
- UC IPM Almond Pest Management Guidelines: Navel orangeworm; Peach twig borer; Alternaria leaf spot; Red leaf blotch.
- Doll, D. The Almond Doctor: Alternaria DSV model.
- IRTA. Variedades de almendro (Vairo).
- CEBAS-CSIC. 'Makako': a new extra-late flowering self-compatible cultivar.
- INTA Catamarca (2025). Chill and heat requirements of almond cultivars.
- CITA Aragón. Necesidades agroclimáticas de las variedades de almendro.
