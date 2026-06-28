# Multi-portal crawler — design, source findings & Claude Code prompt

**Date:** 2026-06-28 · Goal: broaden supply beyond ahgzimmo by adding more public Pacht/sale portals, with cross-source dedup and more real price anchors. Probed live before writing — this reflects what each source actually serves.

## Honest expectation (read first)
The open German hotel Pacht/sale long-tail is **small and heavily overlapping**. This crawler is a **quality win** — more *real* Pacht/sale anchors (shrinks the modeled share), proper Tranio recovery, and dedup confidence — **not a volume explosion**. Realistic net-new after dedup + the rooms-filter: roughly **+150–250 records and many more real price anchors**, dominated by Tranio's ~50 hotels + ~515 commercial sale. True scale (ImmoScout24/Immowelt) needs a paid partner API and is out of scope here (ToS/anti-bot).

## Source matrix (probed 2026-06-28)
| Source | Fetch | DE inventory | Adds | Notes / ToS |
|---|---|---|---|---|
| ahgzimmo.de | plain (Atom feed + detail) | ~364 lease + sale | (already in) | Primary; keep as-is |
| **Tranio** | plain on retry (throttle!) | 50 hotels · ~515 commercial | **biggest recovery — all SALE, clean** | 403s under load → delay 3–5 s, backoff, realistic UA |
| **pachtnetzwerk.immo** | plain + `/Sitemap` | ~13 hotels + 61 gastro | real Pacht anchors; some net-new hotels | prices on detail pages; discoverize platform |
| **gastro-pacht.de** | plain | ~60 (mostly gastro) | real Pacht anchors; few Garni hotels | prices on cards as free-text; try `/wp-json/wp/v2/` first |
| Engel & Völkers Commercial | JS only | — | optional | browser/Playwright pass only; low priority |
| ImmoScout24 / Immowelt | blocked | (large) | — | **excluded** — anti-bot + ToS |

## Per-source adapter notes
- **Tranio** — list pages `tranio.com/commercial/germany/hotel/` and `/office-property/`, per-state `/commercial/germany/<state>/hotel/`; fields on the card: title (type + m² + city), price €, yield %, year, detail URL. Detail page adds rooms/coords sometimes. **All sale.** Throttle hard.
- **pachtnetzwerk.immo** — enumerate via `/Sitemap`; detail URL patterns `/hotel-kaufen-pachten/<slug>`, `/gastronomie-kaufen-pachten/<slug>`. List pages `/hotel-immobilien/<bundesland>`, `/hotel-immobilien/kaufen|pachten`. Price/rooms/area + lat/lng on the detail page (check `og:`/JSON-LD).
- **gastro-pacht.de** — WordPress; **try `/gastronomie/wp-json/wp/v2/` for structured CPT first**; else list pages `/gastronomie/pachtboerse/`, `/gastronomie/kaufboerse/`, `/gastronomie/bundesland/<land>/`; detail `/gastronomie/immobilien/<slug>`. Price is free-text on the card: `Pacht netto 13.000€`, `Pacht ohne Nebenkosten`, `Pacht 5000`, `Umsatzabhängige Pacht`, `Vereinbarung Pacht`, plain `3.680.000€` (sale). Use the existing smart number parser; map "Umsatzabhängige/Vereinbarung" → price_on_request.

## Pipeline (extend build/fetch_listings.mjs — keep it resumable/cached)
1. **Adapters** — one per source emitting raw rows {source, source_url, title, kind hint, deal, price text, rooms, area, address/plz, coords?}. Cache each page under `build/listings_cache/<source>/` (gitignored).
2. **Normalize** to the existing `properties.json` schema; run the smart price/area parser (handles `5776.2` vs `770,16`).
3. **Rooms filter** — keep only records with rooms/beds (hotel, Pension, Hotel Garni, Gasthof-with-rooms, mixed-use with rooms); drop pure restaurants/bars/cafés (consistent with current behaviour).
4. **Dedup across sources** — the same property appears on multiple portals (e.g. the Nordschwarzwald resort is on pachtnetzwerk *and* gastro-pacht). Key on normalized name + PLZ + price proximity, or coords within ~200 m. Prefer the record with the most fields / a real price; keep all source_urls.
5. **Geocode** — PLZ centroid + detail-page lat/lng; Bundesland by point-in-polygon; freeze coords.
6. **Re-anchor the Pacht model** — feed the new real Pacht figures (gastro-pacht "Pacht netto …", pachtnetzwerk detail) and Tranio €/key into `data/pacht_model.json` observed medians.
7. **Validate** — run build/validate_listings.mjs; print per-source counts, dedup removals, new-anchor counts, and the LISTED-vs-modeled share before/after.

## Claude Code prompt (paste this)
> Extend `build/fetch_listings.mjs` into a multi-portal crawler. Read `MULTIPORTAL_CRAWLER.md` first. Add resumable adapters for **Tranio** (throttled — 3–5 s delay, exponential backoff on 403, realistic User-Agent; list pages per type + per state, all sale), **pachtnetzwerk.immo** (enumerate via `/Sitemap`; parse price/rooms/area/coords from detail pages), and **gastro-pacht.de** (try `/gastronomie/wp-json/wp/v2/` first, else list + detail pages; parse the free-text Pacht prices with the existing smart parser; map "Umsatzabhängige/Vereinbarung Pacht" → price_on_request). Normalize all into `data/properties.json`'s existing schema, apply the rooms-to-stay filter, then **dedup across sources** (normalized name + PLZ + price, or coords within ~200 m; keep every source_url). Geocode (PLZ + detail coords, Bundesland by point-in-polygon, freeze). Re-anchor `data/pacht_model.json` observed medians with the new real Pacht/€-per-key figures. Re-run `build/validate_listings.mjs` and append a section: per-source counts, dedup removals, net-new records, and the LISTED-vs-modeled share before/after. Do not break existing functionality; do not scrape ImmoScout24/Immowelt/Booking (ToS); reassemble and verify zero console errors.

## If you later want real volume
The only routes past the long-tail are a **paid scraping API** (Apify/Bright Data/Zyte with a German-real-estate actor) or an **ImmoScout24 partner/API account** — both need a key/contract you'd provide. With either, the same pipeline ingests them; nothing else changes.
