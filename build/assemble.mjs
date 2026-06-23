// Assembles the deployable single-file app from the parts in /build.
// Usage: node build/assemble.mjs   (run from the repo root)
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const b = dirname(fileURLToPath(import.meta.url));
const read = f => readFileSync(join(b, f), 'utf8').replace(/^﻿/, '');

const statesGeo = read('de_states.geojson').trim();
const statesPart = read('p_states.html').replace('__STATES_GEO__', () => statesGeo);

const readJson = f => { try { return read(f).trim() || '[]'; } catch (e) { return '[]'; } };
const kreiseGeo = (() => { try { return read('de_kreise.geojson').trim(); } catch (e) { return 'null'; } })();
const inflowKreise = (() => { try { const o = JSON.parse(read('inflow_kreise.json')); return JSON.stringify(o.data || o); } catch (e) { return '[]'; } })();
const properties = (() => { try { return JSON.stringify(JSON.parse(read('../data/properties.json')).properties); } catch (e) { return '[]'; } })();
const genesisBeds = (() => { try { return JSON.stringify(JSON.parse(read('../data/genesis_beds_by_land.json')).data); } catch (e) { return '{}'; } })();
const pachtModelData = (() => { try { return read('../data/pacht_model.json').trim(); } catch (e) { return 'null'; } })();
const deOutline = (() => { try { return read('../data/de_outline.json').trim(); } catch (e) { return 'null'; } })();
const osmPart = '<script>\n' +
  'const COMMERCIAL_GRID=' + readJson('commercial_grid.json') + ';\n' +
  'const HOTEL_GRID=' + readJson('hotel_grid.json') + ';\n' +
  'const HOTEL_PRICE_GRID=' + readJson('hotel_price_grid.json') + ';\n' +
  'const HOTELS_OSM=' + readJson('hotels_osm.json') + ';\n' +
  'const DE_KREISE_GEO=' + kreiseGeo + ';\n' +
  'const INFLOW_KREISE=' + inflowKreise + ';\n' +
  'const PROPERTIES=' + properties + ';\n' +
  'const LISTING_GRID=' + readJson('../data/listing_grid.json') + ';\n' +
  'const GENESIS_BEDS=' + genesisBeds + ';\n' +
  'const PACHT_MODEL=' + pachtModelData + ';\n' +
  'const DE_OUTLINE=' + deOutline + ';\n</script>\n';

const out = [
  read('p1_head.html'),
  read('p2_body.html'),
  '<script>\n' + read('data.js').trimEnd() + '\n</script>\n',
  statesPart,
  osmPart,
  read('p3_adapter.html'),
  read('p4_app1.html'),
  read('p5_app2.html'),
].join('\n');

writeFileSync(join(b, '..', 'Arrivio_Demand_Map_OpenStreetMap.html'), out);
console.log('Wrote Arrivio_Demand_Map_OpenStreetMap.html (' + out.length + ' bytes)');
