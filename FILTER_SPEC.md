# Supply filter — spec & Claude Code prompt (sliders-only, no preset gate)

**Date:** 2026-06-28. Adds a filter panel to the supply layers so users narrow the map to properties matching any criteria. **Decision: sliders/controls only — NO opinionated "Fits Arrivio" preset gate.** The business-plan economics appear only as non-binding reference markers.

## Controls (each maps to a real field in data/properties.json)
| Control | Field(s) | Type | Reference marker (informational only) |
|---|---|---|---|
| Deal | `deal` | segmented: All / Lease / Sale | — |
| Type | `kind` | multi-select: hotel · gastronomie_with_rooms · mixed_use · office | — |
| Price basis | `price_basis` | All / LISTED only / incl. estimates | — |
| Lease €/m²/mo | `lease_eur_mo ÷ area_m2` | range slider | tick at **€15** labelled "model target" |
| Pacht €/room/mo | `lease_eur_mo ÷ rooms` | range slider | tick at ~€375 |
| Sale €/key | `price_eur ÷ rooms` | range slider | tick at **€67k** |
| Asking price € | `price_eur` | range slider | — |
| Rooms | `rooms` | range slider | tick at ~150 |
| Area m² | `area_m2` | range slider | tick at ~3,750 |
| Yield % | `yield_pct` | range slider | — |
| Location | `state` (+ optional "within X km of a target city") | multi-select states + quick "Wave-1/2 cities" toggle | — |

Reference markers are **labels/ticks only** — they never hide anything. There is no "qualified/green" preset.

## Behaviour
- Applies to the Acquisition-targets pins and the hotel/property layers. Filtered-out pins hide; the result **count updates live** ("N of 769 shown").
- Derived values (€/m², €/room, €/key) computed client-side from the record for filtering; missing values (e.g. price_on_request) are excluded only when that specific slider is moved off its full range.
- A **Reset** button restores full ranges. Sliders default to each field's actual min–max in the data (so nothing is hidden until the user moves them).
- Optional: when a filter is active, the zoomed-out density heatmap may recompute from the filtered set (keep the same renderer/legend); if simpler, leave the heatmap and filter only the pins — your call, but don't regress the heatmap.

## Guardrail
Match the existing panel style (same components, colours, fonts). Don't rename or remove existing layers/toggles/legends or break the build. The filter is additive.

## Claude Code prompt (paste)
> Add a **supply filter panel** to `build/p4_app1.html` (+ legend/UI parts as needed), in the existing sidebar style. Controls, all driven by `data/properties.json` fields, **with no preset "fits" gate**: deal (All/Lease/Sale), kind (multi-select), price_basis (All / LISTED only / incl. estimates), and range sliders for lease €/m²/mo (=lease_eur_mo/area_m2), Pacht €/room (=lease_eur_mo/rooms), sale €/key (=price_eur/rooms), asking price €, rooms, area_m2, yield %, plus a state multi-select with a "Wave-1/2 cities" quick toggle and an optional "within X km of city" radius. Each slider initialises to the data's actual min–max. Show small non-binding reference ticks (€15/m²·mo, €67k/key, ~150 rooms, ~3,750 m²) labelled "model target" — purely informational, they must not filter. Filtering hides non-matching pins and updates a live "N of M shown" count; add a Reset button. Records missing a value are excluded from a slider only when that slider is moved off its full range. Keep the existing layers/toggles/legends/heatmaps and the single-file build intact; match the current visual style; verify zero console errors.
