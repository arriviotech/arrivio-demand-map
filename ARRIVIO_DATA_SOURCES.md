# Arrivio Map — Data & Sourcing Log (FOR YOUR VERIFICATION)

This is the audit trail behind every number that will go on the map. **Please read and confirm
("research is fine") before I wire any of it in.** Decisions locked with you: all-immigration
headline + composition breakdown; heatmaps + labeled estimates; TAM **and** SAM on the States card
(€15,000 = housing value per person — one-time, NOT annual); state-level, all Germany first.

Legend: **[FIRM]** = taken directly from an official table / broker report · **[EST]** = modeled,
with the method shown · **[PROXY]** = a stand-in because the real per-unit data isn't public.

---

## 1. Immigration by federal state → TAM  **[FIRM]**

Source: Destatis *Außenwanderungen nach Bundesländern* (gross arrivals from abroad, all
nationalities). Most recent fully-consistent year = **2025** (the 16 values reconcile exactly to the
national total 1,479,944). National context: 2023 = 1,932,509; 2024 = 1,694,192; 2025 = 1,479,944
(2023–24 were higher due to the Ukraine/asylum peak).

**TAM = immigration × €15,000 per person.**

| Bundesland | Immigration 2025 | Population | **TAM (€)** |
|---|---:|---:|---:|
| Nordrhein-Westfalen | 291,143 | 18,034,454 | **4.37 bn** |
| Bayern | 254,779 | 13,248,928 | **3.82 bn** |
| Baden-Württemberg | 212,190 | 11,245,898 | **3.18 bn** |
| Niedersachsen | 136,920 | 8,004,489 | **2.05 bn** |
| Hessen | 121,947 | 6,280,793 | **1.83 bn** |
| Berlin | 111,064 | 3,685,265 | **1.67 bn** |
| Rheinland-Pfalz | 72,282 | 4,129,569 | **1.08 bn** |
| Sachsen | 54,044 | 4,042,422 | **0.81 bn** |
| Schleswig-Holstein | 43,723 | 2,959,517 | **0.66 bn** |
| Hamburg | 40,093 | 1,862,565 | **0.60 bn** |
| Sachsen-Anhalt | 32,838 | 2,135,597 | **0.49 bn** |
| Brandenburg | 30,531 | 2,556,747 | **0.46 bn** |
| Thüringen | 27,176 | 2,100,277 | **0.41 bn** |
| Mecklenburg-Vorpommern | 20,282 | 1,573,597 | **0.30 bn** |
| Saarland | 15,693 | 1,012,141 | **0.24 bn** |
| Bremen | 15,237 | 704,881 | **0.23 bn** |
| **Germany** | **1,479,944** | **83,577,140** | **€22.2 bn** |

> Note: this is the **all-immigration** TAM (upper bound — assumes every arrival is addressable).
> If you'd rather anchor TAM on 2024 (≈+15% higher), I can swap once you confirm; 2025 is used
> because it's the only year with a clean, reconciled per-state split.

### 1b. What the immigration is made of (the breakdown you asked for) **[FIRM]**
National composition (2023/2024):
- **By entry basis:** ~33% EU free movement · ~21% humanitarian (granted protection) · ~16–21%
  asylum procedure pending · ~10% family reunification · **~6% work/skilled-worker** · ~5% study.
  (EU citizens are the largest single group but carry no "purpose" code; work/asylum/family
  percentages are shares of the ~1.13 M third-country arrivals — see caveat.)
- **Top origin countries 2024:** Ukraine 221,570 · Romania 173,563 · Turkey 88,690 · Syria ~93,335.
  (2023: Ukraine 276k, Romania 189k, Turkey 126k, Poland 106k, Syria 102k, India 50k.)
- **Continental 2024:** Europe 61% (EU 33%) · Asia ~20% · Africa ~5% · Americas/Oceania ~4%.

This breakdown will appear in the States card so the headline TAM is honest about its mix.

---

## 2. Healthcare-worker inflow → SAM  **[FIRM national] / [PROXY per state]**

Arrivio's *serviceable* market. **[FIRM]** national: **32,500 foreign nursing professionals
recognized in 2024** (41% of all recognitions, +19% YoY); nursing = the #1 recognized profession
(22,425 applications). Physicians ≈ 11,000 more. **No per-state recognition table exists** (decided
by 16 separate state authorities, published only nationally), so per-state is a **[PROXY]**:
population share × 32,500, which I'll upgrade to hospital-nursing-staff share if you want (Destatis
"Grunddaten der Krankenhäuser" Excel).

