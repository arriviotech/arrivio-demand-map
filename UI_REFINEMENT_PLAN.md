# Arrivio Demand Map — UI Refinement Plan ("Peak UI")

**Goal:** elevate `Arrivio_Demand_Map_OpenStreetMap.html` from a functional prototype to a
Targomo-Loop-grade location-intelligence product that is *perfect on three form factors*:
**mobile phone**, **desktop PC**, and **big-screen projection in meetings**.

This plan was produced from (a) a line-level audit of the deployed app (including live browser
measurement at 380×740 and 3840×2160), (b) the full build-pipeline handoff doc, and (c) deep web
research across 7 lenses: benchmark teardowns (Targomo Loop, CARTO, ArcGIS, Felt, kepler.gl,
Placer.ai), dark design-token systems, mobile map UX (Google/Apple Maps, Material 3, Apple HIG),
TV/projection legibility science, the Leaflet technical upgrade path, panel/layer-control IA, and
the polish layer (micro-interactions, WCAG 2.2, loading states).

---

## 0. Decisions to lock first

| Decision | Recommendation | Why |
|---|---|---|
| Source of truth | **The repo's compiled HTML is now canonical.** Freeze/drop the Google Maps variant (it exists only inside the handoff doc, not the repo). | The Python generator isn't in the repo and has sandbox paths. Maintaining pixel-parity across two map engines doubles every UI change for near-zero benefit — the OSM version needs no key and is what's deployed. |
| Map engine | **Stay on Leaflet 1.9.4.** Add a dark basemap; defer full MapLibre GL migration ("Path B") unless 2D/3D pitch becomes a hard requirement. | Migration costs 2–3× code verbosity, rebuilds draggable circles as turf polygons, and rewrites every plugin — for looks we can get in CSS + tiles. |
| Default theme | **Dark theme default on desktop/TV (the Targomo look). Light "Beamer" variant offered in Presentation mode.** | Projectors lose ~30% contrast and crush dark UIs; LED TVs/monitors love dark. Both themes ship via one token system. |
| Dark basemap | Day 1: **CARTO `dark_all` raster** (one line, same CDN as today). Week 2: optional **OpenFreeMap `dark` vector** via `maplibre-gl-leaflet`. | OpenFreeMap is the only keyless, unlimited, *commercial-OK* dark basemap (CARTO free tier is technically non-commercial — same terms as the Voyager tiles already in use, so no new risk day 1, but OpenFreeMap is the clean endgame). |
| Single-file constraint | Keep the no-build, single-HTML model. Two tiny sidecar files allowed: `manifest.webmanifest` + PWA icons (data-URI manifests are unreliable). | GitHub Pages serves the repo root; sidecars deploy with zero pipeline change. |
| Security | Move the hardcoded OpenRouteService JWT (line 127, public repo!) behind: restrict the key to the Pages domain at openrouteservice.org, or rotate it. | It's a committed secret on a public URL today. Not strictly UI, but it ships with Phase 0. |

---

## 1. What's wrong today (audit highlights)

### P0 — broken, fix before anything cosmetic
1. **Mobile is functionally dead.** At 380×740 the map computes to **0px height**: the media query's
   `#map{height:60vh}` is defeated by the base `#map{flex:1}` (flex-basis:0%) in the column layout;
   the 1,567px-tall panel absorbs the whole viewport. Leaflet's zoom/layer controls float orphaned
   over the panel text. *(Verified in live Chrome.)*
2. **Click-to-add-area is ON by default** — every stray tap/click drops a 50 km circle. Worst single
   interaction trap, lethal in live demos and on touch.
3. **Contrast failures shipped:** `.hint #8a9099` = 3.2:1, `.muted #9aa0a6` = 2.6:1, approx badge
   `#b26a00/#fff6e6` = 3.9:1 — all fail WCAG AA at the 11px sizes used.
4. **`toLocaleString('en-US')`** for a German market — "1,234" reads as a decimal in de-DE.
5. **Hardcoded ORS API key** in public source.
6. **45 Photon geocode requests fire on every first load** (hotels), each triggering a full hotel
   layer re-render — pins visibly teleport for ~10 s on a projector.

