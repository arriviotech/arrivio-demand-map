// Assembles the deployable single-file app from the parts in /build.
// Usage: node build/assemble.mjs   (run from the repo root)
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const b = dirname(fileURLToPath(import.meta.url));
const read = f => readFileSync(join(b, f), 'utf8').replace(/^﻿/, '');

const statesGeo = read('de_states.geojson').trim();
const statesPart = read('p_states.html').replace('__STATES_GEO__', () => statesGeo);

const out = [
  read('p1_head.html'),
  read('p2_body.html'),
  '<script>\n' + read('data.js').trimEnd() + '\n</script>\n',
  statesPart,
  read('p3_adapter.html'),
  read('p4_app1.html'),
  read('p5_app2.html'),
].join('\n');

writeFileSync(join(b, '..', 'Arrivio_Demand_Map_OpenStreetMap.html'), out);
console.log('Wrote Arrivio_Demand_Map_OpenStreetMap.html (' + out.length + ' bytes)');
