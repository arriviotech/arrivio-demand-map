// Builds Arrivio_Master_Listings.xlsx — every listing on the map, nothing dropped.
//   Sheet 1 "Acquisition listings"          = captures.json ∪ properties.json (full cols incl. rooms/basis/note)
//   Sheet 2 "Existing hotels (OSM context)" = build/hotels_osm.json (~6000 POIs, context only, no price)
//   Sheet 3 "Sources"                       = per-source count / what / date / example URL
// Dependency-free .xlsx writer (ZIP STORE + CRC32 + inlineStr cells) — no npm packages, like the
// reader in import_captures.mjs. Run:  node build/build_master_xlsx.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { deflateRawSync } from 'node:zlib';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const B = dirname(fileURLToPath(import.meta.url));
const ROOT = join(B, '..');
const rd = f => { try { return JSON.parse(readFileSync(join(ROOT, f), 'utf8')); } catch (e) { return null; } };

// ---------- dependency-free xlsx writer ----------
const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
function crc32(buf) { let c = 0xFFFFFFFF; for (let i = 0; i < buf.length; i++) c = CRC[(c ^ buf[i]) & 0xFF] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; }
function zip(files) {                                                   // DEFLATE method (8) + CRC32; STORE for empty parts
  const out = [], central = []; let offset = 0;
  for (const f of files) {
    const name = Buffer.from(f.name, 'utf8'), data = Buffer.isBuffer(f.data) ? f.data : Buffer.from(f.data, 'utf8'), crc = crc32(data);
    const comp = data.length ? deflateRawSync(data, { level: 6 }) : data, method = data.length ? 8 : 0;
    const lh = Buffer.alloc(30);
    lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(20, 4); lh.writeUInt16LE(0, 6); lh.writeUInt16LE(method, 8); lh.writeUInt16LE(0, 10); lh.writeUInt16LE(0, 12);
    lh.writeUInt32LE(crc, 14); lh.writeUInt32LE(comp.length, 18); lh.writeUInt32LE(data.length, 22); lh.writeUInt16LE(name.length, 26); lh.writeUInt16LE(0, 28);
    out.push(lh, name, comp);
    const cd = Buffer.alloc(46);
    cd.writeUInt32LE(0x02014b50, 0); cd.writeUInt16LE(20, 4); cd.writeUInt16LE(20, 6); cd.writeUInt16LE(0, 8); cd.writeUInt16LE(method, 10); cd.writeUInt16LE(0, 12); cd.writeUInt16LE(0, 14);
    cd.writeUInt32LE(crc, 16); cd.writeUInt32LE(comp.length, 20); cd.writeUInt32LE(data.length, 24); cd.writeUInt16LE(name.length, 28);
    cd.writeUInt16LE(0, 30); cd.writeUInt16LE(0, 32); cd.writeUInt16LE(0, 34); cd.writeUInt16LE(0, 36); cd.writeUInt32LE(0, 38); cd.writeUInt32LE(offset, 42);
    central.push(cd, name);
    offset += lh.length + name.length + comp.length;
  }
  let cdSize = 0; for (const c of central) cdSize += c.length;
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0); eocd.writeUInt16LE(files.length, 8); eocd.writeUInt16LE(files.length, 10); eocd.writeUInt32LE(cdSize, 12); eocd.writeUInt32LE(offset, 16);
  return Buffer.concat([...out, ...central, eocd]);
}
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const colL = n => { let s = ''; n++; while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = (n - m - 1) / 26 | 0; } return s; };
function sheetXml(rows) {                                               // rows[0] = header (bold via s=1); cells: number → <v>, else inlineStr
  let x = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><sheetData>';
  for (let ri = 0; ri < rows.length; ri++) {
    x += '<row r="' + (ri + 1) + '">';
    const row = rows[ri];
    for (let ci = 0; ci < row.length; ci++) {
      const v = row[ci]; if (v == null || v === '') continue;
      const ref = colL(ci) + (ri + 1), s = ri === 0 ? ' s="1"' : '';
      if (typeof v === 'number' && isFinite(v)) x += '<c r="' + ref + '"' + s + '><v>' + v + '</v></c>';
      else x += '<c r="' + ref + '"' + s + ' t="inlineStr"><is><t xml:space="preserve">' + esc(v) + '</t></is></c>';
    }
    x += '</row>';
  }
  return x + '</sheetData></worksheet>';
}
function buildXlsx(sheets) {                                            // sheets: [{name, rows}]
  const files = [];
  files.push({ name: '[Content_Types].xml', data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' + sheets.map((_, i) => '<Override PartName="/xl/worksheets/sheet' + (i + 1) + '.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>').join('') + '</Types>' });
  files.push({ name: '_rels/.rels', data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>' });
  files.push({ name: 'xl/workbook.xml', data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>' + sheets.map((s, i) => '<sheet name="' + esc(s.name) + '" sheetId="' + (i + 1) + '" r:id="rId' + (i + 1) + '"/>').join('') + '</sheets></workbook>' });
  files.push({ name: 'xl/_rels/workbook.xml.rels', data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' + sheets.map((_, i) => '<Relationship Id="rId' + (i + 1) + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet' + (i + 1) + '.xml"/>').join('') + '<Relationship Id="rIdS" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>' });
  files.push({ name: 'xl/styles.xml', data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border/></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/></cellXfs></styleSheet>' });
  sheets.forEach((s, i) => files.push({ name: 'xl/worksheets/sheet' + (i + 1) + '.xml', data: sheetXml(s.rows) }));
  return zip(files);
}

// ---------- assemble the data ----------
const caps = (rd('data/captures.json') || {}).properties || [];
const props = (rd('data/properties.json') || {}).properties || [];
const hotels = (() => { const h = rd('build/hotels_osm.json'); return Array.isArray(h) ? h : (h && h.features) || []; })();

const ACQ_COLS = ['asset_type', 'deal', 'source', 'source_url', 'listing_id', 'name', 'district', 'plz', 'city', 'state', 'rent_eur_m2_min', 'rent_eur_m2_max', 'lease_eur_mo', 'price_eur', 'area_m2', 'rooms', 'rooms_basis', 'rooms_note', 'lat', 'lng', 'loc_approx', 'captured', 'notes'];
const acqRow = r => [
  r.asset_type || r.kind || '', r.deal || '', r.source || '', r.source_url || '', r.id || r.listing_id || '',
  r.name || '', r.district || '', r.plz || '', r.city || '', r.state || '',
  r.rent_eur_m2_min ?? '', r.rent_eur_m2_max ?? '', r.lease_eur_mo ?? '', r.price_eur ?? '', r.area_m2 ?? '',
  r.rooms ?? '', r.rooms_basis || (r.rooms ? 'listed' : ''), r.rooms_note || '',
  r.lat ?? '', r.lng ?? '', r.loc_approx ? 'yes' : '', r.captured || '', r.notes || '',
];
const acqRows = [ACQ_COLS, ...[...caps, ...props].map(acqRow)];

const OSM_COLS = ['name', 'city', 'stars', 'rooms', 'lat', 'lng', 'source', 'note'];
const osmRows = [
  ['Existing hotels — OpenStreetMap context layer (NOT priced acquisition supply). Shows the existing hotel footprint for market context.'],
  OSM_COLS,
  ...hotels.map(h => [h.n || h.name || '', h.c || h.city || '', h.s ?? h.stars ?? '', h.r ?? h.rooms ?? '', h.lat ?? '', h.lng ?? h.lon ?? '', 'OpenStreetMap', 'existing hotel POI — context only']),
];

// Sources sheet
const ymax = (arr) => arr.reduce((d, r) => (r.captured && r.captured > d ? r.captured : d), '');
const SRC_COLS = ['source', 'listings', 'asset_types captured', 'kind', 'latest capture', 'example URL'];
const srcRows = [SRC_COLS];
const allAcq = [...caps, ...props];
for (const s of [...new Set(allAcq.map(r => r.source))]) {
  const rs = allAcq.filter(r => r.source === s);
  const types = [...new Set(rs.map(r => r.asset_type || r.kind))].join(', ');
  const ex = (rs.find(r => r.source_url) || {}).source_url || '';
  const kind = /jll|engel|cbre|colliers|christie/i.test(s) ? 'broker (authorized browser)' : 'open portal (plain fetch)';
  srcRows.push([s, rs.length, types, kind, ymax(rs), ex]);
}
srcRows.push(['OpenStreetMap (existing hotels)', hotels.length, 'hotel (existing, context)', 'context layer — no price', '', 'https://www.openstreetmap.org']);
srcRows.push([]);
srcRows.push(['TOTAL acquisition listings (map)', allAcq.length, '', '', '', '']);
srcRows.push(['— with coordinates (pins)', allAcq.filter(r => r.lat != null).length, '', '', '', '']);
srcRows.push(['— approximate location (region/state centroid)', allAcq.filter(r => r.loc_approx).length, '', '', '', '']);
srcRows.push(['rooms: listed', allAcq.filter(r => r.rooms_basis === 'listed').length, '', '', '', '']);
srcRows.push(['rooms: estimated (area ÷ 20)', allAcq.filter(r => r.rooms_basis === 'estimated').length, '', '', '', '']);
srcRows.push(['rooms: n/a (plot/parking/warehouse/no-area)', allAcq.filter(r => r.rooms_basis === 'n/a').length, '', '', '', '']);

const xlsx = buildXlsx([
  { name: 'Acquisition listings', rows: acqRows },
  { name: 'Existing hotels (OSM context)', rows: osmRows },
  { name: 'Sources', rows: srcRows },
]);
writeFileSync(join(ROOT, 'Arrivio_Master_Listings.xlsx'), xlsx);
console.log('Wrote Arrivio_Master_Listings.xlsx (' + (xlsx.length / 1024 | 0) + ' KB)');
console.log('  Sheet "Acquisition listings": ' + (acqRows.length - 1) + ' rows (captures ' + caps.length + ' + portal ' + props.length + ')');
console.log('  Sheet "Existing hotels (OSM context)": ' + hotels.length + ' rows');
console.log('  Sheet "Sources": ' + (srcRows.length - 1) + ' rows');
