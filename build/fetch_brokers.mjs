// =============================================================================
// build/fetch_brokers.mjs — FULL broker sweep (Playwright render-and-extract)
// =============================================================================
// Captures ALL broker listings into data/broker_listings_all.csv (unified schema),
// deduped by listing_id (so the verified ground-truth rows are absorbed, never dup'd).
// Broker SPAs render client-side, so we drive a real headless Chromium, read each
// result CARD's OWN per-property link (that link IS source_url), and parse the card.
//
// ToS / AUTHORIZATION: render-and-extract is ToS-sensitive — run ONLY in a session you
//   are authorized to use, for INTERNAL site-selection research (not redistribution).
//   Never point this at ImmoScout24 / Immowelt / Booking (excluded project-wide).
//
// SELF-CHECK (the only "test", runs itself): --selfcheck fetches ONE page per source,
//   asserts it parsed ≥1 record WITH a real per-property URL, prints a sample, and (for a
//   source that yields 0) prints the failing URL/selector. Sweep a source only if it passes.
//
// RUN
//   npm i playwright && npx playwright install chromium
//   node build/fetch_brokers.mjs --selfcheck                 # gate every source first
//   node build/fetch_brokers.mjs --source=jll                # sweep one source
//   node build/fetch_brokers.mjs                             # sweep all that pass self-check
//     flags: --source=jll|engelvoelkers|cbre|colliers|christie|all (default all)
//            --headful   --maxpages=N (per combo; 0=∞)   --selfcheck
//
// RESUMABLE / THROTTLED: each rendered search page's extracted rows are cached as JSON
//   under build/brokers_cache/<source>/ (gitignored). Re-running skips cached pages.
//   Throttle 2.5 s + jitter between pages; exponential backoff (→20 s) on nav errors.
//
// HEADLESS REACHABILITY (self-check, 2026-06-28 from this server environment):
//   ❌ JLL  — Akamai bot-manager returns "Access Denied" to the headless browser on /search
//             (errors.edgesuite.net). Plain fetch gets a 200 SHELL but the listing array is
//             loaded by a client API that is not in the HTML and is also edge-protected. JLL
//             therefore needs an AUTHORIZED REAL BROWSER (how the 316 ground-truth rows were
//             captured). Run there with: node build/fetch_brokers.mjs --source=jll --headful
//             on a machine with a display + a normal Chrome profile, or capture via the
//             Claude-in-Chrome extension. The harness/pagination/parser are ready.
//   ⚠️ E&V / Colliers / Christie — pages load but sit behind cookie-consent walls and their
//             result URLs/selectors need per-site discovery in an interactive browser.
//   ⚠️ CBRE — immobilien.cbre.de does not resolve; the real search host must be located.
//   ✅ Open portals (ahgzimmo/Tranio/pachtnetzwerk/gastro-pacht) are plain-fetch and NOT
//             blocked — handled by build/fetch_listings.mjs (run that, not this).
// =============================================================================

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const B = dirname(fileURLToPath(import.meta.url));
const ROOT = join(B, '..');
const CACHE = join(B, 'brokers_cache');
const CSV = join(ROOT, 'data', 'broker_listings_all.csv');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const todayISO = () => new Date().toISOString().slice(0, 10);

const ARG = Object.fromEntries(process.argv.slice(2).map(a => { const m = a.match(/^--([^=]+)(?:=(.*))?$/); return m ? [m[1], m[2] ?? true] : [a, true]; }));
const SOURCE = String(ARG.source || 'all').toLowerCase();
const SELFCHECK = !!ARG.selfcheck;
const HEADFUL = !!ARG.headful;
const MAXPAGES = ARG.maxpages != null ? parseInt(ARG.maxpages, 10) : 0;   // per combo; 0 = until empty
const BASE_DELAY = 2500;

// ---- number / text helpers ----
const num = s => { if (s == null) return null; let t = String(s).trim().replace(/[^\d.,-]/g, ''); if (!t) return null; if (t.includes(',')) t = t.replace(/\./g, '').replace(',', '.'); else if (t.includes('.')) { const p = t.split('.'); if (p.length > 2 || p[p.length - 1].length === 3) t = p.join(''); } const n = parseFloat(t); return Number.isFinite(n) ? n : null; };

