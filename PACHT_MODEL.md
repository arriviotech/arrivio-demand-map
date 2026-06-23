# Hotel Pacht (lease) — research, model & per-unit display

**Date:** 2026-06-22 · Companion data file: `data/pacht_model.json`

This defines what Arrivio shows an investor when they **click a single hotel** (zoomed in) on the *Small / family hotels* layer: the **Pacht (lease) the hotel is — or would plausibly be — offered at**, not the nightly room rate. The nightly rate stays only as an internal input to the hexmap cost-range.

---

## 1. The target segment (why this model fits)

German hotels are overwhelmingly **Individualhotellerie** (independent / family-owned): **~86–88% of all hotels by count, ~53% of room capacity**, typically **under 100 rooms** (chains hold ~46% of rooms and ~65–70% of revenue). Small chains inside the remaining ~12–14% are also in scope. *Source: IHA Hotelmarkt Deutschland (via hotelbau.de); user brief.*

Consequence for Arrivio: the realistic deal for most of these is a **Pacht (lease / Pachtvertrag)**, not a purchase — and Pacht is what the investor wants to see per property. Most targets are <100 rooms, family-run, often offered with **no Ablöse** (or a separate inventory buyout).

## 2. Real Pacht anchors (crawled, ahgzimmo)

| Property | Tier | Rooms | m² | Pacht €/mo (net) | €/room/mo | €/m²/mo |
|---|---|---:|---:|---:|---:|---:|
| Hotel Garni 3★, Wuppertal | B-city | 54 | 1,670 | 10,000 (+NK 4,500, keine Ablöse) | **185** | 5.99 |
| Vollhotel, Vechta (~80 beds) | rural | ~40 | 1,500 | 11,000 | ~275 | 7.33 |
| Tagungshotel, Marburg | regional | — | 12,600 | 40,500 | — | 3.21 |
| Restaurant + Gästezimmer, Riedlingen | rural | 3 | 390 | 4,000 | — | 10.26 |

Read-through: real Pacht is **cheaper than a value×yield estimate** would suggest; larger properties carry a **lower €/m²**; small full-service/leisure houses can run higher €/m². The Wuppertal €185/room and the crawl's €191/room median are the central anchors.

## 3. The deduction model (outputs a RANGE)

All numbers live in `data/pacht_model.json` so they can be tuned without code changes.

**Per-room path (preferred when rooms known):**
```
tier        = lookup(city) else "rural"
room_rate   = mean(per_room_eur_mo[tier]) × size_factor
est_mid     = rooms × room_rate
range €/mo  = [est_mid × 0.80, est_mid × 1.25]
```
**Per-m² path (fallback when rooms unknown):** `area_m2 × mean(per_m2_eur_mo[tier]) × size_factor`.

`size_factor`: ×0.85 if >80 rooms or >2,500 m² (economies of scale), ×1.10 if <20 rooms, else 1.0. `Nebenkosten` ≈ +25–45% of cold Pacht, shown separately. **Ablöse** (one-off inventory buyout, ~€60k–300k) is shown as its own line, never folded into Pacht.

Bands (€/room/mo): metro 230–400 · B-city 150–270 · regional 120–200 · rural 90–160. (€/m²/mo: metro 6.5–12 · B-city 4.5–8 · regional 3.2–6 · rural 2.8–4.8.)

**Worked example —** 40-room rural hotel: 40 × ~125 = ~€5,000/mo → **range €4,000–6,250/mo (≈ €48k–75k/yr)**. A 90-room München hotel: 90 × ~315 × 0.85 ≈ **€19,300–30,100/mo**.

## 4. How it must appear on the map (per-hotel click)

- **Headline per hotel = Pacht.** If the hotel matches a real listing in `properties.json` → show the **LISTED** Pacht (€/mo net, €/yr, NK, Ablöse, `Source ↗`). Otherwise → show the **deduced range** "≈ €X,XXX–€Y,YYY / mo (est.)" with `≈ €Z/room` and a clear *estimated* flag.
- **Nightly rate is internal only:** keep ADR solely as the input to the hexmap *Price* cost-range (zoomed-out understanding). Do **not** surface nightly rate as the per-unit investor number.
- Show the regional GENESIS occupancy line as supporting context (demand), as today.

The integration steps and guardrail are in `CLAUDE_CODE_PACHT_PROMPT.md`.

---

## 5. 2026 research update — revenue-based deduction (now live)

The per-hotel estimate is no longer a flat per-room band "calibrated to Wuppertal". It now uses the **standard German hotel-lease (Umsatzpacht) rule**, with real inputs:

> **Pacht ≈ 15–25 % of net revenue**, where **revenue ≈ rooms × 365 × occupancy × ADR**.
> Occupancy = real **Destatis GENESIS** bed-occupancy for the hotel's Bundesland; ADR modeled by category (1–2★ €72 · 3★ €105 · 4★ €135 · 5★ €250). The card shows the inputs, e.g. *"≈ 54 rooms × 40 % occupancy × ~€105/night × 15–25 % of revenue."*

**Per-tier €/room·mo reference bands** (cross-check; synthesized from the revenue rule + 2025 market data + the real anchors — no source publishes hotel Pacht banded by tier, so medium confidence):

| Tier | €/room·mo | €/m²·mo |
|---|---|---|
| Metro (A-city) | 450–900 | 12–25 |
| B-city | 300–550 | 8–15 |
| Regional / mid-town | 180–380 | 5–10 |
| Rural / leisure | 120–300 | 3–8 |

**Key economics (sourced):** turnover rent 15–25 % (hotels) / 8–12 % (gastronomy); near-always a fixed minimum (Sockelpacht); lease-coverage ratio (GOP ÷ Pacht) ≥ 1.3; "Pacht mal acht" for small owner-operated (rent ≈ 12.5 % of turnover); prime hotel yield ~5.25 % (2025). Canonical datapoint: a 100-room hotel at ~75 % occ / ~€80 ADR ⇒ ~€475/room·mo (~20.7 % of revenue).

**Sources:** [pachtnetzwerk.immo — Pachtvertrag](https://pachtnetzwerk.immo/blog/hotel-gastronomie-pachtvertrag-letzte-entscheidungskriterien) · [pachtnetzwerk.immo — Pachtabdeckungsfaktor](https://pachtnetzwerk.immo/blog/der-pachtabdeckungsfaktor) · [AHGZ "Pacht mal acht"](https://www.ahgz.de/archiv/-fuer-gastronomen-gilt-pacht-mal-acht,200012214307.html) · [Engel & Völkers Hotelmarkt 2025](https://www.engelvoelkers.com/de-de/commercial/blog/hotelmarkt--deutschland-zunehmender-wettbewerbsdruck-trotz-hoher-nachfrage/) · Christie & Co DACH Hotel Report 2025. Real LISTED Pacht always overrides the model; where a hotel matches a live listing the card shows the real figure + `Source ↗`.
