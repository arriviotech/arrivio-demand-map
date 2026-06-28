// Ingests verified broker/manual captures (data/broker_listings_all.csv, and Arrivio_Capture_Template
// exported to data/capture_template.csv if present), normalises to the app's record schema with
// asset_type tagged exactly, geocodes by PLZ, dedups, and writes data/captures.json. assemble.mjs
// unions this with properties.json into PROPERTIES. NEVER fabricates — blank where a field is absent.
//   node build/import_captures.mjs
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const B = dirname(fileURLToPath(import.meta.url));
const ROOT = join(B, '..');

// smart number parser: handles 5776.2 (dot-decimal), 770,16 (German comma-decimal), 1.400 (thousands)
const num = s => { if (s == null) return null; let t = String(s).trim().replace(/[^\d.,-]/g, ''); if (!t) return null; if (t.includes(',')) t = t.replace(/\./g, '').replace(',', '.'); else if (t.includes('.')) { const p = t.split('.'); if (p.length > 2 || p[p.length - 1].length === 3) t = p.join(''); } const n = parseFloat(t); return Number.isFinite(n) ? n : null; };

// ---- PLZ geocode (reuse the cached WZB table; metro centroid fallback) ----
const CITY_LL = { 'düsseldorf': [51.227, 6.773], 'köln': [50.937, 6.96], 'bonn': [50.737, 7.098], 'aachen': [50.776, 6.084], 'münchen': [48.137, 11.575], 'hamburg': [53.551, 9.993], 'berlin': [52.52, 13.405], 'frankfurt am main': [50.11, 8.682], 'frankfurt': [50.11, 8.682], 'stuttgart': [48.776, 9.182], 'leipzig': [51.34, 12.375], 'dortmund': [51.514, 7.466], 'essen': [51.456, 7.012], 'bremen': [53.079, 8.802], 'dresden': [51.05, 13.737], 'hannover': [52.376, 9.732], 'nürnberg': [49.452, 11.077] };
const PLZ = new Map();
(() => { const f = join(B, 'listings_cache', 'plz_geocoord.csv'); if (!existsSync(f)) return; for (const line of readFileSync(f, 'utf8').split(/\r?\n/).slice(1)) { const c = line.split(','); if (c.length < 3) continue; const plz = c[0].trim().padStart(5, '0'), lat = parseFloat(c[1]), lng = parseFloat(c[2]); if (/^\d{5}$/.test(plz) && Number.isFinite(lat) && Number.isFinite(lng)) PLZ.set(plz, [Math.round(lat * 1e4) / 1e4, Math.round(lng * 1e4) / 1e4]); } })();
function geocode(plz, city) {
  if (plz) { const p = String(plz).padStart(5, '0'); if (PLZ.has(p)) return PLZ.get(p); for (const len of [4, 3]) { const pre = p.slice(0, len), hits = [...PLZ.entries()].filter(([k]) => k.startsWith(pre)); if (hits.length) { const a = hits.reduce((s, [, v]) => [s[0] + v[0], s[1] + v[1]], [0, 0]); return [Math.round(a[0] / hits.length * 1e4) / 1e4, Math.round(a[1] / hits.length * 1e4) / 1e4]; } } }
  if (city) { const k = city.toLowerCase().trim(); if (CITY_LL[k]) return CITY_LL[k]; }
  return null;
}