**SAM = healthcare recognitions × €15,000/yr.**

| Bundesland | Nursing recognitions (proxy) | **SAM (€)** |
|---|---:|---:|
| Nordrhein-Westfalen | ~7,000 | ~105 m |
| Bayern | ~5,150 | ~77 m |
| Baden-Württemberg | ~4,400 | ~66 m |
| Niedersachsen | ~3,150 | ~47 m |
| Hessen | ~2,500 | ~38 m |
| Sachsen | ~1,600 | ~24 m |
| Rheinland-Pfalz | ~1,600 | ~24 m |
| Berlin | ~1,500 | ~23 m |
| Schleswig-Holstein | ~1,150 | ~17 m |
| Brandenburg | ~1,000 | ~15 m |
| Sachsen-Anhalt | ~840 | ~13 m |
| Thüringen | ~820 | ~12 m |
| Hamburg | ~745 | ~11 m |
| Mecklenburg-Vorpommern | ~625 | ~9 m |
| Saarland | ~385 | ~6 m |
| Bremen | ~275 | ~4 m |
| **Germany** | **32,500** | **€488 m** |

Origin mix (recognized nurses, employed stock): Bosnia 11,300 · Philippines 9,400 · Turkey 9,100 ·
Serbia 8,400 (+ EU: Poland, Croatia, Romania). 306,700 foreign nurses employed = 17.8% of the
workforce (2025).

---

## 3. Hotel occupancy + room price (for hotel heatmaps)  **[FIRM nat'l] / [EST per state & per star]**

- **[FIRM]** National 2024: room occupancy **67%**, ADR **€119**, RevPAR **€70** (CoStar).
- **[FIRM]** Bed occupancy by state (Destatis basis, all accommodation ≥10 beds): Hamburg ~57% and
  Berlin ~56% lead; national 37.9%; eastern states lowest (Brandenburg ~28%, Saxony-Anhalt ~27%,
  H1). **[EST]** the other 12 states sit between these anchors (exact full-year split is paywalled;
  free via Destatis GENESIS table 45412-0012 if you want all 16 exact).
- **[EST]** ADR by star (ordering, not precise): 1★ ≈ €62 · 2★ ≈ €78 · 3★ ≈ €105 · 4★ ≈ €135 ·
  5★ ≈ €250. Anchored to the firm €119 national average (which sits 3★–4★).
- **Confirmed:** per-individual-hotel occupancy/price is **not public** anywhere — only regional
  aggregates. So hotel **pins** (from OpenStreetMap) will carry **[EST]** occupancy = state bed-
  occupancy, and **[EST]** room price = ADR(state) × star factor × city-tier factor (see §6).

---

## 4. Office / commercial market by city (for commercial heatmaps)  **[FIRM Big 7 + 13 cities]**

Primary source: **BNP Paribas RE — Büromarkt Deutschland Q4 2025** (one consistent table), with
Colliers Q2 2025 for average rents and JLL for the aggregate. Per-building prices are **not public**
(confidential/paywalled) — these city aggregates are the honest layer.

| City | Prime €/m²/mo | Avg €/m²/mo | Vacancy % | Vacant m² |
|---|---:|---:|---:|---:|
| Berlin | 47.0 | 27.0 | 8.9 | 1,931,000 |
| Munich | 58.0 | 26.6 | 7.9 | 1,824,000 |
| Frankfurt | 54.0 | 29.0 | 12.1 | 1,879,000 |
| Hamburg | 38.0 | 21.3 | 6.3 | 924,000 |
| Düsseldorf | 46.0 | 19.4 | 12.7 | 1,275,000 |
| Cologne | 33.5 | 21.7 | 6.3 | 497,000 |
| Stuttgart | 37.0 | 21.1 | 6.4 | ~581,000 (est.) |
| Leipzig | 21.0 | — | 5.7 | 230,000 |
| Essen | 20.0 | — | 8.9 | 287,000 |
| Hannover | 24.5 | — | 6.3 | ~341,100 |
| Nuremberg | 19.5 | 12.5 | 8.9 | ~373,200 |
| Dresden | 23.0 | 13.4 | 4.3 | 130,000 |
| Dortmund | 23.0 | 14.6 | 4.2 | 136,000 |
| Bonn | 24.0 | — | 3.5 | 140,960 |
| Münster | 22.0 | 14.7 | 2.9 | 68,600 |
| Mannheim | 22.0 | — | 6.4 | — |
| Bochum | 16.5 | — | 6.0 | — |
| Bremen | ~16–17 (est.) | — | 3.0 | — |
| Karlsruhe | ~16.5 (est.) | — | low | ~110,000 |

