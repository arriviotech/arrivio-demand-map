// =============================================================================
// build/fetch_brokers.mjs — broker render-and-extract crawler (SCAFFOLD, staged)
// =============================================================================
// WHAT THIS IS
//   A resumable, throttled, cached Playwright crawler that renders broker search
//   result pages (which are JS single-page apps and cannot be plain-fetched), reads
//   each result CARD's OWN per-property link, opens it, and extracts a normalized row.
//   Output rows are merged into data/broker_listings_all.csv (the same file the
//   importer build/import_captures.mjs ingests), schema-exact, deduped by listing_id.
//
// ToS / AUTHORIZATION (read before running)
//   * Broker SPAs are ToS-sensitive. Run this ONLY in a browser session you are
//     authorized to use, for INTERNAL site-selection research / demo — not a public
//     product, not a bulk re-publish of broker inventory.
//   * It is render-and-extract (a real browser you control), throttled and polite.
//   * It is NOT a completed sweep. It is staged: start with --broker=jll --cities=target,
//     eyeball the output, then widen. Do NOT point it at ImmoScout24/Immowelt/Booking
//     (anti-bot + ToS — excluded everywhere in this project).
//
// HOW TO RUN (in an authorized environment)
//   1) npm init -y && npm i playwright          # no package.json is committed here
//   2) npx playwright install chromium
//   3) node build/fetch_brokers.mjs --broker=jll --cities=target --max=60
//        flags:  --broker=jll|engelvoelkers|cbre|colliers|christie   (default jll)
//                --cities=target|all            (8 anchor cities, or the full list)
//                --max=60                        (MAX_PER_CITY; 0 = unlimited)
//                --headful                       (show the browser; default headless)
//                --combine                       (re-parse cached pages only; no network)
//   4) node build/import_captures.mjs && node build/assemble.mjs   # fold new rows into the map
//
// RESUMABLE / CACHED
//   Every search page and every property page is cached under build/brokers_cache/<broker>/
//   (gitignored). Re-running skips anything already cached. Throttled by DELAY_MS with a
//   small jitter; on a block/empty render it backs off and logs, never hammers.
//
// STATUS
//   * JLL (gewerbeimmobilien.jll.de) — full adapter below (anchor-driven extraction).
//   * Engel & Völkers, CBRE, Colliers (commercial) + Christie & Co (hotels) — DISCOVERY
//     STUBS: search-URL template + card-link pattern + notes located; extraction TODO,
//     intentionally not implemented as a sweep. Fill in extractCard() per broker when ready.
// =============================================================================

import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const B = dirname(fileURLToPath(import.meta.url));
const ROOT = join(B, '..');
const CACHE = join(B, 'brokers_cache');
const CSV = join(ROOT, 'data', 'broker_listings_all.csv');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const todayISO = () => new Date().toISOString().slice(0, 10);

// ---- CLI ----
const ARG = Object.fromEntries(process.argv.slice(2).map(a => { const m = a.match(/^--([^=]+)(?:=(.*))?$/); return m ? [m[1], m[2] ?? true] : [a, true]; }));
const BROKER = String(ARG.broker || 'jll').toLowerCase();
const CITY_SET = String(ARG.cities || 'target').toLowerCase();
const MAX_PER_CITY = ARG.max != null ? parseInt(ARG.max, 10) : 60;   // 0 = unlimited
const HEADFUL = !!ARG.headful;
const COMBINE = !!ARG.combine;
const DELAY_MS = 1600;                                               // polite throttle between property pages
const jitter = () => DELAY_MS + Math.floor(Math.random() * 600);

// ---- targets ----
const CITY_REGION = {                                               // 8 anchor cities → Bundesland
  'Düsseldorf': 'Nordrhein-Westfalen', 'Köln': 'Nordrhein-Westfalen', 'Bonn': 'Nordrhein-Westfalen', 'Aachen': 'Nordrhein-Westfalen',
  'München': 'Bayern', 'Hamburg': 'Hamburg', 'Berlin': 'Berlin', 'Frankfurt am Main': 'Hessen',
};
const CITIES_ALL = {                                                // extend freely (or load build/de_cities.json)
  ...CITY_REGION,
  'Stuttgart': 'Baden-Württemberg', 'Mannheim': 'Baden-Württemberg', 'Karlsruhe': 'Baden-Württemberg',
  'Leipzig': 'Sachsen', 'Dresden': 'Sachsen', 'Hannover': 'Niedersachsen', 'Bremen': 'Bremen',
  'Nürnberg': 'Bayern', 'Dortmund': 'Nordrhein-Westfalen', 'Essen': 'Nordrhein-Westfalen', 'Duisburg': 'Nordrhein-Westfalen',
  'Wiesbaden': 'Hessen', 'Münster': 'Nordrhein-Westfalen', 'Augsburg': 'Bayern', 'Kiel': 'Schleswig-Holstein',
  'Mainz': 'Rheinland-Pfalz', 'Freiburg im Breisgau': 'Baden-Württemberg', 'Erfurt': 'Thüringen', 'Magdeburg': 'Sachsen-Anhalt', 'Rostock': 'Mecklenburg-Vorpommern',
};
const cities = () => CITY_SET === 'all' ? CITIES_ALL : CITY_REGION;

