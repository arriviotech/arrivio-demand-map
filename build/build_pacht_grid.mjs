// Builds data/hotel_pacht_grid.json = est hotel Pacht €/room·mo per ~2km cell, so the hotel "Pacht"
// hexmap shows REAL variation. ADR is near-constant (85% of OSM hotels default to €95), so the
// signal is regional OCCUPANCY: Pacht/room·mo ≈ ADR × occupancy × 365 × 20% / 12 (the Umsatzpacht
// rule, midpoint). Occupancy = real Destatis GENESIS bed-occupancy for the cell's Bundesland.
//   node build/build_pacht_grid.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const B = dirname(fileURLToPath(import.meta.url));
const ROOT = join(B, '..');
const read = f => readFileSync(join(B, f), 'utf8').replace(/^﻿/, '');
const grid = JSON.parse(read('hotel_price_grid.json'));                 // [[lat,lng,adr],...]
const states = JSON.parse(read('de_states.geojson'));
const G = JSON.parse(readFileSync(join(ROOT, 'data', 'genesis_beds_by_land.json'), 'utf8')).data;

// state polygons (rings are [lng,lat]) + occupancy by German state name
const polys = states.features.map(f => ({ name: f.properties.name || f.properties.NAME_1 || f.properties.GEN, rings: (f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates) }));
const occOf = name => { const g = name && G[name]; return (g && g.hotels_occupancy_pct) ? g.hotels_occupancy_pct : null; };
const inRing = (lat, lng, ring) => { let c = false; for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) { const xi = ring[i][0], yi = ring[i][1], xj = ring[j][0], yj = ring[j][1]; if (((yi > lat) !== (yj > lat)) && (lng < (xj - xi) * (lat - yi) / (yj - yi) + xi)) c = !c; } return c; };
function stateAt(lat, lng) { for (const s of polys) for (const poly of s.rings) if (inRing(lat, lng, poly[0])) return s.name; return null; }

const FACTOR = 365 * 0.20 / 12; // ≈6.083: €/room·mo Pacht per (ADR × occupancy-fraction)
const NAT_OCC = 43; // national fallback when a cell resolves to no state (coast/border rounding)
const cache = new Map();
const out = [];
let placed = 0;
for (const [lat, lng, adr] of grid) {
  const key = Math.round(lat * 20) + '_' + Math.round(lng * 20); // ~5km memo so PIP runs ~once per cell cluster
  let occ = cache.get(key);
  if (occ === undefined) { occ = occOf(stateAt(lat, lng)) || NAT_OCC; cache.set(key, occ); }
  if (occ !== NAT_OCC) placed++;
  out.push([lat, lng, Math.round(adr * (occ / 100) * FACTOR)]);
}
writeFileSync(join(ROOT, 'data', 'hotel_pacht_grid.json'), JSON.stringify(out));

const vals = out.map(c => c[2]).sort((a, b) => a - b);
const q = p => vals[Math.floor((vals.length - 1) * p)];
console.log('hotel_pacht_grid.json:', out.length, 'cells |', placed, 'state-matched');
console.log('€/room·mo  min/p5/p25/median/p75/p95/max:', vals[0], q(.05), q(.25), q(.5), q(.75), q(.95), vals[vals.length - 1]);
