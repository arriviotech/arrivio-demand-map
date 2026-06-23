// Crawls REAL acquisition/lease listings across Germany and writes data/properties.json
// + data/listing_grid.json (clipped pin-density). RESUMABLE: each fetched feed page and the
// PLZ geocode table are cached under build/listings_cache/; re-running skips cached pages.
//   node build/fetch_listings.mjs            -> crawl (cached pages skipped), normalize, write
//   node build/fetch_listings.mjs combine    -> just rebuild outputs from cached pages
//
// Sources: ahgzimmo.de Atom feed (hotel/gastro lease + sale, PRIORITY for lease) ; Tranio
// (commercial sale, best-effort — may be blocked) ; seed rows in data/properties.json are
// preserved and merged. Cost model (LISTED always wins; value x yield is an upper bound only):
//   est purchase = rooms x EUR/key(segment) x regional multiplier ; est lease = purchase x 5.8%.
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const B = dirname(fileURLToPath(import.meta.url));
const ROOT = join(B, '..');
const CACHE = join(B, 'listings_cache');
if (!existsSync(CACHE)) mkdirSync(CACHE);
const COMBINE_ONLY = process.argv[2] === 'combine';
const UA = 'ArrivioSiteSelection/1.0 (site research; ayush@arrivio.global)';
const BROWSER_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const CAPTURED = '2026-06-22';