// propertyType → asset_type (land → land_plot). Apartment buildings handled by a dedicated pass.
const PTYPE_ASSET = { office: 'office', industrial: 'industrial_hall', retail: 'retail', land: 'land_plot' };
// JLL per-property detail path by propertyType (code lowercased): /bueros/d0449 etc.
const JLL_PATH = { office: 'bueros', industrial: 'hallen', retail: 'einzelhandel', land: 'grundstuecke' };
const JLL_PATH_RE = /\/(bueros|hallen|einzelhandel|grundstuecke|wohn-und-geschaeftshaeuser)\/([a-z]\d{3,5})\b/i;

// =============================================================================
// BROKER REGISTRY — JLL is implemented; the rest are discovery stubs.
// =============================================================================
const BROKERS = {
  jll: {
    name: 'JLL',
    // search-results SPA. Params mirror the verified captures (tenureTypes, propertyTypes, cities, regions).
    searchUrl: ({ tenure, ptype, city, region }) =>
      'https://gewerbeimmobilien.jll.de/search?tenureTypes=' + (tenure === 'buy' ? 'buy' : 'rent') +
      '&propertyTypes=' + ptype + '&cities=' + encodeURIComponent(city) + '&regions=' + encodeURIComponent(region),
    // anchor-driven: the per-property URL IS the card's own link. Robust to CSS class churn.
    cardLinkRe: JLL_PATH_RE,
    waitFor: 'a[href*="/bueros/"], a[href*="/hallen/"], a[href*="/einzelhandel/"], a[href*="/grundstuecke/"], a[href*="/wohn-und-geschaeftshaeuser/"]',
    tenures: ['rent', 'buy'],
    ptypes: ['office', 'industrial', 'retail', 'land'],            // + apartment pass below
  },
  // ---- DISCOVERY STUBS (search URL + card-link hint located; extraction TODO) ----
  engelvoelkers: {
    name: 'Engel & Völkers Commercial', stub: true,
    searchUrl: ({ city }) => 'https://www.engelvoelkers.com/de/de/search/?q=' + encodeURIComponent(city) + '&businessArea=commercial',
    cardLinkRe: /\/de\/de\/properties\/[\w-]+\/?/i,
    notes: 'JS SPA; commercial: office/retail/industrial/Wohn-Geschäftshaus. Card link → /properties/<id>. Implement extractCard().',
  },
  cbre: {
    name: 'CBRE', stub: true,
    searchUrl: ({ city }) => 'https://immobilien.cbre.de/de-de/search?location=' + encodeURIComponent(city),
    cardLinkRe: /\/de-de\/property\/[\w-]+/i,
    notes: 'JS SPA; commercial sale+lease. Card link → /property/<slug>. Implement extractCard().',
  },
  colliers: {
    name: 'Colliers', stub: true,
    searchUrl: ({ city }) => 'https://www.colliers.de/immobilien/?ort=' + encodeURIComponent(city),
    cardLinkRe: /\/immobilien\/[\w-]+-\d+\/?/i,
    notes: 'JS SPA; commercial. Card link → /immobilien/<slug>-<id>. Implement extractCard().',
  },
  christie: {
    name: 'Christie & Co', stub: true,
    searchUrl: ({ city }) => 'https://www.christie.com/properties/?country=Germany&keyword=' + encodeURIComponent(city),
    cardLinkRe: /\/properties\/[\w-]+\/?/i,
    notes: 'Hotels-for-sale specialist → asset_type=hotel, deal=sale. Card link → /properties/<slug>. Implement extractCard().',
  },
};

// =============================================================================
// EXTRACTION — JLL: parse a rendered property page's text into schema fields.
// (Field regexes; calibrate against the first cached page if the site markup shifts.)
// =============================================================================
const num = s => { if (s == null) return null; let t = String(s).trim().replace(/[^\d.,-]/g, ''); if (!t) return null; if (t.includes(',')) t = t.replace(/\./g, '').replace(',', '.'); else if (t.includes('.')) { const p = t.split('.'); if (p.length > 2 || p[p.length - 1].length === 3) t = p.join(''); } const n = parseFloat(t); return Number.isFinite(n) ? n : null; };
const txt = html => (html || '').replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();

