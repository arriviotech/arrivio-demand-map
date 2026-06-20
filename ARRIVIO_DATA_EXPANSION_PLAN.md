# Arrivio Map — Data Expansion Plan & Sourcing Methodology

**Status:** PLAN / PROPOSAL — awaiting your answers to the questions in §9 before any data goes on the map.
**This file is also the living methodology log:** once you approve, every dataset I actually pull gets its exact source URL, date, and transformation recorded here under §10 so the numbers are auditable.

---

## 1. What you asked for (my understanding)

**Done this session (already on `testbytej`):**
- ✅ Click a client again → on-map detail popup is back (desktop); mobile keeps the bottom card.
- ✅ Default basemap is now **Clean** (CARTO Voyager), not Dark.
- ✅ "Arrivio" capitalized in the wordmark.
- ✅ Transit progress text now explains what it's doing ("…travel time to nearby client 3 of 16").
- ⏳ **Official Arrivio logo** — I could not reliably extract it from arrivio.global (the site is JS-rendered; no logo asset URL is exposed in the HTML I can fetch). **I need you to drop the logo file in this folder** (see §9, Q5). Right now there's a placeholder `icon.svg`.

**The big build (this document):** add supply-side + demand-side intelligence as new map layers:
- **Supply:** small/family hotels (acquisition targets) and commercial/office buildings (conversion/lease targets), each with as many metrics as can be found.
- **Demand:** immigrant inflow, and a **States** basemap where each Bundesland shows its **TAM**.
- **5 density heatmaps:** (1) immigrant inflow, (2) family-hotel rental pricing, (3) family-hotel room availability, (4) empty office/commercial space available, (5) office/commercial rents.
- **Transit clarity** improvements.

---

## 2. The blunt reality of data availability (read this first)

This is the most important section. Your instinct — "find everything we can scrape" — runs into a hard wall, and I want to be straight about it **before** we spend effort.

German data splits cleanly into **two worlds:**

