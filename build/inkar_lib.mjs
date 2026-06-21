// INKAR API client. Validates TLS properly using Node roots + GoDaddy intermediate
// (INKAR serves an incomplete chain; we supply the missing intermediate rather than disabling verification).
import fs from 'node:fs';
import https from 'node:https';
import tls from 'node:tls';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ca = [...tls.rootCertificates, fs.readFileSync(path.join(__dirname, 'gdig2.pem'), 'utf8')];
const agent = new https.Agent({ ca });

export function inkar(p, method = 'GET', body = null) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const headers = data ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) } : {};
    const r = https.request('https://www.inkar.de' + p, { agent, method, headers }, (rs) => {
      let d = '';
      rs.setEncoding('utf8');
      rs.on('data', (c) => (d += c));
      rs.on('end', () => resolve({ status: rs.statusCode, body: d }));
    });
    r.on('error', reject);
    if (data) r.write(data);
    r.end();
  });
}

// INKAR returns its JSON as a double-encoded string ("\"{...}\""). Parse until we get an object.
export async function inkarJson(p, method = 'GET', body = null) {
  const r = await inkar(p, method, body);
  let j;
  try {
    j = JSON.parse(r.body);
    if (typeof j === 'string') j = JSON.parse(j);
  } catch (e) {
    throw new Error('JSON parse failed (status ' + r.status + '): ' + r.body.slice(0, 200));
  }
  return j;
}
