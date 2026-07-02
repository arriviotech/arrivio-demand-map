// Ingests verified broker/manual captures (data/broker_listings_all.csv, and Arrivio_Capture_Template
// exported to data/capture_template.csv if present), normalises to the app's record schema with
// asset_type tagged exactly, geocodes by PLZ, dedups, and writes data/captures.json. assemble.mjs
// unions this with properties.json into PROPERTIES. NEVER fabricates — blank where a field is absent.
//   node build/import_captures.mjs
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { inflateRawSync } from 'node:zlib';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const B = dirname(fileURLToPath(import.meta.url));
const ROOT = join(B, '..');

// smart number parser: handles 5776.2 (dot-decimal), 770,16 (German comma-decimal), 1.400 (thousands)
const num = s => { if (s == null) return null; let t = String(s).trim().replace(/[^\d.,-]/g, ''); if (!t) return null; if (t.includes(',')) t = t.replace(/\./g, '').replace(',', '.'); else if (t.includes('.')) { const p = t.split('.'); if (p.length > 2 || p[p.length - 1].length === 3) t = p.join(''); } const n = parseFloat(t); return Number.isFinite(n) ? n : null; };

// ---- PLZ geocode (reuse the cached WZB table; metro centroid fallback) ----
const CITY_LL = { 'düsseldorf': [51.227, 6.773], 'köln': [50.937, 6.96], 'bonn': [50.737, 7.098], 'aachen': [50.776, 6.084], 'münchen': [48.137, 11.575], 'hamburg': [53.551, 9.993], 'berlin': [52.52, 13.405], 'frankfurt am main': [50.11, 8.682], 'frankfurt': [50.11, 8.682], 'stuttgart': [48.776, 9.182], 'leipzig': [51.34, 12.375], 'dortmund': [51.514, 7.466], 'essen': [51.456, 7.012], 'bremen': [53.079, 8.802], 'dresden': [51.05, 13.737], 'hannover': [52.376, 9.732], 'nürnberg': [49.452, 11.077] };
try { const _cg = JSON.parse(readFileSync(join(ROOT, 'data', 'city_geocode.json'), 'utf8')); for (const k in _cg) if (!CITY_LL[k]) CITY_LL[k] = _cg[k]; } catch (e) {}
const STATE_LL = { 'baden-wuerttemberg': [48.66, 9.35], 'bayern': [48.79, 11.50], 'berlin': [52.52, 13.40], 'brandenburg': [52.40, 13.05], 'bremen': [53.08, 8.80], 'hamburg': [53.55, 9.99], 'hessen': [50.65, 9.16], 'mecklenburg-vorpommern': [53.61, 12.70], 'niedersachsen': [52.64, 9.85], 'nordrhein-westfalen': [51.43, 7.55], 'rheinland-pfalz': [49.95, 7.45], 'saarland': [49.38, 6.99], 'sachsen': [51.05, 13.35], 'sachsen-anhalt': [51.95, 11.70], 'schleswig-holstein': [54.22, 9.70], 'thueringen': [50.90, 11.03] };
const REGION_LL = { 'eifel': [50.25, 6.65], 'rheingau': [50.00, 8.00], 'rhein-main-region': [50.05, 8.55], 'rhein-main': [50.05, 8.55], 'bodensee': [47.65, 9.30], 'schwarzwald': [48.20, 8.20], 'allgaeu': [47.60, 10.30], 'harz': [51.75, 10.60], 'erzgebirge': [50.55, 13.00] };
const asciiKey = s => (s || '').toLowerCase().replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss').trim();
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

