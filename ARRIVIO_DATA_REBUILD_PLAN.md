# Arrivio Map — Data Rebuild Plan (acquisition-target edition)

**Date:** 2026-06-22 · **Owner:** Ayush · **Status:** PLAN — validated on real data, awaiting go-ahead for the full national pull.

This supersedes the framing in `ARRIVIO_DATA_SOURCES.md` / `ARRIVIO_DATA_EXPANSION_PLAN.md` for the **supply** layers (office & hotels). The demand layers (immigrant inflow, TAM, INKAR districts) are unchanged and stay as-is — they're already FIRM.

---

## 0. What changed — the intent (locked with you 2026-06-22)

The old build tried to paint **market statistics** (broker prime rents, city vacancy totals) across the whole country by interpolation. That's what made the heatmaps "not make sense for many places." We are replacing that intent entirely.

| Layer | OLD intent (wrong) | NEW intent (what you actually want) |
|---|---|---|
| Office / commercial | City prime-rent & vacancy smeared nationwide | **Real individual commercial/office properties for sale or lease** = conversion targets. Capture the **asking price/rate offered to a buyer/tenant**; if none is published, capture details (location, size, type, **listing URL**, contact). |
| Small / family hotels | Modeled nightly room price (ADR) | **Independent hotels as M&A / lease targets** (buy, lease, or roll into a chain). Show **listed price where found, else a per-room model**. Always label which it is (purchase vs annual lease). |
| Rendering | Smooth nationwide heatmap (invented values over empty land) | **Pins + honest clipped density** — each real property is a clickable pin; zoomed out, a density layer shows where targets concentrate. No colour over land with no data. |
| Geography | — | **All of Germany.** |

---

## 1. Why the current data is wrong (diagnosis, measured)

Grounded in the code (`build/fetch_osm.mjs`, `build/p4_app1.html`, `build/p_states.html`) and the actual grid files:

- **Rent & vacancy heatmaps** are an inverse-distance interpolation (`idw()`) from only **19 city anchors**, painted onto every OSM office cell. Rural areas get a blended rent that doesn't exist; and **vacant m² is an absolute total** being smeared spatially — mathematically meaningless.
- **Office density** = counts of OSM `office=*` nodes. Measured: **44% of cells hold a single node** (max 745) → it maps OSM coverage, not commercial-space market size.
- **Hotel price** is modeled from stars only. Measured: **85% of 23,521 cells are priced exactly €95** (the no-star default); 57 distinct values nationwide → effectively flat/meaningless.
- **Hotel rooms** are dominated by star-model defaults (45/85/25) → it's hotel-count weighted by a constant, again OSM coverage.

**Root cause:** real *per-building* rent/vacancy/price is not free, legal, open data. The honest, useful thing is **real listings** of properties that are actually on the market — which is exactly the new intent.

---

## 2. Data sources (validated 2026-06-22)

Legend — **Fetch:** `plain` = returns structured listings on a normal fetch · `browser` = JavaScript-rendered, needs the in-app browser tool · `api` = has a queryable endpoint.

### 2A. Office / commercial property listings (for sale / lease)
| Source | What it gives | Fetch | Notes |
|---|---|---|---|
| **Tranio** (`tranio.com/commercial/germany/`) | Title, type, **price €**, **area m²**, yield %, year, location, **direct listing URL** | **plain** ✅ | 515 German listings; filterable per state & per type (office buildings, offices, hotels, …). Best structured source. Aggregator. |
| **Engel & Völkers Commercial** (`engelvoelkers.com/.../commercial`) | Offices, retail, industrial, hotels for sale/lease; price, size, location | browser | Large inventory (3,500+ in Berlin alone). |
| **Properstar / Arkadia / Realting / PrimeLocation / Reedb** | Aggregated commercial listings, price + location | plain/browser (test each) | Secondary aggregators to widen coverage. |
| **Broker investment listings** (JLL, CBRE, Colliers, BNP Paribas RE, Savills, Aengevelt) | Larger investment / development assets | browser | For bigger conversion targets. |
| **OpenStreetMap** `office=*`, `building=commercial` | Locations + sometimes floor area | api (Overpass) | Keep only as a *baseline footprint* layer, clearly separate from priced listings. |