// ---------- small utils ----------
const decode = s => (s || '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n)).replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16))).trim();
const pick = (xml, tag) => { const m = xml.match(new RegExp('<(?:[\\w]+:)?' + tag + '\\b[^>]*>([\\s\\S]*?)</(?:[\\w]+:)?' + tag + '>', 'i')); return m ? decode(m[1]) : null; };
// the feed mixes formats: cm:price uses '.' as a DECIMAL ("5776.2" = 5776.20), cm:area uses German
// ("770,16" = 770.16, "1.400" = 1400). Detect per value: comma → German; lone dot with 3 trailing
// digits (or multiple dots) → thousands grouping; otherwise the dot is a decimal. Fixes the ×10/×100 bug.
const intOf = s => {
  if (s == null) return null;
  let t = String(s).trim().replace(/[^\d.,-]/g, ''); if (!t) return null;
  if (t.includes(',')) { t = t.replace(/\./g, '').replace(',', '.'); }
  else if (t.includes('.')) { const p = t.split('.'); if (p.length > 2 || p[p.length - 1].length === 3) t = p.join(''); }
  const n = parseFloat(t); return Number.isFinite(n) ? Math.round(n) : null;
};
const round = (n, d = 0) => { const f = 10 ** d; return Math.round(n * f) / f; };

async function get(url, headers, asText = true) {
  const ctrl = new AbortController(); const to = setTimeout(() => ctrl.abort(), 25000);
  try { const r = await fetch(url, { headers, signal: ctrl.signal }); const body = asText ? await r.text() : null; return { ok: r.ok, status: r.status, body }; }
  catch (e) { return { ok: false, status: 0, body: null, err: String(e).slice(0, 60) }; }
  finally { clearTimeout(to); }
}

// ---------- geocoding: PLZ centroid table (+ city/state fallback) ----------
const STATE_CENTROID = { 'Schleswig-Holstein': [54.2, 9.7], 'Hamburg': [53.55, 10.0], 'Niedersachsen': [52.8, 9.1], 'Bremen': [53.08, 8.8], 'Nordrhein-Westfalen': [51.45, 7.4], 'Hessen': [50.6, 9.0], 'Rheinland-Pfalz': [49.9, 7.5], 'Baden-Württemberg': [48.6, 9.0], 'Bayern': [48.8, 11.4], 'Saarland': [49.4, 7.0], 'Berlin': [52.52, 13.4], 'Brandenburg': [52.4, 13.0], 'Mecklenburg-Vorpommern': [53.8, 12.5], 'Sachsen': [51.1, 13.4], 'Sachsen-Anhalt': [52.0, 11.7], 'Thüringen': [50.9, 11.0] };
const CITY_LL = { 'münchen': [48.137, 11.575], munich: [48.137, 11.575], berlin: [52.52, 13.405], hamburg: [53.551, 9.993], 'köln': [50.937, 6.96], cologne: [50.937, 6.96], frankfurt: [50.11, 8.682], stuttgart: [48.776, 9.182], 'düsseldorf': [51.227, 6.773], dusseldorf: [51.227, 6.773], leipzig: [51.34, 12.375], dortmund: [51.514, 7.466], essen: [51.456, 7.012], bremen: [53.079, 8.802], dresden: [51.05, 13.737], hannover: [52.376, 9.732], nürnberg: [49.452, 11.077], nuremberg: [49.452, 11.077], duisburg: [51.435, 6.762], bochum: [51.482, 7.216], wuppertal: [51.256, 7.15], bonn: [50.737, 7.098], münster: [51.96, 7.626], mannheim: [49.488, 8.466], karlsruhe: [49.007, 8.404], kassel: [51.312, 9.48], ingolstadt: [48.766, 11.426] };

let PLZ = new Map();
async function buildPlzIndex() {
  const f = join(CACHE, 'plz_geocoord.csv');
  let txt = existsSync(f) ? readFileSync(f, 'utf8') : null;
  if (!txt) {
    const url = 'https://raw.githubusercontent.com/WZBSocialScienceCenter/plz_geocoord/master/plz_geocoord.csv';
    process.stdout.write('fetching PLZ geocode table...\n');
    const r = await get(url, { 'User-Agent': UA });
    if (r.ok && r.body && r.body.length > 1000) { txt = r.body; writeFileSync(f, txt); process.stdout.write('  cached ' + (txt.length / 1024 | 0) + ' KB\n'); }
    else { process.stdout.write('  PLZ table fetch failed (' + r.status + ') — falling back to city/state centroids\n'); return; }
  }
  for (const line of txt.split(/\r?\n/).slice(1)) {
    const c = line.split(','); if (c.length < 3) continue;
    const plz = c[0].trim().padStart(5, '0'), lat = parseFloat(c[1]), lng = parseFloat(c[2]);
    if (/^\d{5}$/.test(plz) && Number.isFinite(lat) && Number.isFinite(lng)) PLZ.set(plz, [round(lat, 4), round(lng, 4)]);
  }
  process.stdout.write('  PLZ centroids loaded: ' + PLZ.size + '\n');
}
function geocode(plz, city, state) {
  if (plz) { const p = String(plz).padStart(5, '0'); if (PLZ.has(p)) return { ll: PLZ.get(p), prec: 'plz' };
    // nearest by 4- then 3-digit prefix
    for (const len of [4, 3]) { const pre = p.slice(0, len); const hits = [...PLZ.entries()].filter(([k]) => k.startsWith(pre)); if (hits.length) { const a = hits.reduce((s, [, v]) => [s[0] + v[0], s[1] + v[1]], [0, 0]); return { ll: [round(a[0] / hits.length, 4), round(a[1] / hits.length, 4)], prec: 'plz' + len }; } } }
  if (city) { const k = city.toLowerCase().trim(); if (CITY_LL[k]) return { ll: CITY_LL[k], prec: 'city' }; }
  if (state && STATE_CENTROID[state]) return { ll: STATE_CENTROID[state], prec: 'state' };
  return { ll: null, prec: 'none' };
}

// ---------- state by point-in-polygon (de_states.geojson) ----------
let STATES = [];
function loadStates() {
  try {
    const gj = JSON.parse(readFileSync(join(B, 'de_states.geojson'), 'utf8'));
    for (const f of gj.features) {
      const name = f.properties.name || f.properties.NAME_1 || f.properties.GEN || f.properties.gen || f.properties.id;
      const polys = f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates;
      STATES.push({ name, polys });
    }
  } catch (e) { process.stdout.write('de_states.geojson not loaded: ' + e + '\n'); }
}
const inRing = (lat, lng, ring) => { let c = false; for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) { const xi = ring[i][0], yi = ring[i][1], xj = ring[j][0], yj = ring[j][1]; if (((yi > lat) !== (yj > lat)) && (lng < (xj - xi) * (lat - yi) / (yj - yi) + xi)) c = !c; } return c; };
function stateAt(lat, lng) {
  for (const s of STATES) for (const poly of s.polys) { if (inRing(lat, lng, poly[0])) { let hole = false; for (let h = 1; h < poly.length; h++) if (inRing(lat, lng, poly[h])) hole = true; if (!hole) return s.name; } }
  return null;
}