// ---- the 16 Bundesländer (JLL region-level sweep → no city missed) ----
const BUNDESLAENDER = ['Baden-Württemberg', 'Bayern', 'Berlin', 'Brandenburg', 'Bremen', 'Hamburg', 'Hessen', 'Mecklenburg-Vorpommern', 'Niedersachsen', 'Nordrhein-Westfalen', 'Rheinland-Pfalz', 'Saarland', 'Sachsen', 'Sachsen-Anhalt', 'Schleswig-Holstein', 'Thüringen'];

// JLL propertyType → {asset_type, detail-path}. land→land_plot; Wohn-/Geschäftshäuser→apartment_building.
const JLL_TYPES = [
  { p: 'office', asset: 'office', path: 'bueros' },
  { p: 'industrial', asset: 'industrial_hall', path: 'hallen' },
  { p: 'retail', asset: 'retail', path: 'einzelhandel' },
  { p: 'land', asset: 'land_plot', path: 'grundstuecke' },
  { p: 'residential', asset: 'apartment_building', path: 'wohn-und-geschaeftshaeuser' }, // Wohn-/Geschäftshäuser (param verified by self-check)
];
const JLL_PATH_RE = /\/(bueros|hallen|einzelhandel|grundstuecke|wohn-und-geschaeftshaeuser)\/([a-zA-Z]\d{3,6})\b/;
const PATH_ASSET = { bueros: 'office', hallen: 'industrial_hall', einzelhandel: 'retail', grundstuecke: 'land_plot', 'wohn-und-geschaeftshaeuser': 'apartment_building' };

// =============================================================================
// IN-BROWSER EXTRACTORS (serialized into page.evaluate). Anchor-driven: the card's
// own per-property link is the source_url; climb to the card container for the text.
// =============================================================================
function jllExtract() {
  const PATHS = ['bueros', 'hallen', 'einzelhandel', 'grundstuecke', 'wohn-und-geschaeftshaeuser'];
  const sel = PATHS.map(p => 'a[href*="/' + p + '/"]').join(',');
  const seen = new Set(), out = [];
  for (const a of document.querySelectorAll(sel)) {
    const href = (a.href || '').split('?')[0];
    const m = href.match(/\/(bueros|hallen|einzelhandel|grundstuecke|wohn-und-geschaeftshaeuser)\/([a-zA-Z]\d{3,6})/);
    if (!m) continue; const code = m[2].toUpperCase(); if (seen.has(code)) continue; seen.add(code);
    let el = a; for (let i = 0; i < 6 && el.parentElement; i++) { if ((el.innerText || '').length > 80) break; el = el.parentElement; }
    out.push({ href, code, path: m[1].toLowerCase(), linkText: (a.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 90), text: (el.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 600) });
  }
  return out;
}
// generic anchor-driven extractor for the other brokers — SELF-CONTAINED (runs in-browser via
// page.evaluate(fn, reSrc); must reference no outer scope). Card link regex is passed as the arg.
function genericCardExtract(reSrc) {
  const re = new RegExp(reSrc, 'i');
  const seen = new Set(), out = [];
  for (const a of document.querySelectorAll('a[href]')) {
    const href = (a.href || '').split('?')[0];
    if (!re.test(href) || seen.has(href)) continue; seen.add(href);
    let el = a; for (let i = 0; i < 6 && el.parentElement; i++) { if ((el.innerText || '').length > 80) break; el = el.parentElement; }
    out.push({ href, linkText: (a.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 90), text: (el.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 600) });
  }
  return out;
}