function extractJll(html, url) {
  const m = url.match(JLL_PATH_RE); if (!m) return null;
  const pathKey = m[1].toLowerCase(), code = m[2].toUpperCase();
  const ptype = pathKey === 'wohn-und-geschaeftshaeuser' ? 'apartment' : Object.keys(JLL_PATH).find(k => JLL_PATH[k] === pathKey);
  const asset_type = ptype === 'apartment' ? 'apartment_building' : PTYPE_ASSET[ptype] || 'other';
  const T = txt(html);
  const g = re => { const mm = T.match(re); return mm ? mm[1] : null; };
  const name = (g(/<title>([^<]+)<\/title>/i) || (html.match(/<title>([^<]+)<\/title>/i) || [])[1] || (asset_type + ' ' + code)).replace(/\s*[|–-]\s*JLL.*$/i, '').trim();
  const plz = g(/\b(\d{5})\b/);
  const city = g(/\b\d{5}\s+([A-Za-zÄÖÜäöüß .-]{2,40?})/);
  // rent €/m²·mo range and area range — adjust labels to the live page on first calibration run
  const rentR = T.match(/([\d.,]+)\s*(?:bis|–|-)\s*([\d.,]+)\s*€?\s*\/?\s*m²/i) || T.match(/([\d.,]+)\s*€\s*\/\s*m²/i);
  const areaR = T.match(/([\d.,]+)\s*(?:bis|–|-)\s*([\d.,]+)\s*m²/i) || T.match(/([\d.,]+)\s*m²/i);
  const price = num(g(/Kaufpreis[^0-9€]{0,30}([\d.,]{4,})\s*€/i));
  return {
    asset_type, deal: 'sale', code, name, plz, city: city ? city.trim() : '',
    rentLo: rentR ? num(rentR[1]) : null, rentHi: rentR ? num(rentR[2] || rentR[1]) : null,
    areaLo: areaR ? num(areaR[1]) : null, areaHi: areaR ? num(areaR[2] || areaR[1]) : null,
    price_eur: price,
  };
}

