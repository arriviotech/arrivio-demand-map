# Arrivio — TAM migration year & office vacancy: findings + options

Two of the requested changes are **data-availability decisions** that need your pick before I hard-swap the dataset. Both are researched below with sources. (Captured 2026-06-23.)

---

## Point 8 — States · TAM migration year (is it the 2022 refugee spike?)

**Checked:** our `STATES_DATA` is **2024**, NOT 2022. Verified — our NRW `intl` = **344,489**, which exactly matches Destatis 2024 *Zuzüge aus dem Ausland* for NRW (IT.NRW). So the map is **not** built on the Ukraine-spike year.

**But:** 2024 still carries an elevated humanitarian tail. National gross arrivals (Destatis "Wanderungen zwischen Deutschland und dem Ausland"):

| Year | Arrivals from abroad | Net migration |
|---|--:|--:|
| 2019 | 1,558,612 | +327,060 |
| 2021 | 1,323,466 | +329,163 |
| **2022** | **2,665,772** ← Ukraine spike | **+1,462,089** |
| 2023 | 1,932,509 | +662,964 |
| **2024 (ours)** | **1,694,192** | +430,183 |
| 2025 (prov.) | 1,479,944 | +235,000 |

2022 = unusable (≈1M Ukrainians in one year). 2024 is ~9% above the 2019 baseline on gross arrivals; net is near-normal. EU labour mobility actually went *negative* in 2024 — the still-positive total leans on the humanitarian tail.
Sources: Destatis [year table](https://www.destatis.de/EN/Themes/Society-Environment/Population/Migration/Tables/migration-year-01.html), [PD25_224](https://www.destatis.de/DE/Presse/Pressemitteilungen/2025/06/PD25_224_12411.html); [Mediendienst Integration](https://mediendienst-integration.de/ein-und-auswanderung/einwanderung-nach-deutschland/wie-viele-menschen-wandern-nach-deutschland-ein/).

**Options (pick one — I'll swap the data + relabel TAM):**
- **A — Keep 2024 (current conditions).** What we have. Most recent full year; honest if labelled "2024, incl. humanitarian tail."
- **B — Switch to 2023 full per-state table.** Fully sourced and ready to drop in today (all 16 states). Still elevated (Ukraine/Syria), so a *high* case, not a durable baseline.
- **C — Switch to 2019 baseline (pre-Ukraine, pre-COVID).** Best "durable demand" anchor; needs a per-state pull from Destatis GENESIS table 12711 (free, login).
- **D — Show a range 2019 → 2024** (durable → current) as two TAM scenarios.

**Recommendation:** keep **gross** arrivals (housing units are consumed by arrivals, not net), and either **C (2019 durable baseline)** or **D (range)**. I can implement once you choose. Keep €15,000/person.

---

## Point 7 — Office vacancy % per region

**Finding:** office vacancy **%** is published **only per major city** (~30 markets: Top-7 quarterly via JLL/Colliers + ~19 secondary via bulwiengesa/DZ HYP). There is **NO per-Kreis or per-Bundesland vacancy %** in public data — below city level only a 1–10 composite *score* exists (vdpImmoScore), not a rate. The Bundesbank's official series is national + Top-7 + "other 120 cities," never by state.
Sources: [Colliers City Survey](https://citysurvey.colliers.de/en/leasing-market/), [JLL Germany Office](https://www.jll.com/de-de/insights/market-dynamics/germany-office), [DZ HYP/bulwiengesa 2025/26](https://dzhyp.de), [Bundesbank vacancy indicator](https://www.bundesbank.de/en/statistics/sets-of-indicators/vacancy-rate-for-offices-in-germany-622742).

**So a true per-region vacancy-% hexmap would be inventing data.** What I shipped instead: the Office → **Vacancy %** metric now colours the real city markets by their vacancy rate (dark = higher), legend "Office vacancy rate (% — city markets)", range 2.9%–12.7%. This is the honest representation (vacancy is a per-market point statistic).

City vacancy % (latest, for reference): Frankfurt 12.5 · Düsseldorf 10.7 · München 10.0 · Berlin 9.3 · Stuttgart 6.7 · Hamburg 5.8 · Köln 5.2; secondary: Mannheim 10.9, Bremen 7.3, Essen 7.1, Karlsruhe 5.9, Nürnberg 5.6, Leipzig ~4.8, Münster 2.5. National ~5.6% (2024) → ~6.3% (2025).

**Options (pick one):**
- **A — City markers coloured by vacancy % (shipped).** Honest; cities with no office market simply have no marker.
- **B — State choropleth rolled up from each state's major market(s), explicitly labelled "anchor cities only,"** with no-data states left grey. Gives the regional fill you asked for without smearing — but it's a city figure painted over a whole state, so it must carry that caveat.
- I did **not** IDW-smear vacancy across regions (that's the artefact we retired).

**Recommendation:** keep **A** as the truthful default; add **B** as a clearly-captioned overlay only if you want the filled-region look. Tell me and I'll add B.