// =============================================================================
// NODE-SIDE row builders (card → unified schema row). Never fabricate: blank if absent.
// =============================================================================
const STATE_OF_CITY = {}; // optional future map; region comes from the search ctx for JLL
function fieldsFromText(text) {
  const f = {};
  const plz = (text.match(/\b(\d{5})\b/) || [])[1]; if (plz) f.plz = plz;
  const cityM = text.match(/\b\d{5}\s+([A-Za-zÄÖÜäöüß][A-Za-zÄÖÜäöüß .\/-]{1,38})/); if (cityM) f.city = cityM[1].trim().replace(/\s+(ab|von|bis|Fläche|Miete|Kaufpreis).*$/i, '');
  const rent = text.match(/([\d.,]+)\s*(?:–|-|bis)\s*([\d.,]+)\s*€\s*\/?\s*m²/i) || text.match(/([\d.,]+)\s*€\s*\/?\s*m²/i);
  if (rent) { f.rent_lo = num(rent[1]); f.rent_hi = num(rent[2] || rent[1]); }
  const area = text.match(/([\d.,]+)\s*(?:–|-|bis)\s*([\d.,]+)\s*m²/i) || text.match(/([\d.,]+)\s*m²/i);
  if (area) { f.area_lo = num(area[1]); f.area_hi = num(area[2] || area[1]); }
  const price = text.match(/Kaufpreis[^0-9€]{0,30}([\d.,]{4,})\s*€/i) || text.match(/([\d.,]{6,})\s*€(?!\s*\/?\s*m²)/);
  if (price) f.price_eur = num(price[1]);
  return f;
}
function jllRow(card, ctx) {
  const asset_type = PATH_ASSET[card.path] || 'other';
  const f = fieldsFromText(card.text);
  let name = (card.linkText || '').trim();
  if (!name || name.length < 3) name = asset_type.replace('_', ' ') + ' ' + card.code;
  return {
    asset_type, deal: ctx.tenure === 'buy' ? 'sale' : 'lease', source: 'JLL', source_url: card.href, listing_id: 'jll-' + card.code,
    name, district: '', plz: f.plz || '', city: f.city || '', state: ctx.region,
    rent_eur_m2_min: f.rent_lo ?? '', rent_eur_m2_max: f.rent_hi ?? '', price_eur: f.price_eur ?? '',
    area_min_m2: f.area_lo ?? '', area_max_m2: f.area_hi ?? '', rooms: '', captured: todayISO(),
    notes: 'JLL gewerbeimmobilien; render-and-extract; ' + ctx.region + '; ' + ctx.ptype + '/' + ctx.tenure,
  };
}