// ---------- classification + cost model ----------
function classifyKind(text) {
  const t = (text || '').toLowerCase();
  if (/\bhotel|pension|gästehaus|gaestehaus|herberge|boardinghouse|boarding house|aparthotel|hostel|tagungshaus|kurhaus/.test(t)) return 'hotel';
  if (/restaurant|gastronomie|gaststätte|gaststaette|café|cafe|bistro|imbiss|kneipe|landgasthof|erlebnisgastr|eventlocation|brauerei|biergarten/.test(t)) return 'gastronomie';
  if (/\bgasthof|gasthaus|gästezimmer|gaestezimmer/.test(t)) return 'gastronomie';
  return 'mixed_use';
}
const A_CITIES = /münchen|munich|frankfurt|berlin|hamburg|düsseldorf|dusseldorf|köln|cologne|stuttgart/;
const EURKEY = { budget: [40000, 80000], midscale: [80000, 140000], uppermid: [150000, 300000], prime: [300000, 2000000] };
function segmentOf(text) { const t = (text || '').toLowerCase(); if (/5\s*\*|5[\s-]*sterne|luxus|trophy|mandarin|kempinski/.test(t)) return 'prime'; if (/4\s*\*|4[\s-]*sterne|first class/.test(t)) return 'uppermid'; if (/garni|pension|hostel|budget|economy|einfach/.test(t)) return 'budget'; return 'midscale'; }
function regionMult(city, state) { const t = ((city || '') + ' ' + (state || '')).toLowerCase(); if (A_CITIES.test(t)) return 1.5; return 1.0; }
function modelHotel(rooms, text, city, state) {
  if (!rooms) return { purchase: null, leaseYr: null };
  const [lo, hi] = EURKEY[segmentOf(text)]; const mid = (lo + hi) / 2;
  const purchase = Math.round(rooms * mid * regionMult(city, state) / 1000) * 1000;
  return { purchase, leaseYr: Math.round(purchase * 0.058 / 1000) * 1000 }; // 5.8% = upper-bound proxy
}
// sentinel guards: ahgzimmo encodes "Preis auf Anfrage" as 99999999 / 9999999 / 0 etc.
const realPrice = v => (v && v >= 5000 && v < 50000000 && !/^9+$/.test(String(v))) ? v : null;
const realLease = v => (v && v >= 200 && v <= 150000 && !/^9+$/.test(String(v))) ? v : null; // monthly Pacht; >150k/mo = annual/sale figure mislabeled in feed
const cleanArea = (a, kind) => { if (!a || a < 10 || a > 500000) return null; if (kind !== 'hotel' && a > 20000) return null; return a; }; // huge non-hotel area = plot/erroneous

