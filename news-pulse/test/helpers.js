import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures');

const seen = (ms) => new Date(ms).toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');

export function fixture(name, now = Date.now()) {
  return fs
    .readFileSync(path.join(dir, name), 'utf8')
    .replaceAll('{{T1}}', new Date(now - 10 * 60000).toUTCString())
    .replaceAll('{{T2}}', new Date(now - 5 * 60000).toUTCString())
    .replaceAll('{{SEEN}}', seen(now - 3 * 60000))
    .replace(/\{\{AGO(\d+)\}\}/g, (_, m) => new Date(now - Number(m) * 60000).toUTCString());
}