> **nexxt-change is OUT** — it explicitly excludes commercial real estate (confirmed on their site).

### 2B. Hotel M&A / lease targets
| Source | What it gives | Fetch | Notes |
|---|---|---|---|
| **Christie & Co** (`christie.com/hotels-for-sale/germany/`) | Hotels, guesthouses, boarding houses for sale; per-listing detail | browser | Listings load via their `business-search` API — needs browser render. Hotel specialist. |
| **Engel & Völkers Hotel** (`.../properties/com/sale/hotel`) | Hotels for sale, per state | browser | Dedicated hotel consulting arm. |
| **Tranio – Hotels** (`tranio.com/commercial/germany/hotel/`) | **50 hotels** with price €, area m², yield, sometimes rooms, location, URL | **plain** ✅ | Already returns real data (e.g. *Hotel 1,750 m², Munich, €9.2M, 4.95%*). |
| **OpenStreetMap** `tourism=hotel\|guest_house` | All independent hotel **locations** + rooms/stars where tagged | api | Baseline universe (~51k) to render even hotels not currently for sale, with a *modeled* acquisition estimate. |

### 2C. Benchmarks for the cost model (regional / segment)
| Source | Figure used | Date |
|---|---|---|
| European Hotel Transactions Report 2025 (Global Asset Solutions) | Avg **€210k/key**; **Midscale & Economy €229k/key**, **Upscale €307k/key** (European) | 2025 |
| CBRE Germany — hotel investment 2025 | German volume ≈ €1.9bn; **prime yield ≈ 5.8%** | 2025 |
| Christie & Co DACH Hotel Investment Report 2025 | German segment context, regional spreads | Dec 2025 |
| DLA Piper / Lexology (German lease law) | Hotel leases = **Pachtvertrag**, 10y+, **turnover rent + fixed minimum**, hybrid lease/mgmt | 2025 |

**ToS / legality stance (unchanged from your existing doc):** we use openly-browsable aggregators and broker listing pages, plus OSM (ODbL). We do **not** bulk-scrape ImmoScout24 / Immowelt / Booking.com (terms-restricted, anti-bot). We respect rate limits and keep each listing's source URL for attribution.

---

## 3. Cost model — "cost to Arrivio" (terms kept clear)

Every output is tagged **LISTED** (real asking figure from a listing) or **MODELED** (our estimate). Modeled values carry the formula below and an "≈ est." flag in the UI.

### 3A. Hotels
**Two separate numbers, never blended:**

1. **Estimated purchase price (asset value)**
   `purchase ≈ rooms × €/key(segment, region)`
   - `rooms` = listing rooms → else OSM `rooms` → else star-model (1–2★ 22, 3★ 45, 4★ 85, 5★ 140).
   - `€/key` bands (MODELED, German small/independent, anchored to the European segment figures and discounted for regional/independent assets; cross-checked against German listing-implied €/key):
     - Budget / rural independent: **€40k–80k**
     - Midscale / good regional: **€80k–140k**
     - Upper-midscale / strong city: **€150k–300k**
     - Prime city / trophy: **€300k–2,000k** (rare)
   - Regional multiplier by state/city tier (A-cities ×1.3–2.0, secondary ×1.0, rural ×0.7).

2. **Estimated annual lease (Pacht)**
   `lease ≈ asset value × prime yield (~5.8%)`  *(sale-leaseback equivalent)*
   — or, where revenue is known, `≈ turnover × 20–25%`. Shown as a separate line, labelled "est. annual lease."

> Where a hotel is **actually listed for sale**, we show the **LISTED** asking price and skip the model (but still show the modeled lease for comparison). This is the "both: listed where found, else modeled" rule you chose.

