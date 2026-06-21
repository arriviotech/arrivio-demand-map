# Arrivio Map — Data Provenance & Expansion Scope

**Purpose:** one place that answers, for *every* thing on the map, "where did this come from and how
trustworthy is it" — plus a concrete menu of what we *could* add next and how.

- For the deep methodology (exact tables, formulas, pricing model) see **[ARRIVIO_DATA_SOURCES.md](ARRIVIO_DATA_SOURCES.md)**.
- Confidence key: **FIRM** = official/authoritative source · **MODELED** = estimated with a documented
  formula · **HEURISTIC** = best-effort classification that can be wrong on edge cases.

---

## Part A — What's on the map today, and where each piece comes from

### 1. Client demand (the 185 hospital/care-org pins)
| Field | Source | Confidence |
|---|---|---|
| Which organisations, their state, rooms needed, talents/yr, requirements | **Your `Client demand.xlsx`** (185 rows) — the authoritative business input | FIRM (your data) |
| Exact map location (lat/lng) of each client | Geocoded from the client name + state via **OpenStreetMap / Photon (komoot)**, then baked in; 179 exact, 5 town-level, 1 region-level | FIRM for 184, flagged for 1 |
| "Demand hexmap" (pink density) | Built **from the clients above** — each client's room count summed into H3 hexes | FIRM (derived from your data) |

So everything client-side traces back to your spreadsheet; only the *pin coordinates* are external (OSM geocoding), and they're frozen in the file so they never drift.

### 2. States basemap → TAM
| Field | Source | Confidence |
|---|---|---|
| State boundaries (the 16 shapes) | **deutschlandGeoJSON** (public, from German federal mapping/BKG), simplified | FIRM |
| International inflow per state (2024) | **Destatis** table 12711-12 "Wanderungen über die Grenzen der Bundesländer 2024" — arrivals from abroad | FIRM |
| Total inflow per state (incl. domestic, 2024) | Same Destatis table — arrivals from abroad **+** from other German states | FIRM |
| Population per state | **Destatis** (31.12.2024) | FIRM |
| **TAM** = inflow × €15,000 per person | Your assumption (housing value per person — NOT annual); the €15k is the only modeled input | FIRM data × your assumption |

### 2b. Immigrant inflow (DISTRICT-level overlay — mixable with point layers)
A toggleable **overlay** (Layers → "Immigrant inflow") that colors each of the **~400 German
districts (Kreise)** by immigrant settlement intensity — fine enough to actually pick a location.
Semi-transparent, rendered in a dedicated pane *under* the pins so it combines with clients, proposed
areas, hotels, etc. **International only ⇄ Intl + domestic** toggle (panel + click card); clicking a
district shows both options plus the international / domestic / foreign-share figures.
- **Data:** INKAR (BBSR Bonn), 2023, fetched live via its JSON API (`build/fetch_inkar_inflow.mjs`).
  Values are **net migration saldo per 1,000 inhabitants** (arrivals − departures): `intl` =
  Außenwanderungssaldo (international), `total` = Gesamtwanderungssaldo (incl. domestic), plus
  `domestic` and foreign-population share. **FIRM**, all 400 districts.
- **Boundaries:** opendatalab-de Kreis GeoJSON (BKG VG250, simplified to 448 KB), joined on the
  5-digit `AGS`. 400/401 join (Eisenach 16056 merged into Wartburgkreis in 2021 → renders neutral).
- **Honest caveat:** these are **rates (per 1,000), net, not absolute headcounts** — great for
  "where is settlement intensity highest" (density-normalized), but for absolute "arrivals from
  abroad" counts per district you'd need Destatis GENESIS table 12711 (registration-gated). Color is
  capped at the 95th percentile so one outlier district doesn't wash out the map.
- Shares the pink scale and swaps with the other area heatmaps (one at a time); distinct from the
  "States · TAM" basemap (full-screen €-value, state-level).

