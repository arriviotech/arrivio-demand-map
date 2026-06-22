// Dissolves the 16 Bundesland polygons into a single Germany outline (data/de_outline.json),
// used to clip the hex heatmaps to the national border. Edge-dissolve: an edge shared by two
// states is internal (dropped); edges that appear once are the country boundary; stitch into rings.
//   node build/build_outline.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const B = dirname(fileURLToPath(import.meta.url));
const gj = JSON.parse(readFileSync(join(B, 'de_states.geojson'), 'utf8').replace(/^﻿/, ''));

const R = n => Math.round(n * 1e5) / 1e5;            // ~1 m — shared borders share vertices in this source
const vk = p => R(p[0]) + ',' + R(p[1]);
const eKey = (a, b) => a < b ? a + '|' + b : b + '|' + a;

const edges = new Map();
let inputRings = 0;
const addRing = ring => { inputRings++; for (let i = 0; i < ring.length - 1; i++) { const a = vk(ring[i]), b = vk(ring[i + 1]); if (a === b) continue; const k = eKey(a, b); edges.set(k, (edges.get(k) || 0) + 1); } };
for (const f of gj.features) { const g = f.geometry; const polys = g.type === 'Polygon' ? [g.coordinates] : g.coordinates; for (const poly of polys) addRing(poly[0]); }

// boundary adjacency (edges that appear exactly once)
const adj = new Map();
let boundary = 0;
for (const [k, c] of edges) { if (c !== 1) continue; boundary++; const [a, b] = k.split('|'); (adj.get(a) || adj.set(a, []).get(a)).push(b); (adj.get(b) || adj.set(b, []).get(b)).push(a); }

// stitch boundary edges into closed rings
const used = new Set(), kpt = k => k.split(',').map(Number), rings = [];
for (const start of adj.keys()) {
  if (adj.get(start).every(n => used.has(eKey(start, n)))) continue;
  const ring = [start]; let cur = start, prev = null, guard = 0;
  while (guard++ < 200000) {
    const nbrs = adj.get(cur).filter(n => !used.has(eKey(cur, n)));
    let next = nbrs.find(n => n !== prev); if (next == null) next = nbrs[0];
    if (next == null) break;
    used.add(eKey(cur, next)); ring.push(next); prev = cur; cur = next;
    if (next === start) break;
  }
  if (ring.length >= 4 && ring[0] === ring[ring.length - 1]) rings.push(ring.map(kpt));
}

const area = r => { let a = 0; for (let i = 0; i < r.length - 1; i++) a += r[i][0] * r[i + 1][1] - r[i + 1][0] * r[i][1]; return Math.abs(a) / 2; };
rings.sort((a, b) => area(b) - area(a));
// keep the mainland (largest) + real islands; drop internal-border slivers (rings whose centre
// falls INSIDE the mainland) — with even-odd fill a sliver inside Germany would mask a tiny spot.
const inRing = (pt, ring) => { let c = false; for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) { const xi = ring[i][0], yi = ring[i][1], xj = ring[j][0], yj = ring[j][1]; if (((yi > pt[1]) !== (yj > pt[1])) && (pt[0] < (xj - xi) * (pt[1] - yi) / (yj - yi) + xi)) c = !c; } return c; };
const centroid = r => { let x = 0, y = 0; for (const p of r) { x += p[0]; y += p[1]; } return [x / r.length, y / r.length]; };
const mainland = rings[0];
const kept = [mainland, ...rings.slice(1).filter(r => area(r) > 0.0005 && !inRing(centroid(r), mainland))];
const coordinates = kept.map(r => [r]); // MultiPolygon: each ring its own polygon
writeFileSync(join(B, '..', 'data', 'de_outline.json'), JSON.stringify({ type: 'MultiPolygon', coordinates }));

console.log('input state rings:', inputRings, '| unique edges:', edges.size, '| boundary edges:', boundary);
console.log('rings before filter:', rings.length, '| kept (mainland + islands):', kept.length, '| points:', kept.reduce((s, r) => s + r.length, 0));
console.log('kept ring sizes (top 10):', kept.slice(0, 10).map(r => r.length).join(', '));
console.log('largest ring area (deg²):', area(mainland).toFixed(2), '(Germany ≈ 45–46 in lng·lat deg²)');