| | **Official / aggregate data** | **Per-individual-property data** |
|---|---|---|
| Examples | migration by state/district, hotel occupancy by state, office rent & vacancy by city | this specific family hotel's occupancy; this specific building's asking price |
| Availability | **Excellent & free** (Destatis, BA, BKG, big brokers' market reports) | **Effectively unavailable as open data** |
| Accuracy | Real, citable, audit-able | Would be **modeled/estimated**, not facts |

**What this means concretely:**

1. **Immigrant inflow, hotel occupancy, office rents & vacancy** → I can get these **accurately at region/state/city level** from official statistics and published broker reports. These make genuinely trustworthy heatmaps.

2. **Individual family hotels and commercial buildings** → I can get their **locations** (from OpenStreetMap, which tags hotels and many commercial buildings), but **NOT** their real occupancy, room count, or price per property:
   - OSM has a `rooms=` tag on **<10%** of hotels, `stars=` on maybe 30%. Most room counts would be **estimated**.
   - **Occupancy per hotel exists nowhere public.** Only regional averages (Destatis: ~67% national, varies by state).
   - **Per-building lease prices** live behind ImmoScout24 / broker logins; scraping them violates their terms and the data is unstructured and unreliable. City-level rents from broker market reports are the honest substitute.

3. **Scraping listing sites (Booking.com, ImmoScout24, HRS) is off the table** — it breaks their terms of service, the HTML is anti-bot and changes constantly, and the result wouldn't be reproducible or defensible in a pitch. I will use **official statistics + reputable broker market reports + OpenStreetMap (open license)** only. If you have **paid data subscriptions** (STR, AHGZ, a broker relationship, PropertyData), that changes everything — tell me (§9, Q4).

**Bottom line:** we can build **accurate regional heatmaps** for every layer you listed, plus **real location pins** for hotels/commercial from OSM, but the **per-property metrics on those pins will be transparent models**, every assumption documented here. I will never present a modeled number as if it were a measured fact — modeled values get a "≈ est." marker in the UI and a formula in this doc.

---

## 3. Demand layers

### 3A. Immigrant inflow heatmap
- **Source:** Destatis *Wanderungsstatistik* (migration) via [regionalstatistik.de](https://www.regionalstatistik.de) and [destatis.de migration pages](https://www.destatis.de/DE/Themen/Gesellschaft-Umwelt/Bevoelkerung/Wanderungen/_inhalt.html). Net migration 2024 ≈ +430,000; 2023 ≈ +663,000 (national, confirmed).
- **Granularity:** Bundesland (16) — solid. District/Kreis (~400) — available on regionalstatistik.de, more work.
- **Two definitions you must choose between (Q2):**
  - *International inflow* = `Zuzüge über die Grenzen` (arrivals from abroad) per state.
  - *Domestic + international* = total `Zuzüge` including inter-state moves (`Binnenwanderung`). Note: domestic moves net to ~zero nationally, so "domestic+international" mainly re-weights toward economically attractive states.
- **Arrivio-relevant alternative (my recommendation):** Arrivio's real customers are **international healthcare workers**, not all immigrants. In 2024 Germany recognized **~32,500 foreign nursing professionals (+19% YoY)**; nursing is the single largest recognition category (~22,425 applications). Recognition is administered **per Bundesland**, so a **healthcare-worker inflow** layer is both obtainable and far more honest as Arrivio's addressable demand than raw immigration. Source: [anerkennung-in-deutschland.de 2024 evaluation](https://www.anerkennung-in-deutschland.de/html/en/pro/news-evaluation-recognition-statistics-2024.php), BA Fachkräfteeinwanderung statistics.
- **Confidence:** HIGH (general migration by state), MEDIUM (by district; healthcare-by-state).

### 3B. "States" basemap + TAM card
- **Boundaries:** German state polygons in GeoJSON — free/public from [isellsoap/deutschlandGeoJSON](https://github.com/isellsoap/deutschlandGeoJSON) or Destatis Regionalatlas (BKG VG2500). Confidence HIGH. (~50–150 KB inlined; fine for the single-file app.)
- **Render:** a 6th basemap "States" that draws the 16 states as a choropleth colored by TAM, with a count label per state. Clicking a state opens a card showing the metrics.
- **TAM definition (needs your confirmation, Q3):**
  > **TAM (state) = annual inflow into the state × €15,000**
  where €15,000 = assumed **annual housing revenue per person** (≈ €1,250/month for a furnished shared room — plausible for Arrivio's model; confirm).
  - Variant A: `international inflow × €15,000`
  - Variant B: `(domestic + international) inflow × €15,000`
  - The card will show both, plus the raw inflow, the multiplier, and the math, so it's transparent.
- **Honest caveat I'll print on the card:** multiplying *all* inflow by €15k is an **upper-bound TAM** (it assumes every arrival is a potential customer). Arrivio's *serviceable* market (SAM) is closer to the healthcare-worker subset. I recommend showing TAM (all inflow) **and** a SAM line (healthcare inflow × €15k) so the number is credible to investors rather than inflated. Tell me if you want SAM too.

---

## 4. Supply layers

### 4A. Small / family hotels
- **Locations:** OpenStreetMap (`tourism=hotel|guest_house|hostel`) via the Overpass API — name, coords, and whatever tags exist (`rooms`, `stars`, `operator`, `phone`, `website`). Open license (ODbL). "Family/small" inferred = no major-chain `brand`/`operator` + small/unknown size.
- **Metrics & how each is obtained:**
  | Metric | Source | Real or modeled? |
  |---|---|---|
  | Location, name | OSM | **Real** |
  | Star rating | OSM `stars` (~30% coverage) | Real where present |
  | Room count | OSM `rooms` (<10%) → else modeled from building size/stars/city tier | Mostly **modeled** |
  | Occupancy rate | Destatis occupancy by state (~50–70%) applied to the hotel | **Modeled (regional)** |
  | Room price (ADR) | Regional ADR from market reports, adjusted by stars & city tier | **Modeled** — see §6 |
- **Heatmaps built from this:** (#2) rental pricing, (#3) room availability — rendered as a density surface; per-hotel pins carry the modeled metrics with an "≈ est." flag.
- **Confidence:** locations MEDIUM–HIGH; metrics LOW–MEDIUM (transparent models).

### 4B. Commercial / office buildings
- **Per-building:** not openly available (see §2). OSM has `office=*` / `building=commercial` **footprints** (location + sometimes floor area via `building:levels`), which gives us *where* commercial stock sits, but not price or vacancy per building.
- **City/market-level (the accurate layer):** broker market reports give, per city, **prime rent & average rent (€/m²/month)**, **vacancy rate (%)**, and **available space (m²)**:
  - Big 7 (Berlin, Munich, Frankfurt, Hamburg, Düsseldorf, Cologne, Stuttgart) — quarterly from [JLL](https://www.jll.com/en-de/insights/market-dynamics/germany-office), [Colliers City Survey](https://citysurvey.colliers.de/en/leasing-market/), Cushman & Wakefield, BNP Paribas. Confirmed figures: avg vacancy ~8.3%; prime rents Munich ≈ €60, Frankfurt ≈ €54, Berlin ≈ €47.50/m²/month; Frankfurt vacancy 11.5%, Düsseldorf 10.8%, Berlin 9.8%.
  - Secondary cities (Bonn, Essen, Dortmund, Leipzig, etc.) — partial broker coverage; gaps filled by the model in §6.
- **Heatmaps built from this:** (#4) empty office/commercial m² available, (#5) office/commercial rents — rendered as city-anchored density.
- **Confidence:** HIGH (Big 7), MEDIUM (secondary cities, modeled).

---

## 5. The five heatmaps — feasibility summary

| # | Heatmap | Best data | Granularity | Confidence |
|---|---|---|---|---|
| 1 | Immigrant inflow | Destatis migration (or BA healthcare recognition) | State / district | **HIGH** |
| 2 | Family-hotel rental pricing | Regional ADR model (Destatis + reports) | Region → painted on OSM hotel points | MEDIUM (regional) / LOW (per-hotel) |
| 3 | Family-hotel room availability | OSM locations + modeled rooms × (1−occupancy) | Region / points | MEDIUM / LOW |
| 4 | Empty office & commercial m² | Broker vacancy reports | City | **HIGH** (Big 7) / MEDIUM |
| 5 | Office & commercial rents | Broker rent reports | City | **HIGH** (Big 7) / MEDIUM |

---

## 6. Pricing methodology (you specifically asked for the logic)

Wherever a price isn't published for a specific place, I will **model it explicitly** with this chain, and record every input in §10:

**Hotel room price (ADR) for a hotel in city *c* with star rating *s*:**
```
ADR(c,s) = ADR_region(state of c)              ← Destatis/market regional avg daily rate
           × star_factor(s)                     ← e.g. 1★0.7 2★0.85 3★1.0 4★1.35 5★1.9 (from STR/market spreads)
           × city_tier_factor(c)                ← metro 1.25 / large 1.1 / mid 1.0 / small 0.9 (by population)
```
Every factor is a documented assumption with a source or a stated rationale; none are invented silently.

**Commercial / office rent for city *c* without a broker figure:**
```
rent(c) = anchor to the nearest reported city in the same region,
          scaled by population ratio and a regional tier multiplier,
          clamped to the [secondary-city min, Big-7 max] band from reports.
```
The document will list, for each modeled city: the anchor city, the published anchor value, the multiplier used, and the result — so you can sanity-check or override any of them.

**Heatmap color = value → color ramp.** Each heatmap gets its own legend with real units (€/m²/month, % vacancy, rooms, persons/yr) and its min/max, so the color always maps to a stated number.

---

## 7. Transit clarity (your point #6)

Current behavior: transit reachability probes up to 16 nearby clients one-by-one via Deutsche Bahn's free API and shades a rough hull. The "1/16" was opaque. Plan:
- **Done now:** progress text spells out the modes and says "travel time to nearby client X of Y".
- **Proposed next:** add a small **mode filter** (✓ U-/S-Bahn, ✓ tram, ✓ bus, ✓ regional rail) feeding the DB API's `products` parameter, plus an **"all modes (combined)"** default that's clearly labeled. The result list will show, per reachable client, the fastest mode and total minutes. The shaded area stays flagged "approximate" until/unless we self-host a true transit-isochrone engine (a bigger, separate project).
- **Question for you (Q6):** is per-mode filtering actually useful to you, or is "all public transport combined, clearly labeled" enough?

---

## 8. How this gets built (workflow)

1. **You answer §9 + approve this plan.**
2. I pull the approved datasets, **recording every source URL + date + transformation in §10** of this file.
3. **You verify §10** ("this research is fine").
4. Only then do I wire the data into the map as new layers/basemaps, behind their own eye-toggles, with legends and the "≈ est." flags.
5. Naming conventions (kept consistent, all in this folder):
   - `data/inflow_by_state.json`, `data/hotels_osm.json`, `data/commercial_markets.json`, `data/states.geojson`, etc.
   - This doc: `ARRIVIO_DATA_EXPANSION_PLAN.md` (plan + methodology log).
   - Build parts stay in `build/`; `node build/assemble.mjs` regenerates the single HTML.

---

## 9. Questions I need answered (detailed)

See the chat prompt for the crisp version; the detail is here.

- **Q1 — Granularity.** For demand (inflow/TAM): **state-level** (16, clean, fast) or also **district-level** (~400, richer, esp. for NRW where 80% of your demand sits)? For supply: do you want **individual hotel/building pins** (OSM locations + modeled metrics) **and** aggregate heatmaps, or **heatmaps only**?
- **Q2 — "Immigrant inflow" meaning.** (a) **All** immigration, (b) **working-age** immigration, or (c) **healthcare-worker** inflow (recognitions/visas — Arrivio's actual market, my recommendation)? And for "domestic + international": **gross arrivals** or **net** migration?
- **Q3 — TAM multiplier.** Confirm **€15,000 = annual housing revenue per person**. Apply to **all inflow** (headline TAM), or also show a **SAM** = healthcare inflow × €15k (more credible)? Should the States card show both?
- **Q4 — Modeled metrics & data access.** Are you OK with **accurate regional/city heatmaps + OSM location pins carrying clearly-labeled modeled (≈ est.) per-property metrics**? And do you have **any paid data** (STR, broker reports, ImmoScout API, PropertyData) I could use to replace models with real figures?
- **Q5 — Logo.** Please drop the official Arrivio logo (SVG preferred, or high-res PNG) in this folder; I'll wire it into the tab favicon + panel wordmark. What's the exact brand color (the pink I'm using is `#d6219b`)?
- **Q6 — Transit.** Per-mode filter (bus/tram/rail toggles), or just "all public transport combined, clearly labeled"?
- **Q7 — Scope.** All of Germany, or **NRW-focused** first (since 80% of demand is there) then expand?

---

## 10. Sourcing log (filled in after approval — currently empty)

> Each dataset will be recorded here as: **source name · URL · access date · exact table/query · license · transformation applied · resulting file**. This is the audit trail that makes the heatmaps defensible.

*(pending your go-ahead)*
