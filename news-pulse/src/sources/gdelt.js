import { config, countryByCode } from '../config.js';
import { allPlaceAliases, feedKeywords, feedLangs, orGroup, withinBudget, DEVANAGARI } from '../query.js';
import { httpGet, hash, canonicalUrl } from '../util.js';

export const id = 'gdelt';
export const enabled = () => true;

const GDELT_LANG = { en: 'english', hi: 'hindi', de: 'german', fr: 'french', es: 'spanish', it: 'italian', nl: 'dutch', pt: 'portuguese', ja: 'japanese', ko: 'korean' };
const LANG_CODE = Object.fromEntries(Object.entries(GDELT_LANG).map(([k, v]) => [v, k]));

export function buildUrl(feed) {
  const c = countryByCode.get(feed.country);
  // GDELT matches English keywords against machine-translated text in ~65 languages,
  // so English terms also find Hindi articles. It rejects terms shorter than 3 characters.
  // GDELT rejects long queries ("too short or too long"): keep the most specific terms.
  const kw = withinBudget(feedKeywords(feed, 'en').filter((k) => k.length >= 3 && !DEVANAGARI.test(k)), 14);
  const place = allPlaceAliases(feed).filter((a) => !DEVANAGARI.test(a));
  const parts = [orGroup(kw), orGroup(place.map((p) => (/\s/.test(p) ? p : `"${p}"`)))];
  // Without keywords or a place the query would match a whole country's output: skip.
  if (!parts[0] && !parts[1]) return null;
  if (c?.gdelt) parts.push(`sourcecountry:${c.gdelt}`);
  const langs = feedLangs(feed).map((e) => GDELT_LANG[e.lang]).filter(Boolean);
  if (langs.length === 1) parts.push(`sourcelang:${langs[0]}`);
  else if (langs.length > 1) parts.push(`(${langs.map((l) => `sourcelang:${l}`).join(' OR ')})`);
  const qs = new URLSearchParams({
    query: parts.filter(Boolean).join(' '),
    mode: 'artlist',
    format: 'json',
    maxrecords: '75',
    timespan: feed.place ? '12h' : '1h',
    sort: 'datedesc',
  });
  return `${config.bases.gdelt}/api/v2/doc/doc?${qs}`;
}

// seendate looks like 20261030T154500Z
export function parseSeenDate(s) {
  const m = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/.exec(s || '');
  return m ? Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]) : Date.now();
}

export function parse(body) {
  let data;
  try {
    data = JSON.parse(body);
  } catch {
    // GDELT answers query errors with plain text.
    throw new Error(`GDELT: ${body.slice(0, 120)}`);
  }
  return (data.articles || [])
    .filter((a) => a.title && a.url)
    .map((a) => ({
      id: hash(canonicalUrl(a.url)),
      title: a.title.trim(),
      url: a.url,
      source: a.domain || '',
      sourceUrl: a.url,
      publishedAt: parseSeenDate(a.seendate),
      lang: LANG_CODE[(a.language || '').toLowerCase()],
      image: a.socialimage || undefined,
      via: id,
    }));
}

// All GDELT calls go through one queue spaced by gdeltMinGapMs, with one retry after a 429 or network error.
let queue = Promise.resolve();
let last = 0;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function throttled(fn) {
  const run = queue.then(async () => {
    const wait = last + config.gdeltMinGapMs - Date.now();
    if (wait > 0) await sleep(wait);
    try {
      return await fn();
    } finally {
      last = Date.now();
    }
  });
  queue = run.catch(() => {});
  return run;
}

export async function fetchItems(feed) {
  const url = buildUrl(feed);
  if (!url) return [];
  const get = () => throttled(() => httpGet(url, { timeoutMs: 30000 }));
  let body;
  try {
    body = await get();
  } catch {
    body = await get();
  }
  if (/^Please limit requests/i.test(body)) throw new Error('GDELT rate limited');
  return parse(body);
}