// ---- robust CSV parser (quoted fields may contain commas) ----
function parseCSV(text) {
  const rows = []; let row = [], cur = '', q = false;
  for (let i = 0; i < text.length; i++) { const ch = text[i];
    if (q) { if (ch === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += ch; }
    else if (ch === '"') q = true; else if (ch === ',') { row.push(cur); cur = ''; } else if (ch === '\n') { row.push(cur); rows.push(row); row = []; cur = ''; } else if (ch !== '\r') cur += ch;
  }
  if (cur.length || row.length) { row.push(cur); rows.push(row); }
  return rows;
}

const ASSET_TYPES = new Set(['office', 'industrial_hall', 'retail', 'land_plot', 'hotel', 'gastronomy_with_rooms', 'mixed_use', 'apartment_building', 'other']);
function normalize(r, src) {
  let at = (r.asset_type || 'other').trim(); if (!ASSET_TYPES.has(at)) at = 'other';
  const deal = (r.deal || '').trim().toLowerCase() || (num(r.price_eur) ? 'sale' : 'lease');
  const plz = (r.plz || '').replace(/\D/g, '') || null, city = (r.city || '').trim() || null;
  const ll = geocode(plz, city);
  const rentLo = num(r.rent_eur_m2_min), rentHi = num(r.rent_eur_m2_max);
  const aLo = num(r.area_min_m2), aHi = num(r.area_max_m2), price = num(r.price_eur), rooms = num(r.rooms);
  const area = aHi || aLo || null;
  const rec = {
    id: (r.listing_id || '').trim() || (src + '-' + Math.abs([...(r.name || r.source_url || '')].reduce((a, c) => (a * 31 + c.charCodeAt(0)) | 0, 7)).toString(36)),
    asset_type: at, kind: at, deal,
    name: (r.name || '').trim(), district: (r.district || '').trim() || null, plz, city, state: (r.state || '').trim() || null,
    rooms: rooms || null, area_m2: area, area_min_m2: aLo || null, area_max_m2: aHi || null,
    source: (r.source || src).trim(), source_url: (r.source_url || '').trim() || null,
    price_basis: 'LISTED', captured: (r.captured || '').trim() || null, notes: (r.notes || '').trim() || null,
  };
  if (ll) { rec.lat = ll[0]; rec.lng = ll[1]; }
  if (rentLo || rentHi) { rec.rent_eur_m2_min = rentLo; rec.rent_eur_m2_max = rentHi; rec.rent_eur_m2_mo = Math.round(((rentLo || rentHi) + (rentHi || rentLo)) / 2 * 10) / 10; } // lease €/m²·mo
  if (price) { rec.price_eur = price; if (area) rec.eur_per_m2 = Math.round(price / area); }
  return rec;
}

let records = [];
const ingest = (path, defSrc) => { if (!existsSync(path)) return; const rows = parseCSV(readFileSync(path, 'utf8')); const hdr = rows[0].map(h => h.trim()); for (const row of rows.slice(1)) { if (!row.length || row.every(c => !c.trim())) continue; const o = {}; hdr.forEach((h, i) => o[h] = row[i]); records.push(normalize(o, (o.source || defSrc || 'broker'))); } };
ingest(join(ROOT, 'data', 'broker_listings_all.csv'), 'broker');
ingest(join(ROOT, 'data', 'capture_template.csv'), 'capture'); // Arrivio_Capture_Template.xlsx → export here to ingest

// dedup: by id; then name|plz|area; then coords ≤200 m same type+area (keep first, collect source_urls)
const out = [], seenId = new Set();
const key = r => [(r.name || '').toLowerCase().slice(0, 40), r.plz, r.area_m2].join('|');
for (const r of records) {
  if (seenId.has(r.id)) continue;
  let dup = r.name ? out.find(o => key(o) === key(r)) : null;
  if (!dup && r.lat != null) dup = out.find(o => o.lat != null && o.asset_type === r.asset_type && o.area_m2 === r.area_m2 && Math.hypot((o.lat - r.lat) * 111, (o.lng - r.lng) * 70) < 0.2);
  if (dup) { dup.source_urls = [...new Set([...(dup.source_urls || [dup.source_url]), r.source_url].filter(Boolean))]; continue; }
  seenId.add(r.id); out.push(r);
}

writeFileSync(join(ROOT, 'data', 'captures.json'), JSON.stringify({ _meta: { title: 'Imported broker / manually-captured listings', note: 'Normalised from data/broker_listings_all.csv (+ capture_template.csv) via build/import_captures.mjs. asset_type tagged exactly; price_basis=LISTED; geocoded by PLZ; deduped (kept all source_urls). Unioned with properties.json at assemble.', sources: [...new Set(out.map(r => r.source))], count: out.length, captured: out[0] && out[0].captured }, properties: out }, null, 1));

const by = f => out.reduce((m, r) => { const k = f(r) || '—'; m[k] = (m[k] || 0) + 1; return m; }, {});
console.log('captures.json:', out.length, 'records (' + out.filter(r => r.lat != null).length + ' geocoded), PLZ table', PLZ.size);
console.log('by asset_type:', JSON.stringify(by(r => r.asset_type)));
console.log('by source:', JSON.stringify(by(r => r.source)), '| by deal:', JSON.stringify(by(r => r.deal)));
console.log('sample:', JSON.stringify(out[0]));