### 3. Office & commercial (layer has a 3-way metric toggle: Density / Rent / Vacant m²)
| Metric | What it shows | Source | Confidence |
|---|---|---|---|
| **Density** (default) | All-Germany hexmap of office/commercial *site concentration* | **OpenStreetMap** `office=*`, fetched country-wide via **Overpass** in 25 tiles → ~2 km grid (22,230 cells) → hexes in-browser | FIRM locations (OSM coverage varies) |
| **Rent** | **Filled hexmap** of prime office rent — the real city values interpolated (inverse-distance) across all office locations | Anchors: broker reports (Big-7 + ~12 cities); fill: IDW model | FIRM anchors / MODELED fill |
| **Vacant m²** | **Filled hexmap** of vacant office space, same IDW fill from the city anchors | Same | FIRM anchors / MODELED fill |
| (click any city dot) | Full card with the *measured* figures: prime rent, average rent, vacancy %, vacant m² | Broker reports | FIRM |
| Rent & vacancy are **published only per major city** (market statistics, not per-building). The hexmap *fills* the map by interpolating those real anchors across the office locations we have from OSM, so it reads as a heatmap — values away from a measured city are modeled; click the nearest city dot for the firm figure. | | | |

### 4. Small / family hotels (layer has a metric toggle: Rooms / Price)
| Metric | What it shows | Source | Confidence |
|---|---|---|---|
| **Rooms** (default) | All-Germany hexmap of *room availability* (rooms summed per hex) | OSM rooms tag, else modeled from stars | FIRM where tagged, else MODELED |
| **Price** | All-Germany hexmap of *average nightly rate* per area | Modeled from star rating, averaged per hex | MODELED |
| Hotel locations | **OpenStreetMap** `tourism=hotel` / `guest_house` (51,541 found via Overpass) | OSM | FIRM locations |
| "Small / independent" filter | excludes major chains by brand/operator/name; some mid-scale chains slip through | — | HEURISTIC |
| (zoom in) individual clickable hotels | name, est. rooms, stars, est. nightly rate | OSM + model | FIRM loc / MODELED metrics |

### 5. Partner hotels (GCH = amber, Seminaris = green)
| Field | Source | Confidence |
|---|---|---|
| Which hotels, their cities | **GCH Hotel Group** and **Seminaris** public portfolios (37 GCH + 8 Seminaris) | FIRM (names/cities) |
| Exact location | Geocoded in-browser via Photon, cached | FIRM (city-accurate) |

### 6. Reachability & supporting layers
| Layer | Source | Confidence |
|---|---|---|
| Bike/walk isochrones | **OpenRouteService** API (live) | FIRM (engine) |
| Public-transport travel times | **transport.rest** (Deutsche Bahn, live) — exact times; shaded area is an approximation | FIRM times / approx area |
| Bike-share stations | **nextbike GBFS** live feeds | FIRM (live) |
| Basemaps (Clean/Dark/Light/Detail/Satellite) | CARTO, OpenStreetMap, Esri tiles | FIRM |

---

## Part B — Scope: data we *could* add next (and how)