### Structural gaps vs. the Targomo Loop benchmark
- Light-only theme; **zero CSS custom properties** — ~15 hardcoded color literals spread across CSS,
  HTML attributes, and JS template strings. A retheme without tokens touches every rule.
- 7 always-expanded cards (≈1,567px scroll); maintenance tooling (geocoding) is the FIRST card while
  the headline KPI (coverage) is third and rendered *smaller* (18px) than secondary stats (20px).
- No floating search, no floating control cluster, no gradient legend, no statistical hex layer,
  default Leaflet chrome everywhere (expanded radio basemap list = instant "hobby Leaflet page").
- No per-layer eye toggles; Legend is a dead text list at the bottom of the scroll.
- One global radius for ALL areas; areas unnamed ("Area 1" renumbers on delete); no compare view;
  no persistence of areas (the user's actual work product) and no shareable URL.
- Reachability buried: panel → map → popup → button; transit runs ~16 sequential fetches with a
  text counter; results can't start from a *proposed area* (the origin users actually care about).
- Accessibility ≈ absent: zero ARIA, zero authored focus styles, keyboard-unreachable pins,
  silent live updates, color-only encodings (two near-identical pinks: #d6219b areas vs #ff2d95 GCH).
- Typography presentation-hostile: 11–13px gray-on-white; biggest number is 20px. At 3–6 m on a
  projector, ~100% of the UI text is illegible (10-foot minimum ≈ 24–28px at 1080p).

### Engineering seams to respect
- The `M.*` adapter (17 methods) cleanly separates UI from map engine — keep it as the seam.
- `SHARED_JS` hard-references ~37 sidebar element IDs with no null-guards, plus globals
  `window.__reachFrom`, `window.__startApp`, `body.show-labels`. Renaming any ID without updating
  the IIFE breaks the app at runtime — restructure HTML and JS *in lockstep*.
- `renderAll()` tears down and rebuilds all 185 cluster markers + tooltips on every keystroke /
  toggle / drag-end. Acceptable at 185 nodes; must not be the pattern for new layers (hexes, stations).
- Marker formulas to preserve: pin radius `max(5, min(26, 4 + sqrt(rooms_mid)*2.1))`; exact = solid
  white-stroked, approx = dashed; labels gated at zoom ≥ 11.

---

## 2. Design system (the foundation everything hangs on)

### 2.1 Design tokens — CSS custom properties, `html[data-theme]`
All ~40 hardcoded hexes move into `:root` tokens. JS-rendered colors (Leaflet marker options) read
from one `THEME` JS object kept in sync with the CSS block. Theme persisted in `localStorage`,
toggle in panel header (sun/moon).

**Dark theme (default):**
```
--bg:            #0b0d10   /* page/map canvas behind tiles */
--surface-1:     #16191f   /* panel */
--surface-2:     #1e2229   /* cards, popups */
--surface-3:     #262b33   /* hover/raised, dropdowns */
--border:        rgba(255,255,255,.08)
--border-strong: rgba(255,255,255,.14)
--text-primary:  #eceef2   /* 15.2:1 on surface-1 */
--text-secondary:#a8b0bf   /*  8.1:1 */
--text-muted:    #8b93a3   /*  5.7:1 */
--accent:        #d6219b   /* FILLS ONLY on dark (3.9:1 as text = fail) */
--accent-text:   #ff7ac9   /* text/strokes/focus on dark, 7.4:1 */
--accent-soft:   rgba(214,33,155,.16)
```
**Light theme** mirrors today's palette (page #f3f4f6, surface #fff/#f7f8fa/#eef0f3, text
#1d2733/#5b6472, accent #d6219b for both roles — 4.6:1 on white). The current look survives as
the light theme.

**Data colors (dark-tuned, one hue = one meaning):**
- Clients: `#5aa9ff` (7.2:1 on dark; light theme keeps #2E86DE) — always with 2px #fff casing stroke.
- Proposed areas / everything Arrivio: pink, exclusively.
- **GCH hotels re-hued to amber `#f6a97a`** — kills the fatal #ff2d95-vs-#d6219b pink collision.
  Hotels also get a *shape* difference: 10px rounded-square divIcons vs circular client pins
  (color-blind + projector safe).
- Seminaris: `#34d399`.
- Reachability modes: bike `#2dd4bf` (teal), walk `#a78bfa` (violet), transit `#fbbf24` (amber) —
  distinct from client blue, Arrivio pink, Seminaris green.
- Demand ramp (hexes): CARTOColors **ag_Sunset** 7-step `#4b2991 → #872ca2 → #c0369d → #ea4f88 →
  #fa7876 → #f6a97a → #edd9a3` — **light = high** on dark basemaps (dark ramps vanish into dark maps),
  perceptually ordered, CVD-safe. Legend gradient is generated from the same tokens so legend = truth.

### 2.2 Typography
- **Inter** (`rsms.me/inter` or Google Fonts; weights 400/600/700), stack
  `'Inter var',Inter,-apple-system,'Segoe UI',Roboto,sans-serif`.
- Scale: 11px/600 UPPERCASE +0.06em (section headers) · 12 (secondary) · 13 (body/controls) ·
  14/600 (emphasized) · 16/700 (panel title) · **24–28/700 hero stat numerals** (32px in
  presentation mode).
- `font-variant-numeric: tabular-nums` on every live-updating number — no digit jitter during drags.
- Line-height 1.45 body, 1.1 numerals. Nothing below 11px anywhere, weight ≥ 600 for all labels in
  presentation mode.

### 2.3 Spacing, radii, elevation, icons, motion
- Spacing scale (4px base): 4/8/12/16/24/32 as `--space-1..6`.
- Radii: 6 (sm) / 8 (md: inputs, buttons, tiles) / 12 (lg: cards, popups) / 16 (xl: sheet, glass) /
  999 (pills).
- Elevation on dark = **tone first, shadow second** (shadows are invisible over dark maps):
  raised surfaces step up the surface ladder; shadows sm `0 1px 2px rgba(0,0,0,.4)`,
  lg `0 8px 24px rgba(0,0,0,.45)`.
- **Glass recipe — floating chrome only** (search pill, control cluster, legend pill, overview pill;
  never the text-dense panel): `rgba(22,25,31,.85)` + `backdrop-filter: blur(12px) saturate(140%)`
  + 1px `rgba(255,255,255,.08)` border. Max 3 glass surfaces, never animate blur.
- **Icons: Lucide** inline `<symbol>` SVG sprite (~18 glyphs: eye, eye-off, search, plus, minus,
  layers, map-pin, crosshair, bike, footprints, bus, bed, trash-2, chevron-down, sun, moon, camera,
  maximize, play). `stroke: currentColor`, 18px in rows, 20px in floating controls. No icon fonts,
  no runtime icon CDN — keeps the single file self-contained.
- **Motion tokens:** `--dur-fast:150ms` (hovers, eye toggles) · `--dur-med:250ms` (accordion,
  toasts) · `--dur-slow:400ms` (count-ups, sheet) · ease-out `cubic-bezier(0,0,0.2,1)`.
  One global `prefers-reduced-motion` catch-all + `zoomAnimation:false` + `setView` instead of
  `flyTo` under reduced motion.
- **Dark-theme Leaflet's own chrome** (the #1 "default Leaflet" tell): popup wrapper/tip →
  `--surface-2` with 12px radius; tooltips → `rgba(22,25,31,.92)`; cluster discs → `--surface-3`
  with white ring + pink halo; attribution → `rgba(11,13,16,.7)`.

---

## 3. Layout architecture per form factor

### 3.1 Desktop (761–1599px) — "the analyst's tool"
```
┌─────────────────────────────────────────────────┬──────────────┐
│  [Search pill 🔍]                               │  PANEL 360px │
│                                                 │  (collapsible│
│                MAP (dark basemap)               │   accordion) │
│                                                 │              │
│ [gradient legend]   [Σ overview pill]  [controls]│             │
└─────────────────────────────────────────────────┴──────────────┘
```
- **Right panel, 360px** (keep right side — it's the benchmark's muscle memory), opaque
  `--surface-1`, collapsible to a 48px icon rail via an edge chevron; state persisted.
- **Floating search pill** top-left over the map: 44px tall, radius 22, glass. Grouped results:
  *Clients* (name + city + rooms; flies to pin and opens detail) and *Places* (Photon; fly-to +
  **"Add proposed area here"** action — the killer workflow shortcut). Accepts pasted `lat,lng`
  (replaces the engineer-grade lat/lng number inputs).
- **Bottom-right floating control cluster** (replaces default zoom control + the always-expanded
  radio basemap switcher): 40×40px glass buttons, 8px gap — `[+][−]` zoom · fit-Germany (flyToBounds
  all clients) · basemap popover (5 thumbnail cards: Dark / Clean / Light / Detailed / Satellite) ·
  theme toggle · Present · screenshot.
- **Bottom-left gradient legend pill**: 140×8px ag_Sunset gradient bar + "Room demand 0 → max",
  plus 3 sized circles explaining pin-size = rooms, plus categorical key rows for currently visible
  layers only (eye-toggle state drives legend content).
- **Bottom-center "Network Overview" pill** (the Loop signature): live
  `185 clients · 12.4k rooms · 4 areas · 63% covered`; click expands the per-area coverage +
  comparison table.
- Smooth wheel zoom (inline ~100-line SmoothWheelZoom, fallback `zoomSnap:0.25`).

### 3.2 Mobile (≤640px) — "full-bleed map + bottom sheet"
The current stacked layout is deleted, not patched.
- `#map` full-bleed `100dvh` (`100vh` fallback line above); viewport meta gains `viewport-fit=cover`;
  **never** `user-scalable=no`.
- **Panel becomes a 3-detent bottom sheet**: peek **96px** (drag handle 32×4px in a 48px grab zone +
  the KPI strip) · half **50svh** · full **92svh**. Transform-only animation, 300ms
  `cubic-bezier(0.4,0,0.2,1)`, velocity-based fling (>500px/s), `overscroll-behavior:contain`,
  scrollTop==0 drag-handoff, max-width 640px centered on tablets. Vanilla Pointer Events,
  ~150 lines, no library.
- **Pin tap → Google-Maps-style place card** in the sheet (not a Leaflet popup): name, city, rooms
  badge, "Show reach" + "Add area here" actions; map pans the pin above the card via
  `paddingBottomRight`. Visible 44px ✕; Android Back closes via `history.pushState`/`popstate`.
- **Search pill** stays floating top (`env(safe-area-inset-top)+8px`), full-width minus 24px.
- **Filter chip row** under the search pill (horizontally scrolling, 32px visual / 44px hit):
  Clients · Labels · Hotels · Areas · Reach — two-way bound to the layer toggles.
- **FAB** bottom-right 56px pink "+ area" (arms placement mode), offset above sheet peek; zoom
  buttons hidden on touch (pinch suffices).
- All touch targets ≥44px (`@media(pointer:coarse)`); slider thumbs 28px; `tapTolerance:40`;
  `touch-action:none` on the draggable area pin so dragging it never scrolls the sheet.
- **PWA sidecars**: `manifest.webmanifest` (standalone, theme #d6219b) + 192/512 icons →
  installable, chromeless on phones.
- Z-index ladder as tokens: Leaflet panes ≤1000 < search/chips/FAB 1100 < sheet 1200 < toasts 1500.

### 3.3 Big screen / projection (≥1600px or Present mode) — "the boardroom"
- **`body.presenting` + one `--ui-scale` variable** (default 1, presenting 2, "XL room" 2.5).
  Root font 16→20px+; everything in rem. Auto-bump at `@media(min-width:1920px)` even without
  pressing anything.
- **Present mode** (button + `P`/`Ctrl+.`; `?present=1` URL param): `requestFullscreen()`, hide
  panel + search; keep only: enlarged legend (bottom-left, 24–28px swatches/text, max 6 auto-filtered
  entries), overview pill (bottom-center), minimal controls (bottom-right, 48px). KPI numbers
  44–48px, all text ≥22px, weight ≥600 (10-foot rule: font height ≈ viewing distance / 300).
- **Symbology scales with type** (the classic mistake is scaling only text): pin radius ×1.4
  (≈√2, keeps area perception honest), pin strokes 2.5–3px, area circle stroke 4px, isochrone
  stroke 3px, cluster badges 26→44px, no 1px hairlines anywhere.
- **Theme rule:** Present defaults to **light "Beamer" theme** (Positron/Voyager tiles, near-black
  text, ≥7:1) — projectors crush dark UIs; the dark Targomo look is the explicit "LED/TV" option.
- **Saved views ("story steps")**: capture `{title, center, zoom, basemap, layer visibility, active
  area, optional auto-opened client card}` to localStorage; step with ←/→/Space (2s `flyTo`),
  `Home` = fit Germany, `1–9` jump, `B` black screen, `L` legend, `Esc` exit, `?` cheat-sheet
  overlay — PowerPoint conventions, zero learning curve.
- **Cursor spotlight**: 56px pink ring following the mouse + click pulse (~15 lines), auto-hide
  after 3s idle.
- **Kiosk**: `?present=1&autoplay=20` cycles saved views every N s (min 10), pauses on interaction,
  resumes after 60s — any smart-TV browser becomes an office kiosk with one URL.
- **Screenshot button** (`leaflet-simple-map-screenshoter@0.5.0`): captures map + legend + overview
  pill, auto-hides panel/search via its CSS-selector option; capture only after tile `load`;
  `crossOrigin:'anonymous'` on tile layers; filename `arrivio-coverage-YYYY-MM-DD.png`. Phase 2:
  print-styled coverage report (`window.print` → PDF) with the comparison table.

---

## 4. Panel information architecture (the new sidebar)

Exact order, top to bottom (desktop panel = mobile sheet content):

```
[Arrivio wordmark]                    [sun/moon] [gear] [⟨ collapse]
─────────────────────────────────────────────────────────────────
▼ 1. PROPOSED AREAS                                   (open)
   ├ empty state: "No areas yet — tap + or click the map" [+ Add]
   ├ Area rows: ● name (inline-rename, default A/B/C) ·
   │   per-area radius slider · "50 km · 37 clients · 4.2k rooms"
   │   [eye] [fly-to] [reach-from-here] [×]
   ├ [+ Add area] (arms crosshair placement, Esc cancels)
   ├ [Compare areas] (when ≥2) → 3-way table overlay
   └ Scenarios ▾  (save/load named snapshots · Copy link)
▼ 2. DEMAND                                           (open)
   └ 3 KPI tiles, 24px tabular numerals + count-up:
     clients shown · rooms (Σ) · rooms covered by areas
▼ 3. LAYERS                                           (open)
   ├ ☀ Demand hexmap        [gradient swatch]   [eye]
   ├ ● Clients (185)        [blue dot]          [eye]
   │   └ sub: labels on zoom · show approx pins
   ├ ◆ Partner hotels (45)  [parent eye]
   │   ├ GCH (37)  [amber square]               [eye]
   │   └ Seminaris (8) [green square]           [eye]
   ├ ◌ Bike stations        [teal]              [eye]
   └ Basemap: 5 thumbnail tiles (radio)
► 4. REACHABILITY                                     (collapsed;
   ├ origin picker: any client OR proposed area        auto-opens on
   ├ mode segmented control (bike/walk/transit) + time use)
   └ results list + nested band legend chips
► 5. DATA & ADVANCED                                  (collapsed)
   ├ geocode resolve/refresh + progress + cancel
   ├ Export JSON · Clear saved coords (with confirm!)
   ├ ORS key (status dot when saved)
   └ Add area by coordinates
```

Rules applied:
- **Accordion = native `<details>/<summary>`**, multiple sections open simultaneously (never
  auto-collapse — users must see coverage while adjusting reachability), chevron rotates 180ms,
  state persisted in `localStorage('arrivio.ui.v1')`. Collapsed headers show a live one-line summary
  ("Reachability — transit, 20 min").
- **Legend IS the layer list** (Felt model): swatches live in the rows; the separate Legend card and
  Display card are deleted; the on-map gradient pill covers presentation needs.
- **Eye toggles**: 18px Lucide eye/eye-off, `aria-pressed`, 32px hit area, hidden rows fade to
  opacity .45; layers fade via pane-opacity transition (no re-render).
- **Selection is contextual**: clicking a pin/area slides a detail view over the panel top (back
  arrow returns) — desktop twin of the mobile place card. Popups demoted to hover tooltips.
- **Geocoding demoted** from "first card with the most prominent CTA in the app" to a collapsed
  maintenance section; `Clear saved coordinates` gets a confirm dialog (it currently
  `location.reload()`s with zero warning).
- **Cmd/Ctrl+K command palette** (~100 lines vanilla): 185 client names + cities + ~8 commands
  ("Add area at center", "Toggle hexmap", "Present mode", basemap switches).
- **Numbers**: `Intl.NumberFormat('de-DE')` everywhere (1.234 not 1,234; "7,5 km"); `≈` prefix for
  estimates; optional DE/EN toggle defaulting from `navigator.language`.

---

## 5. The map itself (signature visuals)

1. **Hexagonal demand layer** (the Targomo signature, makes 185 pins tell a market story):
   `h3-js@4.4.0` (57.5KB gz, zero deps, NOT deck.gl/d3-hexbin). Bucket clients via
   `latLngToCell`, sum `rooms_mid` per cell, render `cellToBoundary` rings as plain `L.polygon`s.
   Resolution by zoom: res 5 (≈9km) national · res 6 (≈3.5km) regional · res 7 (≈1.4km) city.
   ag_Sunset ramp, fillOpacity .55, hexes below z9 / pins above (crossfade). O(185) — recompute on
   zoomend freely. Eye-toggle row + gradient legend bound to the same ramp tokens.
2. **Demand-weighted donut clusters** (replaces count-only blobs that erase room volume):
   `iconCreateFunction` returns an SVG donut — dark disc `rgba(20,24,32,.85)`, pink ring scaled by
   √(summed rooms), white summed-rooms label, 44px. Drop `MarkerCluster.Default.css`. Zero new deps;
   the biggest visual modernization per byte.
3. **Client pins**: keep radius=√rooms formula; add hover micro-interaction (scale 1.18 + soft halo
   150ms + `bringToFront`), selected state (white ring + pink halo), `alt` text per marker.
   Labels gated by zoom AND viewport density (only when <40 clients visible) to stop projection
   label-soup.
4. **Proposed areas**: replace the text-glyph ★ with an SVG teardrop pin (24×32, pink, white 2px
   stroke, drop-shadow); name pill below. Circle: pink stroke 2px, fill .10 (.18 while dragging) +
   **live drag tooltip** "50 km · 37 clients · 4.2k rooms" with throttled (100ms) live KPI count-up
   — the single most impressive boardroom moment available. **Per-area radius** (slider in each
   area row; the global slider dies). WCAG 2.2 drag alternatives: "Move" mode (crosshair, click to
   relocate, Esc cancels) + arrow-key nudge (250m, Shift=1km).
5. **Isochrones**: nested **3 time bands in one ORS call** (range array), fillOpacity .35/.22/.12
   inner→outer, 2px stroke, outer ring dashed. Mode hues (teal/violet/amber) end the
   green-vs-Seminaris collision. No more viewport-stealing auto-fitBounds (offer a "zoom to reach"
   chip instead). Reachability origin can be **a proposed area** — the actual use case.
   Transit hull keeps a visually distinct "approximate" treatment (hatched/dashed) + label.
6. **Hotels**: 10px rounded-square divIcons (shape ≠ circle), amber/green; hotel geocode burst is
   replaced by **baking browser-resolved coords into the data once** (export exists already) and
   only geocoding deltas, silently, after idle.
7. **Bike stations**: render via canvas renderer or cluster, viewport-culled — the current
   "all of Germany's nextbike network as individual SVG nodes" approach can't survive.

---

## 6. Feedback, status & polish layer

- **Toast system** (bottom-center, `role=status`, errors `role=alert` + persist + Retry action):
  replaces all inline "Computing…"/"Locating hotels 3/45…" text writes. Max 3 stacked.
- **One visually-hidden `aria-live=polite` region** announcing discrete completions only
  ("Erreichbarkeitszone berechnet: 32 Klienten in 30 Minuten") — never per-frame values.
- **Skeleton shimmer** only for 1–10s waits (reachability result block, hotel rows); determinate
  `role=progressbar` + **cancel button** for the minutes-long geocode batch; nothing for <1s ops.
- **Optimistic UI**: pulsing origin pin while isochrone is in flight; polygon crossfades in.
- **Focus**: global `:focus-visible` 2px solid ring (#d6219b light / #ff7ac9 dark); markers get a
  white+pink double ring; hotel dots `keyboard:false` (curated focus order — not 200 tab stops);
  popup/card focus management (focus in on open, return on close).
- **Empty states with one CTA** (Polaris style) for: no areas, no search results, reach not yet run,
  geocode misses (with editable retry). Delete all permanent hint paragraphs.
- **Cursor semantics**: crosshair while placement armed + helper pill ("Click map to place — Esc to
  cancel"); grab/grabbing on area pins; armed buttons get `aria-pressed`.
- **Destructive-action hygiene**: confirm on Clear-all-areas and Clear-coordinates; 8s undo toast
  after deleting an area.
- **State persistence + sharing** (the inversion fix — today geocode caches persist but the user's
  actual work doesn't): areas/radius/names/layer-vis/basemap → debounced URL hash
  (`#v=1&areas=51.49,7.76,50,A;…&base=dark&layers=gch,sem`) + named scenario snapshots in
  localStorage + **Copy link** button. Hash beats localStorage on load.
- **Misc fixes that read as credibility**: favicon + `theme-color` + OG tags; title → "Arrivio —
  Standortanalyse"; kill the default-area-on-load (start with the empty-state CTA instead); rename
  "Demand in view" → "Demand shown" or actually bind it to the viewport (`moveend`); delete dead
  `#setup` CSS + duplicate `nameVariants`; `preconnect` hints for unpkg/cartocdn/photon.

---

## 7. Implementation roadmap

Phases are shippable increments; each ends deployed on Pages and testable on real devices.

### Phase 0 — Stop the bleeding (hours)
1. Fix mobile 0px map (`#map{flex:0 0 60vh}` interim) — real fix lands in Phase 3.
2. Click-to-add default OFF; "+ Add area" arms crosshair placement instead.
3. Contrast: `.hint`/`.muted` → `#6b7280`; approx badge → `#8a5200`.
4. `Intl.NumberFormat('de-DE')` + `tabular-nums`.
5. Confirm dialogs on the two destructive actions; debounce search input (150ms).
6. Rotate/domain-restrict the ORS key; stop hotel-geocode burst (bake coords).

### Phase 1 — Token system + dark theme (1–2 days)
Design tokens (§2.1), Inter, dark/light `data-theme` switch, CARTO `dark_all` basemap default,
dark-themed Leaflet chrome (popups/tooltips/clusters/attribution), motion tokens +
reduced-motion guard, focus-visible rings, Lucide sprite. **This phase alone ≈ 70% of the
Targomo look.**

### Phase 2 — Floating chrome + panel IA (2–3 days)
Search pill (clients + places + lat,lng + add-area action) · bottom-right control cluster +
thumbnail basemap popover · gradient legend pill · network-overview pill · accordion panel in the
§4 order with eye-toggle layer rows · selection detail view · geocoding demoted to Data & advanced ·
empty states · toasts · panel collapse rail.

### Phase 3 — Mobile (2–3 days)
Bottom sheet (3 detents, place card, Back-button support) · filter chips · FAB · touch targets ·
dvh/safe-area · gesture hygiene (`tapTolerance`, `touch-action`) · PWA sidecars · z-index ladder.
Test matrix: iPhone Safari, Android Chrome, 380px → 640px, landscape.

### Phase 4 — Signature data visuals (2–3 days)
h3 hex demand layer + ramp legend · donut clusters · nested isochrone bands + mode hues ·
per-area radius + named areas + live drag stats · area-origin reachability · hotel shape markers ·
pin hover/selected states · label density gating.

### Phase 5 — Presentation & big screen (2 days)
`--ui-scale` + `body.presenting` + ≥1920px auto-bump · Present mode (fullscreen, light-Beamer
default, enlarged legend/KPIs) · saved views + keyboard map + flyTo steps · cursor spotlight ·
screenshot export · kiosk autoplay param.

### Phase 6 — Scenarios, compare, share (1–2 days)
URL-hash state + Copy link · named scenario snapshots · 3-way compare table with winner
highlighting · print-styled coverage report · Cmd+K palette.

### Phase 7 — Hardening (1 day)
ARIA pass (live regions, labels, `aria-expanded`/`aria-pressed` audit) · keyboard nudge for areas ·
OpenFreeMap vector dark option via `maplibre-gl-leaflet` · station-layer canvas/culling ·
performance pass (incremental renders instead of full cluster rebuild) · real projector test
(colors that differ on LCD merge when projected — verify ramps on the actual meeting-room beamer).

### Library shopping list (all CDN, no build step)
| Lib | Version | Purpose |
|---|---|---|
| leaflet (keep) | 1.9.4 | engine |
| leaflet.markercluster (keep) | 1.5.3 | clusters (custom icons; drop Default.css) |
| h3-js | 4.4.0 | hex demand layer |
| leaflet.fullscreen (brunob) | 5.3.1 | presentation fullscreen |
| leaflet-simple-map-screenshoter | 0.5.0 | PNG export |
| SmoothWheelZoom | inline ~100 lines | Google-Maps-feel zoom |
| maplibre-gl + maplibre-gl-leaflet | 5.x + 0.1.3 | (Phase 7, optional) vector dark basemap |
| Inter font | — | typography |

### Explicit anti-decisions (researched and rejected)
- ❌ deck.gl / d3-hexbin for 185 points (megabytes for nothing; screen-space hexes re-bin fuzzily).
- ❌ CSS `filter:invert()` dark mode (hue-shifted garbage, magnified on projection).
- ❌ Full MapLibre migration now (2–3× verbosity; only for a hard 2D/3D requirement).
- ❌ Stadia/MapTiler dark styles (free tiers are non-commercial; Arrivio is commercial use).
- ❌ Leaflet.GestureHandling (for embedded maps in articles, not full-screen apps).
- ❌ Canvas renderer for clients (kills CSS hover styling; solves a non-problem at 185 nodes).
- ❌ Auto-collapse accordions; left-side panel; dark theme forced in projector mode;
  pins as 200 tab stops; pink as text on dark; double-encoding rooms in size AND color on pins.

---

## 8. Acceptance criteria ("perfect in all senses")

**Mobile:** map visible and full-bleed on a 380px phone; every control reachable one-thumb; no
accidental area drops; pin tap opens a place card, Back closes it; installable as a PWA; nothing
under 44px.

**Desktop:** dark Targomo-grade first impression; search-first navigation; panel collapsible;
coverage story (areas → KPIs → compare) above the fold; every async op has visible, cancelable
feedback; keyboard path to everything; WCAG AA contrast throughout.

**Projection:** one keypress to Present; all visible text ≥22px equivalent and symbology scaled to
match; saved-view story steps with smooth flights; legible on a low-lumen beamer (light variant) and
an LED wall (dark variant); screenshot lands in a deck in one click; survives a stray Esc.

---

*Sources behind the specifics: Targomo Loop, CARTO Builder/CARTOColors, kepler.gl, Felt, ArcGIS
Exhibit/Dashboards, Placer.ai (3-site compare), Material 3 (sheets/motion/search), Apple HIG,
NN/g (accordions, skeletons, tooltips, bottom sheets), WCAG 2.2 (2.5.7 dragging, 2.5.8 targets,
1.4.x contrast), Geckoboard/Grafana (TV dashboards/kiosk), BrightCarbon & signage formulas
(viewing-distance type), web.dev (dvh, reduced motion, PWA), OpenFreeMap/Protomaps/CARTO
basemap terms, Leaflet plugin ecosystem (verified versions & CDN URLs).*