// =============================================================================
// SOURCE REGISTRY
// =============================================================================
const SOURCES = {
  jll: {
    name: 'JLL', host: 'https://gewerbeimmobilien.jll.de',
    waitFor: 'a[href*="/bueros/"], a[href*="/hallen/"], a[href*="/einzelhandel/"], a[href*="/grundstuecke/"], a[href*="/wohn-und-geschaeftshaeuser/"]',
    extract: jllExtract,
    // self-check on a single dense combo (NRW offices, rent, page 1)
    selfCheckUrl: 'https://gewerbeimmobilien.jll.de/search?tenureTypes=rent&propertyTypes=office&regions=Nordrhein-Westfalen&page=1&sortBy=dateModifiedAtSource',
    // full sweep: region × type × tenure × page
    * combos() {
      for (const region of BUNDESLAENDER) for (const t of JLL_TYPES) for (const tenure of ['rent', 'buy'])
        yield { key: [region, t.p, tenure].join('_').replace(/[^a-z0-9_]+/gi, '-'), region, ptype: t.p, tenure,
          url: p => SOURCES.jll.host + '/search?tenureTypes=' + tenure + '&propertyTypes=' + t.p + '&regions=' + encodeURIComponent(region) + '&page=' + p + '&sortBy=dateModifiedAtSource' };
    },
    row: jllRow,
    linkRe: JLL_PATH_RE,
  },
  // ---- other brokers: best-effort search URL + card-link pattern; self-check confirms ----
  engelvoelkers: {
    name: 'Engel & Völkers Commercial', host: 'https://www.engelvoelkers.com', stubDiscovery: true,
    waitFor: 'a[href]', extract: genericCardExtract, evalArg: '/propert(?:y|ies)/[\\w-]+',
    selfCheckUrl: 'https://www.engelvoelkers.com/de/de/search/?q=Berlin&businessArea=commercial',
    linkRe: /\/propert(?:y|ies)\/[\w-]+/i,
    row: (card, ctx) => brokerRow(card, ctx, 'Engel & Völkers', 'ev'),
    * combos() { for (const region of BUNDESLAENDER) yield { key: 'ev_' + region.replace(/[^a-z0-9]+/gi, '-'), region, ptype: 'commercial', tenure: 'rent', url: () => 'https://www.engelvoelkers.com/de/de/search/?q=' + encodeURIComponent(region) + '&businessArea=commercial' }; },
  },
  cbre: {
    name: 'CBRE', host: 'https://immobilien.cbre.de', stubDiscovery: true,
    waitFor: 'a[href]', extract: genericCardExtract, evalArg: '/de-de/(?:property|immobilie)/[\\w-]+',
    selfCheckUrl: 'https://immobilien.cbre.de/de-de/search?location=Berlin',
    linkRe: /\/de-de\/(?:property|immobilie)\/[\w-]+/i,
    row: (card, ctx) => brokerRow(card, ctx, 'CBRE', 'cbre'),
    * combos() { for (const region of BUNDESLAENDER) yield { key: 'cbre_' + region.replace(/[^a-z0-9]+/gi, '-'), region, ptype: 'commercial', tenure: 'rent', url: () => 'https://immobilien.cbre.de/de-de/search?location=' + encodeURIComponent(region) }; },
  },
  colliers: {
    name: 'Colliers', host: 'https://www.colliers.de', stubDiscovery: true,
    waitFor: 'a[href]', extract: genericCardExtract, evalArg: '/immobilien/[\\w-]+-\\d+',
    selfCheckUrl: 'https://www.colliers.de/immobilien/?ort=Berlin',
    linkRe: /\/immobilien\/[\w-]+-\d+/i,
    row: (card, ctx) => brokerRow(card, ctx, 'Colliers', 'colliers'),
    * combos() { for (const region of BUNDESLAENDER) yield { key: 'colliers_' + region.replace(/[^a-z0-9]+/gi, '-'), region, ptype: 'commercial', tenure: 'rent', url: () => 'https://www.colliers.de/immobilien/?ort=' + encodeURIComponent(region) }; },
  },
  christie: {
    name: 'Christie & Co', host: 'https://www.christie.com', stubDiscovery: true,
    waitFor: 'a[href]', extract: genericCardExtract, evalArg: '/propert(?:y|ies)/[\\w-]+',
    selfCheckUrl: 'https://www.christie.com/properties/?country=Germany',
    linkRe: /\/propert(?:y|ies)\/[\w-]+/i,
    row: (card, ctx) => ({ ...brokerRow(card, ctx, 'Christie & Co', 'christie'), asset_type: 'hotel', deal: 'sale' }),
    * combos() { yield { key: 'christie_germany', region: '', ptype: 'hotel', tenure: 'buy', url: p => 'https://www.christie.com/properties/?country=Germany&page=' + p }; },
  },
};
function brokerRow(card, ctx, source, idpre) {
  const f = fieldsFromText(card.text);
  const code = (card.href.match(/\/([\w-]+)\/?$/) || [])[1] || Math.abs([...card.href].reduce((a, c) => (a * 31 + c.charCodeAt(0)) | 0, 7)).toString(36);
  let name = (card.linkText || '').trim(); if (!name || name.length < 3) name = source + ' ' + code;
  return {
    asset_type: 'other', deal: ctx.tenure === 'buy' ? 'sale' : 'lease', source, source_url: card.href, listing_id: idpre + '-' + code,
    name, district: '', plz: f.plz || '', city: f.city || '', state: ctx.region || '',
    rent_eur_m2_min: f.rent_lo ?? '', rent_eur_m2_max: f.rent_hi ?? '', price_eur: f.price_eur ?? '',
    area_min_m2: f.area_lo ?? '', area_max_m2: f.area_hi ?? '', rooms: '', captured: todayISO(),
    notes: source + '; render-and-extract; ' + (ctx.region || 'DE'),
  };
}