The same split from §2 of the sources doc applies: **regional/official aggregates are easy and
accurate; per-individual-property facts (each hotel's real price/occupancy) are not openly available**
and would be modeled. Below, each candidate is rated **Feasible / Partial / Hard** with its real source.

### B1. Hotel average pricing by area  — **Partial**
- **Accurate at regional level (Feasible):** average daily rate (ADR) / RevPAR by region exists in
  tourism-industry reports (Destatis turnover proxies, *Treugast*, *Fairmas*, *hotelverband IHA*,
  *STR* if you have a subscription). → a regional **hotel-price heatmap** (modeled per city/region).
- **Per-hotel real nightly price (Hard):** lives on Booking.com / HRS / Expedia. Scraping breaks
  their terms and is unreliable; the clean route is a paid API (e.g. **Amadeus/RateGain/STR**) or a
  manual sample. Without that, per-hotel price stays a star-based model (as today).

### B2. Hotel availability / occupancy by area  — **Feasible**
- **Destatis publishes occupancy (Bettenauslastung / Auslastung der Schlafgelegenheiten) by
  Bundesland and by *Reisegebiet* (tourism sub-region)** — real, free, regularly updated.
- → a genuine **occupancy heatmap** (which regions' hotels are full vs empty = acquisition signal),
  accurate at region level. This is one of the best-value additions and is low-effort.

### B3. Student inflow by area  — **Feasible**
- **Destatis Hochschulstatistik** and the individual universities publish **enrolled students
  (Studierende), incl. international students, per university / city** — free and authoritative.
- → a **student-concentration heatmap** by university city (and an international-students variant),
  which maps directly onto Arrivio's near-market (student housing demand). Medium effort (compile
  per-university enrolment, geocode the campuses).

### B4. Healthcare-worker inflow by area  — **Partial**
- National nurse-recognition totals are FIRM (~32,500 in 2024); a clean **per-state** table isn't
  published (decided by 16 separate authorities). Best proxies: **Bundesagentur für Arbeit** job-
  vacancy data for care roles per region, or hospital-nursing-staff counts (Destatis "Grunddaten der
  Krankenhäuser"). → a **healthcare-demand heatmap** at state/district level (partly modeled).

### B5. Residential rent levels by area  — **Feasible (regional)**
- Asking-rent indices by city/district exist from **Destatis**, regional statistics offices, and
  published market indices (e.g. *F+B*, *empirica*, *IW*). → a **rent-level heatmap** to gauge what
  Arrivio can charge / convert economics per area. Per-listing data (ImmoScout) is ToS-restricted.

### B6. Population / purchasing-power demographics  — **Feasible via Targomo (live API only)**
- Your **Targomo Loop** premium has infas360 demographics (population, income, purchasing power) at
  hex/postcode/state. As established, we **must not copy** that licensed data into the public file,
  but **if your plan includes an API key** we can show it as a *live* layer (and get real travel-time
  isochrones too). Pending your check with Targomo on API access. See sources doc §9b.

### B7. Competitor supply (coliving / student housing / serviced apartments)  — **Partial**
- Providers (e.g. The Social Hub, Stayery, i Live, Quarters, Habyt) list their locations publicly;
  these can be compiled into a **competitor layer** (where supply already exists). Some via OSM,
  some manual. Useful for white-space analysis (demand high + competitors low = opportunity).

### B8. Transport accessibility score  — **Feasible (heavier)**
- A real public-transport accessibility/isochrone layer needs a self-hosted engine (MOTIS /
  OpenTripPlanner with German GTFS). Bigger project, but turns the approximate transit area into
  true reachability polygons. (Already noted as a Stage-3 item.)

### Quick priority view
| Candidate | Source | Feasibility | Value to Arrivio |
|---|---|---|---|
| Hotel occupancy by region (B2) | Destatis | **Feasible, low effort** | High (acquisition signal) |
| Student inflow (B3) | Destatis/universities | **Feasible, medium** | High (near-market) |
| Residential rent levels (B5) | Destatis/indices | **Feasible, medium** | High (unit economics) |
| Hotel pricing (B1) | Reports / paid API | Partial | Medium |
| Healthcare inflow by region (B4) | BA / Destatis | Partial | High |
| Demographics/isochrones (B6) | Targomo API | Feasible *if you have a key* | High |
| Competitor supply (B7) | Public sites/OSM | Partial | High (white-space) |

Tell me which of these to pull next and I'll add it the same way: research → record the source here →
build the layer (off by default, viewport-optimized, mutually exclusive with the other heatmaps).

---

## Part C — How the data is kept honest
- Raw OSM is fetched by `build/fetch_osm.mjs` (resumable; tiles cached in `build/osm_tiles/`), then
  aggregated to the compact `build/*_grid.json` / `hotels_osm.json` that get inlined by
  `build/assemble.mjs`. Re-running is reproducible.
- Every modeled number is flagged "est" in the UI and has its formula in the sources doc.
- Nothing licensed (Targomo/infas360, broker per-building data) is copied into the public file.