### 3B. Offices / commercial
- If the listing has an **asking sale price** or **lease €/m²/mo** → show it verbatim (LISTED) + the source URL.
- If **price on request** → show the property's **details only** (location, size, type, contact, URL), flagged "price on request." No invented number.
- Optional convenience metric: `€/m²` = price ÷ area, when both are listed (LISTED-derived).

All factors live in the workbook (`Cost model` sheet) so you can override any band.

---

## 4. Filter → Normalize → Validate (the methodology you asked for)

### Filter
- Keep only **real commercial stock / on-market assets** (drop OSM noise that isn't a building/space).
- Hotels: keep **small / independent** (tighten the chain-exclusion list; current regex lets some mid-chains through).
- Keep **current** listings only; record the capture date.
- **Dedupe across sources** (same property on Tranio + a broker) by location + size + price proximity.

### Normalize (this is the real fix to your complaint)
- **One record per property**, geocoded to `lat/lng`, into a single schema (see §5).
- **Currency €**, consistent units (m², €/m², €/key, rooms).
- **Type taxonomy**: office, mixed-use, retail-convertible, hotel, guesthouse, …
- **Rates vs absolutes handled correctly**: a price is attached to its *pin*, never spread across space.
- **Density layer** = count/weight of pins per H3 hex, **clipped** so empty land stays blank (no interpolation).
- Provenance fields on every record: `source`, `source_url`, `captured`, `confidence` (LISTED/MODELED).

### Validate
- **Cross-source check**: dedupe + compare overlapping listings; flag >20% disagreement.
- **Sanity bounds**: €/m² and €/key within published market ranges; flag outliers for review.
- **Reconcile** hotel transaction €/key vs the European/German benchmarks in §2C.
- **Manual spot-check** a random sample of ~20 records against their live URLs.
- **Old-vs-new diff**: a report listing what changed from the current map so you can see exactly what moved.
- A subagent does an independent pass on the final dataset before hand-off.

---

## 5. Deliverables & hand-off to Claude Code

1. **`Arrivio_Source_Map.xlsx`** — provenance + how-used (this session): Sources, Sample listings (real), Cost model, Field→UI mapping.
2. **`data/properties.json`** — normalized national dataset for the map. Proposed record schema:
   ```json
   {
     "id": "tranio-2483795",
     "kind": "hotel",                  // or office, mixed_use, retail, ...
     "name": "Hotel in Munich",
     "lat": 48.14, "lng": 11.57,
     "city": "Munich", "state": "Bayern",
     "area_m2": 1750, "rooms": null, "stars": null,
     "listed_price_eur": 9200000,      // null if price on request
     "price_basis": "LISTED",          // or MODELED
     "est_purchase_eur": null,         // MODELED, only when not listed
     "est_lease_eur_yr": 533000,       // MODELED
     "eur_per_m2": 5257, "yield_pct": 4.95,
     "source": "Tranio",
     "source_url": "https://tranio.com/commercial/germany/adt/hotel-in-munich-2483795/",
     "captured": "2026-06-22"
   }
   ```
3. **Build script** (`build/fetch_listings.mjs`): paginate Tranio per state/type (plain fetch); a browser pass for Christie & Co + Engel & Völkers; geocode; dedupe; apply the cost model; emit `properties.json` + a clipped density grid. Resumable & reproducible, like the existing `fetch_osm.mjs`.
4. **Map wiring** (Claude Code): render pins (click → full card with price/details/source link) + the honest density layer; retire the IDW rent/vacancy surfaces.

---

## 6. What I need from you to start the full pull
1. **Approve the source list** in §2 (or add portals you prefer / have access to).
2. **Confirm the €/key bands** in §3A (or give me your own acquisition assumptions).
3. Tell me if you have **any paid access** (a broker relationship, STR/Fairmas, an ImmoScout business API) — it would upgrade modeled fields to real ones.

On your go, I run the national pull, build `properties.json`, fill the rest of the source-map workbook with every captured listing, run the validation pass, and hand a wired-in branch to Claude Code.
