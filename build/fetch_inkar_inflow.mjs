// Fetch per-Kreis immigrant-settlement indicators from INKAR (BBSR) and write inflow_kreise.json.
// Source: https://www.inkar.de  (Indikatoren und Karten zur Raum- und Stadtentwicklung, BBSR Bonn)
// TLS: INKAR serves an incomplete cert chain; inkar_lib supplies the missing GoDaddy intermediate
// so the chain validates against Node's bundled roots (verification is NOT disabled).
import fs from 'node:fs';
import { inkarJson } from './inkar_lib.mjs';

const GEO = 'KRE'; // Kreise level

// Indicator group IDs (from /Wizard/GetIndikatorenZuBereich):
//   163 Außenwanderungssaldo je 1.000 Einw.   -> INTERNATIONAL net migration (abroad)
//   162 Gesamtwanderungssaldo je 1.000 Einw.  -> TOTAL net migration
//   166 Binnenwanderungssaldo je 1.000 Einw.  -> DOMESTIC/internal net migration
//   143 Ausländeranteil (%)                   -> foreign-population SHARE (settlement stock proxy)
const INDICATORS = {
  intl:  '163',
  total: '162',
  domestic: '166',
  auslaenderanteil: '143',
};

async function fetchLatest(variable) {
  const zb = (await inkarJson('/Wizard/GetM%C3%B6glich', 'POST', {
    IndicatorCollection: [{ Gruppe: variable }],
    TimeCollection: '',
    SpaceCollection: [{ level: GEO }],
  })).Möglich;
  const latestYear = Math.max(...zb.map((z) => +z.Zeit));
  const times = zb
    .filter((z) => +z.Zeit === latestYear)
    .map((z) => ({ group: z.Gruppe, level: z.RaumID, indicator: z.IndID, time: z.ZeitID }));
  const data = await inkarJson('/Table/GetDataTable', 'POST', {
    IndicatorCollection: [{ Gruppe: variable }],
    TimeCollection: times,
    SpaceCollection: [{ level: GEO }],
    pageorder: '1',
  });
  const rows = data.Daten;
  const map = new Map();
  for (const r of rows) map.set(r['Schlüssel'], r.Wert);
  return { year: latestYear, map, label: zb[0].Indikator, n: rows.length };
}

const main = async () => {
  // Kreis list (names + AGS)
  const gebiete = (await inkarJson(`/Wizard/GetGebieteZumRaumbezug/${GEO}`)).Gebiete;
  const names = new Map(gebiete.map((g) => [g['Schlüssel'], g.Name]));

  // Fetch each indicator
  const fetched = {};
  for (const [key, id] of Object.entries(INDICATORS)) {
    fetched[key] = await fetchLatest(id);
    console.log(`  ${key} (id ${id}): "${fetched[key].label}" year=${fetched[key].year} rows=${fetched[key].n}`);
  }

  // Assemble one row per Kreis
  const round2 = (v) => (v == null || Number.isNaN(v) ? null : Math.round(v * 100) / 100);
  const out = [...names.entries()].map(([ags, name]) => ({
    ags,
    name,
    intl: round2(fetched.intl.map.get(ags)),
    total: round2(fetched.total.map.get(ags)),
    domestic: round2(fetched.domestic.map.get(ags)),
    auslaenderanteil: round2(fetched.auslaenderanteil.map.get(ags)),
  }));
  out.sort((a, b) => a.ags.localeCompare(b.ags));

  const payload = {
    _meta: {
      source: 'INKAR (BBSR Bonn) https://www.inkar.de',
      api: 'POST https://www.inkar.de/Table/GetDataTable (undocumented JSON API used by R packages bonn/inkaR)',
      level: 'KRE (Kreise / districts)',
      join_key: 'ags = 5-digit Amtlicher Gemeindeschlüssel (== AGS/RS in de_kreise.geojson)',
      year_by_field: {
        intl: fetched.intl.year,
        total: fetched.total.year,
        domestic: fetched.domestic.year,
        auslaenderanteil: fetched.auslaenderanteil.year,
      },
      units: {
        intl: 'Außenwanderungssaldo je 1.000 Einwohner (net migration from/to ABROAD per 1,000 inhabitants; can be negative)',
        total: 'Gesamtwanderungssaldo je 1.000 Einwohner (TOTAL net migration per 1,000 inhabitants; can be negative)',
        domestic: 'Binnenwanderungssaldo je 1.000 Einwohner (INTERNAL/domestic net migration per 1,000 inhabitants)',
        auslaenderanteil: 'Ausländeranteil in % (share of foreign nationals in population — settlement-stock proxy)',
      },
      note: 'Values are RATES per 1,000 inhabitants (Wanderungssaldo) / percent (Ausländeranteil), NOT absolute counts. intl is NET external migration (Zuzüge minus Fortzüge aus/ins Ausland). For absolute "Zuzüge aus dem Ausland" counts, use Destatis GENESIS table 12711 (registration required).',
    },
    data: out,
  };

  fs.writeFileSync('inflow_kreise.json', JSON.stringify(payload));
  // Diagnostics
  const nFull = out.filter((r) => r.intl != null && r.total != null && r.auslaenderanteil != null).length;
  console.log('Kreise:', out.length, '| fully-populated rows:', nFull);
  console.log('file bytes:', fs.statSync('inflow_kreise.json').size);
  // sanity extremes
  const byIntl = [...out].filter((r) => r.intl != null).sort((a, b) => b.intl - a.intl);
  console.log('Top 3 intl:', byIntl.slice(0, 3).map((r) => `${r.name} ${r.intl}`).join(' | '));
  console.log('Bottom 2 intl:', byIntl.slice(-2).map((r) => `${r.name} ${r.intl}`).join(' | '));
  const byShare = [...out].filter((r) => r.auslaenderanteil != null).sort((a, b) => b.auslaenderanteil - a.auslaenderanteil);
  console.log('Top 3 Ausländeranteil:', byShare.slice(0, 3).map((r) => `${r.name} ${r.auslaenderanteil}%`).join(' | '));
};

main().catch((e) => { console.error('FAILED:', e.message); process.exit(1); });
