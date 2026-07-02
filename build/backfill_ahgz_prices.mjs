// Back-fills REAL ahgzimmo prices into data/broker_listings_all.csv.
// Why: the authorized-browser capture recorded "price stated on listing" but not the number.
// The ahgzimmo Atom feed (plain fetch, already used by fetch_listings.mjs) carries cm:price per
// listing — join by the listing CODE (…-CODE in the URL / ahgz-CODE in listing_id).
//   node build/backfill_ahgz_prices.mjs            → refresh feed (cached, throttled) + update CSV
//   node build/backfill_ahgz_prices.mjs cached     → no network, use cached feed pages only
// Idempotent: rows that already carry a price figure are never touched. Sentinel prices
// (9999999/0 = "auf Anfrage") are never written. Sale → price_eur; lease → "; rent ~N EUR/mo"
// appended to notes (the importer parses exactly that pattern into lease_eur_mo).
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const B = dirname(fileURLToPath(import.meta.url));
const ROOT = join(B, '..');
const CACHE = join(B, 'listings_cache');
const CSV = join(ROOT, 'data', 'broker_listings_all.csv');
const UA = 'ArrivioSiteSelection/1.0 (site research; ayush@arrivio.global)';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const CACHED_ONLY = process.argv[2] === 'cached';

async function get(url) {
  const ctrl = new AbortController(); const to = setTimeout(() => ctrl.abort(), 25000);
  try { const r = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/atom+xml,application/xml' }, signal: ctrl.signal }); return { ok: r.ok, status: r.status, body: await r.text() }; }
  catch (e) { return { ok: false, status: 0, body: null }; }
  finally { clearTimeout(to); }
}

// ---- collect feed entries: cached pages + (optionally) a fresh refresh pass ----
const feed = {}; // code → { price, mk }
function harvest(xml) {
  for (const em of xml.match(/<entry\b[\s\S]*?<\/entry>/gi) || []) {
    const url = (em.match(/<link[^>]+href=["']([^"']+)["']/i) || [])[1] || '';
    const code = (url.match(/-([A-Z0-9]{5,8})\/?(?:\?|$)/) || [])[1];
    if (!code) continue;
    const price = ((em.match(/<(?:[\w]+:)?price\b[^>]*>([\s\S]*?)<\/(?:[\w]+:)?price>/i) || [])[1] || '').trim();
    const mk = ((em.match(/<(?:[\w]+:)?marketingType\b[^>]*>([\s\S]*?)<\/(?:[\w]+:)?marketingType>/i) || [])[1] || '').toLowerCase();
    feed[code] = { price, mk };                                     // later pages/fresher passes overwrite
  }
}
import { readdirSync } from 'node:fs';
for (const f of readdirSync(CACHE).filter(f => /^ahgz_(lease|sale2?|refresh_\w+)_p\d+\.xml$/.test(f))) harvest(readFileSync(join(CACHE, f), 'utf8'));

if (!CACHED_ONLY) {
  const FEEDS = [['lease', 'https://www.ahgzimmo.de/suche.atom?t=hospitality:rental:commercial&l=Deutschland&a=de.deutschland'], ['sale', 'https://www.ahgzimmo.de/suche.atom?t=hospitality:sale:commercial&l=Deutschland&a=de.deutschland']];
  for (const [label, start] of FEEDS) {
    let url = start, page = 0;
    while (url && page < 40) {
      page++;
      const cf = join(CACHE, 'ahgz_refresh_' + label + '_p' + page + '.xml');
      let xml = existsSync(cf) ? readFileSync(cf, 'utf8') : null;
      if (xml == null) {
        const r = await get(url);
        if (!r.ok || !r.body) { process.stdout.write('  refresh ' + label + ' p' + page + ' HTTP ' + r.status + ' — stop\n'); break; }
        xml = r.body; writeFileSync(cf, xml); await sleep(1200);
      }
      harvest(xml);
      const es = (xml.match(/<entry\b/gi) || []).length;
      const next = (xml.match(/<link[^>]+rel=["']next["'][^>]+href=["']([^"']+)["']/i) || xml.match(/<link[^>]+href=["']([^"']+)["'][^>]+rel=["']next["']/i) || [])[1];
      url = next ? next.replace(/&amp;/g, '&') : null;
      if (!es) break;
    }
    process.stdout.write('  refreshed feed ' + label + '\n');
  }
}
process.stdout.write('feed codes known: ' + Object.keys(feed).length + '\n');

// ---- CSV in/out (same quoting rules as the rest of the pipeline) ----
function parseCSV(t) { const R = []; let r = [], c = '', q = false; for (let i = 0; i < t.length; i++) { const ch = t[i]; if (q) { if (ch === '"') { if (t[i + 1] === '"') { c += '"'; i++; } else q = false; } else c += ch; } else if (ch === '"') q = true; else if (ch === ',') { r.push(c); c = ''; } else if (ch === '\n') { r.push(c); R.push(r); r = []; c = ''; } else if (ch !== '\r') c += ch; } if (c.length || r.length) { r.push(c); R.push(r); } return R; }
const cell = v => /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v;
const rows = parseCSV(readFileSync(CSV, 'utf8').replace(/^﻿/, ''));
const H = rows[0]; const I = {}; H.forEach((k, i) => I[k] = i);

// old crawler's sentinel guards — "Preis auf Anfrage" is encoded as 9999999/0-style values
const realPrice = v => (v && v >= 5000 && v < 50000000 && !/^9+$/.test(String(v))) ? v : null;
const realLease = v => (v && v >= 200 && v <= 150000 && !/^9+$/.test(String(v))) ? v : null;

let saleSet = 0, leaseSet = 0, already = 0, noFeed = 0, onReq = 0;
for (const r of rows.slice(1)) {
  if (!r || r[I.source] !== 'ahgzimmo.de') continue;
  const hasFigure = (r[I.price_eur] || '').trim() || (r[I.rent_eur_m2_min] || '').trim() || (r[I.rent_eur_m2_max] || '').trim() || /rent\s*~?[\d.,]+\s*EUR\/mo/i.test(r[I.notes] || '');
  if (hasFigure) { already++; continue; }
  const code = (r[I.listing_id] || '').replace(/^ahgz-/, '');
  const e = feed[code];
  if (!e) { noFeed++; continue; }
  const n = parseInt(String(e.price).replace(/[^\d]/g, ''), 10) || 0;
  const isSale = (r[I.deal] || '').trim() === 'sale' || /sale|purchase|kauf/.test(e.mk);
  if (isSale) { const v = realPrice(n); if (v) { r[I.price_eur] = String(v); saleSet++; } else onReq++; }
  else { const v = realLease(n); if (v) { r[I.notes] = ((r[I.notes] || '').trim() ? r[I.notes].trim() + '; ' : '') + 'rent ~' + v + ' EUR/mo'; leaseSet++; } else onReq++; }
}
writeFileSync(CSV, '﻿' + rows.map(r => r.map(cell).join(',')).join('\n') + '\n');
process.stdout.write('backfilled → lease rents: ' + leaseSet + ' · sale prices: ' + saleSet + ' · already priced: ' + already + ' · feed says on-request: ' + onReq + ' · not in feed: ' + noFeed + '\n');
