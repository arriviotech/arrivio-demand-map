# Full-capture engine — grab everything, tag every type, keep every source link

**Goal:** capture **all** listings we can reach — every asset type (offices, halls, retail, **land/plots as land/plots**, hotels, gastronomy-with-rooms, mixed-use, apartment buildings) — from the broker sites + open portals, into one file: **`data/broker_listings_all.csv`**. Capture *everything* now (no restrictive price/area cap); sorting to "what fits Arrivio" happens later via the app's sliders. Output is already seeded with 66 JLL Düsseldorf offices.

## Non-negotiables
- **Tag every row's `asset_type` exactly** — `office · industrial_hall · retail · land_plot · hotel · gastronomy_with_rooms · mixed_use · apartment_building · other`. Land is `land_plot`, never merged into a building type. This prevents the "messy/confused info" the brief warns about.
- **Every row keeps `source` + `source_url`** (the listing link, or the filtered search URL if no per-listing link).
- **Never fabricate.** Blank where a field isn't shown. Capture verbatim (use the smart number parser for `5776.2` vs `770,16`).
- Unified schema (existing file): `asset_type, deal, source, source_url, listing_id, name, district, plz, city, state, rent_eur_m2_min, rent_eur_m2_max, price_eur, area_min_m2, area_max_m2, rooms, captured, notes`.

## Method (proven): render-and-extract
The broker SPAs render listings **client-side** — a raw fetch returns only a shell, `__NEXT_DATA__` doesn't carry the listing array, and there's no clean public JSON API. So use a **headless browser (Playwright)** to load each search URL, wait for cards, and read the rendered listing text exactly as the in-chat capture did (validated on JLL Düsseldorf → 66 rows). Make it **resumable** (cache each source/city/type/page under `build/listings_cache/`, gitignored) and **throttled** (2–4 s between pages, backoff on errors).

### JLL — `gewerbeimmobilien.jll.de`
URL: `/search?tenureTypes={rent|buy}&propertyTypes={office|industrial|retail|land}&cities={City}&regions={Region}&page={n}&sortBy=dateModifiedAtSource` (omit `priceMax`/`surfaceMin`/`surfaceMax` for full capture). Loop tenure × propertyType × all German cities (start with the 8 target cities + Big-7, then all), paginate until a page returns 0 cards. Map `propertyType → asset_type` (office→office, industrial→industrial_hall, retail→retail, land→land_plot). Per card parse: name + JLL code, district, plz, city, region, rent €/m² (min–max), area m² (min–max); `listing_id = "jll-"+code`; `deal` from tenure.

### Broker method findings (probed 2026-06-28)
| Broker | Method that works | Status |
|---|---|---|
| **JLL** gewerbeimmobilien.jll.de | **render-and-extract** off clean filtered search URLs (`/search?propertyTypes=…&cities=…&page=…`); `get_page_text` returns every card | ✅ proven (113 offices captured); **the workhorse** — covers offices/halls/retail/land for all German cities |
| **Engel & Völkers** Commercial | JS SPA; `/commercial` is a marketing landing (no listings) — results live behind a separate search path that must be located first, then render-and-extract | ⚠️ needs search-URL discovery |
| **CBRE**, **Colliers**, Aengevelt, Savills | same JS-SPA pattern → render-and-extract once each search URL + card selector is mapped | ⚠️ needs per-site discovery |

**What this means:** the method that *definitely works and scales today is JLL* — and JLL alone is the richest commercial source (all asset types, every city), so it carries the commercial side. E&V/CBRE/Colliers use the **same** render-and-extract method but each needs its results URL + card selector mapped first (do this in the Playwright build — navigate the site, find the search, adapt the parser). Treat them as **incremental** on top of JLL. Tag `source` accordingly; all asset types incl. land.

### Open portals (plain fetch — already built in `fetch_listings.mjs`)
ahgzimmo, Tranio, pachtnetzwerk, gastro-pacht → hotels / gastronomy_with_rooms / mixed_use / land where present.

## Merge, dedup, hand-off
Append everything into `data/broker_listings_all.csv`; dedup across sources (name + plz + area, or coords within ~200 m; keep all source_urls). The in-chat browser captures (e.g. the Düsseldorf seed) and the `Arrivio_Capture_Template.xlsx` rows feed the **same** file via `build/import_captures.mjs` (geocode, dedup, merge). The app then renders this superset and the sliders/`Fits` sorting select from it.

## Honest scope & caveat
"Every website that exists" isn't enumerable — this targets the **known high-value sources** above and is built to add more. Render-and-extract is against these sites' terms, so it's for the internal investor demo (not redistribution) and runs in your authorized browser/session; for production you'd license an API. The crawl is large — run it in stages (per source/city), resumable.

## Prompt to paste
> Build `build/fetch_brokers.mjs`: a resumable, throttled **Playwright render-and-extract** crawler that captures ALL listings into `data/broker_listings_all.csv` (existing unified schema). For JLL (`gewerbeimmobilien.jll.de/search`), loop tenureTypes={rent,buy} × propertyTypes={office,industrial,retail,land} × German cities, paginate to exhaustion, **no price/area cap**, mapping propertyType→asset_type (land→land_plot) and parsing name/code, district, plz, city, region, rent €/m² range, area range. Add the same for Engel & Völkers, CBRE, Colliers (discover each search URL + card structure). Tag `asset_type` exactly, keep `source`+`source_url` on every row, never fabricate (blank if absent), dedup across sources. Keep the open-portal `fetch_listings.mjs` (ahgzimmo/Tranio/pachtnetzwerk/gastro-pacht) feeding the same file. Cache per source/city/type/page (gitignored), throttle 2–4 s with backoff. Do not scrape ImmoScout24/Immowelt/Booking. Report per-source/per-asset_type counts.