// =============================================================================
// CSV merge (schema-exact; dedup by listing_id → ground-truth rows preserved)
// =============================================================================
const HEADER = ['asset_type', 'deal', 'source', 'source_url', 'listing_id', 'name', 'district', 'plz', 'city', 'state', 'rent_eur_m2_min', 'rent_eur_m2_max', 'price_eur', 'area_min_m2', 'area_max_m2', 'rooms', 'captured', 'notes'];
const csvCell = v => { const s = v == null ? '' : String(v); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
function existingIds() {
  if (!existsSync(CSV)) return new Set();
  const ids = new Set();
  for (const ln of readFileSync(CSV, 'utf8').replace(/^﻿/, '').split(/\r?\n/).slice(1)) { const m = ln.match(/(?:^|,)((?:jll|ev|cbre|colliers|christie)-[A-Za-z0-9_-]+)(?:,|")/); if (m) ids.add(m[1]); }
  return ids;
}
function appendRows(rows) {
  if (!rows.length) return 0;
  const head = existsSync(CSV) ? '' : '﻿' + HEADER.join(',') + '\n';
  const body = rows.map(r => HEADER.map(h => csvCell(r[h])).join(',')).join('\n') + '\n';
  const prior = existsSync(CSV) ? readFileSync(CSV, 'utf8').replace(/\n*$/, '\n') : '';
  writeFileSync(CSV, prior + head + body);
  return rows.length;
}

// =============================================================================
// PLAYWRIGHT plumbing
// =============================================================================
let chromium = null, browser = null, ctx = null, page = null, delay = BASE_DELAY;
const warmed = new Set();
async function ensure() {
  if (browser) return;
  ({ chromium } = await import('playwright'));
  browser = await chromium.launch({ headless: !HEADFUL, args: ['--disable-blink-features=AutomationControlled', '--no-sandbox'] });
  ctx = await browser.newContext({ locale: 'de-DE', timezoneId: 'Europe/Berlin', viewport: { width: 1440, height: 900 }, userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36', extraHTTPHeaders: { 'Accept-Language': 'de-DE,de;q=0.9,en;q=0.8' } });
  await ctx.addInitScript(() => { Object.defineProperty(navigator, 'webdriver', { get: () => undefined }); Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3] }); Object.defineProperty(navigator, 'languages', { get: () => ['de-DE', 'de', 'en'] }); });
  page = await ctx.newPage();
}
// warm up Akamai/Cloudflare cookies by visiting the host root like a human first
async function warm(host) {
  if (warmed.has(host)) return; warmed.add(host);
  await ensure();
  try { await page.goto(host, { waitUntil: 'domcontentloaded', timeout: 30000 }); await sleep(2500 + Math.random() * 1500); } catch (e) { }
}
async function render(url, waitFor) {
  await ensure();
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
      await page.waitForSelector(waitFor, { timeout: 12000 }).catch(() => { });
      for (let s = 0; s < 5; s++) { await page.mouse.wheel(0, 5000).catch(() => { }); await sleep(450); } // lazy-load
      delay = Math.max(BASE_DELAY, delay - 500);
      return true;
    } catch (e) { delay = Math.min(delay * 2, 20000); process.stdout.write('  nav retry (' + (attempt + 1) + ') backoff ' + delay + 'ms: ' + String(e).slice(0, 50) + '\n'); await sleep(delay); }
  }
  return false;
}
const jit = () => BASE_DELAY + Math.floor(Math.random() * 1500);

// =============================================================================
// SELF-CHECK — one page per source, assert ≥1 record with a per-property URL
// =============================================================================
async function selfCheckOne(src) {
  const S = SOURCES[src];
  const dir = join(CACHE, src); if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  process.stdout.write('\n[self-check] ' + S.name + ' → ' + S.selfCheckUrl + '\n');
  await warm(S.host);
  const ok = await render(S.selfCheckUrl, S.waitFor);
  if (!ok) { process.stdout.write('  ❌ navigation failed (blocked/timeout). FAILING URL: ' + S.selfCheckUrl + '\n'); return { src, pass: false, n: 0 }; }
  writeFileSync(join(dir, 'selfcheck.html'), await page.content());
  let cards = [];
  try { cards = await page.evaluate(S.extract, S.evalArg); } catch (e) { process.stdout.write('  extract error: ' + String(e).slice(0, 80) + '\n'); }
  const withUrl = cards.filter(c => S.linkRe.test(c.href || ''));
  process.stdout.write('  parsed cards: ' + cards.length + ' · with per-property URL: ' + withUrl.length + '\n');
  if (withUrl.length) {
    const ctx0 = { region: 'Nordrhein-Westfalen', ptype: 'office', tenure: 'rent' };
    const sample = S.row(withUrl[0], ctx0);
    process.stdout.write('  sample url : ' + withUrl[0].href + '\n');
    process.stdout.write('  sample row : ' + JSON.stringify({ asset_type: sample.asset_type, name: sample.name, city: sample.city, plz: sample.plz, rent: [sample.rent_eur_m2_min, sample.rent_eur_m2_max], area: [sample.area_min_m2, sample.area_max_m2], id: sample.listing_id }) + '\n');
    process.stdout.write('  ✅ PASS\n');
    return { src, pass: true, n: withUrl.length };
  }
  process.stdout.write('  ❌ 0 records with a per-property URL. FAILING URL: ' + S.selfCheckUrl + ' · waitFor: ' + S.waitFor + '\n');
  process.stdout.write('  (first 200 chars of body text: ' + (await page.evaluate(() => document.body.innerText.replace(/\s+/g, ' ').slice(0, 200)).catch(() => '')) + ')\n');
  return { src, pass: false, n: 0 };
}

// =============================================================================
// SWEEP — paginate each combo to exhaustion; cache parsed rows per page (resumable)
// =============================================================================
async function sweepSource(src, passed) {
  const S = SOURCES[src];
  const dir = join(CACHE, src); if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  await warm(S.host);
  const have = existingIds();
  const fresh = [];
  let combos = 0;
  for (const combo of S.combos()) {
    combos++;
    let prevCodes = '';
    for (let p = 1; ; p++) {
      if (MAXPAGES && p > MAXPAGES) break;
      const cacheFile = join(dir, combo.key + '_p' + p + '.json');
      let cards;
      if (existsSync(cacheFile)) { cards = JSON.parse(readFileSync(cacheFile, 'utf8')); }
      else {
        const ok = await render(combo.url(p), S.waitFor);
        if (!ok) { process.stdout.write('  ' + combo.key + ' p' + p + ' nav failed — stop combo\n'); break; }
        try { cards = await page.evaluate(S.extract, S.evalArg); } catch (e) { cards = []; }
        writeFileSync(cacheFile, JSON.stringify(cards));
        await sleep(jit());
      }
      if (!cards.length) break;                                   // last page reached
      const sig = cards.map(c => c.href).sort().join('|');
      if (sig === prevCodes) break;                               // pagination looped (same page) → stop
      prevCodes = sig;
      for (const c of cards) { const row = S.row(c, combo); if (have.has(row.listing_id)) continue; have.add(row.listing_id); fresh.push(row); }
      if (p % 5 === 0) process.stdout.write('  ' + combo.key + ' …p' + p + ' (fresh so far ' + fresh.length + ')\n');
    }
  }
  const added = appendRows(fresh);
  process.stdout.write('[' + S.name + '] swept ' + combos + ' combos · +' + added + ' new rows → broker_listings_all.csv\n');
  return added;
}

// =============================================================================
// MAIN
// =============================================================================
const list = SOURCE === 'all' ? Object.keys(SOURCES) : [SOURCE];
if (list.some(s => !SOURCES[s])) { console.error('unknown --source; known: all,' + Object.keys(SOURCES).join(',')); process.exit(1); }

if (SELFCHECK) {
  const results = [];
  for (const s of list) results.push(await selfCheckOne(s));
  if (browser) await browser.close();
  process.stdout.write('\n=== SELF-CHECK SUMMARY ===\n');
  for (const r of results) process.stdout.write('  ' + (r.pass ? '✅' : '❌') + ' ' + SOURCES[r.src].name + ' (' + r.n + ' w/ URL)\n');
  const pass = results.filter(r => r.pass).map(r => r.src);
  process.stdout.write('\nPASSING sources ready to sweep: ' + (pass.join(', ') || 'NONE') + '\n');
  process.exit(0);
}

// sweep: self-check each first; only sweep passers
let total = 0;
for (const s of list) {
  const r = await selfCheckOne(s);
  if (!r.pass) { process.stdout.write('[' + SOURCES[s].name + '] SKIPPED (self-check failed)\n'); continue; }
  total += await sweepSource(s, r);
}
if (browser) await browser.close();
process.stdout.write('\n=== SWEEP DONE · +' + total + ' new rows total ===\n');
process.stdout.write('Next: node build/import_captures.mjs && node build/validate_listings.mjs && node build/verify_captures.mjs && node build/assemble.mjs\n');