// =============================================================================
// CSV merge (schema-exact; dedup by listing_id; existing rows preserved → resumable)
// =============================================================================
const HEADER = ['asset_type', 'deal', 'source', 'source_url', 'listing_id', 'name', 'district', 'plz', 'city', 'state', 'rent_eur_m2_min', 'rent_eur_m2_max', 'price_eur', 'area_min_m2', 'area_max_m2', 'rooms', 'captured', 'notes'];
const csvCell = v => { const s = v == null ? '' : String(v); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
function loadCsvIds() {
  if (!existsSync(CSV)) return new Set();
  const ids = new Set(); const lines = readFileSync(CSV, 'utf8').replace(/^﻿/, '').split(/\r?\n/).slice(1);
  for (const ln of lines) { const m = ln.match(/(?:^|,)(jll-[A-Z0-9]+|[a-z]+-[A-Za-z0-9]+)(?:,|")/); if (m) ids.add(m[1]); }
  return ids;
}
function appendCsv(rows) {
  if (!rows.length) return 0;
  const head = existsSync(CSV) ? '' : '﻿' + HEADER.join(',') + '\n';
  const body = rows.map(r => HEADER.map(h => csvCell(r[h])).join(',')).join('\n') + '\n';
  writeFileSync(CSV, (existsSync(CSV) ? readFileSync(CSV, 'utf8').replace(/\n*$/, '\n') : '') + head + body);
  return rows.length;
}

// =============================================================================
// MAIN
// =============================================================================
const cfg = BROKERS[BROKER];
if (!cfg) { console.error('unknown --broker=' + BROKER + '; known: ' + Object.keys(BROKERS).join(', ')); process.exit(1); }
const cacheDir = join(CACHE, BROKER); if (!existsSync(cacheDir)) mkdirSync(cacheDir, { recursive: true });

if (cfg.stub) {
  console.log('[' + cfg.name + '] DISCOVERY STUB — not implemented as a sweep.');
  console.log('  search URL example:', cfg.searchUrl({ city: 'Berlin', region: 'Berlin', tenure: 'rent', ptype: 'office' }));
  console.log('  card-link pattern :', cfg.cardLinkRe);
  console.log('  notes             :', cfg.notes);
  console.log('  → implement extractCard() for this broker, then add it to the JLL run path.');
  process.exit(0);
}

// Lazy-load Playwright only when actually crawling (so --combine / stubs need no install).
let chromium = null;
if (!COMBINE) {
  try { ({ chromium } = await import('playwright')); }
  catch (e) { console.error('Playwright is not installed. Run: npm i playwright && npx playwright install chromium\n(or use --combine to re-parse already-cached pages).'); process.exit(1); }
}

const slug = s => String(s).replace(/[^a-z0-9]+/gi, '_').slice(0, 70);
const seen = loadCsvIds();
console.log('[' + cfg.name + '] start · cities=' + CITY_SET + ' · MAX_PER_CITY=' + (MAX_PER_CITY || '∞') + ' · already in CSV: ' + seen.size);

let browser = null, ctx = null, page = null;
async function ensureBrowser() {
  if (browser) return;
  browser = await chromium.launch({ headless: !HEADFUL });
  ctx = await browser.newContext({ locale: 'de-DE', userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36' });
  page = await ctx.newPage();
}

// collect per-property links from a rendered search page (cached HTML reused on re-run)
async function searchLinks(url, key) {
  const cf = join(cacheDir, 'search_' + key + '.html');
  let html = existsSync(cf) ? readFileSync(cf, 'utf8') : null;
  if (html == null) {
    if (COMBINE) return [];
    await ensureBrowser();
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 }).catch(() => { });
    await page.waitForSelector(cfg.waitFor, { timeout: 15000 }).catch(() => { });
    for (let s = 0; s < 6; s++) { await page.mouse.wheel(0, 4000).catch(() => { }); await sleep(500); } // lazy-load
    html = await page.content(); writeFileSync(cf, html); await sleep(jitter());
  }
  const links = new Set();
  for (const m of html.matchAll(new RegExp('href="([^"]*' + cfg.cardLinkRe.source + '[^"]*)"', 'gi'))) {
    let u = m[1]; if (u.startsWith('/')) u = 'https://gewerbeimmobilien.jll.de' + u;
    links.add(u.split('?')[0]);
  }
  return [...links];
}

async function propertyHtml(url) {
  const cf = join(cacheDir, 'p_' + slug(url.replace(/^https?:\/\/[^/]+/, '')) + '.html');
  if (existsSync(cf)) return readFileSync(cf, 'utf8');
  if (COMBINE) return null;
  await ensureBrowser();
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 }).catch(() => { });
  await page.waitForTimeout(1200);
  const html = await page.content(); writeFileSync(cf, html); await sleep(jitter());
  return html;
}

const rows = [];
const TENURES = cfg.tenures, PTYPES = [...cfg.ptypes, 'apartment'];   // apartment = Wohn-/Geschäftshäuser pass
outer:
for (const [city, region] of Object.entries(cities())) {
  let perCity = 0;
  for (const tenure of TENURES) {
    for (const ptype of PTYPES) {
      const realPtype = ptype === 'apartment' ? 'office' : ptype;     // JLL apartment search param TBD; placeholder
      const url = cfg.searchUrl({ tenure, ptype: realPtype, city, region });
      const key = slug([city, region, tenure, ptype].join('_'));
      let links = [];
      try { links = await searchLinks(url, key); } catch (e) { console.log('  search error', city, tenure, ptype, String(e).slice(0, 60)); }
      for (const link of links) {
        const code = (link.match(JLL_PATH_RE) || [])[2]; if (!code) continue;
        const id = 'jll-' + code.toUpperCase();
        if (seen.has(id)) continue; seen.add(id);
        let html = null; try { html = await propertyHtml(link); } catch (e) { }
        if (!html) continue;
        const f = extractJll(html, link); if (!f) continue;
        rows.push({
          asset_type: f.asset_type, deal: tenure === 'buy' ? 'sale' : 'lease', source: 'JLL', source_url: link, listing_id: id,
          name: f.name, district: '', plz: f.plz || '', city: f.city || city, state: region,
          rent_eur_m2_min: f.rentLo ?? '', rent_eur_m2_max: f.rentHi ?? '', price_eur: f.price_eur ?? '',
          area_min_m2: f.areaLo ?? '', area_max_m2: f.areaHi ?? '', rooms: '', captured: todayISO(),
          notes: 'JLL gewerbeimmobilien; render-and-extract; tenure=' + tenure + '; ptype=' + ptype,
        });
        perCity++;
        if (MAX_PER_CITY && perCity >= MAX_PER_CITY) { console.log('  ' + city + ': hit MAX_PER_CITY=' + MAX_PER_CITY + ' (capped — widen with --max=0)'); continue outer; }
      }
    }
  }
  console.log('  ' + city + ': +' + perCity + ' new');
}

if (browser) await browser.close();
const added = appendCsv(rows);
console.log('[' + cfg.name + '] done · ' + added + ' new rows merged into data/broker_listings_all.csv');
console.log('Next: node build/import_captures.mjs && node build/assemble.mjs');
if (rows.length === 0 && !COMBINE) console.log('NOTE: 0 rows — first run usually needs selector calibration. Inspect a cached page under build/brokers_cache/' + BROKER + '/ and adjust extractJll()/waitFor.');