// ---- Pacht (lease) model + ahgzimmo detail-page parse (precise coords, Nebenkosten, Ablöse) ----
const PACHT = (() => { try { return JSON.parse(readFileSync(join(ROOT, 'data', 'pacht_model.json'), 'utf8')); } catch (e) { return null; } })();
const _metroSet = new Set(((PACHT && PACHT.tier_assignment.metro) || []).map(s => s.toLowerCase()));
const _bcitySet = new Set(((PACHT && PACHT.tier_assignment.b_city) || []).map(s => s.toLowerCase()));
const tierOf = city => { if (!city) return 'rural'; const c = city.toLowerCase(); if (_metroSet.has(c)) return 'metro'; if (_bcitySet.has(c)) return 'b_city'; return 'rural'; };
function parseDetail(html) {
  const g = re => { const m = html && html.match(re); return m ? m[1] : null; };
  const lat = parseFloat(g(/og:latitude["'][^>]*content=["']([-\d.]+)/i) || g(/"lat(?:itude)?"\s*:\s*"?([-\d.]+)/i));
  const lng = parseFloat(g(/og:longitude["'][^>]*content=["']([-\d.]+)/i) || g(/"l(?:ng|on|ongitude)"\s*:\s*"?([-\d.]+)/i));
  let nk = null; { const m = html && html.match(/Nebenkosten[\s\S]{0,60}?([\d.]{2,})\s*(?:€|EUR)/i); if (m) nk = intOf(m[1]); }
  let abloese; { const m = html && html.match(/Abl[öo]se[\s\S]{0,60}?(keine|[\d.]{2,}\s*(?:€|EUR))/i); if (m) abloese = /keine/i.test(m[1]) ? 0 : intOf(m[1]); }
  return { lat: Number.isFinite(lat) ? round(lat, 5) : null, lng: Number.isFinite(lng) ? round(lng, 5) : null, nk: (nk && nk >= 200 && nk < 100000) ? nk : null, abloese };
}
async function fetchDetail(url, id) { const cf = join(CACHE, 'detail_' + id + '.html'); if (existsSync(cf) || COMBINE_ONLY) return; const r = await get(url, { 'User-Agent': UA }); if (r.ok && r.body) { writeFileSync(cf, r.body); await sleep(700); } }
const readDetail = id => { const cf = join(CACHE, 'detail_' + id + '.html'); return existsSync(cf) ? parseDetail(readFileSync(cf, 'utf8')) : null; };

// ---------- ahgzimmo Atom crawl ----------
function ahgzId(url) { const m = (url || '').match(/-([A-Z0-9]{5,8})\/?$/); return m ? 'ahgz-' + m[1] : 'ahgz-' + Math.abs([...(url || '')].reduce((a, c) => (a * 31 + c.charCodeAt(0)) | 0, 7)).toString(36); }
function parseAhgzEntry(xml) {
  const url = (xml.match(/<link[^>]+href=["']([^"']+)["']/i) || [])[1] || '';
  const title = pick(xml, 'title') || 'Listing';
  const plz = (pick(xml, 'postalCode') || '').replace(/\D/g, '') || null;
  const city = pick(xml, 'locality');
  const area = intOf(pick(xml, 'area'));
  let rooms = intOf(pick(xml, 'rooms'));
  const priceRaw = intOf(pick(xml, 'price'));
  const mk = (pick(xml, 'marketingType') || '').toLowerCase();
  const blob = title + ' ' + (pick(xml, 'summary') || pick(xml, 'content') || '');
  if (!rooms) { const m = blob.match(/(\d{1,3})\s*(zimmer|gästezimmer|gaestezimmer|hotelzimmer)/i); if (m) rooms = +m[1]; }
  let beds = null; { const m = blob.match(/(\d{2,3})\s*betten/i); if (m) beds = +m[1]; }
  const deal = /sale|kauf|buy|verkauf/.test(mk) ? 'sale' : 'lease';
  return { url: url.split('?')[0], title, plz, city, area, rooms, beds, priceRaw, deal };
}
async function crawlAhgz(label, startUrl) {
  const entries = []; let url = startUrl, page = 0;
  while (url && page < 40) {
    page++;
    const cf = join(CACHE, 'ahgz_' + label + '_p' + page + '.xml');
    let xml = existsSync(cf) ? readFileSync(cf, 'utf8') : null;
    if (xml == null) {
      if (COMBINE_ONLY) break;
      const r = await get(url, { 'User-Agent': UA, Accept: 'application/atom+xml,application/xml' });
      if (!r.ok || !r.body) { process.stdout.write('  ahgz ' + label + ' p' + page + ' HTTP ' + r.status + (r.err ? ' ' + r.err : '') + '\n'); break; }
      xml = r.body; writeFileSync(cf, xml); await sleep(1200);
    }
    const es = xml.match(/<entry\b[\s\S]*?<\/entry>/gi) || [];
    if (page === 1) { const tot = (xml.match(/<(?:[\w]+:)?totalResults>(\d+)/i) || [])[1]; process.stdout.write('  ahgz ' + label + ': totalResults=' + (tot || '?') + '\n'); }
    for (const e of es) entries.push(parseAhgzEntry(e));
    if (!es.length) break;
    const next = (xml.match(/<link[^>]+rel=["']next["'][^>]+href=["']([^"']+)["']/i) || xml.match(/<link[^>]+href=["']([^"']+)["'][^>]+rel=["']next["']/i) || [])[1];
    url = next ? decode(next) : (startUrl + (startUrl.includes('?') ? '&' : '?') + 'page=' + (page + 1));
    if (!next && es.length < 10) break; // no next link and a short page -> assume end
  }
  process.stdout.write('  ahgz ' + label + ': ' + entries.length + ' entries over ' + page + ' page(s)\n');
  return entries;
}

// ---------- Tranio (best-effort; may be blocked) ----------
async function crawlTranio() {
  const cf = join(CACHE, 'tranio_germany.html');
  let html = existsSync(cf) ? readFileSync(cf, 'utf8') : null;
  if (html == null && !COMBINE_ONLY) {
    const r = await get('https://tranio.com/commercial/germany/', { 'User-Agent': BROWSER_UA, 'Accept-Language': 'en-US,en;q=0.9' });
    if (r.ok && r.body) { html = r.body; writeFileSync(cf, html); }
    else { process.stdout.write('  Tranio blocked (HTTP ' + r.status + ') — using seed Tranio rows only\n'); return []; }
  }
  if (!html) return [];
  const out = [];
  for (const m of html.matchAll(/"@type"\s*:\s*"(?:Product|Offer|RealEstateListing)"[\s\S]*?\{[\s\S]*?\}/g)) { /* JSON-LD path if present */ }
  // Tranio embeds listings as cards; extract id+price+area+url heuristically.
  for (const m of html.matchAll(/\/commercial\/germany\/adt\/([a-z0-9-]+?-(\d+))\//g)) {
    out.push({ id: 'tranio-' + m[2], url: 'https://tranio.com' + m[0] });
  }
  process.stdout.write('  Tranio: parsed ' + out.length + ' listing link(s) from HTML\n');
  return []; // detail parse not reliable headless; rely on seed. Links kept for future.
}

// ---------- normalize ----------
function normalizeAhgz(e) {
  const ll0 = e.plz || e.city ? geocode(e.plz, e.city, null) : { ll: null, prec: 'none' };
  let state = ll0.ll ? stateAt(ll0.ll[0], ll0.ll[1]) : null;
  const ll = ll0.ll || (state ? geocode(null, null, state).ll : null);
  const kind = classifyKind(e.title);
  const area = cleanArea(e.area, kind);
  const rec = { id: ahgzId(e.url), kind, deal: e.deal, name: e.title, plz: e.plz || null, city: e.city || null, state: state || null, area_m2: area, rooms: e.rooms || null, beds: e.beds || null, source: 'ahgzimmo.de', source_url: e.url, captured: CAPTURED };
  if (ll) { rec.lat = ll[0]; rec.lng = ll[1]; }
  const det = readDetail(rec.id); // ahgzimmo detail page → precise coords + Nebenkosten + Ablöse
  if (det) { if (det.lat != null && det.lng != null) { rec.lat = det.lat; rec.lng = det.lng; } if (det.nk != null) rec.nk_eur_mo = det.nk; if (det.abloese !== undefined) rec.abloese_eur = det.abloese; }
  const lm = realLease(e.priceRaw), pe = realPrice(e.priceRaw);
  if (e.deal === 'lease' && lm) { rec.lease_eur_mo = lm; rec.lease_eur_yr = lm * 12; rec.price_basis = 'LISTED'; }
  else if (e.deal !== 'lease' && pe) {
    rec.price_eur = pe; const ppm = area ? Math.round(pe / area) : null;
    if (ppm && ppm >= 200 && ppm <= 25000) rec.eur_per_m2 = ppm; // only a credible building €/m²
    rec.price_basis = 'LISTED';
  } else if (kind === 'hotel' && rec.rooms) {                  // hotels only: €/key model when no listed figure (plan §3A)
    const m = modelHotel(rec.rooms, e.title, e.city, state);
    if (m.purchase) { rec.price_eur = m.purchase; rec.lease_eur_yr = m.leaseYr; rec.price_basis = 'MODELED'; }
    else rec.price_basis = 'price_on_request';
  } else rec.price_basis = 'price_on_request';
  return rec;
}

// ---------- main ----------
loadStates();
await buildPlzIndex();
process.stdout.write('crawling ahgzimmo...\n');
const ahgzLease = await crawlAhgz('lease', 'https://www.ahgzimmo.de/suche.atom?t=hospitality:rental:commercial&l=Deutschland&a=de.deutschland');
let ahgzSale = await crawlAhgz('sale', 'https://www.ahgzimmo.de/suche.atom?t=hospitality:purchase:commercial&l=Deutschland&a=de.deutschland');
if (!ahgzSale.length) ahgzSale = await crawlAhgz('sale2', 'https://www.ahgzimmo.de/suche.atom?t=hospitality:sale:commercial&l=Deutschland&a=de.deutschland');
await crawlTranio();

// detail pages for LEASE listings → precise coords + Nebenkosten + Ablöse (resumable/cached)
const leaseEntries = [...ahgzLease, ...ahgzSale].filter(e => e.deal === 'lease');
if (!COMBINE_ONLY) { process.stdout.write('fetching ' + leaseEntries.length + ' lease detail pages (coords/NK/Ablöse)...\n'); let i = 0; for (const e of leaseEntries) { i++; await fetchDetail(e.url, ahgzId(e.url)); if (i % 50 === 0) process.stdout.write('  detail ' + i + '/' + leaseEntries.length + '\n'); } }

const crawled = [...ahgzLease, ...ahgzSale].map(normalizeAhgz);

// ---------- merge with seed (seed's hand-curated fields win) ----------
const seedDoc = JSON.parse(readFileSync(join(B, 'seed_properties.json'), 'utf8'));
const seed = seedDoc.properties || [];
const byId = new Map();
for (const r of crawled) byId.set(r.id, r);
for (const s of seed) {
  if (byId.has(s.id)) { const c = byId.get(s.id); for (const k of Object.keys(s)) if (s[k] != null && s[k] !== '') c[k] = s[k]; } // seed overrides (precise lat/lng, NK, etc.)
  else byId.set(s.id, s);
}
let records = [...byId.values()];

// cross-source dedupe: same city + area within 5% + price within 10%
const priceOf = r => r.price_eur || r.lease_eur_yr || 0;
records = records.filter((r, i) => !records.some((o, j) => j < i && o.city && r.city && o.city.toLowerCase() === r.city.toLowerCase() && o.area_m2 && r.area_m2 && Math.abs(o.area_m2 - r.area_m2) / r.area_m2 < 0.05 && priceOf(o) && priceOf(r) && Math.abs(priceOf(o) - priceOf(r)) / priceOf(r) < 0.1));

// ---------- P1: drop pure gastronomy with no rooms-to-stay (not housing-relevant) ----------
const _n1 = records.length;
records = records.filter(r => !(r.kind === 'gastronomie' && !r.rooms && !r.beds));
process.stdout.write('dropped pure gastronomy (no rooms/beds): -' + (_n1 - records.length) + '\n');

// ---------- clipped pin-density grid (0.02 deg cells) ----------
const gk = (la, ln) => Math.round(la / 0.02) + '_' + Math.round(ln / 0.02);
const gll = k => { const [a, b] = k.split('_'); return [round(a * 0.02, 4), round(b * 0.02, 4)]; };
const dens = new Map();
for (const r of records) if (r.lat != null && r.lng != null) dens.set(gk(r.lat, r.lng), (dens.get(gk(r.lat, r.lng)) || 0) + 1);
const grid = [...dens.entries()].map(([k, w]) => { const [la, ln] = gll(k); return [la, ln, w]; });

// ---------- write ----------
const placed = records.filter(r => r.lat != null && r.lng != null).length;
const doc = {
  _meta: { ...seedDoc._meta, title: 'Arrivio acquisition/lease targets — national dataset', note: 'Crawled ' + CAPTURED + ' from ahgzimmo.de (hotel/gastro lease+sale) + Tranio seed. MODELED records carry the estimate in price_eur / lease_eur_yr with price_basis=MODELED (cost model: rooms x EUR/key x regional mult; lease = purchase x 5.8% upper bound). Geocoded by PLZ centroid; state by point-in-polygon.', count: records.length, placed, sources: ['ahgzimmo.de', 'Tranio', 'OpenStreetMap (baseline, separate)'] },
  properties: records.sort((a, b) => (priceOf(b) - priceOf(a)))
};
if (doc._meta.schema && !doc._meta.schema.includes('abloese_eur')) doc._meta.schema = [...doc._meta.schema, 'abloese_eur'];
writeFileSync(join(ROOT, 'data', 'properties.json'), JSON.stringify(doc, null, 1));
writeFileSync(join(ROOT, 'data', 'listing_grid.json'), JSON.stringify(grid));

// re-anchor the Pacht model to reality: observed median €/room & €/m² per tier from LISTED hotel leases
if (PACHT) {
  const med = a => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y); return Math.round(s[s.length >> 1] * 100) / 100; };
  const rm = { metro: [], b_city: [], rural: [] }, sq = { metro: [], b_city: [], rural: [] };
  for (const r of records) { if (r.deal !== 'lease' || !r.lease_eur_mo || r.kind !== 'hotel') continue; const t = tierOf(r.city); if (r.rooms) rm[t].push(r.lease_eur_mo / r.rooms); if (r.area_m2) sq[t].push(r.lease_eur_mo / r.area_m2); }
  PACHT.observed = { date: CAPTURED, note: 'Median observed €/room/mo & €/m²/mo from LISTED ahgzimmo HOTEL leases (regional folded into rural server-side). LISTED always overrides the model.', eur_per_room_mo: {}, eur_per_m2_mo: {} };
  for (const t of ['metro', 'b_city', 'rural']) { PACHT.observed.eur_per_room_mo[t] = { median: med(rm[t]), n: rm[t].length }; PACHT.observed.eur_per_m2_mo[t] = { median: med(sq[t]), n: sq[t].length }; }
  writeFileSync(join(ROOT, 'data', 'pacht_model.json'), JSON.stringify(PACHT, null, 2));
  process.stdout.write('re-anchored pacht_model.json: median €/room metro/b_city/rural = ' + JSON.stringify(['metro', 'b_city', 'rural'].map(t => med(rm[t]))) + '\n');
}

// ---------- report ----------
const by = (arr, f) => arr.reduce((m, r) => { const k = f(r) || '—'; m[k] = (m[k] || 0) + 1; return m; }, {});
process.stdout.write('\n=== properties.json: ' + records.length + ' records (' + placed + ' geocoded), grid cells ' + grid.length + ' ===\n');
process.stdout.write('by source: ' + JSON.stringify(by(records, r => r.source)) + '\n');
process.stdout.write('by deal:   ' + JSON.stringify(by(records, r => r.deal)) + '\n');
process.stdout.write('by kind:   ' + JSON.stringify(by(records, r => r.kind)) + '\n');
process.stdout.write('by basis:  ' + JSON.stringify(by(records, r => r.price_basis)) + '\n');
process.stdout.write('by state:  ' + JSON.stringify(by(records.filter(r => r.state), r => r.state)) + '\n');
