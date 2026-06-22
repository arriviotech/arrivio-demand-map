// Builds data/genesis_beds_by_land.json from the Destatis 45412 CSV (accommodation
// supply by Betriebsart x Bundesland, 2024). Gives the hotel layer real regional
// context: establishments, beds, arrivals, overnights, and bed occupancy.
//   node build/build_genesis.mjs
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const B = dirname(fileURLToPath(import.meta.url));
const ROOT = join(B, '..');
const CSV = join(ROOT, 'Destatis_45412_Beherbergung_2024.csv');

const num = s => { s = (s || '').trim(); if (!s || s === '.') return null; const n = parseInt(s.replace(/\D/g, ''), 10); return Number.isFinite(n) ? n : null; };
const occ = (nights, beds) => (nights && beds) ? Math.round(nights / (beds * 365) * 1000) / 10 : null; // %

const lines = readFileSync(CSV, 'utf8').replace(/^﻿/, '').split(/\r?\n/).filter(l => l && !l.startsWith('#'));
const header = lines.shift().split(';');
const HOTELS = 'Hotels, Hotels garnis, Gasthöfe, Pensionen';
const TOTAL = 'Insgesamt';

const byLand = {};
for (const line of lines) {
  const c = line.split(';');
  if (c.length < 7) continue;
  const [code, land, art] = c;
  const rec = { betriebe: num(c[3]), beds: num(c[4]), arrivals: num(c[5]), overnights: num(c[6]) };
  byLand[land] ||= { land_code: code, hotels: null, total: null };
  if (art === HOTELS) byLand[land].hotels = rec;
  else if (art === TOTAL) byLand[land].total = rec;
}

const data = {};
for (const [land, v] of Object.entries(byLand)) {
  const h = v.hotels || {}, t = v.total || {};
  data[land] = {
    land_code: v.land_code,
    hotels_betriebe: h.betriebe ?? null,
    hotels_beds: h.beds ?? null,
    hotels_arrivals: h.arrivals ?? null,
    hotels_overnights: h.overnights ?? null,
    hotels_occupancy_pct: occ(h.overnights, h.beds),      // headline (Hotels/Gasthöfe/Pensionen only — per workbook)
    total_betriebe: t.betriebe ?? null,
    total_beds: t.beds ?? null,
    total_overnights: t.overnights ?? null,
    total_occupancy_pct: occ(t.overnights, t.beds)
  };
}

const out = {
  _meta: {
    title: 'German accommodation supply & occupancy by Bundesland, 2024',
    source: 'Destatis / Regionalstatistik GENESIS table 45412-02-02-4-B',
    licence: 'Datenlizenz Deutschland – Namensnennung 2.0',
    retrieved: '2026-06-22',
    occupancy_formula: 'overnights / (beds × 365); hotels_occupancy_pct uses the Hotels/Gasthöfe/Pensionen category',
    note: "'.'/empty in source = confidential (Bremen/Berlin Vorsorge-/Reha)."
  },
  data
};

if (!existsSync(join(ROOT, 'data'))) mkdirSync(join(ROOT, 'data'));
writeFileSync(join(ROOT, 'data', 'genesis_beds_by_land.json'), JSON.stringify(out, null, 2));

// --- report + sanity (Berlin/Hamburg should rank top on hotel occupancy) ---
const rank = Object.entries(data).filter(([, d]) => d.hotels_occupancy_pct != null)
  .sort((a, b) => b[1].hotels_occupancy_pct - a[1].hotels_occupancy_pct);
console.log('Wrote data/genesis_beds_by_land.json (' + Object.keys(data).length + ' Länder)');
console.log('\nHotel bed occupancy ranking (top 6):');
for (const [land, d] of rank.slice(0, 6)) console.log('  ' + d.hotels_occupancy_pct.toFixed(1) + '%  ' + land + '  (' + d.hotels_betriebe + ' hotels, ' + d.hotels_beds + ' beds)');
const hh = data['Hamburg'], be = data['Berlin'];
console.log('\nCHECK: Hamburg=' + hh.hotels_occupancy_pct + '% (exp ~57), Berlin=' + be.hotels_occupancy_pct + '% (exp ~56)');
