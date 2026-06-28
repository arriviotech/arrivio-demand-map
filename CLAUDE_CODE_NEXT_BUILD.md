# Claude Code — next build (crawl + filter + favourites + results UI)

Paste the prompt at the bottom into Claude Code in the `arrivio-demand-map` repo. It reads `MULTIPORTAL_CRAWLER.md`, `FILTER_SPEC.md`, and `Arrivio_Capture_Template.xlsx`. Guardrail throughout: don't break existing functionality; match the current visual style; reassemble; zero console errors.

## Part 1 — Run the open-portal crawl
Per `MULTIPORTAL_CRAWLER.md`: add Tranio + pachtnetzwerk.immo + gastro-pacht.de adapters to `build/fetch_listings.mjs` (resumable, throttled), normalize into `data/properties.json`, apply the rooms-to-stay filter, dedup across sources, geocode, re-anchor `data/pacht_model.json`, re-run validation. Do **not** scrape ImmoScout24/Immowelt/Booking or the broker SPAs (JLL/E&V/CBRE/Colliers) — those arrive via the capture importer (Part 5).

## Part 2 — Sliders-only filter
Per `FILTER_SPEC.md`: a filter panel (no preset "fits" gate) with range sliders for lease €/m²·mo, Pacht €/room, sale €/key, price, rooms, area, yield, plus deal/kind/price_basis/location selectors; reference ticks (€15/m², €67k/key) are informational only.

## Part 3 — Favourites (simple, no backend)
A lightweight "favourite this property" toggle — **no external store, no accounts, nothing to set up.**
- `favStore` with `list() / add(id, snapshot) / remove(id)`; snapshot = {id, name, city, kind, deal, key metric, source_url}.
- Persist with **`localStorage`** so a user's favourites survive page reloads on their own device/browser (fall back to in-memory if localStorage is unavailable). No shared/multi-user persistence — explicitly out of scope for now.
- UI: a **★** toggle on every property card and in the results list; a **"Favourites" filter/view** that shows only saved properties; a small count badge; a "clear all" affordance.

## Part 4 — Where properties live + results representation
Tell the user explicitly (in-app caption + a short note in the provenance doc) which layer each kind lands in:
- `hotel`, `gastronomie_with_rooms` → **Small / family hotels** + the **Acquisition targets** layer.
- `mixed_use`, `office` → **Office & commercial** + **Acquisition targets**.
- All priced listings are clickable pins in **Acquisition targets**.

Then build the results UX (do the UI research; portal/Airbnb-style is the proven pattern): clicking the **Acquisition targets** layer opens a panel with **(a) the filter** and **(b) a scrollable, sortable results list** synced to the map — list cards show name · city · kind · deal · headline metric (€/room for lease, €/key for sale) · €/m² · rooms · area · LISTED/est flag · ★ · Source ↗. Hovering a card highlights its pin and vice-versa; sort by €/m², €/room, €/key, rooms, price, newest; live "N of M" count. Mobile: list/map toggle. Keep the existing single-pin click card too.

## Part 5 — Capture importer (for the broker data I transcribe)
Add `build/import_captures.mjs`: read `Arrivio_Capture_Template.xlsx` **and `data/jll_offices_capture.csv`** (broker office captures with rent/area ranges — map `eur_per_m2` = midpoint of rent_eur_m2_min/max, `area_m2` = area_max_m2, `deal`=lease, `kind`=office, `district`→notes), validate, **geocode** (street/PLZ/city), assign state by point-in-polygon, compute id/eur_per_m2/lease_eur_yr/captured, **dedup against existing + across rows**, and merge into `data/properties.json` with `source` = the broker and the real `source_url`. Never fabricate missing fields — leave them null. This is how JLL/E&V/CBRE rows (transcribed from screenshots) enter the dataset.

## Part 6 — In-app "Data sources & filters" note
Add a small, plainly-worded panel (an ⓘ on the Acquisition-targets layer + an "About / Sources" line) stating, per source, **what was captured, the filter applied, the capture date, and a "view more" link** to the site. Keep it honest ("a filtered snapshot, not the whole market"). Build the list data-driven from each record's `source` / `source_url`. Example lines:
- "Office / commercial — source: **JLL** (gewerbeimmobilien.jll.de). Filter: offices for rent, 1,000–6,000 m², ≤ €15/m²·mo, target cities. Captured 2026-06-28. View more → gewerbeimmobilien.jll.de"
- "Hotels & gastronomy — sources: **ahgzimmo.de**, Tranio, pachtnetzwerk, gastro-pacht. View more → ahgzimmo.de"
- "Occupancy & beds context — **Destatis GENESIS 45412**."

## Verify
Reassemble; confirm the crawl counts, the filter works, favourites persist, the results list syncs with the map, every record keeps its source_url, and zero console errors. Append a short run report to `ARRIVIO_VALIDATION_REPORT.md`.

---

### PROMPT TO PASTE
> Read `MULTIPORTAL_CRAWLER.md`, `FILTER_SPEC.md`, and `Arrivio_Capture_Template.xlsx`, then implement all five parts in `CLAUDE_CODE_NEXT_BUILD.md`: (1) run the throttled open-portal crawl (Tranio + pachtnetzwerk + gastro-pacht) into `data/properties.json` with dedup/geocode/re-anchor/validate; (2) add the sliders-only filter per FILTER_SPEC.md; (3) add a simple favourites toggle (★ on every card/row, "Favourites" view) persisted in localStorage — no backend, no accounts; (4) build a portal-style results panel that opens from the "Acquisition targets" layer — filter + sortable results list synced to the map pins — and document which layer each property kind lands in; (5) add `build/import_captures.mjs` to import `Arrivio_Capture_Template.xlsx` + `data/jll_offices_capture.csv` (geocode, dedup, merge, never fabricate); (6) add an in-app "Data sources & filters" note listing each source, the filter applied, the capture date, and a "view more" link. Don't scrape ImmoScout/Immowelt/Booking or broker SPAs. Keep existing functionality and style intact, reassemble, verify zero console errors, and report the counts + where each kind lands.
