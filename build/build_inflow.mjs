// Builds build/inflow_kreise.json from the Destatis 12711 gross-arrivals pull (zuzuege_kreise_2024.json).
// Replaces the old INKAR net-saldo metric with GROSS arrivals (Zuzüge über die Kreisgrenzen): the
// total number of people who moved INTO each Kreis in 2024 — domestic city-to-city + international
// combined. This is the "addressable audience" metric (gross, not net).
//   node build/build_inflow.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const B = dirname(fileURLToPath(import.meta.url));
const raw = JSON.parse(readFileSync(join(B, 'zuzuege_kreise_2024.json'), 'utf8'));
const clean = n => String(n || '').replace(/,.*$/, '').trim(); // "Düsseldorf, kreisfreie Stadt" -> "Düsseldorf"

const data = raw.map(r => ({
  ags: r.ags,
  name: clean(r.name),
  total: r.zuzuege_total,          // gross arrivals across the district border (domestic + international)
  auslaender: r.zuzuege_auslaender,// arrivals who are foreign nationals
  deutsche: r.zuzuege_deutsche,    // arrivals who are German nationals
})).sort((a, b) => a.ags.localeCompare(b.ags));

const payload = {
  _meta: {
    source: 'Destatis / Regionalstatistik GENESIS table 12711-05-02-4 (Zu- und Fortzüge über die Kreisgrenzen nach Nationalität)',
    year: 2024,
    licence: 'Datenlizenz Deutschland – Namensnennung 2.0',
    join_key: 'ags = 5-digit AGS (== AGS in de_kreise.geojson); Berlin 11000, Hamburg 02000 are single Kreise',
    units: {
      total: 'GROSS arrivals per year — Zuzüge über die Kreisgrenzen: domestic inter-Kreis moves + international arrivals combined (absolute count). This is "people moving in", NOT net saldo.',
      auslaender: 'of which the migrant is a FOREIGN national (note: a foreign national moving from another German Kreis counts here too — it is a nationality split, not an origin split)',
      deutsche: 'of which the migrant is a GERMAN national',
    },
    note: 'Replaces the earlier INKAR NET migration saldo per 1,000. Gross arrivals include city-to-city domestic transfers. Inland-vs-Ausland ORIGIN is not separable at Kreis level for the über-Kreisgrenzen concept.',
  },
  data,
};
writeFileSync(join(B, 'inflow_kreise.json'), JSON.stringify(payload));
const v = data.map(d => d.total).sort((a, b) => a - b);
console.log('inflow_kreise.json:', data.length, 'Kreise | total min/median/max:', v[0], v[v.length >> 1], v[v.length - 1]);
console.log('  Berlin:', JSON.stringify(data.find(d => d.ags === '11000')), '| Munich:', JSON.stringify(data.find(d => d.ags === '09162')));