// ---- dependency-free .xlsx reader (ZIP central-dir + raw inflate; inlineStr & sharedStrings) ----
function unzip(buf) {
  const files = {};
  let eocd = -1; for (let i = buf.length - 22; i >= 0 && i > buf.length - 22 - 65536; i--) { if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; } }
  if (eocd < 0) return files;
  const n = buf.readUInt16LE(eocd + 10); let off = buf.readUInt32LE(eocd + 16);
  for (let k = 0; k < n; k++) {
    if (buf.readUInt32LE(off) !== 0x02014b50) break;
    const method = buf.readUInt16LE(off + 10), compSize = buf.readUInt32LE(off + 20);
    const fnLen = buf.readUInt16LE(off + 28), exLen = buf.readUInt16LE(off + 30), cmLen = buf.readUInt16LE(off + 32);
    const lho = buf.readUInt32LE(off + 42), name = buf.toString('utf8', off + 46, off + 46 + fnLen);
    const lfn = buf.readUInt16LE(lho + 26), lex = buf.readUInt16LE(lho + 28), ds = lho + 30 + lfn + lex;
    const comp = buf.subarray(ds, ds + compSize);
    try { files[name] = method === 0 ? comp : method === 8 ? inflateRawSync(comp) : Buffer.alloc(0); } catch (e) { files[name] = Buffer.alloc(0); }
    off += 46 + fnLen + exLen + cmLen;
  }
  return files;
}
const xdec = s => String(s).replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&#(\d+);/g, (_, d) => String.fromCharCode(+d));
const colNum = c => { let n = 0; for (const ch of c) n = n * 26 + (ch.charCodeAt(0) - 64); return n - 1; };
function readXlsxRows(path, sheetName) {
  if (!existsSync(path)) return [];
  const files = unzip(readFileSync(path));
  const u = k => files[k] ? files[k].toString('utf8') : '';
  const wb = u('xl/workbook.xml'), rels = u('xl/_rels/workbook.xml.rels');
  let target = 'xl/worksheets/sheet1.xml';
  const sm = wb.match(new RegExp('<sheet[^>]*name="' + sheetName + '"[^>]*r:id="(rId\\d+)"', 'i')) || wb.match(/<sheet[^>]*r:id="(rId\d+)"/i);
  if (sm) { const rm = rels.match(new RegExp('Id="' + sm[1] + '"[^>]*Target="([^"]+)"', 'i')); if (rm) target = 'xl/' + rm[1].replace(/^\/?xl\//, '').replace(/^\//, ''); }
  const sheet = u(target) || u('xl/worksheets/sheet1.xml');
  const shared = []; for (const m of u('xl/sharedStrings.xml').matchAll(/<si>([\s\S]*?)<\/si>/g)) shared.push([...m[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map(x => xdec(x[1])).join(''));
  const rows = [];
  for (const rm of sheet.matchAll(/<row[^>]*r="(\d+)"[^>]*>([\s\S]*?)<\/row>/g)) {
    const cells = [];
    for (const cm of rm[2].matchAll(/<c\s+([^>]*?)>([\s\S]*?)<\/c>/g)) {
      const attrs = cm[1], inner = cm[2], rr = attrs.match(/r="([A-Z]+)\d+"/); if (!rr) continue;
      const t = (attrs.match(/t="([a-z]+)"/) || [])[1]; let v = '';
      if (t === 'inlineStr') { const tm = inner.match(/<t[^>]*>([\s\S]*?)<\/t>/); v = tm ? xdec(tm[1]) : ''; }
      else { const vm = inner.match(/<v>([\s\S]*?)<\/v>/); if (vm) v = t === 's' ? (shared[+vm[1]] || '') : xdec(vm[1]); }
      cells[colNum(rr[1])] = v;
    }
    rows[+rm[1] - 1] = cells;
  }
  return rows.filter(Boolean);
}

const ASSET_TYPES = new Set(['office', 'industrial_hall', 'retail', 'land_plot', 'hotel', 'gastronomy_with_rooms', 'mixed_use', 'apartment_building', 'other']);
const JLL_PATH = { office: 'bueros', industrial_hall: 'hallen', retail: 'einzelhandel', land_plot: 'grundstuecke' }; // JLL per-type detail path

// ---- Task 1: room count + basis for every listing (Arrivio co-living model: 20 m²/person incl. common space) ----
// 'listed'   = the listing states a room/unit/Zimmer count → use it, show plainly.
// 'estimated'= derived floor(usable_area / 20) for convertible floor space → show as an estimate.
// 'n/a'      = not estimable (plot/parking/warehouse/no-area) → blank + a short rooms_note.
const PARK_RE = /stellpl|tiefgarage|garagenhof|parkhaus|garagen-?anlage|\bgaragen\b|parkplatz|car park/i;
const WARE_RE = /lagerhalle|lagerfl[äa]che|logistik|warehouse|produktionshalle|gewerbehalle|industriehalle/i;
const PLOT_RE = /grundst[üu]ck|baugrund|bauland|ackerland|\bplot\b/i;
const UNIT_RE = /(\d{1,4})\s*(?:units?|wohneinheiten|einheiten|wohnungen|\bwe\b|hotelzimmer|g[äa]stezimmer|zimmer|apartments?|appartements?)/i;
function roomCount(r, at, area) {
  const listed = num(r.rooms);
  const blob = ((r.name || '') + ' ' + (r.notes || '')).toLowerCase();
  if (listed && listed > 0) return { rooms: Math.round(listed), rooms_basis: 'listed' };            // 1. explicit rooms column
  const um = blob.match(UNIT_RE); if (um) { const v = +um[1]; if (v > 0 && v < 5000) return { rooms: v, rooms_basis: 'listed' }; } // 1. "X units/Zimmer/Einheiten"
  if (at === 'land_plot') return { rooms: null, rooms_basis: 'n/a', rooms_note: 'area is plot size, not a building' };          // 3. guards
  if (PARK_RE.test(blob)) return { rooms: null, rooms_basis: 'n/a', rooms_note: 'parking — not living space' };
  if (at === 'industrial_hall' || WARE_RE.test(blob)) return { rooms: null, rooms_basis: 'n/a', rooms_note: 'warehouse / logistics area — not living space' };
  if (!area) return { rooms: null, rooms_basis: 'n/a', rooms_note: 'no usable area given' };
  if (PLOT_RE.test(blob) || area > 50000) return { rooms: null, rooms_basis: 'n/a', rooms_note: 'area may be plot, not building' };
  const est = Math.floor(area / 20);                                                                 // 2. estimate from floor area
  if (est < 1) return { rooms: null, rooms_basis: 'n/a', rooms_note: 'area too small to estimate' };
  const conv = (at === 'office' || at === 'mixed_use' || at === 'retail');
  return { rooms: est, rooms_basis: 'estimated', rooms_note: (conv ? 'co-living rooms if converted' : 'co-living capacity') + ' (est., ' + Math.round(area) + ' m² ÷ 20)' };
}

function normalize(r, src) {
  let at = (r.asset_type || 'other').trim(); if (!ASSET_TYPES.has(at)) at = 'other';
  const deal = (r.deal || '').trim().toLowerCase() || (num(r.price_eur) ? 'sale' : 'lease');
  const plz = (r.plz || '').replace(/\D/g, '') || null, city = (r.city || '').trim() || null;
  const notesRaw = (r.notes || '').trim();
  // exact building coords embedded in notes as geo:LAT,LNG (Aengevelt) — beats every centroid, never approx
  let ll = null, locApprox = false, locBasis = null, exactGeo = false;
  { const gm = notesRaw.match(/geo:(-?\d+\.\d+),(-?\d+\.\d+)/); if (gm) { const la = +gm[1], lo = +gm[2]; if (la > 45 && la < 56 && lo > 4 && lo < 17) { ll = [Math.round(la * 1e5) / 1e5, Math.round(lo * 1e5) / 1e5]; exactGeo = true; } } }
  if (!ll) ll = geocode(plz, city);
  if (!ll) {
    const ck = asciiKey(city), sk = asciiKey(r.state);
    if (ck && REGION_LL[ck]) { ll = REGION_LL[ck]; locApprox = true; locBasis = 'region'; }
    else if (sk && STATE_LL[sk]) { ll = STATE_LL[sk]; locApprox = true; locBasis = 'state'; }
    if (ll) {
      const h = Math.abs([...((r.listing_id || '') + (r.name || ''))].reduce((a, c) => (a * 31 + c.charCodeAt(0)) | 0, 7));
      const ang = (h % 360) * Math.PI / 180, rad = 0.06 + (h % 60) / 300;
      ll = [Math.round((ll[0] + rad * Math.cos(ang)) * 1e4) / 1e4, Math.round((ll[1] + rad * Math.sin(ang)) * 1e4) / 1e4];
    }
  }
  // MODEL tier from notes (set upstream by the model filter): prime / qualify / size_unknown / context.
  // Unflagged rows are the non-room context set (industrial/retail/land/other) per the master's convention.
  const mt = notesRaw.match(/MODEL:(prime|qualify|size_unknown|context)/);
  const ROOM_TYPES = new Set(['office', 'apartment_building', 'mixed_use', 'hotel', 'gastronomy_with_rooms']);
  const model_tier = mt ? mt[1] : (ROOM_TYPES.has(at) ? 'size_unknown' : 'context');
  const rentLo = num(r.rent_eur_m2_min), rentHi = num(r.rent_eur_m2_max);
  const aLo = num(r.area_min_m2), aHi = num(r.area_max_m2), price = num(r.price_eur);
  const area = aHi || aLo || null;
  const rc = roomCount(r, at, area);                                                    // Task 1: rooms + rooms_basis + rooms_note
  const rec = {
    id: (r.listing_id || '').trim() || (src + '-' + Math.abs([...(r.name || r.source_url || '')].reduce((a, c) => (a * 31 + c.charCodeAt(0)) | 0, 7)).toString(36)),
    asset_type: at, kind: at, deal,
    name: (r.name || '').trim(), district: (r.district || '').trim() || null, plz, city, state: (r.state || '').trim() || null,
    rooms: rc.rooms, rooms_basis: rc.rooms_basis, area_m2: area, area_min_m2: aLo || null, area_max_m2: aHi || null,
    source: (r.source || src).trim(), source_url: (r.source_url || '').trim() || null,
    price_basis: 'LISTED', captured: (r.captured || '').trim() || null, notes: (r.notes || '').trim() || null,
  };
  if (rc.rooms_note) rec.rooms_note = rc.rooms_note;
  rec.model_tier = model_tier;
  if (ll) { rec.lat = ll[0]; rec.lng = ll[1]; if (exactGeo) rec.geo_exact = true; if (locApprox) { rec.loc_approx = true; rec.loc_basis = locBasis; } }
  if (rentLo || rentHi) { rec.rent_eur_m2_min = rentLo; rec.rent_eur_m2_max = rentHi; rec.rent_eur_m2_mo = Math.round(((rentLo || rentHi) + (rentHi || rentLo)) / 2 * 10) / 10; } // lease €/m²·mo
  if (price) { rec.price_eur = price; if (area) rec.eur_per_m2 = Math.round(price / area); }
  // richer optional capture fields (xlsx hotel/gastro rows): Pacht, Nebenkosten, Ablöse, beds
  let lease = num(r.lease_eur_mo);
  // ohne-makler keeps the raw monthly rent in notes ("rent ~1.500 EUR/mo") — surface it as the monthly lease
  if (!lease) { const lm = notesRaw.match(/rent\s*~?\s*([\d.,]+)\s*EUR\/mo/i); if (lm) { const v = num(lm[1]); if (v && v >= 100 && v < 200000) lease = v; } }
  if (lease) { rec.lease_eur_mo = lease; rec.lease_eur_yr = lease * 12; }
  const nk = num(r.nk_eur_mo); if (nk) rec.nk_eur_mo = nk;
  const ab = num(r.abloese_eur); if (ab != null) rec.abloese_eur = ab;
  const beds = num(r.beds); if (beds) rec.beds = beds;
  // JLL: derive the per-property page from the verified listing code (e.g. jll-D0449 → /bueros/d0449), never the city search URL
  if (/jll/i.test(rec.source) && JLL_PATH[rec.asset_type]) {
    const code = (r.listing_id || '').replace(/^jll-/i, '').trim();
    if (/^[A-Za-z]\d{3,4}$/.test(code)) {
      const per = 'https://gewerbeimmobilien.jll.de/' + JLL_PATH[rec.asset_type] + '/' + code.toLowerCase();
      if (rec.source_url && /\/search\?/.test(rec.source_url)) rec.source_search_url = rec.source_url; // keep capture provenance
      rec.source_url = per;
    }
  }
  // price_defined: does the lister state ANY price/rent figure? (NK/service charge does NOT count.)
  // Drives the "Price on request" filter — false = negotiable/opportunity assets ("Preis auf Anfrage").
  rec.price_defined = !!(rec.price_eur || rec.rent_eur_m2_mo || rec.lease_eur_mo || /price stated on listing/i.test(notesRaw));
  return rec;
}

let records = [];
const ingest = (path, defSrc) => { if (!existsSync(path)) return; const rows = parseCSV(readFileSync(path, 'utf8')); const hdr = rows[0].map(h => h.trim()); for (const row of rows.slice(1)) { if (!row.length || row.every(c => !c.trim())) continue; const o = {}; hdr.forEach((h, i) => o[h] = row[i]); records.push(normalize(o, (o.source || defSrc || 'broker'))); } };
ingest(join(ROOT, 'data', 'broker_listings_all.csv'), 'broker');
ingest(join(ROOT, 'data', 'capture_template.csv'), 'capture'); // optional CSV export (legacy path)

// Arrivio_Capture_Template.xlsx "Capture" sheet — read the .xlsx DIRECTLY every build (no manual export).
// Its columns (source, source_url, name, kind, deal, price_basis, plz, city, street, area_m2, rooms, beds,
// price_eur, lease_eur_mo, nk_eur_mo, abloese_eur, …) are mapped to the importer schema. New fills flow in on reassemble.
const xlRows = readXlsxRows(join(ROOT, 'Arrivio_Capture_Template.xlsx'), 'Capture');
if (xlRows.length > 1) {
  const hdr = xlRows[0].map(h => String(h || '').trim()); let added = 0;
  for (const row of xlRows.slice(1)) {
    if (!row || row.every(c => !String(c || '').trim())) continue;
    const o = {}; hdr.forEach((h, i) => o[h] = row[i]);
    if (!String(o.source_url || o.name || o.city || '').trim()) continue;     // skip blank/instruction rows
    records.push(normalize({
      asset_type: o.kind, deal: o.deal, source: o.source || 'capture', source_url: o.source_url, listing_id: '',
      name: o.name, district: o.street, plz: o.plz, city: o.city, state: '',
      price_eur: o.price_eur, area_max_m2: o.area_m2, rooms: o.rooms, beds: o.beds,
      lease_eur_mo: o.lease_eur_mo, nk_eur_mo: o.nk_eur_mo, abloese_eur: o.abloese_eur,
      captured: '', notes: o.notes,
    }, (o.source || 'capture')));
    added++;
  }
  console.log('xlsx Capture rows ingested:', added);
} else console.log('xlsx Capture: header only (0 data rows) — reader wired for future fills');

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
