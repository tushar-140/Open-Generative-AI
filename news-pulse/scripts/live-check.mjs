// End-to-end check against the real sources: fetch, cluster, verify, and print what a reader would see.
// Usage: node scripts/live-check.mjs   (writes a Markdown report to $GITHUB_STEP_SUMMARY when set)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from '../src/config.js';
import { Poller } from '../src/poller.js';
import { adapters } from '../src/sources/index.js';
import { fingerprint, matchScore, reasonText } from '../src/verify.js';
import { feedLabel } from '../src/query.js';
import { embed, semanticReady } from '../src/semantic.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const out = [];
const log = (s = '') => {
  console.log(s);
  out.push(s);
};
const ago = (t) => `${Math.round((Date.now() - t) / 60000)}m`;

// 1. Matching calibration on labelled headline pairs.
const { pairs } = JSON.parse(fs.readFileSync(path.join(here, 'calibration-pairs.json'), 'utf8'));
const vecs = await embed(pairs.flatMap((p) => [p.a, p.b]));
log(`## Matching calibration (semantic model: ${semanticReady() ? config.semantic.model : 'unavailable, lexical only'})`);
log('| expected | cosine | lexical-only | final | a | b |');
log('|---|---|---|---|---|---|');
let wrong = 0;
pairs.forEach((p, i) => {
  const a = { ...fingerprint(p.a), vec: vecs?.[2 * i] };
  const b = { ...fingerprint(p.b), vec: vecs?.[2 * i + 1] };
  const cos = a.vec ? a.vec.reduce((s, x, k) => s + x * b.vec[k], 0) : NaN;
  const lexical = matchScore({ ...a, vec: undefined }, { ...b, vec: undefined }) > 0;
  const final = matchScore(a, b, () => false, config.semantic) > 0;
  if (final !== p.same) wrong++;
  log(`| ${p.same ? 'same' : 'different'} | ${cos.toFixed(3)} | ${lexical ? 'merge' : '-'} | ${final === p.same ? '✅' : '❌'} ${final ? 'merge' : '-'} | ${p.a.slice(0, 60)} | ${p.b.slice(0, 60)} |`);
});
log(`\n**${pairs.length - wrong}/${pairs.length} pairs decided correctly.**\n`);

// 2. Live feeds.
const feeds = [
  { id: 'raj-politics', country: 'IN', place: 'Rajasthan', domain: 'politics', keywords: [] },
  { id: 'jaipur-security', country: 'IN', place: 'Jaipur', domain: 'security', keywords: [] },
  { id: 'in-markets', country: 'IN', place: '', domain: 'markets', keywords: [] },
  { id: 'up-politics-hi', country: 'IN', place: 'उत्तर प्रदेश', domain: 'politics', keywords: [], langs: ['hi'] },
  { id: 'us-tech', country: 'US', place: '', domain: 'tech', keywords: [] },
  { id: 'bihar-disaster', country: 'IN', place: 'Bihar', domain: 'disaster', keywords: [] },
];
const poller = new Poller({ config, adapters, notifier: { notify: async () => {} }, books: new Map() });
let totalItems = 0;
for (const feed of feeds) {
  poller.add(feed);
  poller.stop();
  for (const adapter of adapters.filter((a) => a.enabled(feed))) await poller.run(feed, adapter);
  const book = poller.books.get(feed.id);
  const stories = book.list();
  const src = poller.status(feed.id);
  totalItems += Object.values(src).reduce((n, s) => n + (s.lastCount || 0), 0);
  const articles = stories.flatMap((s) => s.articles);
  const byLang = articles.reduce((m, a) => ({ ...m, [a.lang]: (m[a.lang] || 0) + 1 }), {});
  const fresh = articles.length ? ago(Math.max(...articles.map((a) => a.publishedAt))) : '-';
  log(`## ${feedLabel(feed, 'en')}  /  ${feedLabel(feed, 'hi')}`);
  log(`Sources: ${Object.entries(src).map(([k, s]) => `${k} ${s.lastError ? `❌ ${s.lastError}` : `✅ ${s.lastCount} items`}`).join(' · ')}`);
  const drops = poller.state.get(feed.id).regionDrops;
  log(`Region guard dropped ${drops.length} off-region headline(s)${drops.length ? `, e.g. “${drops.slice(0, 3).join('”, “')}”` : ''}`);
  log(`Articles kept: ${articles.length} (${Object.entries(byLang).map(([k, v]) => `${k}: ${v}`).join(', ')}), newest ${fresh} ago · stories: ${JSON.stringify(book.counts())} · bilingual stories: ${stories.filter((s) => s.langs.length > 1).length}\n`);
  log('| status | outlets | lang | age | headline | why |');
  log('|---|---|---|---|---|---|');
  const top = [...stories].sort((a, b) => b.origins - a.origins || b.latestAt - a.latestAt).slice(0, 10);
  for (const s of top) {
    log(`| ${s.status} | ${s.origins} | ${s.langs.join('+')} | ${ago(s.publishedAt)} | ${s.title.replace(/\|/g, '/').slice(0, 110)} | ${s.reasons.map(reasonText).join('; ')} |`);
  }
  const bilingual = stories.filter((s) => s.langs.length > 1).slice(0, 3);
  for (const s of bilingual) {
    log(`\n<details><summary>Bilingual: ${s.title.slice(0, 90)}</summary>\n`);
    for (const a of s.articles) log(`- [${a.lang}] ${a.source}: ${a.title}`);
    log('\n</details>');
  }
  log('');
}
if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, out.join('\n'));
if (!totalItems) {
  console.error('No items fetched from any source');
  process.exit(1);
}
