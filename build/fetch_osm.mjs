// Fetches OSM office + small/family hotel locations across Germany in small tiles.
// RESUMABLE: each tile is saved to build/osm_tiles/ as it completes; re-running skips
// finished tiles. The combine step (always run at the end, or via `node fetch_osm.mjs combine`)
// aggregates whatever tiles exist into the compact baked files.
//   node build/fetch_osm.mjs            -> fetch missing tiles, then combine
//   node build/fetch_osm.mjs combine    -> just (re)build baked files from existing tiles
import { writeFileSync, readFileSync, existsSync, mkdirSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const OUT = dirname(fileURLToPath(import.meta.url));
const TILEDIR = join(OUT, 'osm_tiles');
if (!existsSync(TILEDIR)) mkdirSync(TILEDIR);
const COMBINE_ONLY = process.argv[2] === 'combine';

const EPS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
  'https://maps.mail.ru/osm/tools/overpass/api/interpreter'
];
const H = { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': 'ArrivioSiteSelection/1.0 (site research; ayush@arrivio.global)' };
const sleep = ms => new Promise(r => setTimeout(r, ms));

const S0 = 47.2, N0 = 55.1, W0 = 5.8, E0 = 15.1, ROWS = 5, COLS = 5;
const tiles = [];
for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
  tiles.push([S0 + (N0 - S0) * r / ROWS, W0 + (E0 - W0) * c / COLS, S0 + (N0 - S0) * (r + 1) / ROWS, W0 + (E0 - W0) * (c + 1) / COLS]);
}
const qFor = (s, w, n, e) => `[out:json][timeout:50];(node["office"](${s},${w},${n},${e});node["tourism"~"^(hotel|guest_house)$"](${s},${w},${n},${e});way["tourism"~"^(hotel|guest_house)$"](${s},${w},${n},${e}););out center tags;`;
const BIG_CHAINS = /(motel one|b&b|ibis|accor|premier inn|mercure|novotel|maritim|nh hotel|h-hotels|h\+ hotel|leonardo|dorint|steigenberger|hilton|marriott|holiday inn|intercontinental|best western|a&o |meininger|scandic|radisson|hampton|moxy|courtyard|ramada|wyndham|travelodge|super 8|grand city|gch|achat|select hotel|arcadia|lindner|premier)/i;
const roomsOf = t => { const r = parseInt(t.rooms, 10); if (Number.isFinite(r) && r > 0 && r < 2000) return r; const s = parseFloat(t.stars); if (s >= 5) return 140; if (s >= 4) return 85; if (s >= 3) return 45; if (s >= 1) return 22; return 25; };
const isSmall = t => !(t.brand || (t.operator && BIG_CHAINS.test(t.operator)) || BIG_CHAINS.test(t.name || ''));

async function fetchTile(t, idx) {
  const body = 'data=' + encodeURIComponent(qFor(...t));
  for (let a = 0; a < EPS.length * 2; a++) {
    const ep = EPS[a % EPS.length];
    try {
      const r = await fetch(ep, { method: 'POST', headers: H, body });
      if (!r.ok) { process.stdout.write(`  tile ${idx} ${ep.split('/')[2]} HTTP ${r.status}\n`); await sleep(r.status === 429 ? 6000 : 2500); continue; }
      const j = JSON.parse(await r.text());
      return j.elements || [];
    } catch (e) { process.stdout.write(`  tile ${idx} ${ep.split('/')[2]} ERR ${String(e).slice(0, 50)}\n`); await sleep(2500); }
  }
  return null;
}

if (!COMBINE_ONLY) {
  for (let i = 0; i < tiles.length; i++) {
    const tf = join(TILEDIR, `tile_${i}.json`);
    if (existsSync(tf)) { process.stdout.write(`tile ${i + 1}/${tiles.length}: cached\n`); continue; }
    const els = await fetchTile(tiles[i], i);
    if (els === null) { process.stdout.write(`tile ${i + 1}/${tiles.length}: FAILED (will retry next run)\n`); continue; }
    const office = [], hotels = [];
    for (const el of els) {
      const lat = el.lat != null ? el.lat : el.center && el.center.lat;
      const lon = el.lon != null ? el.lon : el.center && el.center.lon;
      if (lat == null || lon == null) continue;
      const tg = el.tags || {};
      if (tg.office) office.push([Math.round(lat * 1e4) / 1e4, Math.round(lon * 1e4) / 1e4]);
      else if ((tg.tourism === 'hotel' || tg.tourism === 'guest_house') && isSmall(tg))
        hotels.push({ n: tg.name || 'Hotel', lat: Math.round(lat * 1e4) / 1e4, lng: Math.round(lon * 1e4) / 1e4, r: roomsOf(tg), s: tg.stars ? parseFloat(tg.stars) : null, c: tg['addr:city'] || '' });
    }
    writeFileSync(tf, JSON.stringify({ office, hotels }));
    process.stdout.write(`tile ${i + 1}/${tiles.length}: ${els.length} els (+${office.length} office, +${hotels.length} hotels) SAVED\n`);
    await sleep(2500);
  }
}

// ---- combine ----
const officeGrid = new Map(), hotelGrid = new Map(), hotels = [];
const gkey = (la, ln) => Math.round(la / 0.02) + '_' + Math.round(ln / 0.02);
const gll = k => { const [a, b] = k.split('_'); return [Math.round(a * 0.02 * 1e4) / 1e4, Math.round(b * 0.02 * 1e4) / 1e4]; };
let nTiles = 0;
for (const f of readdirSync(TILEDIR)) {
  if (!/^tile_\d+\.json$/.test(f)) continue;
  nTiles++;
  const d = JSON.parse(readFileSync(join(TILEDIR, f), 'utf8'));
  for (const p of d.office) { const k = gkey(p[0], p[1]); officeGrid.set(k, (officeGrid.get(k) || 0) + 1); }
  for (const h of d.hotels) { const k = gkey(h.lat, h.lng); hotelGrid.set(k, (hotelGrid.get(k) || 0) + h.r); hotels.push(h); }
}
const commercialGrid = [...officeGrid.entries()].map(([k, w]) => { const [la, ln] = gll(k); return [la, ln, w]; });
const hotelGridArr = [...hotelGrid.entries()].map(([k, w]) => { const [la, ln] = gll(k); return [la, ln, w]; });
hotels.sort((a, b) => b.r - a.r);
const hotelsCapped = hotels.slice(0, 6000);
writeFileSync(join(OUT, 'commercial_grid.json'), JSON.stringify(commercialGrid));
writeFileSync(join(OUT, 'hotel_grid.json'), JSON.stringify(hotelGridArr));
writeFileSync(join(OUT, 'hotels_osm.json'), JSON.stringify(hotelsCapped));
process.stdout.write(`\nCOMBINED from ${nTiles} tiles -> office cells ${commercialGrid.length}, hotel cells ${hotelGridArr.length}, hotels ${hotels.length} (baked ${hotelsCapped.length})\n`);
process.stdout.write(`bytes: commercial ${JSON.stringify(commercialGrid).length}, hotelGrid ${JSON.stringify(hotelGridArr).length}, hotels ${JSON.stringify(hotelsCapped).length}\n`);
