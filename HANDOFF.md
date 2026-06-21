# Arrivio Map — Handoff / Resume Guide

Read this first to continue work after a context reset. Everything is committed to branch
**`testbytej`** (pushed to `github.com/arriviotech/arrivio-demand-map`). **Not merged to `main`**, so the
public GitHub Pages link still shows the OLD app until merge.

## How to build (NEVER edit the compiled HTML directly)
The deployable file `Arrivio_Demand_Map_OpenStreetMap.html` is GENERATED. Edit the source parts in
`build/`, then assemble:
```
node build/assemble.mjs        # run from the repo root; writes Arrivio_Demand_Map_OpenStreetMap.html
```
Source parts (concatenated in this order by assemble.mjs):
- `build/p1_head.html` — `<head>`, all CSS (design tokens, layout, components)
- `build/p2_body.html` — markup (panel, floating chrome, legend, icons sprite)
- `build/data.js` — CLIENTS (185) + HOTELS (45) baked data
- `build/p_states.html` — STATES_DATA (TAM, state-level) + COMMERCIAL_DATA (19 office cities) + `__STATES_GEO__`
- (assemble inlines) OSM/INKAR data: `commercial_grid.json`, `hotel_grid.json`, `hotel_price_grid.json`,
  `hotels_osm.json`, `de_kreise.geojson`, `inflow_kreise.json` (→ DE_KREISE_GEO / INFLOW_KREISE), `de_states.geojson`
- `build/p3_adapter.html` — the Leaflet adapter object `M` (all map rendering; the seam between UI and map)
- `build/p4_app1.html` — controller part 1 (state, helpers, render pipeline, areas, selection, hex, states, commercial, hotels, inflow)
- `build/p5_app2.html` — controller part 2 (search, reachability, geocoding, layers/basemap, legend, presentation, mobile sheet, wiring, boot)

## How to preview (user can't run it themselves — keep it live)
Preview server = `npx http-server -p 8123` (via `.claude/launch.json`, started with the Claude_Preview
`preview_start` tool, name **"arrivio-map"**). It serves the file from disk, so after `assemble.mjs`
the user just **hard-refreshes**. Always give them:
**http://localhost:8123/Arrivio_Demand_Map_OpenStreetMap.html** (confirm HTTP 200 before saying done).
Verify changes via the `mcp__Claude_Preview__preview_eval` tool (screenshots time out on this heavy map —
use DOM `preview_eval` assertions instead).

## What's built (all on testbytej)
- Themes (dark default panel + light), basemaps: **Clean (default)**, Dark, Light, Detail, Sat, **States·TAM**.
- Layers (eye toggles): Demand hexmap, **Immigrant inflow** (district choropleth, Intl/+Domestic), Clients
  (+labels/approx), GCH + Seminaris hotels, Bike-share stations, **Office & commercial** (Density/Rent/Vacant m²),
  **Small/family hotels** (Rooms/Price).
- Proposed areas: named, per-area radius, live coverage, compare table, copy-link (URL hash state).
- Reachability (bike/walk via ORS, transit via DB), client/hotel/commercial/area click detail cards/popups.
- Presentation mode, saved views, mobile 3-detent bottom sheet, symbol-size slider, Arrivio logo (logo.png).

## Key conventions
- **One pink sequential ramp** everywhere: light = less, dark = more (`rampColor()` in p3; `--ramp` CSS).
- The **4 area-heatmaps are mutually exclusive** (demand hex / commercial / hotels / inflow — one at a time);
  they overlay freely with point layers (clients/areas/hotels/stations). Inflow renders in a dedicated
  under-markers pane (`'inflow'`, z-index 250) so point layers sit on top.
- **de-DE number formatting** (`NF`/`fmt`/`kfmt`). Modeled values flagged "est". Heatmaps viewport-filtered +
  coarse hex res (`supplyRes`) + global-max colors for performance. Canvas renderer for hex/dense; SVG for
  clients (keeps cluster split animation).
- Entering **States basemap** hides all overlays (bold choropleth) and restores them on leave.

## Data provenance & how to refetch
- OSM (office/commercial + hotels): `node build/fetch_osm.mjs` (resumable; tiles cached in `build/osm_tiles/`, gitignored). `combine` arg re-aggregates without refetch.
- District inflow (INKAR/BBSR): `node build/fetch_inkar_inflow.mjs` (needs `build/gdig2.pem` intermediate cert).
- Full "where every layer's data comes from" + expansion menu: **ARRIVIO_DATA_PROVENANCE.md**.
- Detailed sourcing/methodology log (figures, formulas, pricing model): **ARRIVIO_DATA_SOURCES.md**.

## Open items / TODO
- ⚠️ **ORS API key is hardcoded in source** (public repo) — rotate / domain-restrict before any public deploy.
- **Merge `testbytej` → `main`** when ready (that's what updates the live GitHub Pages link).
- **Green logo vs pink UI** — decide: re-theme UI to green brand, keep pink, or split. (Logo is green; accent is `#d6219b`.)
- Inflow is **net rates per 1,000** (intensity), not absolute counts. Absolute arrivals-from-abroad per district = Destatis GENESIS table 12711 (registration-gated) if ever needed.
- Hotel "small/family" filter is **heuristic** (some mid-scale chains slip through; tighten the exclusion list in `fetch_osm.mjs`).
- Candidate next layers (researched, see provenance §B): hotel occupancy by region, student inflow, residential rents, competitor supply, Targomo live API (demographics + real isochrones, if the user gets an API key — do NOT copy infas360 data into the file).

## To resume in a fresh session
Tell Claude: *"Continue the Arrivio map on branch `testbytej`; read HANDOFF.md."* The memory file
`preview-server-after-changes` also auto-loads (keep the localhost preview live + give the URL after each change).