Big 7 aggregate: ~8.3% vacancy, ~8.3 M m² available. **Caveat:** brokers disagree on the same
city (e.g. Munich prime €55–60 depending on broker); I standardize on BNP Q4 2025 for consistency.

---

## 5. The five heatmaps — exactly what each will plot

| # | Heatmap | Data driving the color | Basis |
|---|---|---|---|
| 1 | Immigrant inflow | §1 immigration per state (toggle: all vs healthcare) | **FIRM** |
| 2 | Family-hotel room price | §3 ADR(state)×star×city-tier on OSM hotel points | **EST** (model) |
| 3 | Family-hotel room availability | OSM hotel count × est. rooms × (1−occupancy §3) | **EST** (model) |
| 4 | Empty office/commercial m² | §4 vacant m² per city | **FIRM** (Big 7+) |
| 5 | Office/commercial rent | §4 prime/avg €/m²/mo per city | **FIRM** (Big 7+) |

---

## 6. Pricing model (the logic you asked to see) — now with real anchors

**Hotel room price for a hotel in city c, star s:**
```
ADR(c,s) = ADR_state(state of c)        // from §3 (national €119 where state ADR unknown)
           × star_factor(s)             // 1★0.59 · 2★0.74 · 3★1.00 · 4★1.29 · 5★2.38  (from §3 star ladder, 3★=base)
           × city_tier(c)               // A-city 1.10 · large 1.00 · mid 0.95 · small 0.90  (A-cities RevPAR +9–11% over nat'l; B-cities −17%, §3)
```
**Hotel rooms available (for #3):** `rooms_est(hotel) = OSM rooms if tagged, else star→size table
(1–2★ ≈ 20, 3★ ≈ 45, 4★ ≈ 90, 5★ ≈ 150)`, then `free_rooms = rooms_est × (1 − occupancy_state)`.

**Office rent for a city without a broker figure:** anchor to the nearest reported city in the same
region, scale by population ratio, clamp to the secondary-city band €14.5–24.5 (§4 / DZ HYP range).
Every modeled city will be listed with its anchor + multiplier when built.

Each heatmap legend shows real units (€/m²/mo, % vacancy, rooms, persons/yr) and its min–max, so
color always maps to a stated number. Modeled values get an "≈ est." flag in the UI.

---

## 7. Full source list (every URL, what came from it)

**Immigration / population:** Destatis Außenwanderungen-nach-Bundesländern table; Destatis PD24_247
(2023 totals), PD25_224 (2024), PD26_184 (2025); IT.NRW & Bayern LfStat & Hessen state releases;
BAMF Migrationsbericht 2023 (PDF) & 2024 (Bundestag Drs. 21/4300); Destatis Gemeindeverzeichnis
population xlsx (31.12.2024). **Healthcare:** Destatis PD25_321 (32,500 nursing recognitions);
BIBB anerkennung-in-deutschland.de 211837 (22,425 applications) & 2023/2024 evaluations; Destatis
PD24_346 (2023); IAB FB 22/2024 (origin stock); Mediendienst Integration (306,700 employed);
Destatis Grunddaten der Krankenhäuser 2023 (per-state nursing-staff upgrade key); BA
Pflegeberufe report (vacancies). **Hotels:** CoStar via fvw.de & hotelvor9.de (67%/€119/€70);
Statista 72869 / Destatis 45412-0012 (bed occupancy by state); Christie & Co Dec-2025 snapshot
(city YoY); Destatis PD25_053 (496.1 M overnight stays); DTV Zahlen-Daten-Fakten 2025; Sparkassen-
Tourismusbarometer Ostdeutschland (east occupancy). **Office:** BNP Paribas RE Büromarkt
Deutschland Q4 2025 (+ Dresden/Dortmund city reports); Colliers Top-7 Q2 2025 & City Survey; JLL
Big-7 + Hannover/Nürnberg/Leipzig Q4 2025; Cushman & Wakefield Top-5 (vacancy anchors); Savills
Prime Office Q3 2025; DZ HYP Regionenstudie 2025/26; city offices Bonn/Münster/Bochum/Bremen.
*(Exact deep links are preserved in the research notes; I'll inline them next to each dataset file
when I build the data/ folder after your approval.)*

---

## 7b. Built so far (on the map)
- **States basemap + TAM card** — LIVE. State boundaries from
  [isellsoap/deutschlandGeoJSON](https://github.com/isellsoap/deutschlandGeoJSON) (`2_bundeslaender/4_niedrig`,
  public, simplified to 3-decimal precision = 36 KB inlined). Choropleth colored by **TAM**, with
  state-name + TAM labels and an International ⇄ +Domestic toggle (legend and in-card, synced).
  Click a state → population, inflow, **TAM (international & +domestic)** + national inflow-mix
  footnote. **SAM was removed per request — TAM only.**
- **Data updated to firm 2024 figures** from a single authoritative table — Destatis *Statistischer
  Bericht Wanderungen 2024*, table **12711-12 "Wanderungen über die Grenzen der Bundesländer nach
  Reichweite der Wanderung 2024"**: per state, `intl` = arrivals from abroad, `total` = arrivals
  incl. from other German states (both FIRM; the 16 reconcile exactly to the national 1,694,192 /
  2,698,688). This **replaced the earlier 2025-abroad + ×1.36 estimate**, so the International vs
  +Domestic toggle now reflects real per-state differences (e.g. Brandenburg total/abroad = 2.66,
  Hamburg 2.14, NRW 1.39 — domestic-heavy states genuinely re-rank under +Domestic).
- **Heatmap palette** — all heatmaps (states choropleth + client demand hexmap) now share one
  sequential brand-pink ramp where **light = less, dark = more**.
- **Commercial concentration layer** (replaces the old office bubbles) — LIVE. An OpenStreetMap-
  derived **density hexmap across all of Germany**: every `office=*` site (≈ all 25 country tiles,
  fetched via Overpass API and aggregated to a ~2 km grid at build time → `build/commercial_grid.json`,
  22,230 weighted cells) is binned into H3 hexes client-side and colored light→dark = fewer→more
  sites. Resolution coarsens with zoom; aggregation is viewport-filtered and colors use a cached
  global max, so it stays smooth. The 19-city broker rent/vacancy data is preserved as **clickable
  city dots** on top (prime rent, average rent, vacancy %, vacant m²). Source: OpenStreetMap (ODbL);
  broker reports (§4). Fetch/aggregate script: `build/fetch_osm.mjs` (resumable, tiles cached in
  `build/osm_tiles/`, gitignored).
- **Hotel rooms (small / family) layer** — LIVE. OSM `tourism=hotel|guest_house` across Germany,
  **filtered to small / independent** (major chains excluded by brand/operator/name), 51,541 found.
  Rendered as a **room-availability density hexmap** (rooms summed per H3 cell, light→dark = fewer→
  more rooms; `build/hotel_grid.json`, 23,521 cells) at country/regional zoom, switching to
  **individual clickable hotels** when zoomed in (top 6,000 by room count baked → `hotels_osm.json`,
  viewport-capped to 1,500 on screen). Per-hotel rooms = OSM `rooms` tag where present, else modeled
  from stars; nightly rate = modeled from stars (both flagged "est"). Source: OpenStreetMap (ODbL).
  **All three density heatmaps (demand / commercial / hotels) are mutually exclusive** — only one
  renders at a time, for clarity and performance.
- *(superseded)* ~~Office / commercial market bubble layer~~ — LIVE (eye toggle "Office market"). 19 cities as bubbles
  where **size = vacant office m²** (availability) and **color = prime rent €/m²/mo**; click a city →
  prime rent, average rent, vacancy %, vacant m². FIRM from broker reports (BNP Paribas RE Büromarkt
  Deutschland Q4 2025; Colliers Top-7 Q2 2025; JLL/C&W) — see §4. City coordinates are standard
  centroids; the 4 cities without a published vacant-m² (Stuttgart/Mannheim/Bochum/Bremen/Karlsruhe
  partials) are flagged "est" in the card. This delivers two of the requested heatmaps (availability
  + rents) in one layer. **Note: this is city-level — per-building data is not public (see §2).**

## 8. Honest gaps (so there are no surprises)
- **Per-state healthcare** is a population proxy until I pull the hospital-nursing-staff Excel.
- **Per-hotel** occupancy/price/rooms are **modeled** — real per-property data isn't public.
- **Per-building** commercial prices don't exist openly; commercial layer is **city-level**.
- Office figures are **Q4 2025** (freshest); hotel/immigration are **2024/2025**. Mixed vintages,
  each labeled.
- "Family/small" hotels: OSM has no such tag — I'll infer (no major-chain brand + small size) and
  label it an inference.

---

## 9b. Targomo Loop — can we populate our dataset from it? (assessment)

I opened your premium map (`loop.targomo.com/x/323a3ae3…`, titled "Arrivio") and inspected what it
actually serves. Findings and the blunt verdict:

**What your Targomo premium provides:**
- **Statistical data = infas360 (2025)** — a *commercial, licensed* dataset: total population,
  household income, households by income band (e.g. "Households 5000+ € net"), purchasing power,
  demographics — at hexagon / **PLZ** (postcode) / **Gemeinde** (municipality) / **state**
  granularity.
- **POI API** (amenities, competitors), **Reachability/Isochrone API** (true multi-modal
  travel-time polygons — Targomo's core strength), and boundary layers (PLZ, Gemeinden, states).
- All served from **`api.targomo.com` with an API key** tied to your account. Basemaps via MapTiler.
- **It is demand/demographics + travel-time. It does NOT contain our supply-side data** (family
  hotels for acquisition, office vacancy/rents, hotel occupancy). Targomo *complements* the Destatis/
  broker research above; it does not replace it.

**Three paths, with verdicts:**

| Path | Verdict | Why |
|---|---|---|
| **A. Export infas360 data → bake into our public file** | ❌ **No** | infas360 is licensed third-party data; Targomo ToS + infas360 licence prohibit extraction/redistribution. Publishing it on our public GitHub Pages would breach both and expose Arrivio. The map being public makes this unambiguous. |
| **B. Live Targomo API layers (your key, fetched at runtime)** | ✅ **Yes — the real unlock** | Licensed, intended use. Add infas360 demographic hexagons + **real travel-time isochrones** + POIs as live layers. Data stays Targomo's (not redistributed). This makes the map genuinely Targomo-grade with *real* demographics and replaces our approximate transit hull with true isochrones. |
| **C. Cross-validate our numbers against Targomo** | ✅ **Yes — always fine** | Use your Loop account (as intended) to sanity-check our Destatis figures (population/income by area). Record agreement here as a confidence boost. No redistribution. |

**Recommendation:**
1. **Keep our Destatis/broker layers** for everything Targomo lacks: immigrant inflow, TAM/SAM,
   hotel occupancy, office vacancy/rents, supply pins. (This is most of the new build.)
2. **Add Targomo as live API layers** for what it does best — **real reachability isochrones** (the
   single biggest upgrade; replaces the approximate transit area) and **infas360 demographic
   heatmaps** (population/income/purchasing-power) as an optional toggle — **only if** you have a
   **developer API key** (next point).
3. **Cross-validate** a few of our numbers vs infas360 and note it here.

**What I need from you for Path B (and the honest caveats):**
- A **Targomo developer API key** for *your own* use. The key embedded in the Loop web app is
  provisioned for `loop.targomo.com` (almost certainly domain-locked) — reusing it in our app would
  likely breach ToS and I can't read it anyway (the browser masks it, correctly). Ask your Targomo
  account manager whether your premium plan includes **API access** and a key usable on your own
  domain, plus the **monthly request quota**.
- **Key security:** like the OpenRouteService key, a Targomo key in a public single-file app is
  exposed. We'd domain-restrict it (Targomo supports referrer restriction) and/or proxy it; otherwise
  anyone could spend your quota. Confirm before we ship it publicly.
- **Licence for display:** confirm your plan permits showing infas360 data to your audience in your
  own app (not just inside Loop). Reachability is normally fine; third-party statistics may be
  Loop-only on some plans.

**Bottom line:** we should NOT copy Targomo/infas360 data into our files, but if your plan gives a
usable API key we can wire Targomo in *live* — real isochrones + real demographics — which is better
than copied data anyway (always current, fully licensed). Tell me about the API key and I'll add it.

---

## 9. What happens after you say "research is fine"
1. I build `data/` files: `inflow_states.json`, `states.geojson`, `hotels_osm.json`,
   `commercial_markets.json`, each with its sources inlined.
2. I add to the map: a **States** basemap (choropleth by TAM, click → TAM+SAM+breakdown card), the
   **5 heatmap** layers (own eye-toggles + legends + "≈ est." flags), hotel/commercial pins, and the
   transit clarity upgrade.
3. You review on the map; we refine what's useful vs noise.
